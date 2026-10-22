import { test, describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createTestServer, TestServerContext } from './test_helper';

describe('Analytics & Real Savings Overview Suite (Entropos-ugg.12)', () => {
  let ctx: TestServerContext;
  const runId = Math.random().toString(36).substring(2, 8);
  let sessionToken: string;

  before(async () => {
    ctx = await createTestServer();

    // Create user and get session token
    const regRes = await fetch(`${ctx.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `analytics_${runId}@company.com`,
        password: 'password123',
        name: 'Analytics Tester',
      }),
    });
    assert.strictEqual(regRes.status, 201);
    const data = await regRes.json();
    sessionToken = data.token;
  });

  after(async () => {
    await ctx.close();
  });

  it('GET /api/analytics/summary returns 30-day default analytics structure', async () => {
    const res = await fetch(`${ctx.baseUrl}/api/analytics/summary`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    assert.strictEqual(data.periodDays, 30);
    assert.ok(data.referenceModel);
    assert.strictEqual(data.referenceModel.id, 'claude-sonnet-5-5');
    assert.ok(data.totals);
    assert.strictEqual(typeof data.totals.totalRequests, 'number');
    assert.strictEqual(typeof data.totals.actualCostUsd, 'number');
    assert.strictEqual(typeof data.totals.referenceCostUsd, 'number');
    assert.strictEqual(typeof data.totals.savedUsd, 'number');
    assert.strictEqual(typeof data.totals.savingsPercentage, 'number');

    assert.ok(Array.isArray(data.daily));
    assert.strictEqual(data.daily.length, 30);
    assert.ok(Array.isArray(data.topModels));
    assert.ok(data.provenance);
    assert.ok(data.provenance.source.includes('route_logs'));
    assert.ok(Array.isArray(data.availableReferenceModels));
  });

  it('GET /api/analytics/summary?days=7 returns 7-day window and points', async () => {
    const res = await fetch(`${ctx.baseUrl}/api/analytics/summary?days=7`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    assert.strictEqual(data.periodDays, 7);
    assert.strictEqual(data.daily.length, 7);
  });

  it('recalculates baseline and savings when custom reference model is chosen', async () => {
    // 1. Query with Claude Sonnet 5.5 ($2 / $10)
    const resSonnet = await fetch(
      `${ctx.baseUrl}/api/analytics/summary?days=7&referenceModel=claude-sonnet-5-5`,
      { headers: { Authorization: `Bearer ${sessionToken}` } }
    );
    const dataSonnet = await resSonnet.json();
    assert.strictEqual(dataSonnet.referenceModel.id, 'claude-sonnet-5-5');
    assert.strictEqual(dataSonnet.referenceModel.inputPerM, 2.0);

    // 2. Query with GPT-6 Astra ($10 / $50)
    const resAstra = await fetch(
      `${ctx.baseUrl}/api/analytics/summary?days=7&referenceModel=gpt-6-astra`,
      { headers: { Authorization: `Bearer ${sessionToken}` } }
    );
    const dataAstra = await resAstra.json();
    assert.strictEqual(dataAstra.referenceModel.id, 'gpt-6-astra');
    assert.strictEqual(dataAstra.referenceModel.inputPerM, 10.0);
    assert.strictEqual(dataAstra.referenceModel.outputPerM, 50.0);
  });
});
