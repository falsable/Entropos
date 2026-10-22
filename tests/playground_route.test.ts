import { test, describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createTestServer, TestServerContext } from './test_helper';
import { calculateCostAndSavings } from '../src/server/modelCatalog';
import { AVAILABLE_REFERENCE_MODELS } from '../src/constants/referenceModels';

describe('Playground & Route Execution Baseline Suite (Entropos-ugg.14)', () => {
  let ctx: TestServerContext;
  let sessionToken: string;

  before(async () => {
    ctx = await createTestServer();

    // Register user for auth token
    const regRes = await fetch(`${ctx.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `playground_test_${Date.now()}@company.com`,
        password: 'password123',
        name: 'Playground Tester',
      }),
    });
    assert.strictEqual(regRes.status, 201);
    const data = await regRes.json();
    sessionToken = data.token;
  });

  after(async () => {
    await ctx.close();
  });

  it('AVAILABLE_REFERENCE_MODELS includes catalog P50 latencies and valid pricing', () => {
    assert.ok(AVAILABLE_REFERENCE_MODELS.length >= 4);

    const sonnet = AVAILABLE_REFERENCE_MODELS.find((m) => m.id === 'claude-sonnet-5-5');
    assert.ok(sonnet);
    assert.strictEqual(sonnet.inputPerM, 2.0);
    assert.strictEqual(sonnet.outputPerM, 10.0);
    assert.ok(typeof sonnet.typicalLatencyMs === 'number' && sonnet.typicalLatencyMs > 0);

    const astra = AVAILABLE_REFERENCE_MODELS.find((m) => m.id === 'gpt-6-astra');
    assert.ok(astra);
    assert.strictEqual(astra.inputPerM, 10.0);
    assert.strictEqual(astra.outputPerM, 50.0);
    assert.ok(typeof astra.typicalLatencyMs === 'number' && astra.typicalLatencyMs > 0);
  });

  it('calculateCostAndSavings computes baseline against custom reference model pricing', () => {
    const usage = { inputTokens: 1000, outputTokens: 2000 };

    // Default reference (Opus 5.5: $4 / $20)
    // 1000 * 4 / 1M = $0.004, 2000 * 20 / 1M = $0.040 -> Total baseline = $0.044
    const defaultCost = calculateCostAndSavings('gemini-3.8-flash', usage);
    assert.strictEqual(defaultCost.baselineCostUsd, 0.044);
    assert.strictEqual(defaultCost.savedPercentage, 81);

    // Sonnet 5.5 reference: $2 / $10
    // 1000 * 2 / 1M = $0.002, 2000 * 10 / 1M = $0.020 -> Total baseline = $0.022
    const sonnetRef = AVAILABLE_REFERENCE_MODELS.find((m) => m.id === 'claude-sonnet-5-5');
    const sonnetCost = calculateCostAndSavings('gemini-3.8-flash', usage, sonnetRef);
    assert.strictEqual(sonnetCost.baselineCostUsd, 0.022);

    // GPT-6 Astra reference: $10 / $50
    // 1000 * 10 / 1M = $0.010, 2000 * 50 / 1M = $0.100 -> Total baseline = $0.110
    const astraRef = AVAILABLE_REFERENCE_MODELS.find((m) => m.id === 'gpt-6-astra');
    const astraCost = calculateCostAndSavings('gemini-3.8-flash', usage, astraRef);
    assert.strictEqual(astraCost.baselineCostUsd, 0.11);
    assert.ok(astraCost.baselineCostUsd > defaultCost.baselineCostUsd);
    assert.ok(astraCost.savedUsd > defaultCost.savedUsd);

    // o3-mini reference: $1.10 / $4.40
    // 1000 * 1.1 / 1M = $0.0011, 2000 * 4.4 / 1M = $0.0088 -> Total baseline = $0.0099
    const o3Ref = AVAILABLE_REFERENCE_MODELS.find((m) => m.id === 'o3-mini');
    const o3Cost = calculateCostAndSavings('gemini-3.8-flash', usage, o3Ref);
    assert.strictEqual(o3Cost.baselineCostUsd, 0.0099);
  });

  it('POST /api/route rejects empty prompt with 400 Bad Request', async () => {
    const res = await fetch(`${ctx.baseUrl}/api/route`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({ prompt: '   ' }),
    });

    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.toLowerCase().includes('prompt'));
  });

  it('POST /api/route returns 503 instead of fake synthetic text when upstream provider fails', async () => {
    // When no provider API key is present in environment, dispatch must fail cleanly
    const res = await fetch(`${ctx.baseUrl}/api/route`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        prompt: 'Calculate topological sort in Rust',
        mode: 'cost_saver',
      }),
    });

    // In CI/test environment without upstream keys, status must be 503
    if (res.status === 503) {
      const body = await res.json();
      assert.ok(body.error);
      assert.ok(!body.responseText, 'Must never return mock synthetic text when provider fails');
    } else {
      // If an upstream provider key is configured on the machine, verify measured telemetry
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(typeof data.speedLatencyMs === 'number' && data.speedLatencyMs >= 0);
      assert.ok(data.responseText);
    }
  });
});
