import React, { useState, useEffect } from 'react';
import { adminHeaders } from '../lib/adminToken';
import { ApiError, errorMessage, fetchJson } from '../lib/api';
import {
  Play,
  Check,
  Copy,
  RefreshCw,
  CornerDownLeft,
  AlertCircle,
  ShieldAlert,
  X,
  ThumbsUp,
  ThumbsDown,
  Activity,
} from 'lucide-react';
import { RouteExecution, RoutingMode } from '../types/router';
import { ROUTING_MODES, ROUTING_MODES_LIST } from '../constants/modes';
import { AVAILABLE_REFERENCE_MODELS } from '../constants/referenceModels';

interface PlaygroundProps {
  mode: RoutingMode;
  onModeChange?: (mode: RoutingMode) => void;
  initialPrompt?: string;
  onExecutionComplete: (execution: RouteExecution) => void;
}

// Formatea un número de la respuesta; si falta o no es finito muestra un guión en vez de romper el render.
const fmtNum = (value: unknown, digits: number): string =>
  typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—';

export const Playground: React.FC<PlaygroundProps> = ({
  mode,
  onModeChange,
  initialPrompt,
  onExecutionComplete,
}) => {
  const presets = [
    {
      title: 'Rust Graph Algorithm',
      description: 'Tarjan SCC cycle detection',
      prompt:
        "Write an idiomatic Rust function to detect topological cycles in a directed graph using Tarjan's SCC algorithm with memory safety and unit tests.",
    },
    {
      title: 'Factual Lookup',
      description: 'ISO country codes and capital',
      prompt:
        'What is the ISO 3166-1 alpha-2 country code for Norway, its official currency, and current population estimate?',
    },
    {
      title: 'Formal Proof',
      description: 'Irrationality proof by contradiction',
      prompt:
        'Prove that the square root of 2 is irrational using proof by contradiction, explaining every deductive step clearly.',
    },
    {
      title: 'JSON Extraction',
      description: 'Invoice data normalization',
      prompt:
        'Extract the following into clean JSON: "Invoice #9021 issued by Acme Corp on 2026-03-12 for $1,450.00 with 10% tax included."',
    },
  ];

  const [prompt, setPrompt] = useState<string>(presets[0].prompt);
  const [selectedMode, setSelectedMode] = useState<RoutingMode>(mode || 'adaptive');
  const [referenceModel, setReferenceModel] = useState<string>(() => {
    return localStorage.getItem('entropos_reference_model') || 'claude-sonnet-5-5';
  });
  const [isRouting, setIsRouting] = useState<boolean>(false);
  const [result, setResult] = useState<RouteExecution | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [simulateFailover, setSimulateFailover] = useState<boolean>(false);
  const [showComparison, setShowComparison] = useState<boolean>(true);
  const [outputView, setOutputView] = useState<'text' | 'json'>('text');
  const [feedbackSent, setFeedbackSent] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);

  // El modo sigue al ajuste global si cambia externamente
  useEffect(() => {
    if (mode) {
      setSelectedMode(mode);
    }
  }, [mode]);

  // Si se pasa un prompt inicial (ej: desde "Test in Playground" en Adaptive), se abre con él
  useEffect(() => {
    if (initialPrompt && initialPrompt.trim()) {
      setPrompt(initialPrompt);
    }
  }, [initialPrompt]);

  const handleModeSelect = (newMode: RoutingMode) => {
    setSelectedMode(newMode);
    onModeChange?.(newMode);
  };

  const handleReferenceModelChange = (newRefId: string) => {
    setReferenceModel(newRefId);
    try {
      localStorage.setItem('entropos_reference_model', newRefId);
    } catch {
      // Ignorar fallos de acceso a localStorage
    }
  };

  const handleExecute = async () => {
    if (!prompt.trim() || isRouting) return;
    setIsRouting(true);
    setFeedbackSent(null);
    setFeedbackError(null);
    setRouteError(null);

    try {
      const data = await fetchJson<RouteExecution>('/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...adminHeaders() },
        body: JSON.stringify({
          prompt,
          mode: selectedMode,
          referenceModel,
          simulateFailover,
          clientOrigin: 'Interactive Console',
        }),
      });
      if (!data || typeof data !== 'object') {
        throw new Error('The server returned an empty routing result. Run the route again.');
      }
      setResult(data);
      onExecutionComplete(data);
    } catch (err) {
      console.error('Routing failed:', err);
      setResult(null);
      setRouteError(errorMessage(err));
    } finally {
      setIsRouting(false);
    }
  };

  const handleSendFeedback = async (outcome: 'success' | 'failure') => {
    if (!result) return;
    setFeedbackError(null);
    try {
      await fetchJson('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...adminHeaders() },
        body: JSON.stringify({
          model: result.selectedModel,
          outcome,
          qualityScore: outcome === 'success' ? 5 : 2,
          latencyMs: result.speedLatencyMs,
          toolExecutionSuccess: outcome === 'success',
          requestId: result.id,
          comment: outcome === 'success' ? 'Validated via Playground' : 'Flagged failure in Playground',
        }),
      });
      setFeedbackSent(outcome === 'success' ? 'Tool Success recorded' : 'Tool Failure recorded');
    } catch (err) {
      console.error('Feedback failed:', err);
      if (err instanceof ApiError && (err.status === 401 || err.status === 503)) {
        setFeedbackError(
          'Feedback was not saved: an admin token is required. Set it in the "Admin token" field of the Adaptive view, then try again.'
        );
      } else {
        setFeedbackError(`Feedback was not saved: ${errorMessage(err)}`);
      }
    }
  };

  // isRealAi no está en RouteExecution: se lee de forma defensiva. Solo `false` explícito marca respuesta de relleno.
  const isReal = !result || (result as RouteExecution & { isRealAi?: boolean }).isRealAi !== false;

  const currentRef =
    AVAILABLE_REFERENCE_MODELS.find((m) => m.id === referenceModel) ||
    AVAILABLE_REFERENCE_MODELS[0];

  // Cálculo de línea base dinámico frente al modelo de referencia elegido por el usuario
  const calculatedBaselineCost = result
    ? result.hasMeasuredUsage &&
      typeof result.inputTokens === 'number' &&
      typeof result.outputTokens === 'number'
      ? Number(
          (
            (result.inputTokens * currentRef.inputPerM +
              result.outputTokens * currentRef.outputPerM) /
            1_000_000
          ).toFixed(6)
        )
      : result.baselineCostUsd
    : 0;

  const actualCost = result?.costUsd ?? 0;
  const netSavedUsd = calculatedBaselineCost - actualCost;
  const netSavedPercentage =
    calculatedBaselineCost > 0
      ? Math.round((netSavedUsd / calculatedBaselineCost) * 100)
      : 0;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Interactive Routing Console
        </h1>
        <p className="text-sm text-slate-400 mt-1 max-w-2xl leading-relaxed">
          Submit prompts to observe how Entropos classifies request complexity, executes automatic provider failover, and measures comparative token savings against monolithic frontier models.
        </p>
      </div>

      {/* Preset Row */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-400">Sample Prompt Scenarios:</span>
          {prompt && (
            <button
              onClick={() => setPrompt('')}
              className="text-[11px] font-mono text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3 h-3" />
              <span>Clear prompt</span>
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {presets.map((preset, idx) => (
            <button
              key={idx}
              onClick={() => setPrompt(preset.prompt)}
              className="p-3 text-left rounded-lg bg-slate-900/60 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 transition-colors cursor-pointer"
            >
              <div className="text-xs font-semibold text-slate-200 truncate">{preset.title}</div>
              <div className="text-[11px] text-slate-500 truncate mt-0.5">{preset.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 2-Column Workbench Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Input Prompt (5 cols) */}
        <div className="lg:col-span-5 bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">Prompt Input</span>
              <span className="text-[11px] text-slate-400 font-mono">
                Active Mode: <strong className="text-indigo-400">{ROUTING_MODES[selectedMode]?.shortName || selectedMode}</strong>
              </span>
            </div>

            {/* Mode Selector Buttons */}
            <div className="grid grid-cols-4 gap-1.5 p-1 bg-slate-950 rounded-lg border border-slate-800 text-[11px] font-mono">
              {ROUTING_MODES_LIST.map((modeDef) => (
                <button
                  key={modeDef.id}
                  onClick={() => handleModeSelect(modeDef.id)}
                  title={modeDef.subtitle}
                  className={`py-1 px-1 rounded text-center transition-colors cursor-pointer truncate ${
                    selectedMode === modeDef.id
                      ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  {modeDef.buttonLabel}
                </button>
              ))}
            </div>
          </div>

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={8}
            placeholder="Enter instructions, code snippet, or query to evaluate..."
            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono leading-relaxed"
          />

          {/* Test Conditions Controls */}
          <div className="pt-2 border-t border-slate-800/80 space-y-2">
            <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={simulateFailover}
                onChange={(e) => setSimulateFailover(e.target.checked)}
                className="rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-0"
              />
              <span>Simulate Upstream Provider Rate-Limit (429 Failover Test)</span>
            </label>

            <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showComparison}
                onChange={(e) => setShowComparison(e.target.checked)}
                className="rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-0"
              />
              <span>Side-by-side Frontier Baseline Comparison</span>
            </label>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
            <span className="font-mono tabular-nums">{prompt.length} characters</span>

            <button
              onClick={handleExecute}
              disabled={isRouting || !prompt.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 shadow-sm"
            >
              {isRouting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Evaluating...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Execute Route</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Column: Execution Output & Breakdown (7 cols) */}
        <div className="lg:col-span-7 bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-slate-300">Routing Decision</span>
              {result && (
                <>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-950/80 text-indigo-300 border border-indigo-800/60">
                    {result.complexityTier || (netSavedPercentage > 70 ? 'Fast Edge' : 'Deep Reasoning')}
                  </span>
                </>
              )}
            </div>

            {result && (
              <div className="flex items-center gap-3">
                <div className="flex items-center bg-slate-950 rounded p-0.5 border border-slate-800 text-[10px] font-mono">
                  <button
                    onClick={() => setOutputView('text')}
                    className={`px-2 py-0.5 rounded transition-colors ${
                      outputView === 'text' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    Response
                  </button>
                  <button
                    onClick={() => setOutputView('json')}
                    className={`px-2 py-0.5 rounded transition-colors ${
                      outputView === 'json' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    JSON
                  </button>
                </div>
                <div className="text-xs font-mono text-slate-400">
                  <span className="text-slate-200 tabular-nums font-semibold">{fmtNum(result.speedLatencyMs, 0)}ms</span>
                </div>
              </div>
            )}
          </div>

          {routeError && (
            <div
              role="alert"
              className="bg-red-950/40 border border-red-800/60 text-red-200 text-xs rounded-lg p-3 flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>Route failed: {routeError} Check the prompt and the server, then run the route again.</span>
            </div>
          )}

          {result ? (
            <div className="space-y-4">
              {/* No-provider warning: the result below is a placeholder */}
              {!isReal && (
                <div
                  role="alert"
                  className="bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs rounded-lg p-3 flex items-start gap-2"
                >
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    No provider answered this request. The text below is a placeholder, and the cost and savings are not real. Configure a provider key to get real answers.
                  </span>
                </div>
              )}

              {/* Failover Alert Banner if occurred */}
              {isReal && result.failoverOccurred && (
                <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-800/40 text-amber-300 text-xs font-mono flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Transparent Failover: Primary provider throttled. Request rerouted to fallback with zero user interruption.</span>
                </div>
              )}

              {/* Telemetry Breakdown Strip */}
              <div className="grid grid-cols-3 gap-3 p-3 bg-slate-950 rounded-lg border border-slate-800 text-xs font-mono">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Selected Model</div>
                  <div className="font-bold text-white truncate mt-0.5">{result.selectedModel}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{result.provider}</div>
                </div>

                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Cost Incurred</div>
                  {isReal ? (
                    <>
                      <div className="font-bold text-slate-200 tabular-nums mt-0.5">
                        ${fmtNum(result.costUsd, 5)}
                      </div>
                      <div className="text-[10px] text-slate-500 tabular-nums mt-0.5">
                        vs ${fmtNum(calculatedBaselineCost, 5)} {currentRef.label.split(' ')[0]}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="font-bold text-slate-500 mt-0.5">N/A</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">no provider answered</div>
                    </>
                  )}
                </div>

                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Net Savings</div>
                  {isReal ? (
                    <>
                      <div
                        className={`font-bold tabular-nums mt-0.5 ${
                          netSavedPercentage >= 0 ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        {netSavedPercentage >= 0
                          ? `${fmtNum(netSavedPercentage, 0)}% saved`
                          : `${fmtNum(Math.abs(netSavedPercentage), 0)}% frontier premium`}
                      </div>
                      <div className="text-[10px] text-emerald-500/80 tabular-nums mt-0.5">
                        {netSavedUsd >= 0 ? `-$${fmtNum(netSavedUsd, 5)}` : `+$${fmtNum(Math.abs(netSavedUsd), 5)}`}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="font-bold text-slate-500 mt-0.5">N/A</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">not a real result</div>
                    </>
                  )}
                </div>
              </div>

              {/* Reason Explanation */}
              <div className="text-xs text-slate-400 flex items-start gap-2 bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/80">
                <CornerDownLeft className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                <span>{result.reason}</span>
              </div>

              {/* Side-by-Side Comparator Table (if enabled) */}
              {showComparison && !isReal && (
                <div className="border border-slate-800 rounded-lg px-3 py-2 text-[11px] font-mono text-slate-500">
                  Benchmark not applicable: no provider answered, so there is no real cost or latency to compare.
                </div>
              )}
              {showComparison && isReal && (
                <div className="border border-slate-800 rounded-lg overflow-hidden text-xs font-mono">
                  <div className="bg-slate-950 px-3 py-2 border-b border-slate-800 text-[11px] text-slate-400 flex flex-wrap justify-between items-center gap-2">
                    <span className="font-semibold text-slate-300">
                      Side-by-Side Model Efficiency Benchmark
                    </span>
                    <div className="flex items-center gap-2">
                      <label htmlFor="playground-baseline-select" className="text-slate-400 text-[11px]">
                        Línea base (Hoy uso):
                      </label>
                      <select
                        id="playground-baseline-select"
                        value={referenceModel}
                        onChange={(e) => handleReferenceModelChange(e.target.value)}
                        className="bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-slate-200 font-mono text-[11px] focus:outline-none focus:border-indigo-500 cursor-pointer"
                      >
                        {AVAILABLE_REFERENCE_MODELS.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label} (${m.inputPerM}/${m.outputPerM})
                          </option>
                        ))}
                      </select>
                      <span
                        className={`text-[10px] font-bold ${
                          netSavedPercentage >= 0 ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        {netSavedPercentage >= 0
                          ? `-${fmtNum(netSavedPercentage, 0)}% cost delta`
                          : `+${fmtNum(Math.abs(netSavedPercentage), 0)}% delta`}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-slate-800 bg-slate-900/30">
                    {/* Active Routed Model */}
                    <div className="p-3 space-y-1.5 bg-emerald-950/10">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-emerald-400 font-semibold">Entropos Smart Choice</span>
                        <span className="text-[10px] px-1.5 py-0.5 bg-emerald-900/50 text-emerald-300 rounded font-semibold">
                          Active
                        </span>
                      </div>
                      <div className="text-sm font-bold text-white truncate">{result.selectedModel}</div>
                      <div className="text-[11px] text-slate-300 flex justify-between pt-1">
                        <span>Cost:</span>
                        <strong className="text-emerald-400 tabular-nums">${fmtNum(result.costUsd, 5)}</strong>
                      </div>
                      <div className="text-[11px] text-slate-400 flex justify-between">
                        <span>Measured Latency:</span>
                        <span className="text-emerald-300 tabular-nums font-semibold">
                          {fmtNum(result.speedLatencyMs, 0)}ms
                        </span>
                      </div>
                      {typeof result.totalTokens === 'number' && result.totalTokens > 0 && (
                        <div className="text-[10px] text-slate-500 flex justify-between pt-0.5">
                          <span>Measured Tokens:</span>
                          <span className="tabular-nums">
                            {result.inputTokens ?? 0} in / {result.outputTokens ?? 0} out
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Monolithic Frontier Baseline */}
                    <div className="p-3 space-y-1.5 bg-slate-950/30">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-slate-400 font-semibold">Monolithic Frontier</span>
                        <span className="text-[10px] text-slate-500">Unrouted Reference</span>
                      </div>
                      <div className="text-sm font-bold text-slate-300 truncate">{currentRef.label}</div>
                      <div className="text-[11px] text-slate-400 flex justify-between pt-1">
                        <span>Cost:</span>
                        <strong className="text-slate-300 tabular-nums">${fmtNum(calculatedBaselineCost, 5)}</strong>
                      </div>
                      <div className="text-[11px] text-slate-500 flex justify-between">
                        <span>Catalog P50 Latency:</span>
                        <span className="text-slate-400 tabular-nums">
                          ~{currentRef.typicalLatencyMs || 1400}ms
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 italic pt-0.5">
                        Reference rate (${currentRef.inputPerM}/${currentRef.outputPerM} / 1M)
                      </div>
                    </div>
                  </div>
                  <div className="px-3 py-2 bg-slate-950/80 border-t border-slate-800/80 flex justify-between items-center text-[11px]">
                    <span className="text-slate-400">Total single-query comparison vs {currentRef.label}:</span>
                    <span
                      className={`font-bold font-mono ${
                        netSavedPercentage >= 0 ? 'text-emerald-400' : 'text-amber-400'
                      }`}
                    >
                      {netSavedPercentage >= 0
                        ? `Saved $${fmtNum(netSavedUsd, 5)} (${fmtNum(netSavedPercentage, 0)}% cheaper)`
                        : `Frontier investment +$${fmtNum(Math.abs(netSavedUsd), 5)}`}
                    </span>
                  </div>
                </div>
              )}

              {/* Closed-Loop Agent Feedback Bar */}
              <div className="p-3 bg-slate-950/90 rounded-lg border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                <div className="flex items-center gap-1.5 text-slate-300">
                  <Activity className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Agent Closed Loop:</span>
                  <span className="text-slate-500 text-[11px]">Was downstream tool execution accurate?</span>
                </div>

                {feedbackSent ? (
                  <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" />
                    <span>{feedbackSent}</span>
                  </span>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleSendFeedback('success')}
                      className="px-2.5 py-1 rounded bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800/60 text-emerald-300 text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <ThumbsUp className="w-3 h-3" />
                      <span>Tool Succeeded</span>
                    </button>
                    <button
                      onClick={() => handleSendFeedback('failure')}
                      className="px-2.5 py-1 rounded bg-red-950/80 hover:bg-red-900 border border-red-800/60 text-red-300 text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <ThumbsDown className="w-3 h-3" />
                      <span>Tool Failed</span>
                    </button>
                  </div>
                )}
              </div>
              {feedbackError && (
                <div
                  role="alert"
                  className="bg-red-950/40 border border-red-800/60 text-red-200 text-xs rounded-lg p-3 flex items-start gap-2"
                >
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{feedbackError}</span>
                </div>
              )}

              {/* Response or JSON Box */}
              <div className="relative bg-slate-950 border border-slate-800 rounded-lg p-3.5 font-mono text-xs text-slate-300 leading-relaxed max-h-72 overflow-y-auto scrollbar-thin">
                {outputView === 'text' ? (
                  <div className="whitespace-pre-wrap">{result.responseText}</div>
                ) : (
                  <pre className="text-indigo-300 text-[11px] overflow-x-auto">
                    {JSON.stringify(result, null, 2)}
                  </pre>
                )}

                <button
                  onClick={() => handleCopy(outputView === 'text' ? result.responseText ?? '' : JSON.stringify(result, null, 2))}
                  className="absolute top-2.5 right-2.5 p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700 transition-colors cursor-pointer"
                  title="Copy output"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-2">
              <p className="text-xs font-mono">No route executed yet.</p>
              <p className="text-xs text-slate-600 max-w-sm">
                Click "Execute Route" on the left to see which provider is selected and measure savings in real time.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
