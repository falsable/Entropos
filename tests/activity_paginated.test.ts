import { test, describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createTestServer, TestServerContext } from './test_helper';

describe('Server Activity Log, Pagination & CSV Export Suite (Entropos-ugg.13)', () => {
  let ctx: TestServerContext;
  const runId = Math.random().toString(36).substring(2, 8);
  let sessionToken: string;

  before(async () => {
    ctx = await createTestServer();

    // Register a test user
    const regRes = await fetch(`${ctx.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `activity_${runId}@company.com`,
        password: 'password123',
        name: 'Activity Tester',
      }),
    });
    assert.strictEqual(regRes.status, 201);
    const data = await regRes.json();
    sessionToken = data.token;
  });

  after(async () => {
    await ctx.close();
  });

  it('GET /api/history returns paginated response with metadata', async () => {
    const res = await fetch(`${ctx.baseUrl}/api/history?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    assert.ok(Array.isArray(data.logs));
    assert.strictEqual(typeof data.total, 'number');
    assert.strictEqual(data.page, 1);
    assert.strictEqual(typeof data.totalPages, 'number');
  });

  it('GET /api/history supports filtering by mode and model', async () => {
    // 1. Filter by mode=adaptive
    const resMode = await fetch(`${ctx.baseUrl}/api/history?mode=adaptive`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    assert.strictEqual(resMode.status, 200);
    const dataMode = await resMode.json();
    assert.ok(Array.isArray(dataMode.logs));

    // 2. Filter by model
    const resModel = await fetch(`${ctx.baseUrl}/api/history?model=Gemini%203.8%20Flash`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    assert.strictEqual(resModel.status, 200);
    const dataModel = await resModel.json();
    assert.ok(Array.isArray(dataModel.logs));
  });

  it('GET /api/history/export?format=csv returns valid text/csv attachment', async () => {
    const res = await fetch(`${ctx.baseUrl}/api/history/export?format=csv`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    assert.strictEqual(res.status, 200);
    const contentType = res.headers.get('content-type') || '';
    assert.ok(contentType.includes('text/csv'), `Content-Type should be text/csv, got ${contentType}`);

    const contentDisposition = res.headers.get('content-disposition') || '';
    assert.ok(contentDisposition.includes('attachment; filename='), 'Content-Disposition must be attachment');

    const csvBody = await res.text();
    assert.ok(csvBody.startsWith('id,timestamp,selectedModel,provider,mode'), 'CSV must start with proper header line');
  });

  it('GET /api/history/export?format=json returns JSON attachment', async () => {
    const res = await fetch(`${ctx.baseUrl}/api/history/export?format=json`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    assert.strictEqual(res.status, 200);
    const contentType = res.headers.get('content-type') || '';
    assert.ok(contentType.includes('application/json'));

    const data = await res.json();
    assert.ok(Array.isArray(data.logs));
  });
});
