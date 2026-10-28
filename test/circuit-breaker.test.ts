import { describe, test, expect } from 'bun:test';
import { TighCircuitBreaker, CircuitOpenError } from '../src/circuit-breaker/circuit-breaker';

describe('TighCircuitBreaker', () => {
  test('executes successfully and remains closed on success', async () => {
    const breaker = new TighCircuitBreaker({ failureThreshold: 3 });
    const result = await breaker.execute(async () => 'ok');
    expect(result).toBe('ok');
    expect(breaker.getState()).toBe('closed');
    expect(breaker.getStats().successes).toBe(1);
    expect(breaker.getStats().failures).toBe(0);
  });

  test('trips to open state after consecutive failures', async () => {
    const breaker = new TighCircuitBreaker({
      failureThreshold: 2,
      recoveryTimeout: 200,
      halfOpenMaxAttempts: 1,
    });

    const failing = async () => {
      throw new Error('downstream-error');
    };

    await expect(breaker.execute(failing)).rejects.toThrow('downstream-error');
    expect(breaker.getState()).toBe('closed');

    await expect(breaker.execute(failing)).rejects.toThrow('downstream-error');
    // Trips to open after 2 failures
    expect(breaker.getState()).toBe('open');

    // Subsequent calls fail fast with CircuitOpenError without executing fn
    let fnExecuted = false;
    await expect(
      breaker.execute(async () => {
        fnExecuted = true;
        return 'not-reached';
      })
    ).rejects.toThrow(CircuitOpenError);
    expect(fnExecuted).toBe(false);
  });

  test('recovers through half-open state after recoveryTimeout', async () => {
    const breaker = new TighCircuitBreaker({
      failureThreshold: 1,
      recoveryTimeout: 50,
      halfOpenMaxAttempts: 2,
    });

    // Trip the circuit
    await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    expect(breaker.getState()).toBe('open');

    // Wait for recovery timeout
    await new Promise((r) => setTimeout(r, 60));
    expect(breaker.getState()).toBe('half-open');

    // Trial attempt 1 in half-open succeeds
    const r1 = await breaker.execute(async () => 'trial-1');
    expect(r1).toBe('trial-1');
    expect(breaker.getState()).toBe('half-open');

    // Trial attempt 2 succeeds -> circuit closes!
    const r2 = await breaker.execute(async () => 'trial-2');
    expect(r2).toBe('trial-2');
    expect(breaker.getState()).toBe('closed');
  });

  test('failure in half-open state trips immediately back to open', async () => {
    const breaker = new TighCircuitBreaker({
      failureThreshold: 1,
      recoveryTimeout: 30,
      halfOpenMaxAttempts: 2,
    });

    await expect(breaker.execute(() => Promise.reject(new Error('fail-1')))).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 40));
    expect(breaker.getState()).toBe('half-open');

    // Failure during half-open trial trips immediately
    await expect(breaker.execute(() => Promise.reject(new Error('fail-half-open')))).rejects.toThrow();
    expect(breaker.getState()).toBe('open');
  });

  test('invokes onStateChange callbacks on state transitions', async () => {
    const breaker = new TighCircuitBreaker({ failureThreshold: 1 });
    const states: string[] = [];
    const unsubscribe = breaker.onStateChange((s) => states.push(s));

    await expect(breaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
    expect(states).toContain('open');

    unsubscribe();
    breaker.reset();
    expect(breaker.getState()).toBe('closed');
  });
});
