import { test, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProductionStorage } from '../src/server/storage';
import { RouteExecution } from '../src/types/router';
import { createTestServer, TestServerContext } from './test_helper';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DIR = path.resolve(__dirname, 'temp_retention_test');

test('Data Retention Policy & Engine Secrets Scrubbing Suite (dgz.8)', async (t) => {
  before(() => {
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  after(() => {
    try {
      if (fs.existsSync(TEST_DIR)) {
        fs.rmSync(TEST_DIR, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  });

  const baseExecution: RouteExecution = {
    id: 'exec_test_retention',
    timestamp: new Date().toISOString(),
    promptSnippet: 'This is a long user prompt snippet that exceeds sixty characters in total length for verification',
    fullPrompt: 'Confidential proprietary prompt: SELECT * FROM internal_users WHERE salary > 100000',
    selectedModel: 'Claude Sonnet 5.5',
    provider: 'Anthropic',
    reason: 'Routed to Claude Sonnet 5.5 \u00b7 Balanced workload (H=3.41, theta=0.88)',
    speedLatencyMs: 250,
    costUsd: 0.003,
    baselineCostUsd: 0.015,
    savedUsd: 0.012,
    savedPercentage: 80,
    responseText: 'Confidential AI model completion containing sensitive information.',
    mode: 'adaptive',
    hasMeasuredUsage: true,
    totalTokens: 150,
    inputTokens: 100,
    outputTokens: 50,
    shannonEntropyBits: 3.41,
    thompsonScore: 0.88,
    posteriorMean: 0.82,
    entropyScore: 68,
    wasExploration: false,
  };

  await t.test('Default retention (metadata_only): prompts and completions are NOT persisted in storage', async () => {
    const dbPath = path.resolve(TEST_DIR, 'retention_default.db');
    const storage = new ProductionStorage(dbPath);

    try {
      assert.strictEqual(storage.getRetentionPolicy(), 'metadata_only');

      storage.recordExecution(baseExecution);
      const logs = storage.getLogs();
      assert.strictEqual(logs.length, 1);
      const logged = logs[0];

      // Content must be scrubbed
      assert.strictEqual(logged.fullPrompt, '');
      assert.strictEqual(logged.responseText, '');
      assert.ok(logged.promptSnippet.length <= 60);

      // Metrics must be preserved
      assert.strictEqual(logged.totalTokens, 150);
      assert.strictEqual(logged.savedUsd, 0.012);
      assert.strictEqual(logged.selectedModel, 'Claude Sonnet 5.5');
    } finally {
      storage.close();
    }
  });

  await t.test('Zero retention policy: clears snippet, full prompt, and response completely', async () => {
    const dbPath = path.resolve(TEST_DIR, 'retention_zero.db');
    const storage = new ProductionStorage(dbPath);

    try {
      storage.updateSettings({ retentionPolicy: 'zero_retention' });
      assert.strictEqual(storage.getRetentionPolicy(), 'zero_retention');

      storage.recordExecution(baseExecution);
      const logged = storage.getLogs()[0];

      assert.strictEqual(logged.promptSnippet, '');
      assert.strictEqual(logged.fullPrompt, '');
      assert.strictEqual(logged.responseText, '');

      // Quota & cost tracking still operational
      assert.strictEqual(logged.costUsd, 0.003);
      assert.strictEqual(storage.getUsageTotals().totalRequests, 1);
    } finally {
      storage.close();
    }
  });

  await t.test('Full retention policy (opt-in): retains prompts and responses when explicitly enabled', async () => {
    const dbPath = path.resolve(TEST_DIR, 'retention_full.db');
    const storage = new ProductionStorage(dbPath);

    try {
      storage.updateSettings({ retentionPolicy: 'full' });
      assert.strictEqual(storage.getRetentionPolicy(), 'full');

      storage.recordExecution(baseExecution);
      const logged = storage.getLogs()[0];

      assert.strictEqual(logged.fullPrompt, baseExecution.fullPrompt);
      assert.strictEqual(logged.responseText, baseExecution.responseText);
    } finally {
      storage.close();
    }
  });

  await t.test('Enterprise Plan: defaults to Zero Data Retention for content', async () => {
    const dbPath = path.resolve(TEST_DIR, 'retention_enterprise.db');
    const storage = new ProductionStorage(dbPath);

    try {
      storage.updateSubscription('enterprise');
      assert.strictEqual(storage.getRetentionPolicy(), 'zero_retention');

      storage.recordExecution(baseExecution);
      const logged = storage.getLogs()[0];

      assert.strictEqual(logged.fullPrompt, '');
      assert.strictEqual(logged.responseText, '');
      assert.strictEqual(logged.promptSnippet, '');
    } finally {
      storage.close();
    }
  });

  await t.test('Moat Scrubbing: Internal algorithm details (entropy bits, Thompson score) are NEVER saved to disk', async () => {
    const dbPath = path.resolve(TEST_DIR, 'retention_moat.db');
    const storage = new ProductionStorage(dbPath);

    try {
      storage.recordExecution(baseExecution);
      storage.close();

      const rawDb = fs.readFileSync(dbPath, 'utf-8');
      assert.ok(!rawDb.includes('shannonEntropyBits'), 'shannonEntropyBits must not be persisted in raw SQLite');
      assert.ok(!rawDb.includes('thompsonScore'), 'thompsonScore must not be persisted in raw SQLite');
      assert.ok(!rawDb.includes('posteriorMean'), 'posteriorMean must not be persisted in raw SQLite');
      assert.ok(!rawDb.includes('entropyScore'), 'entropyScore must not be persisted in raw SQLite');
      assert.ok(!rawDb.includes('H=3.41'), 'Internal formula tokens must be scrubbed from reason');
    } finally {
      try {
        storage.close();
      } catch {
        // ignore
      }
    }
  });

  await t.test('API Endpoints: /api/settings allows viewing and updating retentionPolicy', async () => {
    const ctx: TestServerContext = await createTestServer();

    try {
      // 1. GET /api/settings
      const getRes = await fetch(`${ctx.baseUrl}/api/settings`);
      assert.strictEqual(getRes.status, 200);
      const getData = await getRes.json();
      assert.ok(getData.retentionPolicy);

      // 2. POST /api/settings with new retentionPolicy
      const postRes = await fetch(`${ctx.baseUrl}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retentionPolicy: 'zero_retention' }),
      });
      assert.strictEqual(postRes.status, 200);
      const postData = await postRes.json();
      assert.strictEqual(postData.retentionPolicy, 'zero_retention');
      assert.strictEqual(postData.settings.retentionPolicy, 'zero_retention');
    } finally {
      await ctx.close();
    }
  });
});
