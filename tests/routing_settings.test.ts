import { test, describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createTestServer, TestServerContext } from './test_helper';
import { ROUTING_MODES_LIST } from '../src/constants/modes';
import { parseRoute, tabToPath, TAB_PATHS } from '../src/lib/routes';
import { CustomRule } from '../src/types/router';

describe('Unified Routing & Explicit Settings Persistence Suite (Entropos-ugg.17)', () => {
  let ctx: TestServerContext;

  before(async () => {
    ctx = await createTestServer();
  });

  after(async () => {
    await ctx.close();
  });

  it('ROUTING_MODES_LIST exposes 4 complete mode definitions without orphans', () => {
    assert.strictEqual(ROUTING_MODES_LIST.length, 4);
    const expectedIds = ['adaptive', 'balanced', 'cost_saver', 'max_quality'];
    for (const id of expectedIds) {
      const mode = ROUTING_MODES_LIST.find((m) => m.id === id);
      assert.ok(mode, `Mode ${id} must exist`);
      assert.ok(mode.name, `Mode ${id} must have a name`);
      assert.ok(mode.description, `Mode ${id} must have a description`);
      assert.ok(mode.modelsSummary, `Mode ${id} must have modelsSummary`);
    }
  });

  it('GET /api/settings returns default settings, activeMode, and customRules', async () => {
    const res = await fetch(`${ctx.baseUrl}/api/settings`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    assert.ok(data.settings, 'Must return settings object');
    assert.ok(data.activeMode, 'Must return activeMode');
    assert.ok(Array.isArray(data.customRules), 'Must return customRules array');
  });

  it('POST /api/settings explicitly updates routing mode and budget cap', async () => {
    const updatePayload = {
      mode: 'cost_saver',
      monthlyBudgetCapUsd: 275,
    };

    const res = await fetch(`${ctx.baseUrl}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatePayload),
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.settings.mode, 'cost_saver');
    assert.strictEqual(body.settings.monthlyBudgetCapUsd, 275);
    assert.strictEqual(body.activeMode, 'cost_saver');

    // Verify GET /api/settings returns persisted values
    const verifyRes = await fetch(`${ctx.baseUrl}/api/settings`);
    const verifyData = await verifyRes.json();
    assert.strictEqual(verifyData.settings.mode, 'cost_saver');
    assert.strictEqual(verifyData.settings.monthlyBudgetCapUsd, 275);
  });

  it('POST /api/settings explicitly saves custom domain rules and persists in SQLite WAL', async () => {
    const customRules: CustomRule[] = [
      {
        id: 'rule_test_sql',
        name: 'Strict SQL Routing',
        condition: 'contains_keyword',
        value: 'select,insert,postgresql',
        targetModel: 'Claude Sonnet 5.5',
        targetProvider: 'Anthropic',
        enabled: true,
      },
      {
        id: 'rule_test_reasoning',
        name: 'Math Proofs to DeepSeek',
        condition: 'contains_keyword',
        value: 'theorem,qed,contradiction',
        targetModel: 'DeepSeek R1',
        targetProvider: 'DeepSeek',
        enabled: false,
      },
    ];

    const saveRes = await fetch(`${ctx.baseUrl}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customRules }),
    });

    assert.strictEqual(saveRes.status, 200);
    const saveData = await saveRes.json();
    assert.strictEqual(saveData.customRules.length, 2);
    assert.strictEqual(saveData.customRules[0].name, 'Strict SQL Routing');
    assert.strictEqual(saveData.customRules[1].enabled, false);

    // Verify GET /api/status also reflects the custom rules
    const statusRes = await fetch(`${ctx.baseUrl}/api/status`);
    const statusData = await statusRes.json();
    assert.strictEqual(statusData.customRules.length, 2);
    assert.strictEqual(statusData.customRules[0].targetModel, 'Claude Sonnet 5.5');
  });

  it('Canonical routing navigation: all legacy tabs redirect to unified /app/routing', () => {
    const aliases = ['/app/routing', '/app/enrutamiento', '/app/mode', '/app/strategy', '/app/adaptive'];
    for (const alias of aliases) {
      const parsed = parseRoute(alias, '', '');
      assert.strictEqual(parsed.activeTab, 'routing', `${alias} must resolve to routing tab`);
      assert.strictEqual(parsed.path, '/app/routing', `${alias} must have canonical path /app/routing`);
    }

    assert.strictEqual(tabToPath('routing'), '/app/routing');
    assert.strictEqual(tabToPath('mode'), '/app/routing');
    assert.strictEqual(tabToPath('adaptive'), '/app/routing');
  });
});
