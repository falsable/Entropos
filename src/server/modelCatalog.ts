// Tabla nombre del motor -> id real de la API y clave de cada proveedor. Solo servidor.
// Ids verificados el 2026-10-12 contra la documentacion de cada proveedor (Context7; Claude con la skill claude-api),
// sin claves reales todavia. El modelo que se reporta es `label`: el nombre del id que de verdad se llama.
// ENTROPOS_MODEL_IDS (JSON {"<nombre del motor>": "<id de API>"}) cambia un id sin tocar el codigo.
import { productionStore } from './storage';

export type ProviderId = 'anthropic' | 'openai' | 'gemini' | 'deepseek';

export interface CatalogEntry {
  provider: ProviderId;
  apiModel: string;
  label: string;
}

export const PROVIDER_NAMES: Record<ProviderId, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  gemini: 'Google Gemini',
  deepseek: 'DeepSeek',
};

const PROVIDER_ENV: Record<ProviderId, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
};

const DEFAULT_CATALOG: Record<string, CatalogEntry> = {
  'Claude Sonnet 5.5': { provider: 'anthropic', apiModel: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
  'GPT-6 Astra': { provider: 'openai', apiModel: 'gpt-6-astra', label: 'GPT-6 Astra' },
  'GPT-6.1 Sol': { provider: 'openai', apiModel: 'gpt-6.1-sol', label: 'GPT-6.1 Sol' },
  'o3-mini': { provider: 'openai', apiModel: 'o3-mini', label: 'o3-mini' },
  'Gemini 3.8 Flash': { provider: 'gemini', apiModel: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
  'Gemini 3.1 Flash-Lite': { provider: 'gemini', apiModel: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite' },
  // "Gemini 4 Argon" no existe en la documentacion de Google: se llama al Pro vigente y se reporta con su nombre.
  'Gemini 4 Argon': { provider: 'gemini', apiModel: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview' },
  // "DeepSeek R1" ya no es un id de la API; el modelo de razonamiento vigente es deepseek-v4-pro.
  'DeepSeek R1': { provider: 'deepseek', apiModel: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
  // Modelo usado por /api/chat
  'gemini-3.5-flash': { provider: 'gemini', apiModel: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
};

// Model that answers when the chosen one cannot (no key, open circuit or upstream error).
export const FALLBACK_MODEL = 'Gemini 3.8 Flash';

export interface ModelPricing {
  inputPerM: number; // USD per 1M tokens
  outputPerM: number;
}

// Referencia del ahorro: Claude Opus 5.5 ($4 / $20 por millón)
export const BASELINE_PRICING: ModelPricing = {
  inputPerM: 4.0,
  outputPerM: 20.0,
};

// Precios de entrada y salida por millón de tokens (copia fechada 2026-10-12 de OpenRouter / docs oficiales).
// Modificable en runtime por ENTROPOS_MODEL_PRICING (JSON {"<apiModel>": {"inputPerM": ..., "outputPerM": ...}}).
export const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-sonnet-5-5': { inputPerM: 2.0, outputPerM: 10.0 },
  'gpt-6-astra': { inputPerM: 10.0, outputPerM: 50.0 },
  'gpt-6.1-sol': { inputPerM: 2.0, outputPerM: 10.0 },
  'o3-mini': { inputPerM: 1.1, outputPerM: 4.4 },
  'gemini-3.8-flash': { inputPerM: 0.75, outputPerM: 3.75 },
  'gemini-3.1-flash-lite': { inputPerM: 0.25, outputPerM: 1.5 },
  'gemini-3.1-pro-preview': { inputPerM: 2.0, outputPerM: 12.0 },
  'deepseek-v4-pro': { inputPerM: 0.412, outputPerM: 0.825 },
  'gemini-3.5-flash': { inputPerM: 1.5, outputPerM: 9.0 },
};

function readPricingOverrides(): Record<string, ModelPricing> {
  const raw = process.env.ENTROPOS_MODEL_PRICING;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    console.error('ENTROPOS_MODEL_PRICING is not valid JSON; using default model pricing.');
    return {};
  }
}

const pricingOverrides = readPricingOverrides();

export function getPricingForModel(modelNameOrLabel: string): ModelPricing {
  const entry = resolveModel(modelNameOrLabel);
  const apiModel = entry?.apiModel || modelNameOrLabel;
  if (pricingOverrides[apiModel]) return pricingOverrides[apiModel];
  if (MODEL_PRICING[apiModel]) return MODEL_PRICING[apiModel];
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (key.toLowerCase() === modelNameOrLabel.toLowerCase()) return pricing;
  }
  return MODEL_PRICING['gemini-3.8-flash'];
}

export function getBaselinePricing(): ModelPricing {
  const raw = process.env.ENTROPOS_BASELINE_PRICING;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.inputPerM === 'number' && typeof parsed?.outputPerM === 'number') {
        return parsed;
      }
    } catch {
      // ignore
    }
  }
  return BASELINE_PRICING;
}

export interface CostAndSavings {
  actualCostUsd: number;
  baselineCostUsd: number;
  savedUsd: number;
  savedPercentage: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  hasMeasuredUsage: boolean;
}

export function calculateCostAndSavings(
  actualModel: string,
  usage?: { inputTokens: number; outputTokens: number },
  referencePricing?: { inputPerM: number; outputPerM: number }
): CostAndSavings {
  if (!usage || (usage.inputTokens === 0 && usage.outputTokens === 0)) {
    return {
      actualCostUsd: 0,
      baselineCostUsd: 0,
      savedUsd: 0,
      savedPercentage: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      hasMeasuredUsage: false,
    };
  }

  const { inputTokens, outputTokens } = usage;
  const totalTokens = inputTokens + outputTokens;
  const pricing = getPricingForModel(actualModel);
  const baseline = referencePricing || getBaselinePricing();

  const actualCost = (inputTokens * pricing.inputPerM + outputTokens * pricing.outputPerM) / 1_000_000;
  const baselineCost = (inputTokens * baseline.inputPerM + outputTokens * baseline.outputPerM) / 1_000_000;
  // El ahorro real puede ser negativo si el modelo utilizado es mas costoso que la referencia
  const saved = baselineCost - actualCost;
  const savedPct = baselineCost > 0 ? Math.round((saved / baselineCost) * 100) : 0;

  return {
    actualCostUsd: Number(actualCost.toFixed(6)),
    baselineCostUsd: Number(baselineCost.toFixed(6)),
    savedUsd: Number(saved.toFixed(6)),
    savedPercentage: savedPct,
    inputTokens,
    outputTokens,
    totalTokens,
    hasMeasuredUsage: true,
  };
}

function readOverrides(): Record<string, string> {
  const raw = process.env.ENTROPOS_MODEL_IDS;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    console.error('ENTROPOS_MODEL_IDS is not valid JSON; using the built-in model ids.');
    return {};
  }
}

const overrides = readOverrides();

// Returns null for a name with no real model behind it (for example a custom rule pointing at an unknown model).
export function resolveModel(engineName: string): CatalogEntry | null {
  const entry = DEFAULT_CATALOG[engineName];
  if (!entry) return null;
  const override = overrides[engineName];
  // An overridden id is reported as itself: the label always names what is actually called.
  return typeof override === 'string' && override && override !== entry.apiModel
    ? { ...entry, apiModel: override, label: override }
    : entry;
}

// Feedback arrives with the reported label (for example from a history row); learning is keyed by engine name.
export function engineNameForLabel(name: string): string {
  if (DEFAULT_CATALOG[name]) return name;
  return Object.keys(DEFAULT_CATALOG).find((engineName) => resolveModel(engineName)?.label === name) ?? name;
}

// Single source for provider keys: environment variable first, then a key saved in the store.
export function providerKey(provider: ProviderId): string | undefined {
  return process.env[PROVIDER_ENV[provider]] || productionStore.getProviderSecret(provider) || undefined;
}
