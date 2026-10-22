import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { createTestServer, TestServerContext } from './test_helper';

test('Anthropic Compatible Virtual Proxy Contract Suite (/v1/messages & /messages)', async (t) => {
  let ctx: TestServerContext;
  const originalFetch = globalThis.fetch;

  before(async () => {
    ctx = await createTestServer();
  });

  after(async () => {
    globalThis.fetch = originalFetch;
    await ctx.close();
  });

  await t.test('POST /v1/messages rejects requests without valid x-api-key or Bearer workspace key', async () => {
    // Missing credentials
    const res1 = await fetch(`${ctx.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }),
    });
    assert.strictEqual(res1.status, 401);
    const data1 = await res1.json();
    assert.strictEqual(data1.type, 'error');
    assert.strictEqual(data1.error.type, 'authentication_error');

    // Invalid x-api-key
    const res2 = await fetch(`${ctx.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'invalid_secret_key_123',
      },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }),
    });
    assert.strictEqual(res2.status, 401);

    // Invalid Authorization: Bearer
    const res3 = await fetch(`${ctx.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer invalid_random_token_456',
      },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }),
    });
    assert.strictEqual(res3.status, 401);
  });

  await t.test('POST /v1/messages rejects empty messages array with 400 invalid_request_error', async () => {
    const res = await fetch(`${ctx.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ctx.workspaceKey,
      },
      body: JSON.stringify({ messages: [] }),
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.type, 'error');
    assert.strictEqual(data.error.type, 'invalid_request_error');
  });

  await t.test('POST /v1/messages returns 503 when no provider is available', async () => {
    const prevGemini = process.env.GEMINI_API_KEY;
    const prevOpenAI = process.env.OPENAI_API_KEY;
    const prevAnthropic = process.env.ANTHROPIC_API_KEY;
    const prevDeepSeek = process.env.DEEPSEEK_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;

    try {
      const res = await fetch(`${ctx.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ctx.workspaceKey,
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Solve this algorithm problem' }],
        }),
      });

      assert.strictEqual(res.status, 503);
      const data = await res.json();
      assert.strictEqual(data.type, 'error');
      assert.strictEqual(data.error.type, 'api_error');
    } finally {
      if (prevGemini) process.env.GEMINI_API_KEY = prevGemini;
      if (prevOpenAI) process.env.OPENAI_API_KEY = prevOpenAI;
      if (prevAnthropic) process.env.ANTHROPIC_API_KEY = prevAnthropic;
      if (prevDeepSeek) process.env.DEEPSEEK_API_KEY = prevDeepSeek;
    }
  });

  await t.test('POST /v1/messages non-streaming returns standard Anthropic Message object with measured usage', async () => {
    let capturedUpstreamBody: any = null;

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes('api.openai.com')) {
        capturedUpstreamBody = init?.body ? JSON.parse(init.body as string) : null;
        return new Response(
          JSON.stringify({
            id: 'chatcmpl-mock-upstream',
            choices: [{ message: { role: 'assistant', content: 'Respuesta asistida por Entropos.' } }],
            usage: { prompt_tokens: 42, completion_tokens: 12, total_tokens: 54 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(url, init);
    }) as any;

    process.env.OPENAI_API_KEY = 'mock-openai-key';

    try {
      const multiTurnMessages = [
        { role: 'user', content: 'Hola, quien eres?' },
        { role: 'assistant', content: 'Soy un asistente de IA.' },
        { role: 'user', content: 'Explica la entropia en una frase.' },
      ];

      const res = await fetch(`${ctx.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ctx.workspaceKey,
        },
        body: JSON.stringify({
          model: 'entropos-auto',
          system: 'Eres un tutor conciso y riguroso.',
          messages: multiTurnMessages,
        }),
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();

      // Check standard Anthropic format
      assert.strictEqual(data.type, 'message');
      assert.strictEqual(data.role, 'assistant');
      assert.ok(data.id.startsWith('msg_'));
      assert.ok(Array.isArray(data.content));
      assert.strictEqual(data.content[0].type, 'text');
      assert.strictEqual(data.content[0].text, 'Respuesta asistida por Entropos.');
      assert.strictEqual(data.stop_reason, 'end_turn');

      // Check measured usage
      assert.strictEqual(data.usage.input_tokens, 42);
      assert.strictEqual(data.usage.output_tokens, 12);

      // Verify enterprise headers
      assert.ok(res.headers.get('x-entropos-selected-model'));
      assert.ok(res.headers.get('x-ratelimit-limit'));
      assert.ok(res.headers.get('x-ratelimit-remaining'));

      // Verify privacy / moat: no internal engine variables leaked
      const metaStr = JSON.stringify(data._entropos_router_meta);
      assert.ok(!metaStr.includes('shannonEntropyBits'), 'Must not leak shannonEntropyBits');
      assert.ok(!metaStr.includes('thompsonScore'), 'Must not leak thompsonScore');
      assert.ok(!metaStr.includes('alpha'), 'Must not leak alpha');
      assert.ok(!metaStr.includes('beta'), 'Must not leak beta');
    } finally {
      delete process.env.OPENAI_API_KEY;
    }
  });

  await t.test('POST /v1/messages streaming (stream: true) emits complete Anthropic SSE event sequence', async () => {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes('api.openai.com')) {
        return new Response(
          JSON.stringify({
            id: 'chatcmpl-mock-stream',
            choices: [{ message: { role: 'assistant', content: 'Flujo de respuesta continua.' } }],
            usage: { prompt_tokens: 30, completion_tokens: 8, total_tokens: 38 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(url, init);
    }) as any;

    process.env.OPENAI_API_KEY = 'mock-openai-key';

    try {
      const res = await fetch(`${ctx.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ctx.workspaceKey,
        },
        body: JSON.stringify({
          model: 'entropos-auto',
          stream: true,
          messages: [{ role: 'user', content: 'Dime algo en streaming' }],
        }),
      });

      assert.strictEqual(res.status, 200);
      const contentType = res.headers.get('content-type') || '';
      assert.ok(contentType.includes('text/event-stream'), `Expected text/event-stream, got ${contentType}`);

      const rawText = await res.text();
      assert.ok(rawText.includes('event: message_start'), 'Must include message_start');
      assert.ok(rawText.includes('event: content_block_start'), 'Must include content_block_start');
      assert.ok(rawText.includes('event: content_block_delta'), 'Must include content_block_delta');
      assert.ok(rawText.includes('event: content_block_stop'), 'Must include content_block_stop');
      assert.ok(rawText.includes('event: message_delta'), 'Must include message_delta');
      assert.ok(rawText.includes('event: message_stop'), 'Must include message_stop');
      assert.ok(rawText.includes('Flujo de respuesta continua.'), 'Must include response text');
    } finally {
      delete process.env.OPENAI_API_KEY;
    }
  });

  await t.test('POST /messages alias works identically to /v1/messages', async () => {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes('api.openai.com')) {
        return new Response(
          JSON.stringify({
            id: 'chatcmpl-mock-alias',
            choices: [{ message: { role: 'assistant', content: 'Alias /messages funcionando.' } }],
            usage: { prompt_tokens: 25, completion_tokens: 6, total_tokens: 31 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(url, init);
    }) as any;

    process.env.OPENAI_API_KEY = 'mock-openai-key';

    try {
      const res = await fetch(`${ctx.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ctx.workspaceKey}`,
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Probando alias sin /v1' }],
        }),
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.type, 'message');
      assert.strictEqual(data.content[0].text, 'Alias /messages funcionando.');
    } finally {
      delete process.env.OPENAI_API_KEY;
    }
  });
});
