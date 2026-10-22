import { test, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createTestServer, TestServerContext } from './test_helper';

test('Model Context Protocol (MCP) Contract Suite (/mcp)', async (t) => {
  let ctx: TestServerContext;
  const originalFetch = globalThis.fetch;

  before(async () => {
    ctx = await createTestServer();
  });

  after(async () => {
    globalThis.fetch = originalFetch;
    await ctx.close();
  });

  await t.test('POST /mcp rejects requests without valid Bearer workspace key', async () => {
    const res = await fetch(`${ctx.baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }),
    });
    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.error.code, -32001);
  });

  await t.test('MCP initialize handshake succeeds with valid key', async () => {
    const res = await fetch(`${ctx.baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ctx.workspaceKey}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }),
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.result.protocolVersion, '2024-11-05');
    assert.strictEqual(data.result.serverInfo.name, 'entropos-mcp');
  });

  await t.test('MCP tools/list exposes smart_generate, get_optimal_model, check_savings', async () => {
    const res = await fetch(`${ctx.baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ctx.workspaceKey}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    const toolNames = data.result.tools.map((t: any) => t.name);
    assert.ok(toolNames.includes('smart_generate'));
    assert.ok(toolNames.includes('get_optimal_model'));
    assert.ok(toolNames.includes('check_savings'));
  });

  await t.test('MCP tools/call check_savings returns non-fake usage report', async () => {
    const res = await fetch(`${ctx.baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ctx.workspaceKey}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'check_savings', arguments: {} },
      }),
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    const parsedText = JSON.parse(data.result.content[0].text);
    assert.strictEqual(parsedText.status, 'active');
    assert.ok(Array.isArray(parsedText.connectedProviders));
  });

  await t.test('MCP tools/call smart_generate returns isError: true when upstream fails (dgz.1)', async () => {
    const prevGemini = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    try {
      const res = await fetch(`${ctx.baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ctx.workspaceKey}`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: { name: 'smart_generate', arguments: { prompt: 'Quick query' } },
        }),
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.result.isError, true);
    } finally {
      if (prevGemini) process.env.GEMINI_API_KEY = prevGemini;
    }
  });

  await t.test('MCP tools/call smart_generate supports multi-turn messages and real metrics (dgz.4 & dgz.11)', async () => {
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes('api.openai.com')) {
        return new Response(
          JSON.stringify({
            choices: [{ message: { role: 'assistant', content: 'Respuesta generada por IA real' } }],
            usage: { prompt_tokens: 50, completion_tokens: 15, total_tokens: 65 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(url, init);
    }) as any;

    process.env.OPENAI_API_KEY = 'mock-key';

    try {
      const res = await fetch(`${ctx.baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ctx.workspaceKey}`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 5,
          method: 'tools/call',
          params: {
            name: 'smart_generate',
            arguments: {
              model: 'gpt-6-astra',
              messages: [
                { role: 'user', content: 'Turno 1' },
                { role: 'assistant', content: 'Respuesta 1' },
                { role: 'user', content: 'Turno 2' },
              ],
            },
          },
        }),
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.result.content[0].text, 'Respuesta generada por IA real');
      assert.strictEqual(data.result._meta.tokens, 65);
      assert.ok(data.result._meta.savedUsd);

      // Verify no leaked moat fields
      const metaStr = JSON.stringify(data.result._meta);
      assert.ok(!metaStr.includes('shannonEntropyBits'));
      assert.ok(!metaStr.includes('thompsonScore'));
    } finally {
      delete process.env.OPENAI_API_KEY;
    }
  });
});
