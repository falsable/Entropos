import { test, describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createTestServer, TestServerContext } from './test_helper';
import { productionStore } from '../src/server/storage';

describe('Providers Capacity & Real BYOK Key Management Suite (Entropos-ugg.16)', () => {
  let ctx: TestServerContext;
  let sessionToken: string;
  const originalFetch = globalThis.fetch;

  before(async () => {
    ctx = await createTestServer();

    // Register user for auth token
    const regRes = await fetch(`${ctx.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `byok_tester_${Date.now()}@company.com`,
        password: 'password123',
        name: 'BYOK Tester',
      }),
    });
    assert.strictEqual(regRes.status, 201);
    const data = await regRes.json();
    sessionToken = data.token;
  });

  after(async () => {
    globalThis.fetch = originalFetch;
    await ctx.close();
  });

  it('GET /api/providers returns unconfigured status when no keys are stored or in ENV', async () => {
    // Ensure clean state for openai
    productionStore.deleteProviderSecret('openai');

    const res = await fetch(`${ctx.baseUrl}/api/providers`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    assert.ok(Array.isArray(data.providers));
    const openai = data.providers.find((p: any) => p.id === 'openai');
    assert.ok(openai);
    assert.strictEqual(openai.status, 'not_configured');
    assert.strictEqual(openai.hasApiKey, false);
    assert.strictEqual(openai.testedLatencyMs, null);
  });

  it('POST /api/providers/key rejects invalid inputs with 400 Bad Request', async () => {
    // 1. Missing key
    const resNoKey = await fetch(`${ctx.baseUrl}/api/providers/key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({ providerId: 'openai', apiKey: '   ' }),
    });
    assert.strictEqual(resNoKey.status, 400);

    // 2. Unsupported provider
    const resBadProvider = await fetch(`${ctx.baseUrl}/api/providers/key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({ providerId: 'invalid_llm', apiKey: 'sk-12345' }),
    });
    assert.strictEqual(resBadProvider.status, 400);
  });

  it('POST /api/providers/key tests ping and rejects invalid key without saving', async () => {
    // Mock upstream failure (e.g. 401 Invalid API Key)
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes('api.anthropic.com')) {
        return new Response(JSON.stringify({ error: { message: 'Invalid API Key' } }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return originalFetch(url, init);
    }) as any;

    const res = await fetch(`${ctx.baseUrl}/api/providers/key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        providerId: 'anthropic',
        apiKey: 'sk-ant-api03-invalid-key-attempt',
      }),
    });

    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.strictEqual(body.status, 'error');
    assert.ok(body.error.includes('Invalid API Key') || body.error.includes('Validation failed'));

    // Verify key was NOT stored in database
    const stored = productionStore.getProviderSecret('anthropic');
    assert.strictEqual(stored, undefined);
  });

  it('POST /api/providers/key verifies valid key, encrypts in SQLite, and returns maskedKey', async () => {
    // Mock upstream success (200 OK)
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes('api.anthropic.com')) {
        return new Response(JSON.stringify({ data: [{ id: 'claude-3-5-sonnet' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return originalFetch(url, init);
    }) as any;

    const rawKey = 'sk-ant-api03-real-working-test-key-998877665544';
    const res = await fetch(`${ctx.baseUrl}/api/providers/key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        providerId: 'anthropic',
        apiKey: rawKey,
      }),
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.providerId, 'anthropic');
    assert.strictEqual(body.status, 'connected');
    assert.strictEqual(body.hasApiKey, true);
    assert.ok(typeof body.testedLatencyMs === 'number');
    assert.ok(body.maskedKey);
    assert.strictEqual(body.maskedKey, 'sk-ant-...5544');
    assert.ok(!JSON.stringify(body).includes(rawKey), 'Must never return raw key to client');

    // Verify secret is stored encrypted in SQLite
    const retrieved = productionStore.getProviderSecret('anthropic');
    assert.strictEqual(retrieved, rawKey);

    // Verify GET /api/providers reflects connected status and maskedKey
    const listRes = await fetch(`${ctx.baseUrl}/api/providers`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    const listData = await listRes.json();
    const anthropic = listData.providers.find((p: any) => p.id === 'anthropic');
    assert.ok(anthropic);
    assert.strictEqual(anthropic.status, 'connected');
    assert.strictEqual(anthropic.hasApiKey, true);
    assert.strictEqual(anthropic.maskedKey, 'sk-ant-...5544');
    assert.ok(anthropic.testedLatencyMs !== null);
  });

  it('DELETE /api/providers/:id/key removes encrypted key and updates status', async () => {
    const delRes = await fetch(`${ctx.baseUrl}/api/providers/anthropic/key`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    assert.strictEqual(delRes.status, 200);
    const delData = await delRes.json();
    assert.strictEqual(delData.status, 'not_configured');
    assert.strictEqual(delData.hasApiKey, false);

    // Verify removed from SQLite store
    const stored = productionStore.getProviderSecret('anthropic');
    assert.strictEqual(stored, undefined);
  });
});
