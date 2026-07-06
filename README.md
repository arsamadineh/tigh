# Tigh

A lightweight, composable TypeScript API engine with built-in routing, caching, rate limiting, circuit breaking, middleware support, and comprehensive metrics.

## Features

- Routing — Fast trie-based routing with path parameters and wildcards
- Caching — LRU cache with TTL support and pattern-based invalidation
- Rate Limiting — Token bucket, sliding window, and fixed window strategies
- Circuit Breaker — Automatic failure detection and recovery
- Middleware — Chainable middleware with CORS and timing out of the box
- Metrics — Built-in request tracking, latency percentiles, and performance analytics
- Next.js Adapter — Drop-in integration for Next.js API routes

## Installation

```bash
npm install tigh
```

## Quick Start

```typescript
import { Tigh } from 'tigh';

const engine = new Tigh({
  enableCache: true,
  enableRateLimit: true,
  enableMetrics: true,
});

engine.get('/quotes/:id', async (req) => {
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: { quote: `Quote ${req.params.id}` },
  };
});

const response = await engine.handle('GET', '/quotes/42', {
  method: 'GET',
  path: '/quotes/42',
  headers: {},
  query: {},
  params: {},
  timestamp: Date.now(),
});
```

## Documentation

### English

- README.md (this file)
- USAGE_GUIDE.md - Detailed usage guide with examples
- CONTRIBUTING.md - How to contribute
- CODE_OF_CONDUCT.md - Community guidelines

### Persian (فارسی)

- README_FA.md - دستورالعمل کامل به فارسی
- USAGE_GUIDE_FA.md - راهنمای استفاده تفصیلی
- CONTRIBUTING_FA.md - چگونگی سهم‌گذاری
- CODE_OF_CONDUCT_FA.md - رهنمودهای جامعه

## API Reference

### Creating an Engine

```typescript
const engine = new Tigh(config?: Partial<EngineConfig>);
```

Configuration Options:

```typescript
interface EngineConfig {
  cache: {
    maxSize: number;           // Default: 10000
    defaultTTL: number;        // Default: 60000ms
    checkInterval: number;     // Default: 30000ms
  };
  rateLimit: {
    windowMs: number;          // Default: 60000ms
    maxRequests: number;       // Default: 100
    strategy: 'token-bucket' | 'sliding-window' | 'fixed-window';
  };
  circuitBreaker: {
    failureThreshold: number;  // Default: 5
    recoveryTimeout: number;   // Default: 30000ms
    halfOpenMaxAttempts: number; // Default: 3
    monitoringPeriod: number;  // Default: 60000ms
  };
  enableMetrics: boolean;      // Default: true
  enableCache: boolean;        // Default: true
  enableRateLimit: boolean;    // Default: true
  enableCircuitBreaker: boolean; // Default: true
  cors: {
    origin: string | string[]; // Default: '*'
    methods: string[];
    headers: string[];
    maxAge: number;
  };
}
```

### Defining Routes

Shorthand methods:

```typescript
engine.get(path, handler, options?);
engine.post(path, handler, options?);
engine.put(path, handler, options?);
engine.delete(path, handler, options?);
```

Example:

```typescript
engine.get('/api/quotes', async (req) => {
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: { quotes: [] },
  };
});

engine.post('/api/quotes', async (req) => {
  return {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
    body: { id: 1, ...req.body },
  };
});
```

### Path Parameters

```typescript
// Named parameters
engine.get('/users/:id', async (req) => {
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: { id: req.params.id },
  };
});

// Wildcard routes
engine.get('/static/*', async (req) => {
  const filePath = req.params['*'];
  return {
    status: 200,
    headers: { 'Content-Type': 'text/css' },
    body: '/* CSS content */',
  };
});
```

### Caching

Enable caching per route:

```typescript
engine.get(
  '/api/config',
  async (req) => {
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { config: 'data' },
    };
  },
  {
    cache: {
      ttl: 3600000, // 1 hour
      key: (req) => 'config',
    },
  }
);
```

Invalidate cache patterns:

```typescript
engine.invalidateCache('config:*');
```

### Rate Limiting

Configure rate limiting:

```typescript
const engine = new Tigh({
  rateLimit: {
    windowMs: 60000,
    maxRequests: 100,
    strategy: 'token-bucket',
    keyGenerator: (req) => req.headers['x-user-id'] || req.ip,
  },
});
```

Rate-limited responses return 429 with headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: <timestamp>
Retry-After: 60
```

### Middleware

Use middleware to customize request/response handling:

```typescript
engine.use(async (req, next) => {
  console.log(`${req.method} ${req.path}`);
  const res = await next();
  console.log(`Response: ${res.status}`);
  return res;
});
```

Built-in middleware:

```typescript
import { corsMiddleware, timingMiddleware, compressMiddleware } from 'tigh';

engine.use(corsMiddleware({ origin: '*' }));
engine.use(timingMiddleware());
engine.use(compressMiddleware());
```

### Circuit Breaker

Automatically open circuit when failures exceed threshold:

```typescript
const engine = new Tigh({
  circuitBreaker: {
    failureThreshold: 5,
    recoveryTimeout: 30000,
    halfOpenMaxAttempts: 3,
  },
});
```

States: Closed (normal) -> Open (failing) -> Half-Open (recovery)

### Metrics

Capture performance snapshots:

```typescript
const metrics = engine.flushMetrics();

console.log(metrics.requests.total);        // Total requests
console.log(metrics.latency.p99);           // 99th percentile latency
console.log(metrics.cache.hitRate);         // Cache hit rate
console.log(metrics.circuitBreaker.state);  // Circuit state
```

## Next.js Integration

Use the adapter to integrate with Next.js API routes:

```typescript
// app/api/quotes/[id]/route.ts
import { Tigh, createNextHandler } from 'tigh';

const engine = new Tigh({
  enableCache: true,
  enableRateLimit: true,
});

engine.get('/api/quotes/:id', async (req) => {
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: { id: req.params.id, quote: '...' },
  };
});

export const GET = createNextHandler(engine);
```

## Project Structure

```
tigh/
├── src/
│   ├── engine.ts                 Main engine class
│   ├── types.ts                  TypeScript definitions
│   ├── router.ts                 Trie-based routing
│   ├── cache.ts                  LRU cache implementation
│   ├── rate-limiter.ts           Rate limiting (3 strategies)
│   ├── circuit-breaker.ts        Automatic failure recovery
│   ├── middleware.ts             Middleware system
│   ├── metrics.ts                Performance metrics
│   ├── adapter-next.ts           Next.js adapter
│   └── index.ts                  Main exports
├── dist/                         Compiled output
├── package.json                  Dependencies
├── tsconfig.json                 TypeScript config
├── LICENSE                       MIT License
└── README.md                     This file
```

## Best Practices

1. Cache strategically - focus on read-heavy, infrequently-changing data
2. Monitor metrics - set up alerts for anomalies
3. Test circuit breaker - simulate failures to verify recovery
4. Clean up resources - call engine.destroy() on shutdown
5. Use appropriate TTLs - balance freshness with performance

## License

MIT

## Contributing

Contributions welcome! Please see CONTRIBUTING.md for guidelines.

## Support

For issues and questions:
- GitHub Issues: https://github.com/arsamadineh/tigh/issues
- Discussions: https://github.com/arsamadineh/tigh/discussions

---

Built with care for the Persian-speaking community.
