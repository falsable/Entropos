import { test, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestServer, TestServerContext } from './test_helper';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distAssetsDir = path.resolve(__dirname, '../dist/assets');

test('Moat and Algorithm Leak Prevention Suite', async (t) => {
  let ctx: TestServerContext;

  before(async () => {
    ctx = await createTestServer();
  });

  after(async () => {
    await ctx.close();
  });

  await t.test('Client dist bundle contains 0 occurrences of private engine identifiers', () => {
    assert.ok(fs.existsSync(distAssetsDir), 'dist/assets directory must exist (run npm run build first)');
    const files = fs.readdirSync(distAssetsDir).filter((f) => f.endsWith('.js'));
    assert.ok(files.length > 0, 'dist/assets must contain built javascript bundles');

    const forbiddenPatterns = [
      /\beigenvalue\b/i,
      /\blexicalRichness\b/i,
      /\bcredibleInterval\b/i,
    ];

    for (const file of files) {
      const content = fs.readFileSync(path.join(distAssetsDir, file), 'utf8');
      for (const pattern of forbiddenPatterns) {
        const matches = content.match(pattern);
        assert.strictEqual(
          matches,
          null,
          `Forbidden moat pattern ${pattern} found in client bundle ${file}`
        );
      }
    }
  });

  await t.test('Public API responses never expose raw internal engine fields', async () => {
    // Probe endpoint
    const probeRes = await fetch(`${ctx.baseUrl}/api/probe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Implement a distributed queue' }),
    });
    const probeJson = await probeRes.json();
    const probeString = JSON.stringify(probeJson);

    // Route endpoint
    const routeRes = await fetch(`${ctx.baseUrl}/api/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Write hello world in python' }),
    });
    const routeJson = await routeRes.json();
    const routeString = JSON.stringify(routeJson);

    // Telemetry endpoint
    const telemetryRes = await fetch(`${ctx.baseUrl}/api/adaptive-telemetry`);
    const telemetryJson = await telemetryRes.json();
    const telemetryString = JSON.stringify(telemetryJson);

    const forbiddenFields = [
      'shannonEntropyBits',
      'thompsonScore',
      'alpha',
      'beta',
      'rewardDelta',
    ];

    for (const field of forbiddenFields) {
      assert.ok(
        !probeString.includes(`"${field}"`),
        `Public probe response must not contain internal field "${field}"`
      );
      assert.ok(
        !routeString.includes(`"${field}"`),
        `Public route response must not contain internal field "${field}"`
      );
      assert.ok(
        !telemetryString.includes(`"${field}"`),
        `Public telemetry response must not contain internal field "${field}"`
      );
    }
  });
});
