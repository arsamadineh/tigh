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

## Table of Contents

1. [Installation](#installation)
2. [Quick Start](#quick-start)
3. [API Reference](#api-reference)
4. [Examples](#examples)
5. [Project Structure](#project-structure)
6. [Best Practices](#best-practices)
7. [Documentation in Other Languages](#documentation-in-other-languages)
8. [License](#license)

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

console.log(response);
```

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

## Examples

### Basic API Server

```typescript
import { Tigh } from 'tigh';

const engine = new Tigh({
  cache: { maxSize: 5000, defaultTTL: 300000 },
  rateLimit: { windowMs: 60000, maxRequests: 1000 },
});

engine.get('/api/quotes', async (req) => {
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: { quotes: [] },
  };
}, { cache: { ttl: 300000 } });

engine.get('/api/quotes/:id', async (req) => {
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: { id: req.params.id, text: 'Quote text...' },
  };
}, {
  cache: {
    ttl: 600000,
    key: (req) => `quote:${req.params.id}`,
  },
});

engine.post('/api/quotes', async (req) => {
  const { text, author } = req.body as { text: string; author: string };
  engine.invalidateCache('quote:*');
  
  return {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
    body: {
      id: Date.now(),
      text,
      author,
      createdAt: new Date().toISOString(),
    },
  };
});
```

### With Middleware

```typescript
import { Tigh, corsMiddleware, timingMiddleware } from 'tigh';

const engine = new Tigh();

engine.use(corsMiddleware({ origin: '*' }));
engine.use(timingMiddleware());

engine.use(async (req, next) => {
  const token = req.headers['authorization'];
  if (!token) {
    return {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Unauthorized' },
    };
  }
  return next();
});

engine.get('/api/protected', async (req) => {
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: { message: 'Protected resource' },
  };
});
```

### Next.js Integration

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
│   ├── instance.ts               Engine instance helpers
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
6. Validate input - always validate request data before processing
7. Use HTTPS in production - never transmit sensitive data over HTTP
8. Implement proper authentication - use middleware for auth checks

## Documentation in Other Languages

### فارسی (Persian)

Tigh provides complete documentation in Persian for Persian-speaking developers:

- **README_FA.md** - Complete Persian documentation with examples
- **USAGE_GUIDE_FA.md** - Detailed usage guide with Persian examples
- **CONTRIBUTING_FA.md** - Persian contribution guidelines
- **CODE_OF_CONDUCT_FA.md** - Persian community guidelines
- **CHANGELOG_FA.md** - Persian release notes
- **SETUP.md** - Bilingual setup and deployment guide

#### فارسی مختصر (Quick Persian Overview)

تیغ یک موتور API سبک‌وزن و قابل ترکیب برای TypeScript است که شامل:

- مسیریابی تریه‌ای سریع
- کش LRU با TTL
- محدودیت نرخ (3 استراتژی)
- قطع مدار خودکار
- سیستم middleware
- معیارهای جامع
- انطباق‌گر Next.js

For full Persian documentation, see README_FA.md

## Additional Resources

- **CONTRIBUTING.md** - How to contribute to Tigh
- **CODE_OF_CONDUCT.md** - Community guidelines
- **SECURITY.md** - Security best practices
- **CHANGELOG.md** - Release notes and version history
- **SETUP.md** - Setup and deployment guide

## Support

For issues and questions:

- GitHub Issues: https://github.com/arsamadineh/tigh/issues
- Discussions: https://github.com/arsamadineh/tigh/discussions
- Security Issues: Please report privately

## License

MIT License - see LICENSE file for details

Copyright (c) 2026 Arsam Adineh

---

Built with care for developers worldwide. Full documentation available in English and Persian.
