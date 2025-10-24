export enum CircuitBreakerState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open'
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  monitoringPeriod: number;
}

export class CircuitBreaker {
  private state: CircuitBreakerState;
  private failureCount: number;
  private lastFailureTime: number;
  private nextAttemptTime: number;
  private successCount: number;
  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly monitoringPeriod: number;

  constructor(
    failureThreshold: number = 5,
    resetTimeout: number = 60000, // 1 minute
    monitoringPeriod: number = 10000 // 10 seconds
  ) {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.nextAttemptTime = 0;
    this.successCount = 0;
    this.failureThreshold = failureThreshold;
    this.resetTimeout = resetTimeout;
    this.monitoringPeriod = monitoringPeriod;
  }

  public isOpen(): boolean {
    this.updateState();
    return this.state === CircuitBreakerState.OPEN;
  }

  public isClosed(): boolean {
    this.updateState();
    return this.state === CircuitBreakerState.CLOSED;
  }

  public isHalfOpen(): boolean {
    this.updateState();
    return this.state === CircuitBreakerState.HALF_OPEN;
  }

  public recordSuccess(): void {
    this.successCount++;
    
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      // If we're in half-open state and got a success, close the circuit
      this.state = CircuitBreakerState.CLOSED;
      this.failureCount = 0;
      this.successCount = 0;
    } else if (this.state === CircuitBreakerState.CLOSED) {
      // Reset failure count on success in closed state
      this.failureCount = 0;
    }
  }

  public recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitBreakerState.CLOSED && this.failureCount >= this.failureThreshold) {
      // Open the circuit breaker
      this.state = CircuitBreakerState.OPEN;
      this.nextAttemptTime = Date.now() + this.resetTimeout;
    } else if (this.state === CircuitBreakerState.HALF_OPEN) {
      // If we're in half-open state and got a failure, open the circuit again
      this.state = CircuitBreakerState.OPEN;
      this.nextAttemptTime = Date.now() + this.resetTimeout;
    }
  }

  private updateState(): void {
    const now = Date.now();

    if (this.state === CircuitBreakerState.OPEN && now >= this.nextAttemptTime) {
      // Transition from open to half-open
      this.state = CircuitBreakerState.HALF_OPEN;
      this.successCount = 0;
    }

    // Reset failure count if monitoring period has passed without failures
    if (this.state === CircuitBreakerState.CLOSED && 
        this.lastFailureTime > 0 && 
        now - this.lastFailureTime > this.monitoringPeriod) {
      this.failureCount = 0;
    }
  }

  public getState(): CircuitBreakerState {
    this.updateState();
    return this.state;
  }

  public getStats(): {
    state: CircuitBreakerState;
    failureCount: number;
    successCount: number;
    lastFailureTime: number;
    nextAttemptTime: number;
  } {
    this.updateState();
    
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime
    };
  }

  public reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    this.nextAttemptTime = 0;
  }

  public forceOpen(): void {
    this.state = CircuitBreakerState.OPEN;
    this.nextAttemptTime = Date.now() + this.resetTimeout;
  }

  public forceClose(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    this.nextAttemptTime = 0;
  }
}