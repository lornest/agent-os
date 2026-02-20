import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { StaticServer } from '../src/static-server.js';

const TEST_PORT = 19891;

describe('StaticServer', () => {
  let httpServer: Server;
  let staticServer: StaticServer;
  const testDir = join(tmpdir(), `static-server-test-${Date.now()}`);

  beforeAll(async () => {
    // Create test static files
    mkdirSync(testDir, { recursive: true });
    mkdirSync(join(testDir, 'assets'), { recursive: true });
    writeFileSync(join(testDir, 'index.html'), '<html><body>Hello</body></html>');
    writeFileSync(join(testDir, 'style.css'), 'body { color: red; }');
    writeFileSync(join(testDir, 'assets', 'app.js'), 'console.log("hi")');

    staticServer = new StaticServer(testDir);

    httpServer = createServer((req, res) => {
      staticServer.handle(req, res);
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(TEST_PORT, resolve);
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
    rmSync(testDir, { recursive: true, force: true });
  });

  it('serves index.html with correct MIME type', async () => {
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/index.html`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const body = await res.text();
    expect(body).toContain('Hello');
  });

  it('serves CSS with correct MIME type', async () => {
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/style.css`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/css');
  });

  it('serves JS with correct MIME type', async () => {
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/assets/app.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/javascript');
  });

  it('SPA fallback: returns index.html for unknown paths', async () => {
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/some/deep/route`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('Hello');
  });

  it('sets cache headers: no-cache for HTML', async () => {
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/index.html`);
    expect(res.headers.get('cache-control')).toBe('no-cache');
  });

  it('sets cache headers: immutable for assets', async () => {
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/assets/app.js`);
    expect(res.headers.get('cache-control')).toContain('immutable');
  });

  it('SPA fallback uses no-cache headers', async () => {
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/unknown-route`);
    expect(res.headers.get('cache-control')).toBe('no-cache');
  });
});
