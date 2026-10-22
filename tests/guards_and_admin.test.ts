import { test, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createTestServer, TestServerContext } from './test_helper';

test('Guards, Admin Authentication, and Rate Limiting Suite', async (t) => {
  let ctx: TestServerContext;
  const originalFetch = globalThis.fetch;

  before(async () => {
    ctx = await createTestServer();
  });

  after(async () => {
    globalThis.fetch = originalFetch;
    await ctx.close();
  });

  await t.test('Admin-guarded endpoints reject requests with invalid token', async () => {
    const prevAdmin = process.env.ENTROPOS_ADMIN_TOKEN;
    process.env.ENTROPOS_ADMIN_TOKEN = 'secret-admin-pass-123';

    try {
      // 1. Wrong token -> 401
      const resWrong = await fetch(`${ctx.baseUrl}/api/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer wrong-token',
        },
        body: JSON.stringify({ mode: 'max_quality' }),
      });
      assert.strictEqual(resWrong.status, 401);

      // 2. Correct token -> 200
      const resCorrect = await fetch(`${ctx.baseUrl}/api/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer secret-admin-pass-123',
        },
        body: JSON.stringify({ mode: 'max_quality' }),
      });
      assert.strictEqual(resCorrect.status, 200);
      const dataCorrect = await resCorrect.json();
      assert.strictEqual(dataCorrect.activeMode, 'max_quality');
    } finally {
      if (prevAdmin) process.env.ENTROPOS_ADMIN_TOKEN = prevAdmin;
      else delete process.env.ENTROPOS_ADMIN_TOKEN;
    }
  });

  await t.test('Rate limiter returns 429 with Retry-After header when threshold exceeded', async () => {
    // /api/adaptive-telemetry/reset has max: 3 requests per 60s
    const prevAdmin = process.env.ENTROPOS_ADMIN_TOKEN;
    delete process.env.ENTROPOS_ADMIN_TOKEN;

    try {
      for (let i = 0; i < 3; i++) {
        const res = await fetch(`${ctx.baseUrl}/api/adaptive-telemetry/reset`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        assert.strictEqual(res.status, 200);
      }

      // 4th request should be rate-limited
      const rateLimitedRes = await fetch(`${ctx.baseUrl}/api/adaptive-telemetry/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      assert.strictEqual(rateLimitedRes.status, 429);
      assert.ok(rateLimitedRes.headers.get('retry-after'));
      const data = await rateLimitedRes.json();
      assert.strictEqual(data.error, 'Too many requests');
    } finally {
      if (prevAdmin) process.env.ENTROPOS_ADMIN_TOKEN = prevAdmin;
    }
  });

  await t.test('/api/test-provider returns 400 when provider key is missing and measures ping when present', async () => {
    // Missing key
    const resNoKey = await fetch(`${ctx.baseUrl}/api/test-provider`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId: 'openai' }),
    });
    assert.strictEqual(resNoKey.status, 400);
    const dataNoKey = await resNoKey.json();
    assert.strictEqual(dataNoKey.status, 'not_configured');

    // With key & mocked fetch
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes('api.openai.com')) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      return originalFetch(url, init);
    }) as any;

    process.env.OPENAI_API_KEY = 'mock-key';
    try {
      const resWithKey = await fetch(`${ctx.baseUrl}/api/test-provider`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: 'openai' }),
      });
      assert.strictEqual(resWithKey.status, 200);
      const dataWithKey = await resWithKey.json();
      assert.strictEqual(dataWithKey.status, 'connected');
      assert.ok(typeof dataWithKey.latencyMs === 'number');
    } finally {
      delete process.env.OPENAI_API_KEY;
    }
  });
});
