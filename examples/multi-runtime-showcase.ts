/**
 * Example 2: Multi-Runtime Deployment Showcase
 *
 * Demonstrates how a single TighEngine instance can be deployed across:
 * 1. Bun.serve
 * 2. Node.js (http.createServer)
 * 3. Next.js App Router (app/api/[...route]/route.ts)
 * 4. Cloudflare Workers
 */
import { TighEngine, jsonBody } from '../src';
import {
  createBunHandler,
  createCloudflareHandler,
  createNextHandler,
  createNodeHandler,
} from '../src/adapters';

// Define core API engine once
export const coreEngine = new TighEngine();

coreEngine.get('/api/info', async (req) => {
  return jsonBody({
    name: 'Unified Core Engine',
    timestamp: Date.now(),
    clientIp: req.ip,
  });
});

coreEngine.get('/api/users/[userId]', async (req) => {
  return jsonBody({
    userId: req.params.userId,
    profile: { status: 'active', verified: true },
  });
});

// 1. Bun Runtime
export const bunServer = {
  fetch: createBunHandler(coreEngine),
};

// 2. Cloudflare Workers
export const cloudflareWorker = {
  fetch: createCloudflareHandler(coreEngine),
};

// 3. Next.js App Router (e.g. app/api/[...route]/route.ts)
export const nextHandler = {
  GET: createNextHandler(coreEngine),
  POST: createNextHandler(coreEngine),
  OPTIONS: createNextHandler(coreEngine),
};

// 4. Node.js native http server
export function startNodeServer(port = 4000) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const http = require('node:http');
  const server = http.createServer(createNodeHandler(coreEngine));
  server.listen(port, () => {
    console.log(`Node.js server listening on http://localhost:${port}`);
  });
  return server;
}
