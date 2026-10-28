/**
 * Example 1: Full-featured REST API with Tigh v1
 *
 * Demonstrates:
 * - Route grouping and prefixing
 * - Radix trie dynamic parameters (`[id]` and `:slug`)
 * - Global and scoped middlewares (authentication, logging)
 * - Pre-serialized zero-copy response caching (`PrebuiltCache`)
 * - GCRA rate limiting with IETF-standard headers
 * - RFC 7807 problem details
 */
import { TighEngine, jsonBody, problemResponse } from '../src';

interface Product {
  id: string;
  name: string;
  price: number;
  inStock: boolean;
}

const database = new Map<string, Product>([
  ['1', { id: '1', name: 'Ultra-fast SSD 2TB', price: 189.99, inStock: true }],
  ['2', { id: '2', name: 'Mechanical Keyboard RGB', price: 129.5, inStock: true }],
  ['3', { id: '3', name: 'Studio Monitor Headphones', price: 149.0, inStock: false }],
]);

export function createProductApiEngine(): TighEngine {
  const engine = new TighEngine({
    rateLimit: { maxRequests: 50, windowMs: 60000 },
    enableMetrics: true,
  });

  // Global logging middleware
  engine.use(async (req, next) => {
    const start = performance.now();
    const res = await next();
    const duration = (performance.now() - start).toFixed(2);
    console.log(`[TIGH] ${req.method} ${req.path} -> ${res.status} (${duration}ms)`);
    return res;
  });

  // Health check endpoint
  engine.get('/health', async () => jsonBody({ status: 'ok', timestamp: Date.now() }));

  // Metrics endpoint with Prometheus output
  engine.get('/metrics', async () => {
    return {
      status: 200,
      headers: { 'content-type': 'text/plain; version=0.0.4; charset=utf-8' },
      body: new TextEncoder().encode(engine.metrics.toPrometheus()),
    };
  });

  // Grouped Product Routes under /api/v1
  engine.group('/api/v1', (api) => {
    // List all products with caching
    api.get(
      '/products',
      async () => {
        const list = Array.from(database.values());
        return jsonBody({ count: list.length, items: list });
      },
      {
        cache: { ttl: 30000, key: () => 'products:list' },
      }
    );

    // Get product by dynamic param [id]
    api.get('/products/[id]', async (req) => {
      const product = database.get(req.params.id);
      if (!product) {
        return problemResponse(404, 'Product Not Found', `Product '${req.params.id}' does not exist.`);
      }
      return jsonBody(product);
    });

    // Create new product (Protected route)
    api.post('/products', async (req) => {
      const apiKey = req.headers['authorization'];
      if (!apiKey || apiKey !== 'Bearer secret-token') {
        return problemResponse(401, 'Unauthorized', 'Invalid or missing API key.');
      }

      const body = req.body as Partial<Product> | undefined;
      if (!body || !body.name || typeof body.price !== 'number') {
        return problemResponse(400, 'Bad Request', 'Invalid product data: name and price are required.');
      }

      const newId = String(database.size + 1);
      const newProduct: Product = {
        id: newId,
        name: body.name,
        price: body.price,
        inStock: body.inStock ?? true,
      };

      database.set(newId, newProduct);
      // Invalidate the cached list
      engine.invalidateCache('products:*');

      return jsonBody(newProduct, 201);
    });
  });

  return engine;
}

// Standalone Bun runner
if (import.meta.main) {
  const engine = createProductApiEngine();
  console.log('Tigh REST API listening at http://localhost:3000');
  Bun.serve({
    port: 3000,
    fetch: (req) => engine.fetch(req),
  });
}
