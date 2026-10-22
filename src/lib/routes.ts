import { SubscriptionPlanId } from '../types/router';

export type ConsoleTab =
  | 'overview'
  | 'mcp'
  | 'routing'
  | 'adaptive'
  | 'playground'
  | 'flow'
  | 'providers'
  | 'history'
  | 'mode'
  | 'pricing'
  | 'operator';

export type ViewMode = 'landing' | 'console' | 'login' | 'signup';

export interface RouteState {
  viewMode: ViewMode;
  activeTab: ConsoleTab;
  checkoutPlan: SubscriptionPlanId | null;
  path: string;
}

export const TAB_PATHS: Record<ConsoleTab, string> = {
  overview: '/app/overview',
  mcp: '/app/connect',
  routing: '/app/routing',
  adaptive: '/app/routing',
  playground: '/app/playground',
  flow: '/app/flow',
  providers: '/app/providers',
  history: '/app/history',
  mode: '/app/routing',
  pricing: '/app/pricing',
  operator: '/app/operator',
};

export const PATH_TO_TAB: Record<string, ConsoleTab> = {
  overview: 'overview',
  inicio: 'overview',
  home: 'overview',
  connect: 'mcp',
  mcp: 'mcp',
  routing: 'routing',
  enrutamiento: 'routing',
  adaptive: 'routing',
  playground: 'playground',
  flow: 'flow',
  chat: 'playground',
  providers: 'providers',
  history: 'history',
  logs: 'history',
  mode: 'routing',
  strategy: 'routing',
  pricing: 'pricing',
  subscription: 'pricing',
  operator: 'operator',
};

const VALID_PLAN_IDS: SubscriptionPlanId[] = ['developer', 'pro', 'enterprise'];

/**
 * Parses pathname, hash, and search query into a canonical RouteState.
 * Can be called with explicit strings or defaults to browser window.location.
 */
export function parseRoute(rawPath?: string, rawHash?: string, rawSearch?: string): RouteState {
  const isBrowser = typeof window !== 'undefined';
  const path = rawPath !== undefined ? rawPath : (isBrowser ? window.location.pathname : '/');
  const hash = rawHash !== undefined ? rawHash : (isBrowser ? window.location.hash : '');
  const search = rawSearch !== undefined ? rawSearch : (isBrowser ? window.location.search : '');

  // Hash routing support (e.g., #/app/pricing or #/app/connect)
  let effectivePath = path;
  if (hash.startsWith('#/app') || (hash.startsWith('#/') && hash.length > 2)) {
    effectivePath = hash.slice(1);
  }

  // Parse search params for checkout plan (e.g., ?plan=pro)
  let checkoutPlan: SubscriptionPlanId | null = null;
  try {
    const searchString = search || (hash.includes('?') ? hash.slice(hash.indexOf('?')) : '');
    if (searchString) {
      const params = new URLSearchParams(searchString);
      const planParam = params.get('plan') as SubscriptionPlanId | null;
      if (planParam && VALID_PLAN_IDS.includes(planParam)) {
        checkoutPlan = planParam;
      }
    }
  } catch {
    // ignore query string parsing issues
  }

  // Strip query and trailing slashes for path matching
  const cleanPath = effectivePath.split('?')[0].replace(/\/+$/, '') || '/';

  if (cleanPath === '' || cleanPath === '/') {
    return {
      viewMode: 'landing',
      activeTab: 'mcp',
      checkoutPlan,
      path: '/',
    };
  }

  if (cleanPath === '/login') {
    return {
      viewMode: 'login',
      activeTab: 'mcp',
      checkoutPlan,
      path: '/login',
    };
  }

  if (cleanPath === '/signup' || cleanPath === '/register') {
    return {
      viewMode: 'signup',
      activeTab: 'mcp',
      checkoutPlan,
      path: '/signup',
    };
  }

  if (cleanPath === '/app') {
    return {
      viewMode: 'console',
      activeTab: 'mcp',
      checkoutPlan,
      path: '/app/connect',
    };
  }

  if (cleanPath.startsWith('/app/')) {
    const segment = cleanPath.slice('/app/'.length).split('/')[0].toLowerCase();
    const tab = PATH_TO_TAB[segment] || 'mcp';
    return {
      viewMode: 'console',
      activeTab: tab,
      checkoutPlan,
      path: TAB_PATHS[tab] || '/app/connect',
    };
  }

  // Unknown route fallback to landing
  return {
    viewMode: 'landing',
    activeTab: 'mcp',
    checkoutPlan,
    path: '/',
  };
}

/**
 * Returns canonical URL for a given console tab and optional checkout plan.
 */
export function tabToPath(tab: string, checkoutPlan?: SubscriptionPlanId | null): string {
  const base = TAB_PATHS[tab as ConsoleTab] || '/app/connect';
  if (checkoutPlan) {
    return `${base}?plan=${encodeURIComponent(checkoutPlan)}`;
  }
  return base;
}

/**
 * Client-side programmatic navigation using HTML5 History API.
 */
export function navigateTo(to: string, options?: { replace?: boolean }): void {
  if (typeof window === 'undefined') return;

  const current = window.location.pathname + window.location.search + window.location.hash;
  if (current === to) return;

  if (options?.replace) {
    window.history.replaceState({}, '', to);
  } else {
    window.history.pushState({}, '', to);
  }

  window.dispatchEvent(new Event('entropos:navigate'));
}
