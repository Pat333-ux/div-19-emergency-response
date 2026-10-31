export interface OverrideCommand {
  commandId: string;
  initiator: string;
  action: "GLOBAL_FREEZE" | "GLOBAL_RESUME" | "ISOLATE_MODULE";
  targetId?: string;
  reason: string;
  timestamp: string;
}

export class EmergencyOverrideManager {
  private globalFrozen: boolean = false;
  private overrideLog: OverrideCommand[] = [];

  /**
   * Execute an emergency override command (e.g., global freeze by Governing Officer).
   */
  executeOverride(
    initiator: string,
    action: "GLOBAL_FREEZE" | "GLOBAL_RESUME" | "ISOLATE_MODULE",
    reason: string,
    targetId?: string
  ): OverrideCommand {
    if (action === "GLOBAL_FREEZE") {
      this.globalFrozen = true;
    } else if (action === "GLOBAL_RESUME") {
      this.globalFrozen = false;
    }

    const command: OverrideCommand = {
      commandId: `EMG-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      initiator,
      action,
      targetId,
      reason,
      timestamp: new Date().toISOString(),
    };

    this.overrideLog.push(command);
    return command;
  }

  /**
   * Check if the entire system is under global emergency freeze.
   */
  isGlobalFrozen(): boolean {
    return this.globalFrozen;
  }

  /**
   * Retrieve audit log of all emergency overrides executed.
   */
  getOverrideLog(): OverrideCommand[] {
    return this.overrideLog;
  }
}

export const emergencyOverrideManager = new EmergencyOverrideManager();
