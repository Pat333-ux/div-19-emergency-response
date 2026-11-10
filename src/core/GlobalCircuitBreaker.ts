export type EmergencyAlertLevel = "NORMAL" | "ELEVATED" | "CRITICAL_HALT";
export type EmergencyScope = "GLOBAL" | string;

export interface EmergencyState {
  globalPause: boolean;
  pausedDivisions: string[];
  alertLevel: EmergencyAlertLevel;
  reasonCode: string | null;
  updatedAt: string;
}

export interface CircuitStatus extends EmergencyState {
  operational: boolean;
}

export interface EmergencyHaltRequest {
  scope: EmergencyScope;
  alertLevel: Exclude<EmergencyAlertLevel, "NORMAL">;
  /** Stable, non-sensitive code only; free-form text is intentionally not broadcast. */
  reasonCode: string;
  multisigProof: string;
}

export interface EmergencyResumeRequest {
  scope: EmergencyScope;
  multisigProof: string;
}

export interface EmergencyEvent {
  sourceDivision: "div-19-emergency-response";
  targetDivision: "ALL_DIVISIONS" | string;
  eventType: "EMERGENCY_CIRCUIT_HALT" | "EMERGENCY_CIRCUIT_RESUME";
  payload: {
    alertLevel: EmergencyAlertLevel;
    reasonCode: string;
    timestamp: string;
  };
}

export interface GlobalCircuitBreakerDependencies {
  /** Must perform real cryptographic/multisig verification. Never use a prefix check. */
  verifyMultisigProof(proof: string): Promise<boolean> | boolean;
  /** Connect this to the authenticated BEAST division event router. */
  dispatchDivisionEvent(event: EmergencyEvent): Promise<void>;
  now?: () => Date;
}

const ALERT_PRIORITY: Record<EmergencyAlertLevel, number> = {
  NORMAL: 0,
  ELEVATED: 1,
  CRITICAL_HALT: 2,
};

const DIVISION_ID = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,62}$/;
const REASON_CODE = /^[A-Z][A-Z0-9_]{1,63}$/;

/**
 * Process-local emergency state with injected proof verification and event transport.
 * Production deployments must provide durable shared state and authenticated adapters;
 * this class alone does not coordinate multiple workers or divisions.
 */
export class GlobalCircuitBreaker {
  private globalPause = false;
  private readonly pausedDivisions = new Set<string>();
  private readonly alertByScope = new Map<string, EmergencyAlertLevel>();
  private readonly reasonByScope = new Map<string, string>();
  private updatedAt: string;

  constructor(private readonly dependencies: GlobalCircuitBreakerDependencies) {
    this.updatedAt = this.clock().toISOString();
  }

  getStatus(divisionId?: string): CircuitStatus {
    const alertLevel = this.currentAlertLevel();
    const reasonCode = this.globalPause
      ? this.reasonByScope.get("GLOBAL") ?? null
      : divisionId
        ? this.reasonByScope.get(divisionId) ?? null
        : null;
    const isPaused = this.globalPause || (divisionId !== undefined && this.pausedDivisions.has(divisionId));

    return {
      operational: !isPaused,
      globalPause: this.globalPause,
      pausedDivisions: [...this.pausedDivisions].sort(),
      alertLevel,
      reasonCode,
      updatedAt: this.updatedAt,
    };
  }

  async triggerHalt(request: EmergencyHaltRequest): Promise<{ status: "HALT_ENGAGED"; target: string; state: CircuitStatus; broadcastDelivered: boolean }> {
    this.validateScope(request.scope);
    this.validateReasonCode(request.reasonCode);
    if (request.alertLevel !== "ELEVATED" && request.alertLevel !== "CRITICAL_HALT") {
      throw new TypeError("alertLevel must be ELEVATED or CRITICAL_HALT");
    }
    await this.requireValidProof(request.multisigProof);

    const scopeKey = request.scope === "GLOBAL" ? "GLOBAL" : request.scope;
    if (scopeKey === "GLOBAL") this.globalPause = true;
    else this.pausedDivisions.add(scopeKey);
    this.alertByScope.set(scopeKey, request.alertLevel);
    this.reasonByScope.set(scopeKey, request.reasonCode);
    this.updatedAt = this.clock().toISOString();

    const target = scopeKey === "GLOBAL" ? "ALL_DIVISIONS" : scopeKey;
    const broadcastDelivered = await this.broadcast({
      sourceDivision: "div-19-emergency-response",
      targetDivision: target,
      eventType: "EMERGENCY_CIRCUIT_HALT",
      payload: {
        alertLevel: request.alertLevel,
        reasonCode: request.reasonCode,
        timestamp: this.updatedAt,
      },
    });

    return { status: "HALT_ENGAGED", target, state: this.getStatus(), broadcastDelivered };
  }

  async resume(request: EmergencyResumeRequest): Promise<{ status: "RESUMED"; target: string; state: CircuitStatus; broadcastDelivered: boolean }> {
    this.validateScope(request.scope);
    await this.requireValidProof(request.multisigProof);

    const scopeKey = request.scope === "GLOBAL" ? "GLOBAL" : request.scope;
    if (scopeKey === "GLOBAL") {
      this.globalPause = false;
      this.pausedDivisions.clear();
      this.alertByScope.clear();
      this.reasonByScope.clear();
    } else {
      this.pausedDivisions.delete(scopeKey);
      this.alertByScope.delete(scopeKey);
      this.reasonByScope.delete(scopeKey);
    }
    this.updatedAt = this.clock().toISOString();

    const target = scopeKey === "GLOBAL" ? "ALL_DIVISIONS" : scopeKey;
    const broadcastDelivered = await this.broadcast({
      sourceDivision: "div-19-emergency-response",
      targetDivision: target,
      eventType: "EMERGENCY_CIRCUIT_RESUME",
      payload: {
        alertLevel: this.currentAlertLevel(),
        reasonCode: "AUTHORIZED_RESUME",
        timestamp: this.updatedAt,
      },
    });

    return { status: "RESUMED", target, state: this.getStatus(), broadcastDelivered };
  }

  private async requireValidProof(proof: string): Promise<void> {
    if (typeof proof !== "string" || proof.length < 16) {
      throw new TypeError("A valid multisig proof is required");
    }
    let verified = false;
    try {
      verified = await this.dependencies.verifyMultisigProof(proof);
    } catch {
      // Fail closed when the verifier is unavailable or errors.
    }
    if (!verified) throw new Error("Multisig proof verification failed");
  }

  private validateScope(scope: string): void {
    if (scope !== "GLOBAL" && (typeof scope !== "string" || !DIVISION_ID.test(scope))) {
      throw new TypeError("scope must be GLOBAL or a valid division ID");
    }
  }

  private validateReasonCode(reasonCode: string): void {
    if (typeof reasonCode !== "string" || !REASON_CODE.test(reasonCode)) {
      throw new TypeError("reasonCode must be a non-sensitive uppercase code");
    }
  }

  private currentAlertLevel(): EmergencyAlertLevel {
    let current: EmergencyAlertLevel = "NORMAL";
    for (const level of this.alertByScope.values()) {
      if (ALERT_PRIORITY[level] > ALERT_PRIORITY[current]) current = level;
    }
    return current;
  }

  private async broadcast(event: EmergencyEvent): Promise<boolean> {
    try {
      await this.dependencies.dispatchDivisionEvent(event);
      return true;
    } catch {
      // Keep local state engaged even when the event router is unavailable.
      return false;
    }
  }

  private clock(): Date {
    return this.dependencies.now ? this.dependencies.now() : new Date();
  }
}
