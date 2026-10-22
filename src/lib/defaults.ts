// Constantes publicas (proveedores, reglas del usuario, ajustes). Viven aparte del motor a proposito:
// el cliente importa de aqui y NUNCA de routerEngine.ts, que contiene el metodo (docs/ analisis de moat).
import { ProviderConfig, RouterSettings, CustomRule } from '../types/router';

export const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    logo: 'A',
    models: ['Claude Sonnet 5.5', 'Claude Opus 5.5', 'Claude Haiku 5.5'],
    enabled: true,
    status: 'not_configured',
    hasApiKey: false,
    badge: '30% Faster · Top Coder',
    testedLatencyMs: null,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    logo: 'O',
    models: ['GPT-6 Astra', 'GPT-6.1 Sol', 'GPT-6 Luna', 'o3-mini', 'GPT-5.5'],
    enabled: true,
    status: 'not_configured',
    hasApiKey: false,
    badge: 'GPT-6 Frontier',
    testedLatencyMs: null,
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    logo: 'G',
    models: ['Gemini 4 Argon', 'Gemini 3.8 Flash', 'Gemini 3.1 Pro', 'Gemini 3.1 Flash-Lite'],
    enabled: true,
    status: 'not_configured',
    hasApiKey: false,
    badge: 'Ultra Fast Edge (120ms)',
    testedLatencyMs: null,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    logo: 'D',
    models: ['DeepSeek R1 (Reasoning)', 'DeepSeek V3'],
    enabled: true,
    status: 'not_configured',
    hasApiKey: false,
    badge: 'Math & Logic',
    testedLatencyMs: null,
  },
  {
    id: 'groq',
    name: 'Groq Cloud',
    logo: 'Q',
    models: ['Llama 3.3 70B Versatile', 'Llama 3.1 8B Instant'],
    enabled: false,
    status: 'not_configured',
    hasApiKey: false,
    badge: '500+ tokens/sec',
    testedLatencyMs: null,
  },
  {
    id: 'ollama',
    name: 'Local Ollama',
    logo: 'L',
    models: ['Llama 3.2 3B', 'Qwen 2.5 Coder', 'Mistral 7B'],
    enabled: false,
    status: 'not_configured',
    hasApiKey: false,
    badge: 'Private & Free',
    testedLatencyMs: null,
  },
];

export const DEFAULT_CUSTOM_RULES: CustomRule[] = [
  {
    id: 'rule_sql',
    name: 'SQL & Database Queries',
    condition: 'contains_keyword',
    value: 'sql,database,postgres,query',
    targetModel: 'Claude Sonnet 5.5',
    targetProvider: 'Anthropic',
    enabled: true,
  },
  {
    id: 'rule_translation',
    name: 'Language Translation & Summaries',
    condition: 'contains_keyword',
    value: 'translate,summary,spanish,french',
    targetModel: 'Gemini 3.8 Flash',
    targetProvider: 'Google Gemini',
    enabled: true,
  },
];

export const DEFAULT_SETTINGS: RouterSettings = {
  mode: 'adaptive',
  monthlyBudgetCapUsd: 150.0,
  preferredFastModel: 'Gemini 3.8 Flash',
  preferredSmartModel: 'Claude Sonnet 5.5',
  autoFallbackEnabled: true,
  retentionPolicy: 'metadata_only',
  customRules: DEFAULT_CUSTOM_RULES,
};
