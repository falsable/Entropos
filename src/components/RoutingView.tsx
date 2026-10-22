import React, { useState, useEffect, useMemo } from 'react';
import {
  Sliders,
  Check,
  AlertTriangle,
  Cpu,
  RotateCcw,
  Sparkles,
  Activity,
  Plus,
  Trash2,
  Code2,
  ShieldCheck,
  Save,
  Undo2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import {
  RoutingMode,
  CustomRule,
  PublicModelPosterior,
  PublicFeedbackEvent,
} from '../types/router';
import { ROUTING_MODES_LIST } from '../constants/modes';
import { fetchJson, errorMessage, ApiError } from '../lib/api';
import { adminHeaders, getAdminToken, setAdminToken } from '../lib/adminToken';

const STATUS_LABELS: Record<PublicModelPosterior['status'], string> = {
  primary: 'Primary',
  standby: 'Standby',
  deprioritized: 'Deprioritized',
};

const ADMIN_TOKEN_MESSAGE =
  'An admin token is required for this action. Enter it in the "Admin token" field and try again.';

function adminActionError(err: unknown): string {
  if (err instanceof ApiError && (err.status === 401 || err.status === 503)) {
    return ADMIN_TOKEN_MESSAGE;
  }
  return errorMessage(err);
}

export interface RoutingViewProps {
  currentMode: RoutingMode;
  onModeChange: (mode: RoutingMode) => void;
  customRules: CustomRule[];
  onUpdateRules: (rules: CustomRule[]) => void;
  onNotify?: (message: string) => void;
  onNavigateToPlayground?: (prompt?: string) => void;
}

export const RoutingView: React.FC<RoutingViewProps> = ({
  currentMode,
  onModeChange,
  customRules,
  onUpdateRules,
  onNotify,
  onNavigateToPlayground,
}) => {
  // ---------------------------------------------------------------------------
  // DRAFT VS SAVED STATE (EXPLICIT SAVE WORKFLOW)
  // ---------------------------------------------------------------------------
  const [savedMode, setSavedMode] = useState<RoutingMode>(currentMode);
  const [draftMode, setDraftMode] = useState<RoutingMode>(currentMode);

  const [savedRules, setSavedRules] = useState<CustomRule[]>(customRules);
  const [draftRules, setDraftRules] = useState<CustomRule[]>(customRules);

  const [savedBudgetCap, setSavedBudgetCap] = useState<number>(150);
  const [draftBudgetCap, setDraftBudgetCap] = useState<number>(150);

  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Sync saved state when props change externally (e.g. initial status load)
  useEffect(() => {
    setSavedMode(currentMode);
    setDraftMode(currentMode);
  }, [currentMode]);

  useEffect(() => {
    setSavedRules(customRules);
    setDraftRules(customRules);
  }, [customRules]);

  // Fetch initial settings from server (budget cap, mode, rules)
  useEffect(() => {
    fetchJson<{
      settings?: { mode?: RoutingMode; monthlyBudgetCapUsd?: number };
      customRules?: CustomRule[];
    }>('/api/settings', { headers: adminHeaders() })
      .then((data) => {
        if (data?.settings?.mode) {
          setSavedMode(data.settings.mode);
          setDraftMode(data.settings.mode);
        }
        if (typeof data?.settings?.monthlyBudgetCapUsd === 'number') {
          setSavedBudgetCap(data.settings.monthlyBudgetCapUsd);
          setDraftBudgetCap(data.settings.monthlyBudgetCapUsd);
        }
        if (Array.isArray(data?.customRules)) {
          setSavedRules(data.customRules);
          setDraftRules(data.customRules);
        }
      })
      .catch(() => {
        // Fallback to local props if server /api/settings is admin-guarded
      });
  }, []);

  // Compute dirty state
  const modeChanged = draftMode !== savedMode;
  const rulesChanged = useMemo(
    () => JSON.stringify(draftRules) !== JSON.stringify(savedRules),
    [draftRules, savedRules]
  );
  const budgetChanged = draftBudgetCap !== savedBudgetCap;
  const isDirty = modeChanged || rulesChanged || budgetChanged;

  // Browser navigation warning when unsaved changes exist
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Discard changes
  const handleDiscardChanges = () => {
    setDraftMode(savedMode);
    setDraftRules(savedRules);
    setDraftBudgetCap(savedBudgetCap);
    setSaveError(null);
  };

  // Explicit Save Changes Handler
  const handleSaveChanges = async () => {
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccessNotice(null);

    try {
      const data = await fetchJson<{
        settings?: { mode?: RoutingMode; monthlyBudgetCapUsd?: number };
        customRules?: CustomRule[];
      }>('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...adminHeaders(),
        },
        body: JSON.stringify({
          mode: draftMode,
          customRules: draftRules,
          monthlyBudgetCapUsd: draftBudgetCap,
        }),
      });

      // Update saved reference states
      setSavedMode(draftMode);
      setSavedRules(draftRules);
      setSavedBudgetCap(draftBudgetCap);

      // Notify parent app
      onModeChange(draftMode);
      onUpdateRules(draftRules);

      setSaveSuccessNotice('Configuración de enrutamiento guardada y activa en el servidor.');
      if (onNotify) {
        onNotify('Configuración de enrutamiento guardada con éxito.');
      }
      setTimeout(() => setSaveSuccessNotice(null), 4000);
    } catch (err) {
      setSaveError(`No se pudieron guardar los cambios: ${adminActionError(err)}`);
    } finally {
      setIsSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // CUSTOM RULES DRAFT OPERATIONS
  // ---------------------------------------------------------------------------
  const [showAddRule, setShowAddRule] = useState<boolean>(false);
  const [newRuleName, setNewRuleName] = useState<string>('');
  const [newRuleKeywords, setNewRuleKeywords] = useState<string>('');
  const [newRuleModel, setNewRuleModel] = useState<string>('Claude Sonnet 5.5');
  const [newRuleError, setNewRuleError] = useState<string | null>(null);

  const handleToggleRule = (id: string) => {
    setDraftRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r))
    );
  };

  const handleDeleteRule = (id: string) => {
    setDraftRules((prev) => prev.filter((r) => r.id !== id));
  };

  const handleAddRule = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newRuleName.trim()) {
      setNewRuleError('Ingresa un nombre descriptivo para la regla.');
      return;
    }
    if (!newRuleKeywords.trim()) {
      setNewRuleError('Ingresa al menos una palabra clave.');
      return;
    }
    setNewRuleError(null);

    const providerMap: Record<string, string> = {
      'Claude Sonnet 5.5': 'Anthropic',
      'Claude Opus 5.5': 'Anthropic',
      'Claude Haiku 5.5': 'Anthropic',
      'Gemini 4 Argon': 'Google Gemini',
      'Gemini 3.8 Flash': 'Google Gemini',
      'Gemini 3.1 Flash-Lite': 'Google Gemini',
      'DeepSeek R1': 'DeepSeek',
      'GPT-6 Astra': 'OpenAI',
      'GPT-6.1 Sol': 'OpenAI',
      'GPT-6 Luna': 'OpenAI',
      'o3-mini': 'OpenAI',
    };

    const newRule: CustomRule = {
      id: 'rule_' + Date.now().toString(36),
      name: newRuleName.trim(),
      condition: 'contains_keyword',
      value: newRuleKeywords
        .split(',')
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean)
        .join(','),
      targetModel: newRuleModel,
      targetProvider: providerMap[newRuleModel] || 'Anthropic',
      enabled: true,
    };

    setDraftRules((prev) => [...prev, newRule]);
    setNewRuleName('');
    setNewRuleKeywords('');
    setShowAddRule(false);
  };

  // ---------------------------------------------------------------------------
  // MODEL ROUTING CONFIDENCE & ADAPTIVE TELEMETRY
  // ---------------------------------------------------------------------------
  const [posteriors, setPosteriors] = useState<Record<string, PublicModelPosterior>>({});
  const [feedbacks, setFeedbacks] = useState<PublicFeedbackEvent[]>([]);
  const [telemetryError, setTelemetryError] = useState<string | null>(null);
  const [isLoadingTelemetry, setIsLoadingTelemetry] = useState<boolean>(false);
  const [adminToken, setAdminTokenState] = useState<string>(getAdminToken());
  const [resetError, setResetError] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState<boolean>(false);

  // Fetch telemetry
  const fetchTelemetry = async () => {
    setIsLoadingTelemetry(true);
    setTelemetryError(null);
    try {
      const data = await fetchJson('/api/adaptive-telemetry');
      if (data?.posteriors) setPosteriors(data.posteriors);
      if (Array.isArray(data?.recentFeedbacks)) setFeedbacks(data.recentFeedbacks);
    } catch (err) {
      setTelemetryError(errorMessage(err));
    } finally {
      setIsLoadingTelemetry(false);
    }
  };

  useEffect(() => {
    fetchTelemetry();
  }, []);

  // Reset routing calibration
  const handleResetRouting = async () => {
    setIsResetting(true);
    setResetError(null);
    try {
      const data = await fetchJson('/api/adaptive-telemetry/reset', {
        method: 'POST',
        headers: adminHeaders(),
      });
      if (data?.posteriors) setPosteriors(data.posteriors);
      if (onNotify) onNotify('Preferencias de calibración restablecidas a la línea base.');
    } catch (err) {
      setResetError(adminActionError(err));
    } finally {
      setIsResetting(false);
    }
  };

  // Workload probe
  const [testPrompt, setTestPrompt] = useState<string>(
    "Write an idiomatic Rust function to detect topological cycles in a directed acyclic graph using Tarjan's SCC algorithm with proper memory safety and unit tests."
  );
  const [probe, setProbe] = useState<{ tier: string; summary: string } | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);

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
        if (controller.signal.aborted) return;
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

  // Feedback simulator
  const [feedbackModel, setFeedbackModel] = useState<string>('Claude Sonnet 5.5');
  const [feedbackOutcome, setFeedbackOutcome] = useState<
    'success' | 'failure' | 'retry' | 'hallucination'
  >('success');
  const [feedbackQuality, setFeedbackQuality] = useState<number>(5);
  const [feedbackComment, setFeedbackComment] = useState<string>(
    'Tool executed with zero runtime errors'
  );
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState<boolean>(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

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

      if (data?.updatedPosterior) {
        setPosteriors((prev) => ({
          ...prev,
          [feedbackModel]: data.updatedPosterior,
        }));
      }
      if (data?.event) {
        setFeedbacks((prev) => [data.event, ...prev.slice(0, 19)]);
      }
      if (onNotify) {
        onNotify(
          `Confianza de enrutamiento actualizada para ${feedbackModel}: ${data.updatedPosterior?.confidence ?? '--'}%`
        );
      }
    } catch (err) {
      setFeedbackError(adminActionError(err));
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const samplePrompts = [
    {
      label: 'Deep Code (Tarjan Rust)',
      prompt:
        "Write an idiomatic Rust function to detect topological cycles in a directed acyclic graph using Tarjan's SCC algorithm with proper memory safety and unit tests.",
    },
    {
      label: 'Formal Logic Proof',
      prompt:
        'Prove that the square root of 2 is irrational using proof by contradiction, explaining every deductive step clearly.',
    },
    {
      label: 'Boilerplate Format',
      prompt:
        'Convert the ISO date string "2026-10-12T09:30:00Z" to European DD/MM/YYYY format in TypeScript.',
    },
    {
      label: 'Factual Edge Query',
      prompt: 'What is the ISO 3166-1 alpha-2 country code for Norway and its official currency?',
    },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* --------------------------------------------------------------------- */}
      {/* HEADER & STICKY ACTION BAR WITH EXPLICIT SAVE                         */}
      {/* --------------------------------------------------------------------- */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <Sliders className="w-6 h-6 text-indigo-400" />
              <span>Enrutamiento</span>
            </h1>
            <p className="text-sm text-slate-400 mt-1 max-w-3xl leading-relaxed">
              Configura el modo heurístico o adaptativo, define reglas de dominio personalizadas y
              observa la calibración de confianza en bucle cerrado sobre tus modelos.
            </p>
          </div>

          {/* Action Bar: Discard & Save */}
          <div className="flex items-center gap-3 shrink-0">
            {isDirty && (
              <button
                type="button"
                onClick={handleDiscardChanges}
                disabled={isSaving}
                className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:outline-none"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>Descartar</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleSaveChanges}
              disabled={!isDirty || isSaving}
              aria-label="Guardar cambios de enrutamiento"
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 shadow-sm focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none cursor-pointer ${
                isDirty
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/50 hover:shadow-indigo-900/80'
                  : 'bg-slate-800/80 text-slate-500 cursor-not-allowed opacity-60'
              }`}
            >
              <Save className={`w-3.5 h-3.5 ${isSaving ? 'animate-spin' : ''}`} />
              <span>{isSaving ? 'Guardando...' : 'Guardar cambios'}</span>
            </button>
          </div>
        </div>

        {/* Unsaved Changes Banner / Notification */}
        {isDirty && (
          <div
            role="status"
            className="p-3 rounded-xl bg-amber-950/40 border border-amber-600/50 text-amber-200 text-xs flex items-center justify-between gap-3 animate-in fade-in"
          >
            <div className="flex items-center gap-2 font-mono">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Tienes cambios sin guardar:</strong>{' '}
                {modeChanged && `Modo (${draftMode}) `}
                {rulesChanged && 'Reglas modificadas '}
                {budgetChanged && `Límite mensual ($${draftBudgetCap})`}
                . Pulsa <strong>Guardar cambios</strong> para sincronizarlos con el servidor.
              </span>
            </div>
            <button
              type="button"
              onClick={handleDiscardChanges}
              className="text-amber-300 hover:text-white underline underline-offset-2 shrink-0 cursor-pointer"
            >
              Revertir
            </button>
          </div>
        )}

        {/* Success Notice */}
        {saveSuccessNotice && (
          <div
            role="status"
            className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-600/50 text-emerald-200 text-xs flex items-center gap-2 font-mono animate-in fade-in"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{saveSuccessNotice}</span>
          </div>
        )}

        {/* Error Notice */}
        {saveError && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 text-xs flex items-center gap-2 font-mono animate-in fade-in"
          >
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{saveError}</span>
          </div>
        )}
      </div>

      {/* --------------------------------------------------------------------- */}
      {/* SECTION 1: MODO DE ENRUTAMIENTO (ROUTING MODE)                       */}
      {/* --------------------------------------------------------------------- */}
      <section className="space-y-4" aria-labelledby="section-routing-mode">
        <div className="flex items-center justify-between">
          <div>
            <h2 id="section-routing-mode" className="text-base font-semibold text-white">
              1. Modo de Enrutamiento
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Selecciona el umbral heurístico o adaptativo que gobierna el despacho de peticiones.
            </p>
          </div>
          {savedMode && (
            <span className="text-xs font-mono text-slate-400">
              Modo activo en servidor: <strong className="text-indigo-400">{savedMode}</strong>
            </span>
          )}
        </div>

        {/* 4 Cards in Responsive 4-Column Grid (No card is left alone!) */}
        <div
          role="radiogroup"
          aria-label="Modo de enrutamiento"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {ROUTING_MODES_LIST.map((m) => {
            const isSelected = draftMode === m.id;
            const isLiveActive = savedMode === m.id;

            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                tabIndex={0}
                onClick={() => setDraftMode(m.id)}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    setDraftMode(m.id);
                  }
                }}
                className={`rounded-xl p-5 border text-left transition-all flex flex-col justify-between cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none ${
                  isSelected
                    ? 'bg-slate-900 border-indigo-500 shadow-md shadow-indigo-950/40 ring-1 ring-indigo-500/50'
                    : 'bg-slate-900/40 border-slate-800 hover:border-slate-700 hover:bg-slate-900/70 text-slate-300'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-white">{m.name}</span>
                    {isSelected && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-950 text-indigo-300 border border-indigo-800">
                        {isLiveActive ? 'Activo' : 'Borrador'}
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-slate-400 font-mono">{m.subtitle}</div>

                  <p className="text-xs text-slate-300 leading-relaxed font-sans line-clamp-4">
                    {m.description}
                  </p>

                  <div className="pt-2 text-xs font-mono text-slate-500 border-t border-slate-800/80">
                    <span className="text-[10px] uppercase block mb-1">Roster:</span>
                    <span className="text-slate-400 text-[11px] line-clamp-2">
                      {m.modelsSummary}
                    </span>
                  </div>
                </div>

                <div className="pt-4 mt-2">
                  <span
                    className={`block w-full py-1.5 rounded-lg text-xs font-medium text-center transition-colors ${
                      isSelected
                        ? 'bg-indigo-600 text-white font-semibold'
                        : 'bg-slate-800 text-slate-300 group-hover:bg-slate-700'
                    }`}
                  >
                    {isSelected ? 'Seleccionado' : 'Seleccionar'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* --------------------------------------------------------------------- */}
      {/* SECTION 2: REGLAS PERSONALIZADAS DE DOMINIO (CUSTOM RULES)            */}
      {/* --------------------------------------------------------------------- */}
      <section className="space-y-4" aria-labelledby="section-custom-rules">
        <div className="p-6 rounded-xl bg-slate-900/40 border border-slate-800 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="section-custom-rules" className="text-base font-semibold text-white">
                2. Reglas de Enrutamiento Personalizadas
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Sobrescribe el modelo de destino cuando el prompt coincida con palabras clave
                específicas (ej. forzar Sonnet 5.5 en SQL o Gemini Flash en resúmenes).
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowAddRule(!showAddRule)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono border border-slate-700 cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{showAddRule ? 'Cerrar formulario' : 'Añadir Regla'}</span>
            </button>
          </div>

          {/* Add Rule Form */}
          {showAddRule && (
            <form
              onSubmit={handleAddRule}
              className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-3 font-mono text-xs animate-in fade-in"
            >
              {newRuleError && (
                <div role="alert" className="text-red-400 text-xs">
                  {newRuleError}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="rule-name" className="text-[10px] text-slate-500 uppercase block mb-1">
                    Nombre de la regla
                  </label>
                  <input
                    id="rule-name"
                    type="text"
                    placeholder="Ej. Seguridad y Criptografía"
                    value={newRuleName}
                    onChange={(e) => setNewRuleName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label htmlFor="rule-keywords" className="text-[10px] text-slate-500 uppercase block mb-1">
                    Palabras clave (separadas por coma)
                  </label>
                  <input
                    id="rule-keywords"
                    type="text"
                    placeholder="crypto,cipher,hash,jwt"
                    value={newRuleKeywords}
                    onChange={(e) => setNewRuleKeywords(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label htmlFor="rule-target-model" className="text-[10px] text-slate-500 uppercase block mb-1">
                    Modelo de Destino
                  </label>
                  <select
                    id="rule-target-model"
                    value={newRuleModel}
                    onChange={(e) => setNewRuleModel(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Claude Sonnet 5.5">Claude Sonnet 5.5 (Anthropic)</option>
                    <option value="Claude Opus 5.5">Claude Opus 5.5 (Anthropic Frontier)</option>
                    <option value="Claude Haiku 5.5">Claude Haiku 5.5 (Anthropic Fast)</option>
                    <option value="GPT-6 Astra">GPT-6 Astra (OpenAI Flagship)</option>
                    <option value="GPT-6.1 Sol">GPT-6.1 Sol (OpenAI Frontier)</option>
                    <option value="DeepSeek R1">DeepSeek R1 (Reasoning)</option>
                    <option value="Gemini 4 Argon">Gemini 4 Argon (Google Frontier)</option>
                    <option value="Gemini 3.8 Flash">Gemini 3.8 Flash (Ultra-Fast)</option>
                    <option value="o3-mini">o3-mini (OpenAI Fast Reasoning)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddRule(false)}
                  className="px-3 py-1.5 text-slate-400 hover:text-white cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 text-white rounded font-medium hover:bg-indigo-500 transition-colors cursor-pointer"
                >
                  Guardar en borrador
                </button>
              </div>
            </form>
          )}

          {/* Existing Rules List */}
          <div className="space-y-2">
            {draftRules.length === 0 && (
              <div className="text-xs text-slate-500 py-3 text-center">
                No hay reglas personalizadas activas. Las peticiones siguen el modo de enrutamiento principal.
              </div>
            )}
            {draftRules.map((rule) => (
              <div
                key={rule.id}
                className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 flex items-center justify-between text-xs font-mono"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className={`font-semibold ${rule.enabled ? 'text-white' : 'text-slate-500'}`}>
                      {rule.name}
                    </span>
                    <span className="text-slate-500 text-[11px]">→ si coincide [{rule.value}]</span>
                  </div>
                  <div className="text-slate-400 text-[11px]">
                    Destino: <strong className="text-indigo-400">{rule.targetModel}</strong> ({rule.targetProvider})
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={rule.enabled}
                    aria-label={`Regla ${rule.name}: ${rule.enabled ? 'Activa' : 'Desactivada'}`}
                    onClick={() => handleToggleRule(rule.id)}
                    className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none ${
                      rule.enabled
                        ? 'bg-indigo-950/80 text-indigo-300 border border-indigo-700/60'
                        : 'bg-slate-900 text-slate-500 border border-slate-800'
                    }`}
                  >
                    {rule.enabled ? 'Activa' : 'Desactivada'}
                  </button>
                  <button
                    type="button"
                    aria-label={`Eliminar regla ${rule.name}`}
                    onClick={() => handleDeleteRule(rule.id)}
                    className="p-1 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:outline-none"
                    title="Eliminar regla"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Spend Guardrail */}
        <div className="p-5 rounded-xl bg-slate-900/40 border border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-semibold text-white">Límite de Gasto Mensual</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Topa las peticiones o activa modelos ligeros de respaldo si el gasto mensual acumulado alcanza este umbral.
              </p>
            </div>

            <div className="text-xs font-mono">
              <span className="text-slate-400">Límite: </span>
              <span className="text-white font-bold tabular-nums">${draftBudgetCap} USD</span>
            </div>
          </div>

          <label htmlFor="budget-cap-slider" className="sr-only">
            Límite mensual de gasto en USD
          </label>
          <input
            id="budget-cap-slider"
            type="range"
            min="25"
            max="500"
            step="25"
            value={draftBudgetCap}
            onChange={(e) => setDraftBudgetCap(parseInt(e.target.value, 10))}
            className="w-full accent-indigo-500 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          />
        </div>
      </section>

      {/* --------------------------------------------------------------------- */}
      {/* SECTION 3: CONFIANZA Y CONTROL ADAPTATIVO (CLOSED LOOP & METRICS)      */}
      {/* --------------------------------------------------------------------- */}
      <section className="space-y-6" aria-labelledby="section-confidence">
        <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/30 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[11px] font-mono font-semibold">
                  Closed-Loop Control Theory
                </span>
                <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Calibración Continua Online
                </span>
              </div>
              <h2 id="section-confidence" className="text-xl font-bold tracking-tight text-white">
                3. Confianza de Modelos y Telemetría Adaptativa
              </h2>
              <p className="text-sm text-slate-300 max-w-3xl leading-relaxed">
                Entropos evalúa cada prompt antes del gasto y calibra la preferencia de enrutamiento
                mediante los resultados y latencias medidas en downstream.
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
                placeholder="Token de admin"
                className="w-32 px-2.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs font-mono focus:outline-none focus:border-indigo-500"
                title="Requerido en producción para resetear calibración o enviar señales"
              />
              <button
                type="button"
                onClick={handleResetRouting}
                disabled={isResetting}
                className="px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-mono transition-colors flex items-center gap-1.5 border border-slate-700 cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none"
                title="Restablecer calibración de enrutamiento a valores base"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
                <span>Restablecer</span>
              </button>
              {onNavigateToPlayground && (
                <button
                  type="button"
                  onClick={() => onNavigateToPlayground(testPrompt)}
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Probar en Playground</span>
                </button>
              )}
            </div>
          </div>

          {resetError && (
            <div role="alert" className="bg-red-950/40 border border-red-800/60 text-red-200 text-xs rounded-lg p-3">
              Restablecimiento fallido: {resetError}
            </div>
          )}

          {/* 4 Pillars Summary Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 font-mono text-xs">
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
              <div className="text-[11px] text-slate-400 uppercase">Clasificación Pre-Despacho</div>
              <div className="text-sm font-bold text-white mt-0.5">Antes del Gasto</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Cero tokens desperdiciados</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
              <div className="text-[11px] text-slate-400 uppercase">Motor de Decisión</div>
              <div className="text-sm font-bold text-indigo-400 mt-0.5">Lazo Cerrado</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Aprende de cada ejecución</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
              <div className="text-[11px] text-slate-400 uppercase">Modelos Monitorizados</div>
              <div className="text-sm font-bold text-emerald-400 mt-0.5">
                {Object.keys(posteriors).length || 6} Activos
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Salud y latencia en vivo</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
              <div className="text-[11px] text-slate-400 uppercase">Envolvente de Latencia</div>
              <div className="text-sm font-bold text-white mt-0.5">Límites por Proveedor</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Conmutación automática</div>
            </div>
          </div>
        </div>

        {/* Model Confidence Bars Grid */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Cpu className="w-4 h-4 text-indigo-400" />
              <span>Nivel de Confianza por Modelo</span>
            </h3>
            {isLoadingTelemetry && (
              <span className="text-xs font-mono text-slate-400 animate-pulse">
                Actualizando telemetría...
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 font-mono">
            {Object.keys(posteriors).length === 0 && telemetryError && (
              <div
                role="alert"
                className="md:col-span-2 lg:col-span-3 bg-red-950/40 border border-red-800/60 text-red-200 text-xs rounded-lg p-3 flex items-center justify-between gap-3"
              >
                <span>No se pudo cargar la telemetría: {telemetryError}</span>
                <button
                  type="button"
                  onClick={fetchTelemetry}
                  className="px-2.5 py-1 rounded-lg bg-red-900/50 hover:bg-red-900/80 text-red-100 border border-red-800/60 shrink-0 cursor-pointer"
                >
                  Reintentar
                </button>
              </div>
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
                    <span className="text-slate-400">Confianza:</span>
                    <span className="text-white font-bold">
                      {post.confidence}% · {STATUS_LABELS[post.status]}
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-valuenow={post.confidence}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Confianza para ${modelName}`}
                    className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800"
                  >
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 rounded-full transition-all duration-500"
                      style={{ width: `${post.confidence}%` }}
                    />
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                  <div className="p-2 rounded bg-slate-950/80 border border-slate-800/80">
                    <span className="text-slate-500">P50 / P99 Latencia:</span>
                    <div className="text-slate-300">
                      {post.latencyP50Ms}ms / {post.latencyP99Ms}ms
                    </div>
                  </div>
                  <div className="p-2 rounded bg-slate-950/80 border border-slate-800/80">
                    <span className="text-slate-500">Coste:</span>
                    <div className="text-slate-300">${(post.costPer1k * 1000).toFixed(2)}/1M</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Workload Probe & Feedback Simulator Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Workload Probe (Col 7) */}
          <div className="lg:col-span-7 p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-indigo-950 border border-indigo-800/60 text-indigo-400">
                  <Code2 className="w-4 h-4" />
                </span>
                <h3 className="text-base font-bold text-white">Sonda de Carga de Trabajo (Workload Probe)</h3>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Clasifica el nivel de complejidad del prompt en el servidor antes del despacho.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {samplePrompts.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setTestPrompt(p.prompt)}
                  className="px-2.5 py-1 rounded-lg bg-slate-800/60 hover:bg-slate-700/80 text-slate-300 text-xs font-mono transition-colors border border-slate-700/60 cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none"
                >
                  {p.label}
                </button>
              ))}
            </div>

            <label htmlFor="probe-prompt-input" className="sr-only">
              Prompt para probar clasificación
            </label>
            <textarea
              id="probe-prompt-input"
              value={testPrompt}
              onChange={(e) => setTestPrompt(e.target.value)}
              rows={3}
              className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs font-mono focus:outline-none focus:border-indigo-500 resize-none"
              placeholder="Escribe una tarea para ver cómo la clasifica Entropos..."
            />

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono space-y-1.5">
              <div className="text-[10px] text-slate-500 uppercase">Nivel de Carga Detectado</div>
              <div className="text-sm font-bold text-indigo-300 uppercase">
                {probe ? probe.tier : probeError ? '--' : '...'}
              </div>
              <div className="text-xs text-slate-400">
                {probe ? probe.summary : probeError ? 'Sin clasificación disponible.' : 'Analizando...'}
              </div>
            </div>
            {probeError && (
              <div role="alert" className="bg-red-950/40 border border-red-800/60 text-red-200 text-xs rounded-lg p-3">
                Error en sonda: {probeError}
              </div>
            )}
          </div>

          {/* Feedback Simulator (Col 5) */}
          <div className="lg:col-span-5 p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-emerald-950 border border-emerald-800/60 text-emerald-400">
                  <Activity className="w-4 h-4" />
                </span>
                <h3 className="text-base font-bold text-white">Simulador de Señales Downstream</h3>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Simula el resultado de ejecución de un agente cliente (ej. Claude Code o Cursor) para observar cómo la confianza se calibra en vivo.
              </p>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div>
                <label htmlFor="feedback-model-select" className="text-slate-400 text-[11px] block mb-1">
                  Modelo de Destino:
                </label>
                <select
                  id="feedback-model-select"
                  value={feedbackModel}
                  onChange={(e) => setFeedbackModel(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  {(Object.keys(posteriors).length > 0
                    ? Object.keys(posteriors)
                    : ['Claude Sonnet 5.5', 'GPT-6 Astra', 'Gemini 3.8 Flash', 'DeepSeek R1']
                  ).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <span className="text-slate-400 text-[11px] block mb-1">Resultado de Ejecución:</span>
                <div className="grid grid-cols-2 gap-2">
                  {(['success', 'failure', 'retry', 'hallucination'] as const).map((outcome) => (
                    <button
                      key={outcome}
                      type="button"
                      aria-pressed={feedbackOutcome === outcome}
                      onClick={() => setFeedbackOutcome(outcome)}
                      className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold uppercase transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none ${
                        feedbackOutcome === outcome
                          ? outcome === 'success'
                            ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                            : 'bg-rose-950 text-rose-300 border-rose-700'
                          : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {outcome}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="feedback-quality-slider" className="text-slate-400 text-[11px] block mb-1">
                  Puntuación de Calidad: <strong className="text-white">{feedbackQuality}/5</strong>
                </label>
                <input
                  id="feedback-quality-slider"
                  type="range"
                  min="1"
                  max="5"
                  value={feedbackQuality}
                  onChange={(e) => setFeedbackQuality(parseInt(e.target.value, 10))}
                  className="w-full accent-indigo-500 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                />
              </div>

              <button
                type="button"
                onClick={handleSubmitFeedback}
                disabled={isSubmittingFeedback}
                className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors cursor-pointer flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none shadow-sm"
              >
                <Activity className={`w-3.5 h-3.5 ${isSubmittingFeedback ? 'animate-spin' : ''}`} />
                <span>{isSubmittingFeedback ? 'Enviando señal...' : 'Enviar Señal de Lazo Cerrado'}</span>
              </button>

              {feedbackError && (
                <div role="alert" className="text-red-400 text-xs">
                  {feedbackError}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
