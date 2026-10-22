import { test, describe, it } from 'node:test';
import assert from 'node:assert';
import { parseRoute, tabToPath, TAB_PATHS, PATH_TO_TAB, ConsoleTab } from '../src/lib/routes';

describe('Client-Side URL Routing Suite (Entropos-ugg.8)', () => {
  it('parses root / as landing page', () => {
    const route = parseRoute('/', '', '');
    assert.strictEqual(route.viewMode, 'landing');
    assert.strictEqual(route.path, '/');
    assert.strictEqual(route.checkoutPlan, null);
  });

  it('parses /login and /signup auth routes', () => {
    const r1 = parseRoute('/login', '', '');
    assert.strictEqual(r1.viewMode, 'login');
    assert.strictEqual(r1.path, '/login');

    const r2 = parseRoute('/signup', '', '');
    assert.strictEqual(r2.viewMode, 'signup');
    assert.strictEqual(r2.path, '/signup');

    const r3 = parseRoute('/register', '', '');
    assert.strictEqual(r3.viewMode, 'signup');
    assert.strictEqual(r3.path, '/signup');
  });

  it('parses /app and redirects to /app/connect console view', () => {
    const route = parseRoute('/app', '', '');
    assert.strictEqual(route.viewMode, 'console');
    assert.strictEqual(route.activeTab, 'mcp');
    assert.strictEqual(route.path, '/app/connect');
  });

  it('parses canonical /app/connect and alias /app/mcp', () => {
    const r1 = parseRoute('/app/connect', '', '');
    assert.strictEqual(r1.viewMode, 'console');
    assert.strictEqual(r1.activeTab, 'mcp');
    assert.strictEqual(r1.path, '/app/connect');

    const r2 = parseRoute('/app/mcp', '', '');
    assert.strictEqual(r2.viewMode, 'console');
    assert.strictEqual(r2.activeTab, 'mcp');
    assert.strictEqual(r2.path, '/app/connect');
  });

  it('parses all primary console tabs correctly', () => {
    const tabs: ConsoleTab[] = [
      'overview',
      'routing',
      'playground',
      'flow',
      'providers',
      'history',
      'pricing',
      'operator',
    ];

    for (const tab of tabs) {
      const canonicalPath = TAB_PATHS[tab];
      const route = parseRoute(canonicalPath, '', '');
      assert.strictEqual(route.viewMode, 'console');
      assert.strictEqual(route.activeTab, tab);
      assert.strictEqual(route.path, canonicalPath);
    }
  });

  it('parses aliases for overview, history, mode, pricing, and redirects retired chat to playground', () => {
    assert.strictEqual(parseRoute('/app/overview', '', '').activeTab, 'overview');
    assert.strictEqual(parseRoute('/app/inicio', '', '').activeTab, 'overview');
    assert.strictEqual(parseRoute('/app/logs', '', '').activeTab, 'history');
    assert.strictEqual(parseRoute('/app/strategy', '', '').activeTab, 'routing');
    assert.strictEqual(parseRoute('/app/mode', '', '').activeTab, 'routing');
    assert.strictEqual(parseRoute('/app/adaptive', '', '').activeTab, 'routing');
    assert.strictEqual(parseRoute('/app/enrutamiento', '', '').activeTab, 'routing');
    assert.strictEqual(parseRoute('/app/routing', '', '').activeTab, 'routing');
    assert.strictEqual(parseRoute('/app/subscription', '', '').activeTab, 'pricing');
    assert.strictEqual(parseRoute('/app/chat', '', '').activeTab, 'playground');
  });

  it('parses hash routes (#/app/pricing, #/app/connect)', () => {
    const r1 = parseRoute('/', '#/app/pricing', '');
    assert.strictEqual(r1.viewMode, 'console');
    assert.strictEqual(r1.activeTab, 'pricing');

    const r2 = parseRoute('/', '#/app/connect', '');
    assert.strictEqual(r2.viewMode, 'console');
    assert.strictEqual(r2.activeTab, 'mcp');
  });

  it('extracts valid checkoutPlan parameter from search query or hash query', () => {
    const r1 = parseRoute('/app/pricing', '', '?plan=pro');
    assert.strictEqual(r1.checkoutPlan, 'pro');

    const r2 = parseRoute('/app/pricing', '', '?plan=enterprise');
    assert.strictEqual(r2.checkoutPlan, 'enterprise');

    const r3 = parseRoute('/app/pricing', '', '?plan=developer');
    assert.strictEqual(r3.checkoutPlan, 'developer');

    // Invalid plans should be safely ignored
    const r4 = parseRoute('/app/pricing', '', '?plan=invalid_plan');
    assert.strictEqual(r4.checkoutPlan, null);
  });

  it('tabToPath generates canonical deep links', () => {
    assert.strictEqual(tabToPath('mcp'), '/app/connect');
    assert.strictEqual(tabToPath('pricing'), '/app/pricing');
    assert.strictEqual(tabToPath('pricing', 'pro'), '/app/pricing?plan=pro');
    assert.strictEqual(tabToPath('routing'), '/app/routing');
    assert.strictEqual(tabToPath('adaptive'), '/app/routing');
    assert.strictEqual(tabToPath('mode'), '/app/routing');
    assert.strictEqual(tabToPath('operator'), '/app/operator');
  });

  it('falls back to landing page for unknown routes', () => {
    const route = parseRoute('/unknown-route/123', '', '');
    assert.strictEqual(route.viewMode, 'landing');
    assert.strictEqual(route.path, '/');
  });
});
