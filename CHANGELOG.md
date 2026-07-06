# Changelog

## [0.0.1-beta] - 2026-07-06

### Added
- Initial release of Tigh API engine
- Trie-based routing system with path parameters and wildcards
- LRU cache with TTL support and pattern-based invalidation
- Rate limiting with three strategies: Token Bucket, Sliding Window, Fixed Window
- Automatic circuit breaker with failure detection and recovery
- Chainable middleware system with built-in CORS and timing
- Comprehensive metrics collection with latency percentiles
- Next.js adapter for seamless integration
- Full TypeScript support with strict type checking
- Extensive Persian and English documentation

### Core Features
- Routing: Fast trie-based routing supporting named parameters and wildcards
- Caching: LRU cache with configurable TTL and memory limits
- Rate Limiting: Multiple strategies for different use cases
- Circuit Breaker: Automatic failure detection with half-open recovery state
- Middleware: Custom middleware support with built-in utilities
- Metrics: Request tracking, latency percentiles, cache stats, rate limit stats
- Next.js Ready: Drop-in adapter for Next.js API routes
- Performance: Optimized for high-throughput API services

### Documentation
- Complete README in English and Persian
- Detailed usage guide in English and Persian
- Contributing guidelines
- API reference documentation
- Real-world examples

### Known Limitations
- Single-process only (does not support distributed rate limiting or cache)
- No built-in database integration
- Metrics stored in-memory only

## Future Roadmap

- [ ] Redis integration for distributed caching
- [ ] OpenTelemetry instrumentation
- [ ] GraphQL support
- [ ] WebSocket support
- [ ] Distributed rate limiting
- [ ] Request validation middleware
- [ ] Authentication middleware presets
- [ ] API versioning utilities
