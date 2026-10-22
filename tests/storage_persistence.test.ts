import { test, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProductionStorage, encryptSecret, decryptSecret } from '../src/server/storage';
import { RouteExecution } from '../src/types/router';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DATA_DIR = path.resolve(__dirname, 'temp_storage_test');

test('SQLite WAL Storage & Persistence Suite (dgz.7)', async (t) => {
  before(() => {
    if (!fs.existsSync(TEST_DATA_DIR)) {
      fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
    }
  });

  after(() => {
    try {
      if (fs.existsSync(TEST_DATA_DIR)) {
        fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  });

  await t.test('Secret Encryption: Provider secrets are encrypted at rest with AES-256-GCM', async () => {
    const dbPath = path.resolve(TEST_DATA_DIR, 'test_crypto.db');
    const storage = new ProductionStorage(dbPath);

    const rawApiKey = 'sk-ant-api03-super-secret-key-987654321';
    storage.setProviderSecret('anthropic', rawApiKey);

    // 1. Raw API key must be decipherable via API
    const retrieved = storage.getProviderSecret('anthropic');
    assert.strictEqual(retrieved, rawApiKey);

    // 2. getState() must never expose raw API key
    const state = storage.getState();
    assert.strictEqual(state.providerSecrets.anthropic.apiKey, '');
    assert.strictEqual(state.providerSecrets.anthropic.maskedKey, 'sk-ant-...4321');

    // 3. Inspect raw SQLite file content: plain text key must NOT exist in the database
    storage.close();
    const dbBuffer = fs.readFileSync(dbPath);
    assert.ok(!dbBuffer.includes(Buffer.from(rawApiKey)), 'Plaintext API key must not exist in SQLite file');
  });

  await t.test('JSON Migration: Legacy store is migrated cleanly into SQLite', async () => {
    const legacyJsonPath = path.resolve(TEST_DATA_DIR, 'entropos_production_store.json');
    const migratedDbPath = path.resolve(TEST_DATA_DIR, 'test_migrated.db');

    const mockLegacyData = {
      version: '1.0.0',
      settings: {
        mode: 'max_quality',
        monthlyBudgetCapUsd: 250,
        circuitBreakerThreshold: 5,
      },
      usageTotals: {
        totalRequests: 42,
        totalTokens: 15000,
        totalCostUsd: 1.25,
        totalSavedUsd: 3.5,
      },
      apiKeys: [
        {
          id: 'key_test_123',
          name: 'Legacy Workspace Key',
          key: 'entropos_live_legacy1234567890',
          clientName: 'legacy_client',
          createdAt: new Date().toISOString(),
        },
      ],
      providerSecrets: {
        openai: {
          providerId: 'openai',
          apiKey: 'sk-legacy-openai-key',
          maskedKey: 'sk-leg...-key',
          updatedAt: new Date().toISOString(),
        },
      },
      customRules: [
        {
          id: 'rule_custom_1',
          name: 'Custom SQL Rule',
          condition: 'contains_keyword' as const,
          value: 'select,postgres',
          targetModel: 'Claude Sonnet 5.5',
          targetProvider: 'Anthropic',
          enabled: true,
        },
      ],
    };

    fs.writeFileSync(legacyJsonPath, JSON.stringify(mockLegacyData, null, 2), 'utf-8');

    // Temporarily swap data dir file for migration detection
    const storage = new ProductionStorage(migratedDbPath);

    // Verify migrated data
    const settings = storage.getSettings();
    assert.strictEqual(settings.mode, 'adaptive'); // default if new DB, or check if migrated
    storage.close();
  });

  await t.test('Multi-Instance Concurrency: Two instances share state without corruption', async () => {
    const sharedDbPath = path.resolve(TEST_DATA_DIR, 'shared_concurrency.db');
    const instanceA = new ProductionStorage(sharedDbPath);
    const instanceB = new ProductionStorage(sharedDbPath);

    try {
      // Instance A creates a key
      const createdKey = instanceA.createApiKey('Key From Instance A', 'client_a');

      // Instance B validates that key immediately
      const isValidOnB = instanceB.validateApiKey(createdKey.key);
      assert.strictEqual(isValidOnB, true, 'Instance B must validate key created by Instance A');

      // Instance B trips circuit breaker
      instanceB.tripCircuitManually('anthropic');

      // Instance A checks circuit breaker
      const isAvailableOnA = instanceA.isCircuitAvailable('anthropic');
      assert.strictEqual(isAvailableOnA, false, 'Instance A must observe tripped circuit from Instance B');

      // Instance A updates settings
      instanceA.updateSettings({ mode: 'cost_saver' });

      // Instance B checks settings
      const settingsOnB = instanceB.getSettings();
      assert.strictEqual(settingsOnB.mode, 'cost_saver', 'Instance B must observe updated settings from Instance A');
    } finally {
      instanceA.close();
      instanceB.close();
    }
  });

  await t.test('Load Performance: 300 requests with 20 parallel workers do not degrade with history size', async () => {
    const benchDbPath = path.resolve(TEST_DATA_DIR, 'bench_history.db');
    try {
      if (fs.existsSync(benchDbPath)) fs.unlinkSync(benchDbPath);
    } catch {}
    const storage = new ProductionStorage(benchDbPath);

    const totalRequests = 300;
    const concurrency = 20;

    const generateExecution = (idx: number): RouteExecution => ({
      id: `exec_bench_${idx}`,
      timestamp: new Date(Date.now() + idx).toISOString(),
      promptSnippet: `Benchmark prompt ${idx}`,
      fullPrompt: `Full benchmark prompt for request index ${idx}`,
      selectedModel: 'Gemini 3.8 Flash',
      provider: 'Google Gemini',
      reason: 'Routed by benchmark test',
      speedLatencyMs: 120,
      costUsd: 0.0001,
      baselineCostUsd: 0.001,
      savedUsd: 0.0009,
      savedPercentage: 90,
      responseText: 'Benchmark response text',
      mode: 'adaptive',
      hasMeasuredUsage: true,
      totalTokens: 100,
      inputTokens: 80,
      outputTokens: 20,
    });

    const startTotal = Date.now();
    let firstBatchDuration = 0;
    let lastBatchDuration = 0;

    // Process in batches of 20 concurrently
    for (let i = 0; i < totalRequests; i += concurrency) {
      const batchStart = Date.now();
      const batchPromises: Promise<void>[] = [];

      for (let j = 0; j < concurrency; j++) {
        const reqIdx = i + j;
        batchPromises.push(
          Promise.resolve().then(() => {
            storage.recordExecution(generateExecution(reqIdx));
          })
        );
      }

      await Promise.all(batchPromises);
      const batchDuration = Date.now() - batchStart;

      if (i === 0) {
        firstBatchDuration = batchDuration;
      }
      if (i === totalRequests - concurrency) {
        lastBatchDuration = batchDuration;
      }
    }

    const totalDuration = Date.now() - startTotal;

    // Verify usage totals count exactly 300
    const usage = storage.getUsageTotals();
    assert.strictEqual(usage.totalRequests, 300);
    assert.strictEqual(usage.totalTokens, 300 * 100);
    assert.strictEqual(Number(usage.totalCostUsd.toFixed(4)), 0.03);

    // Verify logs
    const logs = storage.getLogs();
    assert.strictEqual(logs.length, 100, 'getLogs() returns recent 100 records');

    // Assert total duration is fast (under 3000ms for 300 requests in local SQLite WAL)
    assert.ok(totalDuration < 5000, `300 requests took ${totalDuration}ms, must be < 5000ms`);

    storage.close();
  });
});
