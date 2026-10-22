import React, { useState } from 'react';
import {
  ArrowRight,
  Shield,
  Zap,
  Cpu,
  Layers,
  Terminal,
  ChevronRight,
  TrendingUp,
  Sliders,
  DollarSign,
  Activity,
  CheckCircle2,
  Lock,
  GitBranch,
  Copy,
  Check,
  Code2,
  Sparkles,
  RotateCcw,
  AlertTriangle,
  Send,
  HelpCircle,
} from 'lucide-react';
import { SubscriptionPlanId } from '../types/router';
import { buildClientSnippets, ClientId, KEY_PLACEHOLDER } from '../lib/mcpSnippets';
import { PLANS_LIST } from '../constants/plans';
import { calculateRoi, ROI_CONSTANTS } from '../constants/roi';
import { navigateTo } from '../lib/routes';

// Landing shows a subset of the console's snippets, built from the same source.
const LANDING_CLIENTS: { id: ClientId; tab: string }[] = [
  { id: 'claude_code', tab: 'Claude Code' },
  { id: 'cursor', tab: 'Cursor' },
  { id: 'openai_sdk', tab: 'Python SDK' },
];

// Demo ilustrativa: escenarios fijos y un medidor cualitativo. A proposito NO contiene senales de ruteo,
// pesos, umbrales ni reglas de actualizacion (ver docs/ analisis de moat, seccion 3.B).
interface DemoScenario {
  id: string;
  label: string;
  sample: string;
  tier: string;
  model: string;
  why: string;
}

const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'lookup',
    label: 'Quick lookup',
    sample: 'What is the capital of Australia?',
    tier: 'Instant edge',
    model: 'Gemini 3.8 Flash',
    why: 'Predictable, low-risk request: answered at the edge for a fraction of the cost.',
  },
  {
    id: 'systems',
    label: 'Systems code',
    sample: 'Audit this Rust Tarjan implementation for race conditions.',
    tier: 'Frontier reasoning',
    model: 'Claude Sonnet 5.5',
    why: 'Open-ended engineering task: reserved for a proven frontier engine.',
  },
  {
    id: 'proof',
    label: 'Formal proof',
    sample: 'Prove that sqrt(2) is irrational.',
    tier: 'Deep logic',
    model: 'DeepSeek R1',
    why: 'Multi-step formal reasoning: sent to a specialist reasoning engine.',
  },
];

const DEMO_MODELS: { name: string; role: string; start: number }[] = [
  { name: 'Claude Sonnet 5.5', role: 'Complex Systems & Code', start: 90 },
  { name: 'GPT-6 Astra', role: 'OpenAI Frontier Flagship', start: 88 },
  { name: 'Gemini 3.8 Flash', role: 'Ultra-Fast Edge', start: 85 },
  { name: 'DeepSeek R1', role: 'Formal Logic & Proofs', start: 78 },
];

interface LandingPageProps {
  onEnterDashboard: (targetTab?: string) => void;
  onOpenCheckout: (planId: SubscriptionPlanId) => void;
  totalSavedUsd: number;
  totalRequests: number;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onEnterDashboard,
  onOpenCheckout,
  totalSavedUsd,
  totalRequests,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [activeSnippetTab, setActiveSnippetTab] = useState<ClientId>('claude_code');
  const [interactiveTokens, setInteractiveTokens] = useState<number>(25);

  // Illustrative closed-loop demo state (no real routing signals live in the browser)
  const [scenarioId, setScenarioId] = useState<string>(DEMO_SCENARIOS[1].id);
  const [modelLevels, setModelLevels] = useState<Record<string, number>>(() =>
    Object.fromEntries(DEMO_MODELS.map((m) => [m.name, m.start]))
  );
  const [simFeedbackMsg, setSimFeedbackMsg] = useState<string | null>(null);
  const scenario = DEMO_SCENARIOS.find((sc) => sc.id === scenarioId) ?? DEMO_SCENARIOS[0];

  const { baselineMonthly: baselineCost, entroposMonthly: routerCost, annualSavings } = calculateRoi(
    interactiveTokens
  );

  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, callback?: () => void) => {
    if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) {
      e.preventDefault();
      if (callback) callback();
    }
  };

  const reportOutcome = (modelName: string, outcome: 'success' | 'failure') => {
    setModelLevels((prev) => {
      const current = prev[modelName] ?? 0;
      const next = outcome === 'success' ? current + 4 : current - 12;
      return { ...prev, [modelName]: Math.max(5, Math.min(99, next)) };
    });
    setSimFeedbackMsg(
      outcome === 'success'
        ? `Outcome recorded: ${modelName} earned more of this kind of work.`
        : `Failure recorded: traffic shifts away from ${modelName} until it recovers.`
    );
    setTimeout(() => setSimFeedbackMsg(null), 3500);
  };

  const snippets = buildClientSnippets(window.location.origin, KEY_PLACEHOLDER);

  const handleCopy = () => {
    navigator.clipboard.writeText(snippets[activeSnippetTab].snippet);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-600/30 selection:text-white">
      {/* Top Navbar */}
      <nav className="border-b border-slate-800/80 bg-slate-950/90 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold tracking-tight text-white">Entropos</span>
            <span className="text-slate-600 hidden sm:inline">/</span>
            <span className="text-xs font-mono text-indigo-400 hidden sm:inline">
              Adaptive Control Plane
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs font-medium">
            <button
              onClick={() => {
                const el = document.getElementById('adaptive-manifesto');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              className="text-slate-400 hover:text-white transition-colors cursor-pointer hidden md:inline"
            >
              Adaptive vs Legacy
            </button>
            <button
              onClick={() => {
                const el = document.getElementById('simulator');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              className="text-slate-400 hover:text-white transition-colors cursor-pointer hidden lg:inline"
            >
              Live Demo
            </button>
            <button
              onClick={() => {
                const el = document.getElementById('roi-calculator');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              className="text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              ROI Calculator
            </button>
            <a
              href="/app/pricing"
              onClick={(e) => handleLinkClick(e, () => onEnterDashboard('pricing'))}
              className="text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              Pricing
            </a>
            <a
              href="/login"
              onClick={(e) => handleLinkClick(e, () => navigateTo('/login'))}
              className="text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              Sign In
            </a>
            <a
              href="/app/connect"
              onClick={(e) => handleLinkClick(e, () => onEnterDashboard('mcp'))}
              className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
            >
              <span>Launch Console</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-16 pb-20 border-b border-slate-800/80">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b0f_1px,transparent_1px),linear-gradient(to_bottom,#1e293b0f_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

        <div className="max-w-5xl mx-auto px-4 sm:px-6 relative z-10 text-center space-y-6">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-950/60 border border-indigo-800/60 text-xs font-mono text-indigo-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Closed-Loop Control Plane for LLM Routing · Reads every request before the spend · Learns from every outcome</span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-white leading-[1.1]">
            The Closed-Loop Adaptive Router for Mission-Critical AI.
          </h1>

          {/* Subtitle */}
          <p className="text-base sm:text-lg text-slate-400 max-w-3xl mx-auto leading-relaxed">
            Legacy routers rely on static heuristics and blind, open-loop dispatches. Entropos closes the loop: it reads each request before spending on it, learns from downstream outcomes, and shifts traffic as providers drift, reserving Claude Sonnet 5.5, GPT-6 Astra, and DeepSeek R1 for the work that needs them.
          </p>

          {/* Action CTAs */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
            <a
              href="/app/adaptive"
              onClick={(e) => handleLinkClick(e, () => onEnterDashboard('adaptive'))}
              className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-all cursor-pointer flex items-center gap-2 shadow-lg shadow-indigo-950/50 active:scale-95"
            >
              <span>Explore Adaptive Control Plane</span>
              <ArrowRight className="w-4 h-4" />
            </a>
            <button
              onClick={() => {
                const el = document.getElementById('adaptive-manifesto');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              className="px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-sm font-medium transition-colors cursor-pointer flex items-center gap-2"
            >
              <Cpu className="w-4 h-4 text-indigo-400" />
              <span>Why Legacy Routers Fail</span>
            </button>
            <a
              href="/app/connect"
              onClick={(e) => handleLinkClick(e, () => onEnterDashboard('mcp'))}
              className="px-5 py-3 rounded-xl hover:bg-slate-900/60 text-slate-400 hover:text-slate-200 text-sm font-medium transition-colors cursor-pointer"
            >
              Connect MCP (60s) →
            </a>
          </div>

          {/* Proof Bar */}
          <div className="pt-8 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto text-left font-mono">
            <div className="p-3.5 rounded-xl bg-slate-900/50 border border-slate-800">
              <div className="text-[11px] text-slate-500 uppercase">Decision Latency</div>
              <div className="text-lg font-bold text-emerald-400 tabular-nums mt-0.5">
                &lt; 40ms
              </div>
              <div className="text-[10px] text-slate-500">Projected · control-plane decision</div>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-900/50 border border-slate-800">
              <div className="text-[11px] text-slate-500 uppercase">Cost Reduction</div>
              <div className="text-lg font-bold text-white tabular-nums mt-0.5">
                82% off Frontier Bill
              </div>
              <div className="text-[10px] text-slate-500">Projected{totalSavedUsd > 0 ? ` · $${totalSavedUsd.toFixed(2)} routed saved` : ''}</div>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-900/50 border border-slate-800">
              <div className="text-[11px] text-slate-500 uppercase">Decision Loop</div>
              <div className="text-lg font-bold text-indigo-400 tabular-nums mt-0.5">
                Closed-Loop Adaptive
              </div>
              <div className="text-[10px] text-slate-500">Learns from tool outcomes</div>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-900/50 border border-slate-800">
              <div className="text-[11px] text-slate-500 uppercase">Quality Retained</div>
              <div className="text-lg font-bold text-white tabular-nums mt-0.5">
                99.4% on agentic tasks
              </div>
              <div className="text-[10px] text-slate-500">Projected · complex benchmarks</div>
            </div>
          </div>
          <p className="pt-3 text-[11px] font-mono text-slate-600">
            Figures marked projected are design targets, not measured production results.
          </p>
        </div>
      </section>

      {/* MANIFESTO SECTION: Next-Gen Adaptive Control vs Legacy Routers */}
      <section id="adaptive-manifesto" className="py-20 border-b border-slate-800/80 bg-slate-950 scroll-mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-12">
          <div className="text-center space-y-3">
            <div className="text-xs uppercase font-mono tracking-wider text-indigo-400">
              Architecture Manifesto
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
              Why Legacy Routers Fail in Production
            </h2>
            <p className="text-sm sm:text-base text-slate-400 max-w-2xl mx-auto leading-relaxed">
              First-generation LLM routers (OpenRouter, LiteLLM, RouteLLM) treat model dispatching as a static, open-loop classification problem. Here is why modern agentic systems require closed-loop adaptive control.
            </p>
          </div>

          {/* Deep Comparative Scorecard Table */}
          <div className="rounded-2xl border border-slate-800 overflow-hidden bg-slate-900/40 shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="bg-slate-900/90 border-b border-slate-800 text-[11px] text-slate-400">
                    <th className="py-4 px-5 font-semibold text-slate-300 w-1/4">System Dimension</th>
                    <th className="py-4 px-5 font-semibold text-slate-400 w-3/8 bg-slate-950/40">
                      Legacy Routers (OpenRouter / LiteLLM / RouteLLM)
                    </th>
                    <th className="py-4 px-5 font-bold text-indigo-300 w-3/8 bg-indigo-950/30 border-l border-indigo-900/40">
                      Entropos Adaptive Control Plane
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  <tr className="hover:bg-slate-900/50">
                    <td className="py-4 px-5 font-semibold text-white">Routing Decision Mechanism</td>
                    <td className="py-4 px-5 text-slate-400 bg-slate-950/20">
                      Static regex, token length triggers, or dumb binary embeddings (cheap vs expensive).
                    </td>
                    <td className="py-4 px-5 text-emerald-300 font-medium bg-indigo-950/20 border-l border-indigo-900/40">
                      Reads each request before spending on it and learns online which model earns each kind of work.
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-900/50">
                    <td className="py-4 px-5 font-semibold text-white">Control Loop</td>
                    <td className="py-4 px-5 text-red-400/90 bg-slate-950/20">
                      Open-Loop ("Fire and Forget"). Zero downstream learning from code execution or hallucinations.
                    </td>
                    <td className="py-4 px-5 text-emerald-300 font-medium bg-indigo-950/20 border-l border-indigo-900/40">
                      Closed-Loop Adaptive Feedback. Downstream tool failures & re-prompts continuously adjust routing confidence.
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-900/50">
                    <td className="py-4 px-5 font-semibold text-white">Outage & Provider Degradation</td>
                    <td className="py-4 px-5 text-slate-400 bg-slate-950/20">
                      Cascading timeout retry storms. When Claude or OpenAI slows down, your clients stall.
                    </td>
                    <td className="py-4 px-5 text-emerald-300 font-medium bg-indigo-950/20 border-l border-indigo-900/40">
                      Continuous health feedback plus circuit breakers. Traffic shifts away from degraded providers automatically.
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-900/50">
                    <td className="py-4 px-5 font-semibold text-white">Agent Feedback Integration</td>
                    <td className="py-4 px-5 text-slate-400 bg-slate-950/20">
                      Context-blind per-message. No signal flows back from the agent to the router.
                    </td>
                    <td className="py-4 px-5 text-emerald-300 font-medium bg-indigo-950/20 border-l border-indigo-900/40">
                      Consumes tool-call and test outcomes from your agent to improve the next routing decision.
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-900/50">
                    <td className="py-4 px-5 font-semibold text-white">Latency & SLA Guarantees</td>
                    <td className="py-4 px-5 text-slate-400 bg-slate-950/20">
                      Best-effort hopes. Tail P99 latency spikes unchecked without bounding.
                    </td>
                    <td className="py-4 px-5 text-emerald-300 font-medium bg-indigo-950/20 border-l border-indigo-900/40">
                      Per-provider latency envelopes with automated failover.
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-900/50">
                    <td className="py-4 px-5 font-semibold text-white">Operational Maintenance</td>
                    <td className="py-4 px-5 text-slate-400 bg-slate-950/20">
                      Hours tweaking brittle regex configs and manually updating fallback arrays.
                    </td>
                    <td className="py-4 px-5 text-emerald-300 font-medium bg-indigo-950/20 border-l border-indigo-900/40">
                      Autonomous online calibration. 60-second MCP drop-in with self-tuning parameters.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 3 Core Architectural Pillars */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
            <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-950 border border-indigo-800/60 flex items-center justify-center text-indigo-400">
                <Code2 className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white">1. Reads the Request Before the Spend</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Before sending a single packet, Entropos inspects each request so routine work is answered instantly at the edge, while open-ended reasoning is reserved for frontier engines.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-950 border border-emerald-800/60 flex items-center justify-center text-emerald-400">
                <Cpu className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white">2. Calibrated on Real Traffic</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Routing preferences are calibrated continuously from live production outcomes, balancing proven engines with careful trials of emerging ones. The calibration data is proprietary and improves with usage.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-purple-950 border border-purple-800/60 flex items-center justify-center text-purple-400">
                <Activity className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white">3. Closed-Loop Agent Feedback</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                When Claude Code or Cursor executes a generated tool call, the downstream outcome (success, runtime failure, or re-prompt) feeds back into Entropos' control loop online, updating routing confidence without manual retraining.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* INTERACTIVE CLOSED-LOOP DEMO (illustrative: no real routing signals in the browser) */}
      <section id="simulator" className="py-20 border-b border-slate-800/80 bg-slate-900/20 scroll-mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-8">
          <div className="text-center space-y-2">
            <div className="text-xs uppercase font-mono tracking-wider text-emerald-400">
              Interactive Demo
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-white">
              See the Control Plane Adapt
            </h2>
            <p className="text-sm text-slate-400 max-w-xl mx-auto">
              Pick a workload to see where Entropos would send it, then report a downstream outcome to watch routing preference shift. Illustrative scenarios; production signals and calibration are proprietary.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left: workload picker (Col 6) */}
            <div className="lg:col-span-6 p-6 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-indigo-400 font-semibold uppercase">
                  Workload Routing
                </span>
                <span className="text-[11px] font-mono text-slate-500">Illustrative scenarios</span>
              </div>

              <div className="flex flex-wrap gap-2">
                {DEMO_SCENARIOS.map((sc) => (
                  <button
                    key={sc.id}
                    onClick={() => setScenarioId(sc.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-colors cursor-pointer ${
                      scenarioId === sc.id
                        ? 'bg-indigo-600 border-indigo-500 text-white font-semibold'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {sc.label}
                  </button>
                ))}
              </div>

              <div className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs font-mono">
                {scenario.sample}
              </div>

              <div className="grid grid-cols-2 gap-3 font-mono text-center">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[10px] text-slate-500 uppercase">Tier</div>
                  <div className="text-xs font-bold text-emerald-400 mt-2 uppercase">{scenario.tier}</div>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[10px] text-slate-500 uppercase">Routed To</div>
                  <div className="text-xs font-bold text-white mt-2">{scenario.model}</div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800/80 text-xs font-mono text-slate-400 leading-relaxed">
                {scenario.why}
              </div>
            </div>

            {/* Right: routing preference and closed loop (Col 6) */}
            <div className="lg:col-span-6 p-6 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-emerald-400 font-semibold uppercase">
                  Routing Preference
                </span>
                <span className="text-[11px] font-mono text-slate-500">Updates with every outcome</span>
              </div>

              {simFeedbackMsg && (
                <div className="p-2.5 rounded-lg bg-indigo-950/80 border border-indigo-600/60 text-indigo-200 text-xs font-mono animate-in fade-in">
                  {simFeedbackMsg}
                </div>
              )}

              <div className="space-y-3 font-mono">
                {DEMO_MODELS.map((m) => {
                  const level = modelLevels[m.name] ?? m.start;
                  const status = level >= 80 ? 'Primary' : level >= 55 ? 'Standby' : 'Deprioritized';
                  return (
                    <div key={m.name} className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <div>
                          <span className="font-bold text-white">{m.name}</span>
                          <span className="text-[10px] text-slate-500 ml-2">({m.role})</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => reportOutcome(m.name, 'success')}
                            className="px-2 py-0.5 rounded bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800/60 text-emerald-300 text-[10px] cursor-pointer"
                            title="Simulate successful downstream tool run"
                          >
                            + Tool Success
                          </button>
                          <button
                            onClick={() => reportOutcome(m.name, 'failure')}
                            className="px-2 py-0.5 rounded bg-red-950/80 hover:bg-red-900 border border-red-800/60 text-red-300 text-[10px] cursor-pointer"
                            title="Simulate downstream failure/hallucination"
                          >
                            - Failure
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>Routing status</span>
                        <span className="font-bold text-slate-200">{status}</span>
                      </div>

                      <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 rounded-full transition-all duration-300"
                          style={{ width: `${level}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="text-[11px] text-slate-400 font-mono text-center">
                Click "+ Tool Success" or "- Failure" above to see how Entropos shifts routing preference online.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Code Snippets Section: Multi-client Integration */}
      <section className="py-16 border-b border-slate-800/80 bg-slate-900/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-5 space-y-4">
              <div className="text-xs uppercase font-mono tracking-wider text-indigo-400">
                Zero Friction Integration
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                Drop in with one JSON block or SDK base URL.
              </h2>
              <p className="text-sm text-slate-400 leading-relaxed">
                Connect Claude Code, Cursor, Windsurf, or your existing OpenAI SDK codebase. No complex prompt re-engineering required.
              </p>
              <ul className="space-y-2.5 text-xs text-slate-300 font-mono">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Claude Code CLI (`claude mcp add`)</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Cursor IDE (`.cursor/mcp.json`)</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Python / TypeScript OpenAI SDK (`baseURL: /v1`)</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Windsurf & Cline extensions</span>
                </li>
              </ul>
            </div>

            {/* Code Box */}
            <div className="lg:col-span-7">
              <div className="rounded-xl bg-slate-950 border border-slate-800 shadow-2xl overflow-hidden font-mono text-xs">
                {/* Tabs */}
                <div className="px-4 py-2 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {LANDING_CLIENTS.map(({ id, tab }) => (
                      <button
                        key={id}
                        onClick={() => setActiveSnippetTab(id)}
                        className={`px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                          activeSnippetTab === id
                            ? 'bg-slate-800 text-white font-semibold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                  >
                    {copiedCode ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="p-4 text-slate-300 overflow-x-auto max-h-72">
                  <pre className="text-slate-200 leading-relaxed">{snippets[activeSnippetTab].snippet}</pre>
                </div>
                <div className="px-4 py-2 bg-slate-900/40 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Routing Mode: adaptive (closed-loop)</span>
                  <span className="text-emerald-400 font-semibold">Active & Verified</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Savings Calculator */}
      <section id="roi-calculator" className="py-16 border-b border-slate-800/80 scroll-mt-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Calculate your engineering team's ROI
            </h2>
            <p className="text-sm text-slate-400 max-w-xl mx-auto">
              See what your monthly spend looks like before and after offloading boilerplate queries.
            </p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6">
            <div className="space-y-3 font-mono text-xs">
              <div className="flex justify-between items-center text-slate-300">
                <span>Monthly LLM Token Volume:</span>
                <span className="text-white font-bold text-sm tabular-nums">
                  {interactiveTokens} Million Tokens / Month
                </span>
              </div>
              <input
                type="range"
                min="5"
                max="100"
                step="5"
                value={interactiveTokens}
                onChange={(e) => setInteractiveTokens(parseInt(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
              <div className="flex justify-between text-[11px] text-slate-500">
                <span>5M (Solo dev)</span>
                <span>25M (Small squad)</span>
                <span>50M (Active team)</span>
                <span>100M+ (Enterprise)</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono text-center pt-2">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-[11px] text-slate-500 uppercase">Direct Frontier Bill</div>
                <div className="text-2xl font-bold text-slate-300 tabular-nums mt-1">
                  ${baselineCost.toLocaleString()}
                  <span className="text-xs text-slate-500 font-normal"> /mo</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-1">100% Claude Opus 5.5 / Sonnet 5.5 rate</div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-[11px] text-slate-500 uppercase">With Entropos</div>
                <div className="text-2xl font-bold text-white tabular-nums mt-1">
                  ${routerCost.toLocaleString()}
                  <span className="text-xs text-slate-500 font-normal"> /mo</span>
                </div>
                <div className="text-[10px] text-indigo-400 mt-1">Adaptive closed-loop routing</div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-emerald-500/30 bg-emerald-950/10">
                <div className="text-[11px] text-emerald-400 uppercase font-semibold">Net Annual Saved</div>
                <div className="text-2xl font-bold text-emerald-400 tabular-nums mt-1">
                  ${annualSavings.toLocaleString()} USD
                </div>
                <div className="text-[10px] text-emerald-300/80 mt-1">82% projected reduction</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Subscription Plans Section */}
      <section id="pricing" className="py-20 border-b border-slate-800/80 bg-slate-900/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-12">
          <div className="text-center space-y-3">
            <div className="text-xs uppercase font-mono tracking-wider text-indigo-400">
              Subscription & Plans
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-white">
              Predictable pricing. Instant activation.
            </h2>
            <p className="text-sm text-slate-400 max-w-xl mx-auto">
              Start with the Developer tier for free, or unlock BYOK credentials, multi-client routing, and custom heuristics.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PLANS_LIST.map((plan) => (
              <div
                key={plan.id}
                className={`rounded-2xl p-6 flex flex-col justify-between relative ${
                  plan.isPopular
                    ? 'bg-slate-900 border border-indigo-500 shadow-xl shadow-indigo-950/50'
                    : 'bg-slate-900/60 border border-slate-800'
                }`}
              >
                {plan.isPopular && (
                  <div className="absolute -top-3 right-6 px-2.5 py-0.5 rounded-full bg-indigo-600 text-white text-[10px] font-mono font-semibold">
                    Recomendado
                  </div>
                )}
                <div>
                  <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                  <p className="text-xs text-slate-400 mt-1">{plan.tagline}</p>
                  <div className="flex items-baseline gap-1 my-4 font-mono">
                    <span className="text-3xl font-bold text-white">{plan.priceDisplay}</span>
                    <span className="text-xs text-slate-500">{plan.periodDisplay}</span>
                  </div>
                  <ul className="space-y-2.5 text-xs text-slate-300 my-6">
                    {plan.features.map((feature, fIdx) => (
                      <li key={fIdx} className="flex items-start gap-2">
                        <CheckCircle2
                          className={`w-4 h-4 shrink-0 mt-0.5 ${
                            plan.isPopular ? 'text-indigo-400' : 'text-slate-400'
                          }`}
                        />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                {plan.id === 'developer' ? (
                  <a
                    href="/app/connect"
                    onClick={(e) => handleLinkClick(e, () => onEnterDashboard('mcp'))}
                    className="w-full py-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer bg-indigo-600 hover:bg-indigo-500 text-white block text-center shadow-md"
                  >
                    Comenzar Gratis (Developer)
                  </a>
                ) : (
                  <a
                    href={`/app/pricing?plan=${plan.id}`}
                    onClick={(e) => handleLinkClick(e, () => onOpenCheckout(plan.id))}
                    className="w-full py-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer block text-center bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                  >
                    {`Lista de Espera ${plan.name} (Próximamente)`}
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-slate-800/80 bg-slate-950 text-xs font-mono text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-300">Entropos</span>
            <span>—</span>
            <span>Closed-Loop Adaptive Control Plane for Model Context Protocol & OpenAI API</span>
          </div>
          <div className="flex items-center gap-6">
            <a
              href="/app/pricing"
              onClick={(e) => handleLinkClick(e, () => onEnterDashboard('pricing'))}
              className="hover:text-slate-300 transition-colors cursor-pointer"
            >
              Subscription
            </a>
            <a
              href="/app/adaptive"
              onClick={(e) => handleLinkClick(e, () => onEnterDashboard('adaptive'))}
              className="hover:text-slate-300 transition-colors cursor-pointer"
            >
              Adaptive Plane
            </a>
            <a
              href="/app/connect"
              onClick={(e) => handleLinkClick(e, () => onEnterDashboard('mcp'))}
              className="hover:text-slate-300 transition-colors cursor-pointer"
            >
              Console
            </a>
            <span className="text-slate-600">Enterprise Ready</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
