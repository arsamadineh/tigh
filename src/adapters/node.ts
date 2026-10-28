import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Engine } from '../types';

/**
 * Creates an HTTP request listener for Node.js `http.createServer`.
 *
 * Usage:
 * ```ts
 * import http from 'node:http';
 * import { TighEngine } from 'tigh';
 * import { createNodeHandler } from 'tigh/adapters/node';
 *
 * const engine = new TighEngine();
 * const server = http.createServer(createNodeHandler(engine));
 * server.listen(3000);
 * ```
 */
export function createNodeHandler(engine: Engine) {
  return (req: IncomingMessage, res: ServerResponse): void => {
    const host = req.headers.host || 'localhost';
    const socket = req.socket as unknown as { encrypted?: boolean } | undefined;
    const proto = socket?.encrypted ? 'https' : 'http';
    const url = new URL(req.url || '/', `${proto}://${host}`);

    const bodyChunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      bodyChunks.push(chunk);
    });

    req.on('end', async () => {
      try {
        const hasBody =
          req.method !== 'GET' && req.method !== 'HEAD' && bodyChunks.length > 0;
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) {
          if (Array.isArray(v)) {
            v.forEach((val) => headers.append(k, val));
          } else if (v !== undefined) {
            headers.set(k, v);
          }
        }

        const init: RequestInit = {
          method: req.method,
          headers,
          body: hasBody ? Buffer.concat(bodyChunks) : undefined,
        };

        const webReq = new Request(url.toString(), init);
        const response = await engine.fetch(webReq);

        const responseHeaders: Record<string, string | string[]> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        res.writeHead(response.status, responseHeaders);
        if (response.body) {
          const ab = await response.arrayBuffer();
          res.end(Buffer.from(ab));
        } else {
          res.end();
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal Server Error';
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Server Error', message }));
      }
    });

    req.on('error', (err) => {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Bad Request', message: err.message }));
    });
  };
}

/**
 * Connect/Express-compatible middleware adapter.
 */
export function createNodeMiddleware(engine: Engine) {
  const handler = createNodeHandler(engine);
  return (
    req: IncomingMessage,
    res: ServerResponse,
    _next?: (err?: unknown) => void
  ): void => {
    handler(req, res);
  };
}
