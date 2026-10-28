import { describe, test, expect } from 'bun:test';
import { TighEngine, jsonBody } from '../src/server';
import {
  createBunHandler,
  createCloudflareHandler,
  createNextHandler,
  createNodeHandler,
  createNodeMiddleware,
} from '../src/adapters';
import { EventEmitter } from 'node:events';

describe('Tigh Runtime Adapters', () => {
  test('Bun adapter delegates directly to engine.fetch', async () => {
    const engine = new TighEngine({ enableRateLimit: false });
    engine.get('/ping', async () => jsonBody({ pong: true }));

    const handler = createBunHandler(engine);
    const res = await handler(new Request('http://localhost/ping'));
    expect(res.status).toBe(200);
    expect((await res.json()).pong).toBe(true);
    engine.destroy();
  });

  test('Cloudflare Workers adapter delegates to engine.fetch', async () => {
    const engine = new TighEngine({ enableRateLimit: false });
    engine.get('/cf', async () => jsonBody({ runtime: 'cloudflare' }));

    const handler = createCloudflareHandler(engine);
    const res = await handler(new Request('http://localhost/cf'));
    expect(res.status).toBe(200);
    expect((await res.json()).runtime).toBe('cloudflare');
    engine.destroy();
  });

  test('Next.js App Router adapter handles route.ts requests', async () => {
    const engine = new TighEngine({ enableRateLimit: false });
    engine.get('/api/next', async () => jsonBody({ framework: 'next' }));

    const handler = createNextHandler(engine);
    const res = await handler(new Request('http://localhost/api/next'), {
      params: { id: 'test' },
    });
    expect(res.status).toBe(200);
    expect((await res.json()).framework).toBe('next');
    engine.destroy();
  });

  test('Node.js adapter handles IncomingMessage and ServerResponse', async () => {
    const engine = new TighEngine({ enableRateLimit: false });
    engine.get('/node-test', async () => jsonBody({ node: true }));

    const handler = createNodeHandler(engine);

    // Mock IncomingMessage
    const req = new EventEmitter() as any;
    req.method = 'GET';
    req.url = '/node-test';
    req.headers = { host: '127.0.0.1:3000' };

    // Mock ServerResponse
    let statusCode = 0;
    let writtenHeaders: any = {};
    let writtenBody: Buffer | null = null;

    const res: any = {
      writeHead(code: number, headers: any) {
        statusCode = code;
        writtenHeaders = headers;
      },
      end(chunk?: Buffer) {
        if (chunk) writtenBody = chunk;
      },
    };

    handler(req, res);
    // Simulate end of request stream
    req.emit('end');

    // Wait for microtask / async processing
    await new Promise((r) => setTimeout(r, 20));

    expect(statusCode).toBe(200);
    expect(writtenHeaders['content-type']).toContain('application/json');
    expect(writtenBody).not.toBeNull();
    const parsed = JSON.parse(writtenBody!.toString());
    expect(parsed.node).toBe(true);
    engine.destroy();
  });

  test('Node middleware wraps createNodeHandler', async () => {
    const engine = new TighEngine({ enableRateLimit: false });
    engine.get('/mw', async () => jsonBody({ mw: true }));

    const mw = createNodeMiddleware(engine);
    expect(typeof mw).toBe('function');
    engine.destroy();
  });
});
