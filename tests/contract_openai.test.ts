import { test, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createTestServer, TestServerContext } from './test_helper';

test('OpenAI Compatible Virtual Proxy Contract Suite (/v1)', async (t) => {
  let ctx: TestServerContext;
  const originalFetch = globalThis.fetch;

  before(async () => {
    ctx = await createTestServer();
  });

  after(async () => {
    globalThis.fetch = originalFetch;
    await ctx.close();
  });

  await t.test('GET /v1/models returns model list without authentication', async () => {
    const res = await fetch(`${ctx.baseUrl}/v1/models`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.object, 'list');
    assert.ok(Array.isArray(data.data));
    assert.ok(data.data.some((m: any) => m.id === 'entropos-auto'));
  });

  await t.test('POST /v1/chat/completions rejects requests without valid Bearer workspace key', async () => {
    // Missing Authorization
    const res1 = await fetch(`${ctx.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }),
    });
    assert.strictEqual(res1.status, 401);
    const data1 = await res1.json();
    assert.strictEqual(data1.error.code, 'invalid_api_key');

    // Invalid Authorization
    const res2 = await fetch(`${ctx.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer invalid_random_key_123',
      },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }),
    });
    assert.strictEqual(res2.status, 401);
  });

  await t.test('POST /v1/chat/completions returns 503 when no provider is available (dgz.1)', async () => {
    // Ensure no provider keys in environment
    const prevGemini = process.env.GEMINI_API_KEY;
    const prevOpenAI = process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      const res = await fetch(`${ctx.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ctx.workspaceKey}`,
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Solve this algorithm problem' }],
        }),
      });

      assert.strictEqual(res.status, 503);
      const data = await res.json();
      assert.strictEqual(data.error.code, 'upstream_unavailable');
      assert.strictEqual(data.error.type, 'server_error');
    } finally {
      if (prevGemini) process.env.GEMINI_API_KEY = prevGemini;
      if (prevOpenAI) process.env.OPENAI_API_KEY = prevOpenAI;
    }
  });

  await t.test('POST /v1/chat/completions handles multi-turn conversations and returns measured usage (dgz.4 & dgz.11)', async () => {
    let capturedUpstreamBody: any = null;

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes('api.openai.com')) {
        capturedUpstreamBody = init?.body ? JSON.parse(init.body as string) : null;
        return new Response(
          JSON.stringify({
            id: 'chatcmpl-upstream-123',
            choices: [{ message: { role: 'assistant', content: 'Tu nombre es Ana.' } }],
            usage: { prompt_tokens: 38, completion_tokens: 7, total_tokens: 45 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(url, init);
    }) as any;

    process.env.OPENAI_API_KEY = 'mock-openai-key';

    try {
      const multiTurnMessages = [
        { role: 'user', content: 'Mi nombre es Ana' },
        { role: 'assistant', content: 'Hola Ana, ¿en qué te puedo ayudar hoy?' },
        { role: 'user', content: '¿Cómo me llamo?' },
      ];

      const res = await fetch(`${ctx.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ctx.workspaceKey}`,
        },
        body: JSON.stringify({
          messages: multiTurnMessages,
          model: 'gpt-6-astra',
        }),
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();

      // Check standard OpenAI format
      assert.strictEqual(data.object, 'chat.completion');
      assert.strictEqual(data.choices[0].message.content, 'Tu nombre es Ana.');
      assert.strictEqual(data.choices[0].finish_reason, 'stop');

      // Check measured usage
      assert.strictEqual(data.usage.prompt_tokens, 38);
      assert.strictEqual(data.usage.completion_tokens, 7);
      assert.strictEqual(data.usage.total_tokens, 45);

      // Verify full multi-turn messages forwarded upstream (dgz.4)
      assert.ok(capturedUpstreamBody, 'Upstream body must be captured');
      assert.strictEqual(capturedUpstreamBody.messages.length, 3);
      assert.strictEqual(capturedUpstreamBody.messages[0].content, 'Mi nombre es Ana');
      assert.strictEqual(capturedUpstreamBody.messages[1].content, 'Hola Ana, ¿en qué te puedo ayudar hoy?');
      assert.strictEqual(capturedUpstreamBody.messages[2].content, '¿Cómo me llamo?');

      // Verify dynamic rate limit headers (no hardcoded 10000 / 9942)
      const limitHeader = res.headers.get('x-ratelimit-limit');
      const remainingHeader = res.headers.get('x-ratelimit-remaining');
      const resetHeader = res.headers.get('x-ratelimit-reset');
      assert.ok(limitHeader, 'x-ratelimit-limit header should be present');
      assert.ok(remainingHeader, 'x-ratelimit-remaining header should be present');
      assert.notStrictEqual(remainingHeader, '9942', 'x-ratelimit-remaining must not be hardcoded to 9942');
      assert.ok(resetHeader, 'x-ratelimit-reset header should be present');

      // Verify metadata does not leak internal engine fields
      const metaStr = JSON.stringify(data._entropos_router_meta);
      assert.ok(!metaStr.includes('shannonEntropyBits'), 'Must not leak shannonEntropyBits');
      assert.ok(!metaStr.includes('thompsonScore'), 'Must not leak thompsonScore');
      assert.ok(!metaStr.includes('alpha'), 'Must not leak alpha');
      assert.ok(!metaStr.includes('beta'), 'Must not leak beta');
    } finally {
      delete process.env.OPENAI_API_KEY;
    }
  });
});
