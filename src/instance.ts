import { TighEngine } from './server';
import { Tigh } from './engine';

export const engine = new TighEngine({
  enableMetrics: true,
  enableCache: true,
  enableRateLimit: true,
  enableCircuitBreaker: true,
  cache: {
    maxSize: 5000,
    defaultTTL: 30000,
    checkInterval: 15000,
  },
  rateLimit: {
    windowMs: 60000,
    maxRequests: 120,
    strategy: 'gcra',
  },
  circuitBreaker: {
    failureThreshold: 5,
    recoveryTimeout: 30000,
    halfOpenMaxAttempts: 3,
    monitoringPeriod: 60000,
  },
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
    headers: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Api-Key'],
    maxAge: 86400,
  },
});

export const legacyEngine = new Tigh();

export { createNextHandler } from './adapters/next';
export default engine;
