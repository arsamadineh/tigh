import type { CircuitBreakerConfig, CircuitBreakerStats, CircuitState } from '../types';

/**
 * Error thrown when a call is attempted while the circuit is OPEN.
 */
export class CircuitOpenError extends Error {
  readonly retryAfter: number;

  constructor(retryAfter: number, message?: string) {
    super(message || `Circuit breaker is open. Retry after ${retryAfter}s`);
    this.name = 'CircuitOpenError';
    this.retryAfter = retryAfter;
  }
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  recoveryTimeout: 30000,
  halfOpenMaxAttempts: 3,
  monitoringPeriod: 60000,
};

/**
 * Circuit breaker protecting downstream resources with closed / open / half-open states.
 * On repeated failures, trips to OPEN and rejects calls immediately until recoveryTimeout
 * elapses, then allows trial attempts in HALF-OPEN. Success closes the circuit; any failure
 * trips it back to OPEN.
 */
export class TighCircuitBreaker {
  private readonly config: CircuitBreakerConfig;
  private state: CircuitState = 'closed';
  private failures = 0;
  private successes = 0;
  private totalTrips = 0;
  private halfOpenAttempts = 0;
  private lastFailureTime = 0;
  private stateEnteredAt = Date.now();
  private stateChangeCallbacks: Array<(state: CircuitState) => void> = [];

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  private now(): number {
    return Date.now();
  }

  private transition(state: CircuitState): void {
    const oldState = this.state;
    this.state = state;
    this.stateEnteredAt = this.now();
    this.halfOpenAttempts = 0;

    if (state === 'closed') {
      this.failures = 0;
      this.successes = 0;
    } else if (state === 'open') {
      this.totalTrips++;
      this.lastFailureTime = this.now();
    }

    if (oldState !== state) {
      for (const cb of this.stateChangeCallbacks) {
        cb(state);
      }
    }
  }

  getState(): CircuitState {
    const now = this.now();
    if (this.state === 'open') {
      if (now - this.stateEnteredAt >= this.config.recoveryTimeout) {
        this.transition('half-open');
      }
    }
    return this.state;
  }

  canExecute(): boolean {
    const current = this.getState();
    if (current === 'closed') return true;
    if (current === 'open') return false;
    // half-open: allow up to halfOpenMaxAttempts
    return this.halfOpenAttempts < this.config.halfOpenMaxAttempts;
  }

  async execute<T>(fn: () => Promise<T> | T): Promise<T> {
    if (!this.canExecute()) {
      const retryAfter = this.getRetryAfterSeconds();
      throw new CircuitOpenError(retryAfter);
    }

    if (this.state === 'half-open') {
      this.halfOpenAttempts++;
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  recordSuccess(): void {
    this.successes++;
    if (this.state === 'half-open') {
      if (this.successes >= this.config.halfOpenMaxAttempts) {
        this.transition('closed');
      }
    } else if (this.state === 'closed' && this.failures > 0) {
      this.failures = Math.max(0, this.failures - 1);
    }
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = this.now();

    if (this.state === 'half-open') {
      this.transition('open');
      return;
    }

    if (this.state === 'closed' && this.failures >= this.config.failureThreshold) {
      this.transition('open');
    }
  }

  getRetryAfter(): number {
    if (this.state !== 'open') return 0;
    const elapsed = this.now() - this.stateEnteredAt;
    return Math.max(0, this.config.recoveryTimeout - elapsed);
  }

  getRetryAfterSeconds(): number {
    return Math.max(1, Math.ceil(this.getRetryAfter() / 1000));
  }

  onStateChange(callback: (state: CircuitState) => void): () => void {
    this.stateChangeCallbacks.push(callback);
    return () => {
      const idx = this.stateChangeCallbacks.indexOf(callback);
      if (idx > -1) this.stateChangeCallbacks.splice(idx, 1);
    };
  }

  getStats(): CircuitBreakerStats {
    return {
      state: this.getState(),
      failures: this.failures,
      successes: this.successes,
      totalTrips: this.totalTrips,
    };
  }

  reset(): void {
    this.transition('closed');
    this.totalTrips = 0;
  }
}
