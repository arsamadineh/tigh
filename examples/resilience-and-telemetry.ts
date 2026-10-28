/**
 * Example 3: Microservice Resilience & Telemetry
 *
 * Demonstrates:
 * - Protecting flakey downstream services with TighCircuitBreaker
 * - Automatic 503 fallback with Retry-After header
 * - Real-time DDSketch latency percentiles (P50, P90, P99)
 * - Prometheus metrics exposition
 */
import { TighEngine, jsonBody } from '../src';

export function createResilientEngine(): TighEngine {
  const engine = new TighEngine({
    enableCircuitBreaker: true,
    circuitBreaker: {
      failureThreshold: 3, // trip after 3 failures
      recoveryTimeout: 5000, // wait 5s before entering half-open
      halfOpenMaxAttempts: 2,
      monitoringPeriod: 10000,
    },
  });

  let simulatedDbHealthy = false;

  // Endpoint demonstrating circuit breaker protection
  engine.get('/api/external-data', async () => {
    if (!simulatedDbHealthy) {
      throw new Error('Downstream Database Connection Refused');
    }
    return jsonBody({ source: 'external-db', data: [1, 2, 3] });
  });

  // Admin switch to recover DB
  engine.post('/admin/recover-db', async () => {
    simulatedDbHealthy = true;
    return jsonBody({ message: 'Downstream DB recovered' });
  });

  // Prometheus telemetry endpoint
  engine.get('/metrics', async () => {
    return {
      status: 200,
      headers: { 'content-type': 'text/plain; version=0.0.4; charset=utf-8' },
      body: new TextEncoder().encode(engine.metrics.toPrometheus()),
    };
  });

  return engine;
}
