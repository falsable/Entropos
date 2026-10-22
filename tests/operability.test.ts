import { test, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestServer, TestServerContext } from './test_helper';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('Operability, Security Headers, Readiness, and Logging Suite (dgz.10)', async (t) => {
  let ctx: TestServerContext;

  before(async () => {
    ctx = await createTestServer();
  });

  after(async () => {
    await ctx.close();
  });

  await t.test('Security Headers: X-Powered-By is omitted and hardening headers are present', async () => {
    const res = await fetch(`${ctx.baseUrl}/healthz`);
    assert.strictEqual(res.status, 200);

    // Express signature must be removed
    assert.strictEqual(res.headers.get('x-powered-by'), null);

    // Hardening headers
    assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
    assert.strictEqual(res.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.strictEqual(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.strictEqual(res.headers.get('cross-origin-opener-policy'), 'same-origin');
  });

  await t.test('Structured Request ID: X-Request-Id is generated and propagates client trace IDs', async () => {
    // 1. Auto-generated request ID
    const res1 = await fetch(`${ctx.baseUrl}/healthz`);
    const reqId1 = res1.headers.get('x-request-id');
    assert.ok(reqId1, 'X-Request-Id must be generated');
    assert.ok(reqId1.startsWith('req_'));

    // 2. Client-provided request ID echoed back
    const customTraceId = 'trace_client_99887766';
    const res2 = await fetch(`${ctx.baseUrl}/healthz`, {
      headers: { 'X-Request-Id': customTraceId },
    });
    assert.strictEqual(res2.headers.get('x-request-id'), customTraceId);
  });

  await t.test('Liveness vs Readiness: /healthz (process) vs /readyz (storage + upstream provider)', async () => {
    // Liveness is always 200 if process answers
    const healthRes = await fetch(`${ctx.baseUrl}/healthz`);
    assert.strictEqual(healthRes.status, 200);
    const healthData = await healthRes.json();
    assert.strictEqual(healthData.status, 'healthy');

    // Readiness: test 503 when no upstream provider is configured
    const prevGemini = process.env.GEMINI_API_KEY;
    const prevAnthropic = process.env.ANTHROPIC_API_KEY;
    const prevOpenAI = process.env.OPENAI_API_KEY;
    const prevDeepSeek = process.env.DEEPSEEK_API_KEY;

    delete process.env.GEMINI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;

    try {
      const unreadyRes = await fetch(`${ctx.baseUrl}/readyz`);
      assert.strictEqual(unreadyRes.status, 503);
      const unreadyData = await unreadyRes.json();
      assert.strictEqual(unreadyData.status, 'not_ready');
      assert.strictEqual(unreadyData.checks.storage.status, 'ok');
      assert.strictEqual(unreadyData.checks.storage.engine, 'sqlite_wal');
      assert.strictEqual(unreadyData.checks.upstreamProviders.status, 'failed');

      // Readiness: test 200 when provider key is present
      process.env.GEMINI_API_KEY = 'test_gemini_key_for_readyz';
      const readyRes = await fetch(`${ctx.baseUrl}/readyz`);
      assert.strictEqual(readyRes.status, 200);
      const readyData = await readyRes.json();
      assert.strictEqual(readyData.status, 'ready');
      assert.strictEqual(readyData.checks.upstreamProviders.status, 'ok');
      assert.ok(readyData.checks.upstreamProviders.connected.includes('Google Gemini'));
    } finally {
      if (prevGemini) process.env.GEMINI_API_KEY = prevGemini;
      else delete process.env.GEMINI_API_KEY;
      if (prevAnthropic) process.env.ANTHROPIC_API_KEY = prevAnthropic;
      if (prevOpenAI) process.env.OPENAI_API_KEY = prevOpenAI;
      if (prevDeepSeek) process.env.DEEPSEEK_API_KEY = prevDeepSeek;
    }
  });

  await t.test('Malformed JSON handling: returns 400 JSON error instead of Express HTML page', async () => {
    const res = await fetch(`${ctx.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ctx.workspaceKey}`,
      },
      body: '{"invalid_json": [malformed, syntax',
    });

    assert.strictEqual(res.status, 400);
    const contentType = res.headers.get('content-type') || '';
    assert.ok(contentType.includes('application/json'), `Expected application/json, got ${contentType}`);

    const body = await res.json();
    assert.strictEqual(body.error.code, 'invalid_json');
    assert.strictEqual(body.error.type, 'invalid_request_error');
    assert.ok(body.error.message.includes('Invalid JSON'));
  });

  await t.test('Deployment Artifacts: Dockerfile and docker-compose.yml exist and are valid', async () => {
    const rootDir = path.resolve(__dirname, '..');
    const dockerfilePath = path.resolve(rootDir, 'Dockerfile');
    const composePath = path.resolve(rootDir, 'docker-compose.yml');
    const dockerignorePath = path.resolve(rootDir, '.dockerignore');

    assert.ok(fs.existsSync(dockerfilePath), 'Dockerfile must exist');
    assert.ok(fs.existsSync(composePath), 'docker-compose.yml must exist');
    assert.ok(fs.existsSync(dockerignorePath), '.dockerignore must exist');

    const dockerfileContent = fs.readFileSync(dockerfilePath, 'utf-8');
    assert.ok(dockerfileContent.includes('FROM node:22-alpine AS builder'));
    assert.ok(dockerfileContent.includes('FROM node:22-alpine AS runner'));
    assert.ok(dockerfileContent.includes('USER node'));
    assert.ok(dockerfileContent.includes('HEALTHCHECK'));
    assert.ok(dockerfileContent.includes('EXPOSE 3000'));
  });
});
