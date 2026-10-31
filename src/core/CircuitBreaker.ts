export interface CircuitState {
  componentId: string;
  componentName: string;
  status: "CLOSED" | "OPEN" | "HALF-OPEN"; // CLOSED = Normal, OPEN = Tripped/Paused
  tripReason?: string;
  trippedAt?: string;
}

export class CircuitBreakerRegistry {
  private circuits: Map<string, CircuitState> = new Map();

  /**
   * Register a system component or contract with the circuit breaker.
   */
  registerComponent(componentId: string, componentName: string): CircuitState {
    const circuit: CircuitState = {
      componentId,
      componentName,
      status: "CLOSED",
    };

    this.circuits.set(componentId, circuit);
    return circuit;
  }

  /**
   * Trip the circuit breaker (pause component operations due to threat).
   */
  tripCircuit(componentId: string, tripReason: string): CircuitState | undefined {
    const circuit = this.circuits.get(componentId);
    if (!circuit) return undefined;

    circuit.status = "OPEN";
    circuit.tripReason = tripReason;
    circuit.trippedAt = new Date().toISOString();

    this.circuits.set(componentId, circuit);
    return circuit;
  }

  /**
   * Reset or close the circuit breaker (resume normal operations).
   */
  resetCircuit(componentId: string): CircuitState | undefined {
    const circuit = this.circuits.get(componentId);
    if (!circuit) return undefined;

    circuit.status = "CLOSED";
    circuit.tripReason = undefined;
    circuit.trippedAt = undefined;

    this.circuits.set(componentId, circuit);
    return circuit;
  }

  /**
   * Get all active circuit states.
   */
  getAllCircuits(): CircuitState[] {
    return Array.from(this.circuits.values());
  }

  /**
   * Check if a component is operational.
   */
  isOperational(componentId: string): boolean {
    const circuit = this.circuits.get(componentId);
    return circuit ? circuit.status === "CLOSED" : false;
  }
}

export const circuitBreakerRegistry = new CircuitBreakerRegistry();
