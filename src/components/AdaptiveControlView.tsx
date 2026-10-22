import React, { useState, useEffect } from 'react';
import {
  Activity,
  Zap,
  TrendingDown,
  Cpu,
  ShieldCheck,
  RotateCcw,
  Sparkles,
  Layers,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Send,
  Sliders,
  Code2,
  Info,
} from 'lucide-react';
import { PublicModelPosterior, PublicFeedbackEvent } from '../types/router';
import { adminHeaders, getAdminToken, setAdminToken } from '../lib/adminToken';
import { ApiError, errorMessage, fetchJson } from '../lib/api';

const STATUS_LABELS: Record<PublicModelPosterior['status'], string> = {
  primary: 'Primary',
  standby: 'Standby',
  deprioritized: 'Deprioritized',
};

const ADMIN_TOKEN_MESSAGE = 'An admin token is required for this action. Enter it in the "Admin token" field and try again.';

// 401/503 = falta o no está configurado el token de admin; el resto muestra el mensaje real del servidor.
function adminActionError(err: unknown): string {
  if (err instanceof ApiError && (err.status === 401 || err.status === 503)) return ADMIN_TOKEN_MESSAGE;
  return errorMessage(err);
}

interface AdaptiveControlViewProps {
  onNotify?: (message: string) => void;
  onNavigateToPlayground?: (prompt?: string) => void;
}

export const AdaptiveControlView: React.FC<AdaptiveControlViewProps> = ({
  onNotify,
  onNavigateToPlayground,
}) => {
  const [posteriors, setPosteriors] = useState<Record<string, PublicModelPosterior>>({});
  const [feedbacks, setFeedbacks] = useState<PublicFeedbackEvent[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [adminToken, setAdminTokenState] = useState<string>(getAdminToken());

  // Workload probe: the classification runs on the server; the browser only receives the public tier.
  const [testPrompt, setTestPrompt] = useState<string>(
    "Write an idiomatic Rust function to detect topological cycles in a directed acyclic graph using Tarjan's SCC algorithm with proper memory safety and unit tests."
  );
  const [probe, setProbe] = useState<{ tier: string; summary: string } | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [telemetryError, setTelemetryError] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // Feedback Simulator State
  const [feedbackModel, setFeedbackModel] = useState<string>('Claude Sonnet 5.5');
  const [feedbackOutcome, setFeedbackOutcome] = useState<'success' | 'failure' | 'retry' | 'hallucination'>('success');
  const [feedbackQuality, setFeedbackQuality] = useState<number>(5);
  const [feedbackComment, setFeedbackComment] = useState<string>('Tool executed with zero runtime errors');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState<boolean>(false);

  // Fetch live telemetry from backend (public view only)
  const fetchTelemetry = async () => {
    setTelemetryError(null);
    try {
      const data = await fetchJson('/api/adaptive-telemetry');
      if (data.posteriors) setPosteriors(data.posteriors);
      if (data.recentFeedbacks) setFeedbacks(data.recentFeedbacks);
    } catch (err) {
      setTelemetryError(errorMessage(err));
    }
  };

  useEffect(() => {
    fetchTelemetry();
  }, []);

  // Classify the prompt on the server (debounced)
  useEffect(() => {
    const prompt = testPrompt.trim();
    if (!prompt) {
      setProbe(null);
      setProbeError(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const data = await fetchJson('/api/probe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...adminHeaders() },
          body: JSON.stringify({ prompt }),
          signal: controller.signal,
        });
        setProbe(data);
        setProbeError(null);
      } catch (err) {
        if (controller.signal.aborted) return; // Superseded by a newer prompt: keep the last result
        if (err instanceof ApiError && err.status === 401) {
          setProbeError(null);
          setProbe({ tier: 'Locked', summary: 'Admin token required to run the probe.' });
        } else {
          setProbe(null);
          setProbeError(errorMessage(err));
        }
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [testPrompt, adminToken]);

  // Submit Feedback
  const handleSubmitFeedback = async () => {
    setIsSubmittingFeedback(true);
    setFeedbackError(null);
    try {
      const data = await fetchJson('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...adminHeaders() },
        body: JSON.stringify({
          model: feedbackModel,
          outcome: feedbackOutcome,
          qualityScore: feedbackQuality,
          toolExecutionSuccess: feedbackOutcome === 'success',
          comment: feedbackComment,
        }),
      });

      if (data.updatedPosterior) {
        setPosteriors((prev) => ({
          ...prev,
          [feedbackModel]: data.updatedPosterior,
        }));
      }
      if (data.event) {
        setFeedbacks((prev) => [data.event, ...prev.slice(0, 19)]);
      }
      if (onNotify) {
        onNotify(`Routing confidence updated for ${feedbackModel}: ${data.updatedPosterior?.confidence ?? '--'}%`);
      }
    } catch (err) {
      setFeedbackError(adminActionError(err));
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  // Reset routing preferences
  const handleReset = async () => {
    setIsLoading(true);
    setResetError(null);
    try {
      const data = await fetchJson('/api/adaptive-telemetry/reset', { method: 'POST', headers: adminHeaders() });
      setPosteriors(data.posteriors);
      if (onNotify) onNotify('Routing preferences recalibrated to baseline');
    } catch (err) {
      setResetError(adminActionError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const samplePrompts = [
    {
      label: 'Deep Code (Tarjan Rust)',
      prompt: "Write an idiomatic Rust function to detect topological cycles in a directed acyclic graph using Tarjan's SCC algorithm with proper memory safety and unit tests.",
    },
    {
      label: 'Formal Logic Proof',
      prompt: 'Prove that the square root of 2 is irrational using proof by contradiction, explaining every deductive step clearly.',
    },
    {
      label: 'Boilerplate Format',
      prompt: 'Convert the ISO date string "2026-10-12T09:30:00Z" to European DD/MM/YYYY format in TypeScript.',
    },
    {
      label: 'Factual Edge Query',
      prompt: 'What is the ISO 3166-1 alpha-2 country code for Norway and its official currency?',
    },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Top Banner / Philosophy Header */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/30 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[11px] font-mono font-semibold">
                Closed-Loop Control Theory
              </span>
              <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Adaptive Learning Online
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Next-Gen Adaptive Control Plane
            </h1>
            <p className="text-sm text-slate-300 max-w-3xl leading-relaxed">
              Unlike legacy static routers that rely on rigid rules or blind open-loop dispatches, Entropos reads each request before spending on it and keeps learning from real downstream agent outcomes.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <input
              type="password"
              value={adminToken}
              onChange={(e) => {
                setAdminToken(e.target.value);
                setAdminTokenState(e.target.value);
              }}
              placeholder="Admin token"
              className="w-32 px-2.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs font-mono focus:outline-none focus:border-indigo-500"
              title="Required in production to run the probe, submit feedback or reset routing"
            />
            <button
              onClick={handleReset}
              disabled={isLoading}
              className="px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-mono transition-colors flex items-center gap-1.5 border border-slate-700 cursor-pointer"
              title="Reset routing preferences to baseline"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Reset Routing</span>
            </button>
            <button
              onClick={() => onNavigateToPlayground && onNavigateToPlayground(testPrompt)}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Test in Playground</span>
            </button>
          </div>
        </div>

        {resetError && (
          <div role="alert" className="bg-red-950/40 border border-red-800/60 text-red-200 text-xs rounded-lg p-3">
            Reset failed: {resetError}
          </div>
        )}

        {/* 4 Pillars Summary Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 font-mono text-xs">
          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
            <div className="text-[11px] text-slate-400 uppercase">Request Intake</div>
            <div className="text-sm font-bold text-white mt-0.5">Classified Pre-Dispatch</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Before any spend</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
            <div className="text-[11px] text-slate-400 uppercase">Decision Engine</div>
            <div className="text-sm font-bold text-indigo-400 mt-0.5">Closed-Loop Adaptive</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Learns from every outcome</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
            <div className="text-[11px] text-slate-400 uppercase">Models Monitored</div>
            <div className="text-sm font-bold text-emerald-400 mt-0.5">{Object.keys(posteriors).length} Active</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Health & latency tracked</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
            <div className="text-[11px] text-slate-400 uppercase">Latency Envelope</div>
            <div className="text-sm font-bold text-white mt-0.5">Per-Provider Bounds</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Automated failover</div>
          </div>
        </div>
      </div>

      {/* Model routing confidence (public view: no internal calibration values) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Cpu className="w-5 h-5 text-indigo-400" />
              <span>Model Routing Confidence</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Routing preference for each model is calibrated continuously from live downstream outcomes. Calibration data is proprietary.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 font-mono">
          {Object.keys(posteriors).length === 0 && telemetryError && (
            <div
              role="alert"
              className="md:col-span-2 lg:col-span-3 bg-red-950/40 border border-red-800/60 text-red-200 text-xs rounded-lg p-3 flex items-center justify-between gap-3"
            >
              <span>Could not load routing telemetry: {telemetryError}</span>
              <button
                onClick={fetchTelemetry}
                className="px-2.5 py-1 rounded-lg bg-red-900/50 hover:bg-red-900/80 text-red-100 border border-red-800/60 shrink-0 cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}
          {Object.keys(posteriors).length === 0 && !telemetryError && (
            <div className="text-xs text-slate-500">Loading routing telemetry...</div>
          )}
          {Object.entries(posteriors).map(([modelName, post]) => (
            <div
              key={modelName}
              className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition-colors space-y-3"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-bold text-white">{modelName}</div>
                  <div className="text-[11px] text-slate-400">{post.provider}</div>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                    post.slaEnvelopeOk
                      ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                      : 'bg-amber-950/80 text-amber-300 border border-amber-800/60'
                  }`}
                >
                  {post.slaEnvelopeOk ? 'SLA Enforced' : 'Degraded SLA'}
                </span>
              </div>

              {/* Routing Confidence Bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Routing Confidence:</span>
                  <span className="text-white font-bold">
                    {post.confidence}% · {STATUS_LABELS[post.status]}
                  </span>
                </div>
                <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 rounded-full transition-all duration-500"
                    style={{ width: `${post.confidence}%` }}
                  />
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                <div className="p-2 rounded bg-slate-950/80 border border-slate-800/80">
                  <span className="text-slate-500">P50 / P99 Latency:</span>
                  <div className="text-slate-300">
                    {post.latencyP50Ms}ms / {post.latencyP99Ms}ms
                  </div>
                </div>
                <div className="p-2 rounded bg-slate-950/80 border border-slate-800/80">
                  <span className="text-slate-500">Cost:</span>
                  <div className="text-slate-300">${(post.costPer1k * 1000).toFixed(2)}/1M tokens</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Two Column Layout: Workload Probe & Closed-Loop Agent Feedback Simulator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Workload Probe (Col 7) */}
        <div className="lg:col-span-7 p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-indigo-950 border border-indigo-800/60 text-indigo-400">
                <Code2 className="w-4 h-4" />
              </span>
              <h3 className="text-base font-bold text-white">Workload Probe</h3>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Type or select a prompt below to see how Entropos classifies the workload before dispatch. Only the resulting tier is shown; the signals behind it are proprietary.
            </p>
          </div>

          {/* Quick Presets */}
          <div className="flex flex-wrap gap-2">
            {samplePrompts.map((p, idx) => (
              <button
                key={idx}
                onClick={() => setTestPrompt(p.prompt)}
                className="px-2.5 py-1 rounded-lg bg-slate-800/60 hover:bg-slate-700/80 text-slate-300 text-xs font-mono transition-colors border border-slate-700/60 cursor-pointer"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Input Textarea */}
          <textarea
            value={testPrompt}
            onChange={(e) => setTestPrompt(e.target.value)}
            rows={3}
            className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs font-mono focus:outline-none focus:border-indigo-500 resize-none"
            placeholder="Describe a task to see how Entropos classifies it..."
          />

          {/* Classification result */}
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono space-y-1.5">
            <div className="text-[10px] text-slate-500 uppercase">Workload Tier</div>
            <div className="text-sm font-bold text-indigo-300 uppercase">{probe ? probe.tier : probeError ? '--' : '...'}</div>
            <div className="text-xs text-slate-400">
              {probe ? probe.summary : probeError ? 'No classification available.' : 'Classifying...'}
            </div>
          </div>
          {probeError && (
            <div role="alert" className="bg-red-950/40 border border-red-800/60 text-red-200 text-xs rounded-lg p-3">
              Probe failed: {probeError}
            </div>
          )}
        </div>

        {/* Right: Closed-Loop Agent Feedback Simulator (Col 5) */}
        <div className="lg:col-span-5 p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-emerald-950 border border-emerald-800/60 text-emerald-400">
                <Activity className="w-4 h-4" />
              </span>
              <h3 className="text-base font-bold text-white">Closed-Loop Feedback Simulator</h3>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Simulate an agent downstream signal (e.g. from Claude Code or Cursor) to watch routing confidence update in real time.
            </p>
          </div>

          <div className="space-y-3 font-mono text-xs">
            <div>
              <label className="text-slate-400 text-[11px] block mb-1">Target Model:</label>
              <select
                value={feedbackModel}
                onChange={(e) => setFeedbackModel(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                {Object.keys(posteriors).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-slate-400 text-[11px] block mb-1">Downstream Execution Signal:</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setFeedbackOutcome('success')}
                  className={`py-2 px-2 rounded-lg border text-xs text-center transition-colors cursor-pointer ${
                    feedbackOutcome === 'success'
                      ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Success
                </button>
                <button
                  type="button"
                  onClick={() => setFeedbackOutcome('failure')}
                  className={`py-2 px-2 rounded-lg border text-xs text-center transition-colors cursor-pointer ${
                    feedbackOutcome === 'failure'
                      ? 'bg-red-950/80 border-red-500 text-red-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Tool Failure
                </button>
                <button
                  type="button"
                  onClick={() => setFeedbackOutcome('retry')}
                  className={`py-2 px-2 rounded-lg border text-xs text-center transition-colors cursor-pointer ${
                    feedbackOutcome === 'retry'
                      ? 'bg-amber-950/80 border-amber-500 text-amber-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Agent Re-Prompt
                </button>
                <button
                  type="button"
                  onClick={() => setFeedbackOutcome('hallucination')}
                  className={`py-2 px-2 rounded-lg border text-xs text-center transition-colors cursor-pointer ${
                    feedbackOutcome === 'hallucination'
                      ? 'bg-purple-950/80 border-purple-500 text-purple-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Hallucination
                </button>
              </div>
            </div>

            <div>
              <label className="text-slate-400 text-[11px] flex justify-between mb-1">
                <span>Output Quality Rating:</span>
                <span className="text-white font-bold">{feedbackQuality} / 5 Stars</span>
              </label>
              <input
                type="range"
                min="1"
                max="5"
                step="1"
                value={feedbackQuality}
                onChange={(e) => setFeedbackQuality(parseInt(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
            </div>

            <div>
              <label className="text-slate-400 text-[11px] block mb-1">Agent Feedback Note:</label>
              <input
                type="text"
                value={feedbackComment}
                onChange={(e) => setFeedbackComment(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
                placeholder="e.g. Unit tests passed with 100% code coverage"
              />
            </div>

            <button
              onClick={handleSubmitFeedback}
              disabled={isSubmittingFeedback}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md active:scale-98"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSubmittingFeedback ? 'Submitting feedback...' : 'Submit Feedback to Closed Loop'}</span>
            </button>
            {feedbackError && (
              <div role="alert" className="bg-red-950/40 border border-red-800/60 text-red-200 text-xs rounded-lg p-3">
                Feedback not recorded: {feedbackError}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Real-Time Closed Loop Feedback Stream Log */}
      <div className="space-y-3 font-mono">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <span>Recent Closed-Loop Feedback Telemetry Stream</span>
          </h3>
          <span className="text-xs text-slate-500">{feedbacks.length} recorded events</span>
        </div>

        <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-950/70">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 text-[11px]">
                <tr>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Target Model</th>
                  <th className="py-2.5 px-3">Outcome</th>
                  <th className="py-2.5 px-3">Effect</th>
                  <th className="py-2.5 px-3">Latency</th>
                  <th className="py-2.5 px-3">Agent Retrospective</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {feedbacks.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-500">
                      No feedback events recorded yet. Submit feedback above or run prompts in the Playground.
                    </td>
                  </tr>
                ) : (
                  feedbacks.map((fb) => (
                    <tr key={fb.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="py-2.5 px-3 text-[11px] text-slate-500">
                        {new Date(fb.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-white">{fb.model}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            fb.outcome === 'success'
                              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                              : 'bg-red-950/80 text-red-300 border border-red-800/60'
                          }`}
                        >
                          {fb.outcome.toUpperCase()}
                        </span>
                      </td>
                      <td
                        className={`py-2.5 px-3 font-bold ${
                          fb.effect === 'raised' ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {fb.effect === 'raised' ? 'Confidence raised' : 'Confidence lowered'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400">{fb.latencyMs}ms</td>
                      <td className="py-2.5 px-3 text-slate-400 truncate max-w-xs">{fb.comment}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
