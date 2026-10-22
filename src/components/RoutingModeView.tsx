import React, { useState } from 'react';
import { RoutingMode, CustomRule } from '../types/router';
import { Check, Plus, Trash2, Sliders } from 'lucide-react';
import { errorMessage, fetchJson } from '../lib/api';
import { ROUTING_MODES_LIST } from '../constants/modes';

interface RoutingModeViewProps {
  currentMode: RoutingMode;
  onModeChange: (mode: RoutingMode) => void;
  customRules: CustomRule[];
  onUpdateRules: (rules: CustomRule[]) => void;
}

export const RoutingModeView: React.FC<RoutingModeViewProps> = ({
  currentMode,
  onModeChange,
  customRules,
  onUpdateRules,
}) => {
  const [budgetCap, setBudgetCap] = useState<number>(150);
  const [savedNotice, setSavedNotice] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleKeywords, setNewRuleKeywords] = useState('');
  const [newRuleModel, setNewRuleModel] = useState('Claude Sonnet 5.5');
  const [showAddRule, setShowAddRule] = useState(false);

  const modes = ROUTING_MODES_LIST;

  const handleSelectMode = async (mode: RoutingMode) => {
    const previousMode = currentMode;
    setSaveError(null);
    setSavedNotice(false);
    onModeChange(mode);
    try {
      await fetchJson('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, customRules }),
      });
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2000);
    } catch (err) {
      // El servidor no guardó el cambio: volver a la estrategia anterior para no mostrar una activa que no lo es
      onModeChange(previousMode);
      setSaveError(`Strategy not changed: ${errorMessage(err)} Select it again to retry.`);
    }
  };

  const handleToggleRule = (id: string) => {
    const updated = customRules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r));
    onUpdateRules(updated);
  };

  const handleDeleteRule = (id: string) => {
    const updated = customRules.filter((r) => r.id !== id);
    onUpdateRules(updated);
  };

  const handleAddRule = () => {
    if (!newRuleName.trim() || !newRuleKeywords.trim()) return;
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
      id: 'rule_' + Date.now(),
      name: newRuleName.trim(),
      condition: 'contains_keyword',
      value: newRuleKeywords.trim().toLowerCase(),
      targetModel: newRuleModel,
      targetProvider: providerMap[newRuleModel] || 'Anthropic',
      enabled: true,
    };
    onUpdateRules([...customRules, newRule]);
    setNewRuleName('');
    setNewRuleKeywords('');
    setShowAddRule(false);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Routing Optimization Strategy
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Select the heuristic threshold used when evaluating prompt complexity across your connected MCP clients, or enforce domain-specific custom overrides.
          </p>
        </div>

        {savedNotice && (
          <div className="text-xs font-mono text-emerald-400 flex items-center gap-1.5">
            <Check className="w-4 h-4" />
            <span>Updated live across MCP sessions</span>
          </div>
        )}
      </div>

      {saveError && (
        <div role="alert" className="bg-red-950/40 border border-red-800/60 text-red-200 text-xs rounded-lg p-3">
          {saveError}
        </div>
      )}

      {/* Strategy Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {modes.map((m) => {
          const isSelected = currentMode === m.id;

          return (
            <div
              key={m.id}
              onClick={() => handleSelectMode(m.id)}
              className={`rounded-xl p-5 border transition-all cursor-pointer flex flex-col justify-between ${
                isSelected
                  ? 'bg-slate-900 border-indigo-500 shadow-sm'
                  : 'bg-slate-900/40 border-slate-800 hover:border-slate-700 hover:bg-slate-900/70'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">{m.name}</h3>
                  {isSelected && (
                    <span className="text-[11px] font-mono text-indigo-400 font-medium">
                      Active
                    </span>
                  )}
                </div>

                <div className="text-xs text-slate-400 font-mono">
                  {m.subtitle}
                </div>

                <p className="text-xs text-slate-300 leading-relaxed font-sans">
                  {m.description}
                </p>

                <div className="pt-2 text-xs font-mono text-slate-500 border-t border-slate-800/80">
                  <span className="text-[10px] uppercase block mb-1">Roster:</span>
                  <span className="text-slate-400 text-[11px]">{m.modelsSummary}</span>
                </div>
              </div>

              <div className="pt-4 mt-2">
                <button
                  className={`w-full py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    isSelected
                      ? 'bg-indigo-600 text-white font-semibold'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  {isSelected ? 'Current Strategy' : 'Select'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Custom Domain Override Rules (Power Feature for Enterprise/Devs) */}
      <div className="p-6 rounded-xl bg-slate-900/40 border border-slate-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Custom Domain Override Rules</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Enforce strict model choices for specific keywords (e.g., ensure SQL queries always use Claude Sonnet 5.5, or summaries always use Gemini 3.8 Flash).
            </p>
          </div>

          <button
            onClick={() => setShowAddRule(!showAddRule)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono border border-slate-700 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Rule</span>
          </button>
        </div>

        {/* Add Rule Form */}
        {showAddRule && (
          <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-3 font-mono text-xs">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] text-slate-500 uppercase block mb-1">Rule Name</label>
                <input
                  type="text"
                  placeholder="e.g., Security & Cryptography"
                  value={newRuleName}
                  onChange={(e) => setNewRuleName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-white"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-500 uppercase block mb-1">Keywords (comma-separated)</label>
                <input
                  type="text"
                  placeholder="e.g., crypto,cipher,hash,jwt"
                  value={newRuleKeywords}
                  onChange={(e) => setNewRuleKeywords(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-white"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-500 uppercase block mb-1">Target Model</label>
                <select
                  value={newRuleModel}
                  onChange={(e) => setNewRuleModel(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-white"
                >
                  <option value="Claude Sonnet 5.5">Claude Sonnet 5.5 (Anthropic - 30% Faster)</option>
                  <option value="Claude Opus 5.5">Claude Opus 5.5 (Anthropic Frontier)</option>
                  <option value="GPT-6 Astra">GPT-6 Astra (OpenAI Flagship)</option>
                  <option value="GPT-6.1 Sol">GPT-6.1 Sol (OpenAI Frontier)</option>
                  <option value="DeepSeek R1">DeepSeek R1 (Reasoning)</option>
                  <option value="Gemini 4 Argon">Gemini 4 Argon (Google Frontier)</option>
                  <option value="Gemini 3.8 Flash">Gemini 3.8 Flash (Ultra-Fast 120ms)</option>
                  <option value="o3-mini">o3-mini (OpenAI Fast Reasoning)</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAddRule(false)}
                className="px-3 py-1 text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleAddRule}
                className="px-3 py-1 bg-indigo-600 text-white rounded font-medium hover:bg-indigo-500"
              >
                Save Rule
              </button>
            </div>
          </div>
        )}

        {/* Existing Rules List */}
        <div className="space-y-2">
          {customRules.map((rule) => (
            <div
              key={rule.id}
              className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 flex items-center justify-between text-xs font-mono"
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className={`font-semibold ${rule.enabled ? 'text-white' : 'text-slate-500'}`}>
                    {rule.name}
                  </span>
                  <span className="text-slate-500 text-[11px]">→ if prompt contains [{rule.value}]</span>
                </div>
                <div className="text-slate-400 text-[11px]">
                  Target: <strong className="text-indigo-400">{rule.targetModel}</strong> ({rule.targetProvider})
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleToggleRule(rule.id)}
                  className={`px-2 py-0.5 rounded text-[11px] cursor-pointer ${
                    rule.enabled ? 'bg-indigo-950/60 text-indigo-400 border border-indigo-800/60' : 'bg-slate-900 text-slate-500'
                  }`}
                >
                  {rule.enabled ? 'Active' : 'Disabled'}
                </button>
                <button
                  onClick={() => handleDeleteRule(rule.id)}
                  className="text-slate-500 hover:text-rose-400 cursor-pointer"
                  title="Delete rule"
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
            <h3 className="text-xs font-semibold text-white">Monthly Expense Guardrail</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Caps requests and downgrades fallback models when your aggregate monthly token spend reaches this threshold.
            </p>
          </div>

          <div className="text-xs font-mono">
            <span className="text-slate-400">Monthly Limit: </span>
            <span className="text-white font-bold tabular-nums">${budgetCap} USD</span>
          </div>
        </div>

        <input
          type="range"
          min="25"
          max="500"
          step="25"
          value={budgetCap}
          onChange={(e) => setBudgetCap(parseInt(e.target.value))}
          className="w-full accent-indigo-500 cursor-pointer"
        />
      </div>
    </div>
  );
};
