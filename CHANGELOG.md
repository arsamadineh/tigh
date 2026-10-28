# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-10-28

### 🚀 Major Architectural Enhancements & Features

- **Radix (Patricia) Trie Router (`TighRadixRouter`)**:
  - Sub-microsecond compiled route matching per HTTP method with zero lookup allocations.
  - Full support for dynamic bracket parameters `[param]`, colon parameters `:param`, and trailing wildcards `*`.
  - Automatic mid-segment edge splitting and reverse-insertion edge reorganization.
  - Unicode NFC normalization and URL path decoding (full support for Persian and international characters).

- **S3-FIFO Prebuilt Response Cache (`PrebuiltCache`)**:
  - Zero-copy storage of pre-serialized `Uint8Array` response byte fragments.
  - Eliminates repetitive runtime `JSON.stringify` on cached hot paths.
  - S3-FIFO 3-queue cache eviction (`in`, `probation`, `main`) with W-TinyLFU ghost ledger admission.
  - Single-flight request coalescing (`withSingleFlight`) to prevent cache thundering herds under high concurrency.
  - Wildcard pattern cache invalidation (`engine.invalidateCache('pattern:*')`).

- **GCRA Rate Limiter (`TighGcraRateLimiter`)**:
  - Implements the Generic Cell Rate Algorithm (virtual clock leaky bucket).
  - Emits standard IETF rate limiting headers (`RateLimit`, `RateLimit-Policy`, `Retry-After`) alongside legacy `X-RateLimit-*`.
  - Configurable IP resolver and custom key generator.

- **Circuit Breaker (`TighCircuitBreaker`)**:
  - State machine with `closed`, `open`, and `half-open` states.
  - Automatic fast-fail with HTTP 503 and `Retry-After` header during outages.
  - Smooth self-healing and recovery probing in half-open state.

- **Bounded Telemetry & DDSketch (`TighMetrics`, `DDSketch`)**:
  - Streaming quantile estimation (P50, P90, P95, P99) with logarithmic bucketing.
  - Strict bounded memory consumption (zero memory growth over time).
  - Built-in Prometheus exposition format generator (`metrics.toPrometheus()`).

- **Web-Standard Server Boundary (`TighEngine.fetch`)**:
  - Built around the Fetch API standard `Request` and `Response`.
  - Built-in CORS preflight and OPTIONS handling.
  - Automatic deterministic ETag calculation with conditional HTTP 304 Not Modified responses.
  - RFC 7807 Problem Details for 404, 500, and client errors.

- **Multi-Runtime Adapters**:
  - `tigh/adapters/bun`: Native `Bun.serve` integration.
  - `tigh/adapters/cloudflare`: Native Cloudflare Workers fetch handler.
  - `tigh/adapters/next`: Drop-in handler for Next.js App Router (`route.ts`).
  - `tigh/adapters/node`: Native Node.js `http.createServer` and Connect/Express middleware.

- **Backward Compatibility**:
  - Preserved legacy v0 class interfaces (`TighCache`, `TighRateLimiter`, `TighCircuitBreaker`, `TighEngine`) and types.

---

## [0.0.1-beta] - 2026-07-06

### Added
- Initial release of Tigh API engine
- Trie-based routing system with path parameters and wildcards
- LRU cache with TTL support and pattern-based invalidation
- Rate limiting with three strategies: Token Bucket, Sliding Window, Fixed Window
- Automatic circuit breaker with failure detection and recovery
- Chainable middleware system with built-in CORS and timing
- Next.js adapter for API routes
