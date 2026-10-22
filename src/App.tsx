import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { LandingPage } from './components/LandingPage';
import { CheckoutModal } from './components/CheckoutModal';
import { McpConnect } from './components/McpConnect';
import { RoutingFlowGraph } from './components/RoutingFlowGraph';
import { Playground } from './components/Playground';
import { ProvidersView } from './components/ProvidersView';
import { ActivityLog } from './components/ActivityLog';
import { RoutingModeView } from './components/RoutingModeView';
import { RoutingView } from './components/RoutingView';
import { PricingRoi } from './components/PricingRoi';
import { OperatorView } from './components/OperatorView';
import { AdaptiveControlView } from './components/AdaptiveControlView';
import { AuthView } from './components/AuthView';
import { OverviewDashboard } from './components/OverviewDashboard';
import {
  RouteExecution,
  RoutingMode,
  CustomRule,
  PublicWorkspaceKey,
  SubscriptionPlanId,
  SubscriptionState,
  UserRecord,
  WorkspaceRecord,
  AuthSessionResponse,
} from './types/router';
import { DEFAULT_CUSTOM_RULES } from './lib/defaults';
import { PLANS } from './constants/plans';
import { fetchJson, errorMessage } from './lib/api';
import { parseRoute, tabToPath, navigateTo, ConsoleTab, ViewMode } from './lib/routes';
import {
  getStoredSessionToken,
  getStoredUser,
  getStoredWorkspace,
  fetchCurrentSession,
  logoutSession,
} from './lib/auth';
import { Check, ArrowLeft } from 'lucide-react';

export default function App() {
  // Navigation: URL-driven route state (landing vs console dashboard tabs)
  const initialRoute = parseRoute();
  const [viewMode, setViewMode] = useState<ViewMode>(initialRoute.viewMode);
  const [activeTab, setActiveTab] = useState<string>(initialRoute.activeTab);
  const [checkoutPlan, setCheckoutPlan] = useState<SubscriptionPlanId | null>(initialRoute.checkoutPlan);

  const [mode, setMode] = useState<RoutingMode>('adaptive');
  const [customRules, setCustomRules] = useState<CustomRule[]>(DEFAULT_CUSTOM_RULES);
  const [playgroundPrompt, setPlaygroundPrompt] = useState<string>('');
  const [liveToast, setLiveToast] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  // Sync state on browser Back / Forward / Hash / custom navigate events
  useEffect(() => {
    const handleLocationChange = () => {
      const current = parseRoute();
      setViewMode(current.viewMode);
      setActiveTab(current.activeTab);
      if (current.checkoutPlan) {
        setCheckoutPlan(current.checkoutPlan);
      }
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    window.addEventListener('entropos:navigate', handleLocationChange);

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
      window.removeEventListener('entropos:navigate', handleLocationChange);
    };
  }, []);

  // Auth & Workspace state
  const [currentUser, setCurrentUser] = useState<UserRecord | null>(() => getStoredUser());
  const [currentWorkspace, setCurrentWorkspace] = useState<WorkspaceRecord | null>(() => getStoredWorkspace());

  // Subscription state
  const [subscription, setSubscription] = useState<SubscriptionState>({
    planId: PLANS.developer.id,
    planName: PLANS.developer.name,
    status: 'active',
    monthlyQuota: PLANS.developer.quotaMonthly,
    usedThisMonth: 0,
    currentPeriodEnd: '—',
    features: PLANS.developer.features,
  });

  const [apiKeys, setApiKeys] = useState<PublicWorkspaceKey[]>([]);

  const [serverStatus, setServerStatus] = useState<{
    totalRequests: number;
    totalSavedUsd: number;
    averageDiscountPct: number | null;
    activeMode: string;
  }>({
    totalRequests: 0,
    totalSavedUsd: 0,
    averageDiscountPct: null,
    activeMode: 'balanced',
  });

  const [history, setHistory] = useState<RouteExecution[]>([]);

  const fetchSubscription = () => {
    fetchJson<SubscriptionState>('/api/subscription')
      .then((data) => {
        if (data?.planId) {
          setSubscription(data);
        }
      })
      .catch((err) => setServerError(`Could not load your subscription: ${errorMessage(err)}`));
  };

  const fetchKeys = () => {
    fetchJson<{ keys: PublicWorkspaceKey[] }>('/api/keys')
      .then((data) => setApiKeys(Array.isArray(data?.keys) ? data.keys : []))
      .catch((err) => setServerError(`Could not load workspace keys: ${errorMessage(err)}`));
  };

  // Route guard: unauthenticated access to the console redirects to /login
  useEffect(() => {
    const hasToken = Boolean(getStoredSessionToken());
    if (viewMode === 'console' && !hasToken) {
      navigateTo('/login', { replace: true });
    }
  }, [viewMode]);

  // Sync session on mount if token exists
  useEffect(() => {
    if (getStoredSessionToken()) {
      fetchCurrentSession()
        .then((sess) => {
          if (sess) {
            setCurrentUser(sess.user);
            setCurrentWorkspace(sess.workspace);
            if (sess.subscription) {
              setSubscription(sess.subscription);
            }
          } else {
            setCurrentUser(null);
            setCurrentWorkspace(null);
            if (viewMode === 'console') {
              navigateTo('/login', { replace: true });
            }
          }
        })
        .catch(() => {});
    }
  }, []);

  const fetchHistory = () => {
    fetchJson<{ logs: RouteExecution[] }>('/api/history')
      .then((data) => {
        if (Array.isArray(data?.logs)) {
          setHistory(data.logs);
        }
      })
      .catch(() => {});
  };

  // Sync server status, subscription, keys, and history on mount
  useEffect(() => {
    fetchJson('/api/status')
      .then((data) => {
        if (data?.totalRequests !== undefined) {
          setServerStatus({
            totalRequests: data.totalRequests,
            totalSavedUsd: data.totalSavedUsd,
            averageDiscountPct: data.averageDiscountPct ?? null,
            activeMode: data.activeMode || 'balanced',
          });
          setMode(data.activeMode || 'balanced');
          if (data.customRules) {
            setCustomRules(data.customRules);
          }
        }
      })
      .catch((err) => setServerError(`Could not load workspace status: ${errorMessage(err)}`));

    fetchSubscription();
    fetchKeys();
    fetchHistory();
  }, []);

  const handleExecutionComplete = (execution: RouteExecution) => {
    setHistory((prev) => [execution, ...prev]);

    // Simulated executions are excluded from live production metrics and subscription quotas
    if (!execution.isSimulated) {
      setServerStatus((prev) => ({
        ...prev,
        totalRequests: prev.totalRequests + 1,
        totalSavedUsd: Number((prev.totalSavedUsd + execution.savedUsd).toFixed(2)),
      }));
      // The average discount comes from the server's unrounded totals.
      fetchJson('/api/status')
        .then((data) => {
          if (data?.averageDiscountPct !== undefined) {
            setServerStatus((prev) => ({ ...prev, averageDiscountPct: data.averageDiscountPct }));
          }
        })
        .catch((err) => setServerError(`Could not refresh workspace status: ${errorMessage(err)}`));
      setSubscription((prev) => ({
        ...prev,
        usedThisMonth: prev.usedThisMonth + 1,
      }));
    }
  };

  // The server generates the key; this response is the only time the console sees its full value.
  const handleCreateApiKey = async (name: string, clientName: string): Promise<PublicWorkspaceKey> => {
    const created = await fetchJson<PublicWorkspaceKey>('/api/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, clientName }),
    });
    setApiKeys((prev) => [created, ...prev]);
    setLiveToast(`Workspace key "${created.name}" created. Copy it now: it will not be shown again.`);
    setTimeout(() => setLiveToast(null), 4000);
    return created;
  };

  const handleSimulateMcpCall = () => {
    const sample: RouteExecution = {
      id: 'sim_mcp_' + Date.now().toString(36),
      timestamp: new Date().toISOString(),
      promptSnippet: 'Refactor AST token validation module to zero-copy slice...',
      fullPrompt:
        'Refactor AST token validation module to zero-copy slice with unit tests and invariant bounds.',
      selectedModel: 'Claude Sonnet 5.5',
      provider: 'Anthropic',
      reason: 'Complex coding logic & memory safety detected -> Routed to Claude Sonnet 5.5',
      speedLatencyMs: 235,
      costUsd: 0.00048,
      baselineCostUsd: 0.0036,
      savedUsd: 0.00312,
      savedPercentage: 86,
      responseText: 'AST validation refactored with zero-copy lifetimes and invariant assertions.',
      mode,
      clientOrigin: 'Claude Code (Simulated CLI)',
      isSimulated: true,
    };
    handleExecutionComplete(sample);
    setLiveToast('Simulated query executed: sample prompt routed (Simulated, excluded from live metrics).');
    setTimeout(() => setLiveToast(null), 4000);
  };

  const handleOpenCheckout = (planId: SubscriptionPlanId) => {
    navigateTo(tabToPath('pricing', planId));
    setCheckoutPlan(planId);
  };

  const handleCloseCheckout = () => {
    setCheckoutPlan(null);
    if (typeof window !== 'undefined' && window.location.search.includes('plan=')) {
      navigateTo(tabToPath(activeTab), { replace: true });
    }
  };

  const handleAuthSuccess = (sess: AuthSessionResponse) => {
    setCurrentUser(sess.user);
    setCurrentWorkspace(sess.workspace);
    if (sess.subscription) {
      setSubscription(sess.subscription);
    }
    fetchKeys();
    fetchSubscription();
    navigateTo('/app/connect');
    setLiveToast(`Welcome, ${sess.user.name || sess.user.email}! Workspace: ${sess.workspace.name}`);
    setTimeout(() => setLiveToast(null), 4000);
  };

  const handleLogout = async () => {
    await logoutSession();
    setCurrentUser(null);
    setCurrentWorkspace(null);
    setApiKeys([]);
    navigateTo('/');
    setLiveToast('You have been logged out.');
    setTimeout(() => setLiveToast(null), 3000);
  };

  const handleEnterDashboard = (targetTab: string = 'mcp') => {
    if (!getStoredSessionToken()) {
      navigateTo('/login');
    } else {
      navigateTo(tabToPath(targetTab));
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNavigateToTab = (tab: string) => {
    navigateTo(tabToPath(tab));
  };

  const handleNavigateToLanding = () => {
    navigateTo('/');
  };

  const averageDiscountLabel =
    serverStatus.averageDiscountPct !== null ? `${serverStatus.averageDiscountPct.toFixed(1)}% off frontier` : '—';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-600/30 selection:text-white">
      {viewMode === 'landing' ? (
        /* Landing Page View */
        <LandingPage
          onEnterDashboard={handleEnterDashboard}
          onOpenCheckout={handleOpenCheckout}
          totalSavedUsd={serverStatus.totalSavedUsd}
          totalRequests={serverStatus.totalRequests}
        />
      ) : viewMode === 'login' || viewMode === 'signup' ? (
        /* Auth View (Login / Register / GitHub simulation) */
        <AuthView
          key={viewMode}
          initialMode={viewMode === 'signup' ? 'signup' : 'login'}
          onSuccess={handleAuthSuccess}
          onNavigateHome={handleNavigateToLanding}
        />
      ) : (
        /* Console / App Dashboard View */
        <>
          {/* Top Header */}
          <Header
            activeTab={activeTab}
            setActiveTab={handleNavigateToTab}
            serverStatus={serverStatus}
            onShowLandingPage={handleNavigateToLanding}
            subscription={subscription}
            subscriptionPlan={subscription.planName}
            workspaceName={currentWorkspace?.name}
            userEmail={currentUser?.email}
            onLogout={handleLogout}
          />

          {/* Real-time Notification Banner: the live region stays mounted so screen readers announce changes */}
          <div role="status" aria-live="polite">
            {liveToast && (
              <div className="bg-indigo-950/60 border-b border-indigo-800/80 px-4 py-2 text-xs font-mono text-indigo-300 flex items-center justify-center gap-2 animate-in fade-in">
                <Check className="w-3.5 h-3.5 text-indigo-400" aria-hidden="true" />
                <span>{liveToast}</span>
              </div>
            )}
          </div>

          {serverError && (
            <div
              role="alert"
              className="bg-red-950/60 border-b border-red-800/80 px-4 py-2 text-xs text-red-200 flex items-center justify-center gap-3"
            >
              <span>{serverError}</span>
              <button
                onClick={() => setServerError(null)}
                className="text-red-300 hover:text-white underline underline-offset-2 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Quick Back to Landing Bar */}
          <div className="border-b border-slate-900 bg-slate-950 px-4 sm:px-6 py-2 flex items-center justify-between text-xs font-mono text-slate-400">
            <a
              href="/"
              onClick={(e) => {
                if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) {
                  e.preventDefault();
                  handleNavigateToLanding();
                }
              }}
              className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Landing Page</span>
            </a>
            <div className="flex items-center gap-3">
              <span>
                Plan: <strong className="text-white">{subscription.planName}</strong>
              </span>
              <span>•</span>
              <a
                href="/app/pricing"
                onClick={(e) => {
                  if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) {
                    e.preventDefault();
                    handleNavigateToTab('pricing');
                  }
                }}
                className="text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
              >
                Manage Subscription & Quotas
              </a>
            </div>
          </div>

          {/* Main Viewport */}
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 space-y-8">
            {/* Metric Strip (Clean, unboxed, tabular-nums) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-900/40 border border-slate-800/80">
              <div>
                <div className="text-[11px] text-slate-500 uppercase font-mono tracking-wider">
                  Cumulative Savings
                </div>
                <div className="text-xl font-bold font-mono text-emerald-400 tabular-nums mt-0.5">
                  ${serverStatus.totalSavedUsd.toFixed(2)} USD
                </div>
              </div>

              <div>
                <div className="text-[11px] text-slate-500 uppercase font-mono tracking-wider">
                  Average Token Discount
                </div>
                <div className="text-xl font-bold font-mono text-white tabular-nums mt-0.5">
                  {averageDiscountLabel}
                </div>
              </div>

              <div>
                <div className="text-[11px] text-slate-500 uppercase font-mono tracking-wider">
                  Total Queries Routed
                </div>
                <div className="text-xl font-bold font-mono text-white tabular-nums mt-0.5">
                  {serverStatus.totalRequests}
                </div>
              </div>

              <div>
                <div className="text-[11px] text-slate-500 uppercase font-mono tracking-wider">
                  Subscription Tier
                </div>
                <div className="text-xl font-bold font-mono text-indigo-400 capitalize mt-0.5">
                  {subscription.planName}
                </div>
              </div>
            </div>

            {serverStatus.totalRequests === 0 && (
              <p className="text-sm text-slate-400">
                No routed requests yet. Connect a client in{' '}
                <a
                  href="/app/connect"
                  onClick={(e) => {
                    if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) {
                      e.preventDefault();
                      handleNavigateToTab('mcp');
                    }
                  }}
                  className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 cursor-pointer"
                >
                  MCP Setup
                </a>{' '}
                or run a prompt in the{' '}
                <a
                  href="/app/playground"
                  onClick={(e) => {
                    if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) {
                      e.preventDefault();
                      handleNavigateToTab('playground');
                    }
                  }}
                  className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 cursor-pointer"
                >
                  Playground
                </a>
                ; your savings will show up here.
              </p>
            )}

            {/* Tab Views */}
            {activeTab === 'overview' && (
              <OverviewDashboard
                onNavigateToTab={handleNavigateToTab}
                serverStatus={serverStatus}
              />
            )}

            {activeTab === 'mcp' && (
              <McpConnect
                apiKeys={apiKeys}
                onCreateApiKey={handleCreateApiKey}
                onSimulateMcpCall={handleSimulateMcpCall}
                onNavigateToTab={handleNavigateToTab}
                latestExecution={history[0] || null}
              />
            )}

            {(activeTab === 'routing' || activeTab === 'mode' || activeTab === 'adaptive') && (
              <RoutingView
                currentMode={mode}
                onModeChange={setMode}
                customRules={customRules}
                onUpdateRules={setCustomRules}
                onNotify={(msg) => setLiveToast(msg)}
                onNavigateToPlayground={(p) => {
                  if (p) setPlaygroundPrompt(p);
                  handleNavigateToTab('playground');
                }}
              />
            )}

            {activeTab === 'flow' && (
              <RoutingFlowGraph
                recentExecutions={history}
                onTriggerSimulation={handleSimulateMcpCall}
              />
            )}

            {activeTab === 'playground' && (
              <Playground
                mode={mode}
                onModeChange={setMode}
                initialPrompt={playgroundPrompt}
                onExecutionComplete={handleExecutionComplete}
              />
            )}

            {activeTab === 'providers' && <ProvidersView />}

            {activeTab === 'history' && <ActivityLog history={history} />}

            {activeTab === 'pricing' && (
              <PricingRoi
                subscription={subscription}
                onOpenCheckout={handleOpenCheckout}
                onRefreshSubscription={fetchSubscription}
              />
            )}

            {activeTab === 'operator' && <OperatorView />}
          </main>

          {/* Clean Editorial Footer */}
          <footer className="border-t border-slate-800/80 py-6 text-xs text-slate-500 font-mono">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                Entropos · Model Context Protocol Specification 2024-11-05
              </div>
              <div className="flex items-center gap-4 text-slate-400">
                <a
                  href="/"
                  onClick={(e) => {
                    if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) {
                      e.preventDefault();
                      handleNavigateToLanding();
                    }
                  }}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  Landing Page
                </a>
                <span aria-hidden="true">·</span>
                <a
                  href="/app/connect"
                  onClick={(e) => {
                    if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) {
                      e.preventDefault();
                      handleNavigateToTab('mcp');
                    }
                  }}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  MCP Docs
                </a>
                <span aria-hidden="true">·</span>
                <a
                  href="/app/pricing"
                  onClick={(e) => {
                    if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) {
                      e.preventDefault();
                      handleNavigateToTab('pricing');
                    }
                  }}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  Subscription
                </a>
                <span aria-hidden="true">·</span>
                <span>Zero Data Retention</span>
              </div>
            </div>
          </footer>
        </>
      )}

      {/* Checkout & Subscription Upgrade Modal */}
      {checkoutPlan && (
        <CheckoutModal
          isOpen={Boolean(checkoutPlan)}
          onClose={handleCloseCheckout}
          targetPlanId={checkoutPlan}
          onSuccess={(updatedSub) => {
            setSubscription(updatedSub);
            setLiveToast(`Successfully activated ${updatedSub.planName} tier!`);
            setTimeout(() => setLiveToast(null), 4000);
          }}
        />
      )}
    </div>
  );
}
