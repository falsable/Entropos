// Frontera publica del servidor: todo lo que sale hacia el navegador, MCP o clientes OpenAI pasa por aqui.
// El motor (routerEngine.ts) y los posteriors internos NO se serializan: solo la vista recortada de abajo.
// Criterio: docs/ analisis de moat, seccion 3.B (el "como" es secreto; el "que" y el "por que" son publicos).
import type {
  ClosedLoopFeedbackEvent,
  ModelPosterior,
  PublicFeedbackEvent,
  PublicModelPosterior,
} from '../types/router';

type InferredTier = 'deterministic' | 'moderate' | 'deep_reasoning' | 'formal_logic';

const TIER_LABELS: Record<InferredTier, string> = {
  deterministic: 'Instant edge',
  moderate: 'Balanced',
  deep_reasoning: 'Frontier reasoning',
  formal_logic: 'Deep logic',
};

const TIER_SUMMARIES: Record<InferredTier, string> = {
  deterministic: 'Routine request: answered at the edge for a fraction of the cost.',
  moderate: 'Mixed workload: routed to the best cost-to-quality option.',
  deep_reasoning: 'Open-ended engineering task: reserved for a frontier reasoning engine.',
  formal_logic: 'Multi-step formal reasoning: sent to a specialist reasoning engine.',
};

export function publicTier(tier?: string): string {
  return TIER_LABELS[tier as InferredTier] ?? TIER_LABELS.moderate;
}

export function publicTierSummary(tier?: string): string {
  return TIER_SUMMARIES[tier as InferredTier] ?? TIER_SUMMARIES.moderate;
}

interface PublicDecision {
  selectedModel: string;
  reason: string;
  entropy?: { inferredComplexity?: string };
}

// Razones que no describen el metodo (regla del usuario, failover) se muestran tal cual. Si el texto del motor
// cambia y deja de coincidir, cae al texto generico: falla cerrado.
const SAFE_REASON_PREFIXES = ['Matched Custom Rule', 'Failover Event', 'Adaptive Circuit Breaker'];

export function publicReason(decision: PublicDecision): string {
  if (SAFE_REASON_PREFIXES.some((prefix) => decision.reason.startsWith(prefix))) return decision.reason;
  return `Routed to ${decision.selectedModel} \u00b7 ${publicTier(decision.entropy?.inferredComplexity)} workload`;
}

type HiddenExecutionField =
  | 'entropyScore'
  | 'shannonEntropyBits'
  | 'thompsonScore'
  | 'wasExploration'
  | 'posteriorMean';

const HIDDEN_EXECUTION_FIELDS: HiddenExecutionField[] = [
  'entropyScore',
  'shannonEntropyBits',
  'thompsonScore',
  'wasExploration',
  'posteriorMean',
];

// El store interno conserva el registro completo; al exterior solo sale esta copia recortada.
export function toPublicExecution<T extends object>(record: T, decision: PublicDecision): Omit<T, HiddenExecutionField> {
  const out = { ...record } as Record<string, unknown>;
  for (const key of HIDDEN_EXECUTION_FIELDS) delete out[key];
  out.reason = publicReason(decision);
  out.complexityTier = publicTier(decision.entropy?.inferredComplexity);
  return out as Omit<T, HiddenExecutionField>;
}

export function toPublicPosterior(p: ModelPosterior): PublicModelPosterior {
  const confidence = Math.round((p.sampleMean * 100) / 5) * 5;
  return {
    modelId: p.modelId,
    modelName: p.modelName,
    provider: p.provider,
    confidence,
    status: confidence >= 90 ? 'primary' : confidence >= 75 ? 'standby' : 'deprioritized',
    latencyP50Ms: p.latencyP50Ms,
    latencyP99Ms: p.latencyP99Ms,
    costPer1k: p.costPer1k,
    slaEnvelopeOk: p.slaEnvelopeOk,
  };
}

export function toPublicPosteriors(posteriors: Record<string, ModelPosterior>): Record<string, PublicModelPosterior> {
  return Object.fromEntries(Object.entries(posteriors).map(([name, p]) => [name, toPublicPosterior(p)]));
}

export function toPublicFeedback(event: ClosedLoopFeedbackEvent): PublicFeedbackEvent {
  const { rewardDelta, ...rest } = event;
  return { ...rest, effect: rewardDelta > 0 ? 'raised' : 'lowered' };
}
