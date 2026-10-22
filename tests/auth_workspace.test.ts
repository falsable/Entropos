import { test, describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createTestServer, TestServerContext } from './test_helper';

describe('User Authentication & Workspace Isolation Suite (Entropos-ugg.9)', () => {
  let ctx: TestServerContext;
  const runId = Math.random().toString(36).substring(2, 8);
  const aliceEmail = `alice_${runId}@company.com`;
  const ghEmail = `gh_${runId}@github.com`;
  const charlieEmail = `charlie_${runId}@dev.org`;
  const alfaEmail = `alfa_${runId}@agency.com`;
  const betaEmail = `beta_${runId}@enterprise.com`;

  before(async () => {
    ctx = await createTestServer();
  });

  after(async () => {
    await ctx.close();
  });

  it('rejects registration with invalid email or short password', async () => {
    const res1 = await fetch(`${ctx.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', password: 'password123', name: 'Tester' }),
    });
    assert.strictEqual(res1.status, 400);

    const res2 = await fetch(`${ctx.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `test_${runId}@example.com`, password: '123', name: 'Tester' }),
    });
    assert.strictEqual(res2.status, 400);
  });

  it('registers new user, creates their workspace, and issues persistent session token', async () => {
    const res = await fetch(`${ctx.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: aliceEmail, password: 'secure_password_123', name: 'Alice Smith' }),
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();

    assert.ok(data.token, 'Token must be issued');
    assert.ok(data.token.startsWith('sess_'));
    assert.strictEqual(data.user.email, aliceEmail);
    assert.strictEqual(data.user.name, 'Alice Smith');
    assert.ok(data.workspace.id.startsWith('ws_'));
    assert.strictEqual(data.workspace.name, "Alice Smith's Workspace");
    assert.strictEqual(data.subscription.planId, 'developer');
  });

  it('rejects duplicate registration with existing email', async () => {
    const res = await fetch(`${ctx.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: aliceEmail, password: 'another_password', name: 'Alice Dupe' }),
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes('already exists'));
  });

  it('authenticates valid credentials on login and rejects invalid credentials', async () => {
    // Valid login
    const resOk = await fetch(`${ctx.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: aliceEmail, password: 'secure_password_123' }),
    });
    assert.strictEqual(resOk.status, 200);
    const okData = await resOk.json();
    assert.ok(okData.token);
    assert.strictEqual(okData.user.email, aliceEmail);

    // Wrong password
    const resWrong = await fetch(`${ctx.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: aliceEmail, password: 'wrong_password_xyz' }),
    });
    assert.strictEqual(resWrong.status, 401);

    // Non-existent user
    const resNoUser = await fetch(`${ctx.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `nobody_${runId}@nowhere.com`, password: 'password123' }),
    });
    assert.strictEqual(resNoUser.status, 401);
  });

  it('supports GitHub OAuth login / registration', async () => {
    const res = await fetch(`${ctx.baseUrl}/api/auth/github`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ghEmail, name: 'Octocat Dev' }),
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.token);
    assert.strictEqual(data.user.email, ghEmail);
    assert.strictEqual(data.user.authProvider, 'github');
    assert.ok(data.workspace.id);
  });

  it('GET /api/auth/me returns current session user and workspace', async () => {
    // 1. Register a user
    const regRes = await fetch(`${ctx.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: charlieEmail, password: 'charlie_secret_99', name: 'Charlie' }),
    });
    assert.strictEqual(regRes.status, 201);
    const regData = await regRes.json();
    const token = regData.token;

    // 2. Fetch /api/auth/me
    const meRes = await fetch(`${ctx.baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.strictEqual(meRes.status, 200);
    const meData = await meRes.json();
    assert.strictEqual(meData.user.email, charlieEmail);
    assert.strictEqual(meData.workspace.id, regData.workspace.id);
  });

  it('guarantees workspace isolation: users only see their own workspace keys', async () => {
    // 1. User 1 (Team Alfa)
    const user1Res = await fetch(`${ctx.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: alfaEmail, password: 'password_alfa_123', name: 'Alfa Admin' }),
    });
    assert.strictEqual(user1Res.status, 201);
    const { token: token1 } = await user1Res.json();

    // User 1 creates a key
    const createKey1 = await fetch(`${ctx.baseUrl}/api/keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
      },
      body: JSON.stringify({ name: 'Alfa Secret Key', clientName: 'cursor' }),
    });
    assert.strictEqual(createKey1.status, 201);

    // 2. User 2 (Team Beta)
    const user2Res = await fetch(`${ctx.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: betaEmail, password: 'password_beta_123', name: 'Beta Admin' }),
    });
    assert.strictEqual(user2Res.status, 201);
    const { token: token2 } = await user2Res.json();

    // User 2 creates a key
    const createKey2 = await fetch(`${ctx.baseUrl}/api/keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token2}`,
      },
      body: JSON.stringify({ name: 'Beta Secret Key', clientName: 'claude_code' }),
    });
    assert.strictEqual(createKey2.status, 201);

    // 3. User 1 queries keys: MUST see Alfa Secret Key and MUST NOT see Beta Secret Key
    const list1Res = await fetch(`${ctx.baseUrl}/api/keys`, {
      headers: { Authorization: `Bearer ${token1}` },
    });
    const list1Data = await list1Res.json();
    const list1Names = list1Data.keys.map((k: any) => k.name);
    assert.ok(list1Names.includes('Alfa Secret Key'), 'User 1 must see their own key');
    assert.ok(!list1Names.includes('Beta Secret Key'), 'User 1 must NOT see User 2 key');

    // 4. User 2 queries keys: MUST see Beta Secret Key and MUST NOT see Alfa Secret Key
    const list2Res = await fetch(`${ctx.baseUrl}/api/keys`, {
      headers: { Authorization: `Bearer ${token2}` },
    });
    const list2Data = await list2Res.json();
    const list2Names = list2Data.keys.map((k: any) => k.name);
    assert.ok(list2Names.includes('Beta Secret Key'), 'User 2 must see their own key');
    assert.ok(!list2Names.includes('Alfa Secret Key'), 'User 2 must NOT see User 1 key');
  });

  it('POST /api/auth/logout invalidates session token', async () => {
    // 1. Login
    const loginRes = await fetch(`${ctx.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: aliceEmail, password: 'secure_password_123' }),
    });
    assert.strictEqual(loginRes.status, 200);
    const { token } = await loginRes.json();

    // 2. Logout
    const logoutRes = await fetch(`${ctx.baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.strictEqual(logoutRes.status, 200);

    // 3. Storage check: session must be erased
    const { productionStore } = await import('../src/server/storage');
    assert.strictEqual(productionStore.getSession(token), null);
  });

  it('GET /api/history returns recorded executions for guided onboarding detector (Entropos-ugg.10)', async () => {
    // 1. Register a user and get session
    const regRes = await fetch(`${ctx.baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `history_${runId}@company.com`, password: 'password123', name: 'History User' }),
    });
    assert.strictEqual(regRes.status, 201);
    const { token } = await regRes.json();

    // 2. Query /api/history
    const historyRes = await fetch(`${ctx.baseUrl}/api/history`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.strictEqual(historyRes.status, 200);
    const data = await historyRes.json();
    assert.ok(Array.isArray(data.logs), 'logs must be an array');
  });
});
