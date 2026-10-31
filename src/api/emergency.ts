import { circuitBreakerRegistry } from "../core/CircuitBreaker";
import { emergencyOverrideManager } from "../core/EmergencyOverride";

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export class EmergencyAPIHandler {
  /**
   * Trip a circuit breaker for a specific component.
   * POST /api/emergency/circuit/trip
   */
  static tripCircuit(body: { componentId: string; reason: string }): APIResponse<any> {
    if (!body.componentId || !body.reason) {
      return {
        success: false,
        error: "Missing required fields: componentId or reason.",
        timestamp: new Date().toISOString(),
      };
    }

    const circuit = circuitBreakerRegistry.tripCircuit(body.componentId, body.reason);
    if (!circuit) {
      return {
        success: false,
        error: "Component not found in circuit registry.",
        timestamp: new Date().toISOString(),
      };
    }

    return {
      success: true,
      data: circuit,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Execute global emergency override (Freeze / Resume).
   * POST /api/emergency/override
   */
  static executeOverride(body: {
    initiator: string;
    action: "GLOBAL_FREEZE" | "GLOBAL_RESUME" | "ISOLATE_MODULE";
    reason: string;
    targetId?: string;
  }): APIResponse<any> {
    if (!body.initiator || !body.action || !body.reason) {
      return {
        success: false,
        error: "Missing required fields: initiator, action, or reason.",
        timestamp: new Date().toISOString(),
      };
    }

    const command = emergencyOverrideManager.executeOverride(
      body.initiator,
      body.action,
      body.reason,
      body.targetId
    );

    return {
      success: true,
      data: command,
      timestamp: new Date().toISOString(),
    };
  }
}
