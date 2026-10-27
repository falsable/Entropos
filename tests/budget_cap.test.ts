import { test, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Isolated DB: this suite changes the global cap, which must not leak into other test files.
// Set before the server module (and its productionStore singleton) is loaded.
const TEST_DIR = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'entropos-budget-'));
process.env.ENTROPOS_DB_PATH = path.join(TEST_DIR, 'budget.db');

import type { RouteExecution } from '../src/types/router';
import type { TestServerContext } from './test_helper';

const SPEND = 2.5;

function execution(id: string, timestamp: string, costUsd: number): RouteExecution {
  return {
    id,
    timestamp,
    promptSnippet: 'budget test',
    fullPrompt: '',
    selectedModel: 'Gemini 3.8 Flash',
    provider: 'Google Gemini',
    reason: 'test',
    speedLatencyMs: 10,
    costUsd,
    baselineCostUsd: costUsd * 2,
    savedUsd: costUsd,
    savedPercentage: 50,
    responseText: '',
    mode: 'adaptive',
    hasMeasuredUsage: true,
    totalTokens: 10,
    inputTokens: 5,
    outputTokens: 5,
  };
}

test('Monthly budget cap enforcement (Entropos-olr)', async (t) => {
  const { createTestServer } = await import('./test_helper');
  const { productionStore } = await import('../src/server/storage');
  const { evaluateBudget, monthStartUtc, nextMonthStartUtc } = await import('../src/server/budgetGuard');
  let ctx: TestServerContext;
  const saved: Record<string, string | undefined> = {};
  const KEYS = ['GEMINI_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'DEEPSEEK_API_KEY'];

  before(async () => {
    for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
    ctx = await createTestServer();
    productionStore.recordExecution(execution('budget_now', new Date().toISOString(), SPEND));
  });

  after(async () => {
    for (const k of KEYS) { if (saved[k] !== undefined) process.env[k] = saved[k]; }
    await ctx.close();
    // Best effort: Windows keeps the SQLite file locked while the singleton store is open.
    try { fs.rmSync(TEST_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  const openai = () => fetch(`${ctx.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ctx.workspaceKey}` },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }),
  });
  const anthropic = (path = '/v1/messages') => fetch(`${ctx.baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ctx.workspaceKey },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }),
  });
  const mcp = (name: string, key = ctx.workspaceKey) => fetch(`${ctx.baseUrl}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name, arguments: { prompt: 'hello' } } }),
  });

  await t.test('cap below accumulated spend: /v1/chat/completions returns 429 naming cap and spend', async () => {
    productionStore.updateSettings({ monthlyBudgetCapUsd: 1 });
    const res = await openai();
    assert.strictEqual(res.status, 429);
    assert.ok(Number(res.headers.get('retry-after')) > 0);
    const body = await res.json();
    assert.strictEqual(body.error.code, 'monthly_budget_exceeded');
    assert.strictEqual(body.error.monthly_budget_cap_usd, 1);
    assert.strictEqual(body.error.spent_usd, SPEND);
    assert.ok(body.error.message.includes('$1.00') && body.error.message.includes('$2.5000'));
    assert.ok(body.error.resets_at.endsWith('-01T00:00:00.000Z'));
  });

  await t.test('cap below accumulated spend: /v1/messages and /messages return 429 in Anthropic shape', async () => {
    for (const p of ['/v1/messages', '/messages']) {
      const res = await anthropic(p);
      assert.strictEqual(res.status, 429, p);
      const body = await res.json();
      assert.strictEqual(body.type, 'error');
      assert.strictEqual(body.error.type, 'rate_limit_error');
      assert.strictEqual(body.error.monthly_budget_cap_usd, 1);
      assert.strictEqual(body.error.spent_usd, SPEND);
    }
  });

  await t.test('cap below accumulated spend: MCP smart_generate returns 429 JSON-RPC error, other tools still work', async () => {
    const res = await mcp('smart_generate');
    assert.strictEqual(res.status, 429);
    const body = await res.json();
    assert.strictEqual(body.jsonrpc, '2.0');
    assert.strictEqual(body.id, 7);
    assert.strictEqual(body.error.data.code, 'monthly_budget_exceeded');
    assert.strictEqual(body.error.data.monthly_budget_cap_usd, 1);
    assert.strictEqual(body.error.data.spent_usd, SPEND);

    const free = await mcp('check_savings');
    assert.strictEqual(free.status, 200);
  });

  await t.test('unauthenticated callers get 401, never the spend figures', async () => {
    const res = await fetch(`${ctx.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer nope' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }),
    });
    assert.strictEqual(res.status, 401);
    const mcpRes = await mcp('smart_generate', 'nope');
    assert.strictEqual(mcpRes.status, 401);
  });

  await t.test('429 body leaks no router internals', async () => {
    const text = await (await openai()).text();
    assert.ok(!/entropy|thompson|posterior|shannon/i.test(text));
  });

  await t.test('spend below the cap passes on both proxies and MCP (no 429)', async () => {
    productionStore.updateSettings({ monthlyBudgetCapUsd: 100 });
    for (const res of [await openai(), await anthropic(), await mcp('smart_generate')]) {
      assert.notStrictEqual(res.status, 429);
      assert.notStrictEqual(res.status, 401);
      assert.strictEqual(res.headers.get('x-entropos-budget-warning'), null);
    }
  });

  await t.test('alert header appears at 80% of the cap, before the block', async () => {
    productionStore.updateSettings({ monthlyBudgetCapUsd: 3 }); // 2.5 / 3 = 83.3%
    for (const res of [await openai(), await anthropic()]) {
      assert.notStrictEqual(res.status, 429);
      assert.match(res.headers.get('x-entropos-budget-warning') || '', /83\.3% of the \$3\.00 monthly cap/);
    }
  });

  await t.test('a cap of 0 disables enforcement', async () => {
    productionStore.updateSettings({ monthlyBudgetCapUsd: 0 });
    assert.notStrictEqual((await openai()).status, 429);
  });

  await t.test('reset: spend from a previous month does not count, the month boundary clears the block', async () => {
    const may = (day: number, h = 12) => new Date(Date.UTC(2020, 4, day, h)).toISOString();
    productionStore.recordExecution(execution('budget_may', may(20), 5));

    const lastDay = new Date(Date.UTC(2020, 4, 31, 23, 59, 59));
    const firstDay = new Date(Date.UTC(2020, 5, 1, 0, 0, 0));
    productionStore.updateSettings({ monthlyBudgetCapUsd: 4 });

    const before = evaluateBudget(productionStore, lastDay)!;
    assert.strictEqual(before.spentUsd, 5);
    assert.strictEqual(before.exceeded, true);
    assert.strictEqual(before.resetsAt, firstDay.toISOString());

    const after = evaluateBudget(productionStore, firstDay)!;
    assert.strictEqual(after.spentUsd, 0);
    assert.strictEqual(after.exceeded, false);
    assert.strictEqual(after.periodStart, firstDay.toISOString());

    assert.strictEqual(monthStartUtc(lastDay).toISOString(), new Date(Date.UTC(2020, 4, 1)).toISOString());
    assert.strictEqual(nextMonthStartUtc(new Date(Date.UTC(2020, 11, 15))).toISOString(), new Date(Date.UTC(2021, 0, 1)).toISOString());
  });

  await t.test('reset through the proxies: old-month spend over the cap still passes today', async () => {
    // Current-month spend is 2.5 USD; cap 4 is above it even though a past month spent 5.
    productionStore.updateSettings({ monthlyBudgetCapUsd: 4 });
    assert.notStrictEqual((await openai()).status, 429);
    assert.notStrictEqual((await anthropic()).status, 429);
  });
});
