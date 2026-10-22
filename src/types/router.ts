export type RoutingMode = 'adaptive' | 'balanced' | 'cost_saver' | 'max_quality';

export interface ProviderConfig {
  id: string;
  name: string;
  logo: string;
  models: string[];
  enabled: boolean;
  status: 'connected' | 'not_configured' | 'error' | 'unreachable';
  hasApiKey: boolean;
  maskedKey?: string;
  badge?: string;
  testedLatencyMs?: number | null;
  lastVerifiedAt?: string | null;
}

export interface EntropyProbeResult {
  shannonEntropy: number; // e.g. 1.8 to 5.6 bits
  normalizedEntropy: number; // 0.0 - 1.0
  lexicalRichness: number; // unique tokens / total
  syntacticComplexity: number; // syntax token density
  branchingFactor: number; // logical branches / conditionals
  complexityScore: number; // 0 - 100
  inferredComplexity: 'deterministic' | 'moderate' | 'deep_reasoning' | 'formal_logic';
  detectedSignals: string[];
}

export interface ModelPosterior {
  modelId: string;
  modelName: string;
  provider: string;
  alpha: number; // success reward credits
  beta: number; // failure / latency penalties
  sampleMean: number; // alpha / (alpha + beta)
  sampleVariance: number;
  credibleInterval: [number, number];
  thompsonDraw?: number;
  latencyP50Ms: number;
  latencyP99Ms: number;
  costPer1k: number;
  slaEnvelopeOk: boolean;
  explorationCount: number;
  exploitationCount: number;
}

export interface ClosedLoopFeedbackEvent {
  id: string;
  timestamp: string;
  requestId: string;
  model: string;
  provider: string;
  outcome: 'success' | 'failure' | 'retry' | 'hallucination';
  qualityScore: number; // 1 to 5
  latencyMs: number;
  toolExecutionSuccess: boolean;
  rewardDelta: number;
  comment?: string;
}

// Vista publica: lo unico que sale del servidor hacia el navegador y los clientes.
// No lleva alfa/beta, intervalos, umbrales ni deltas (docs/ analisis de moat, seccion 3.B).
export interface PublicModelPosterior {
  modelId: string;
  modelName: string;
  provider: string;
  confidence: number; // 0-100, redondeado a multiplos de 5
  status: 'primary' | 'standby' | 'deprioritized';
  latencyP50Ms: number;
  latencyP99Ms: number;
  costPer1k: number;
  slaEnvelopeOk: boolean;
}

export interface PublicFeedbackEvent {
  id: string;
  timestamp: string;
  requestId: string;
  model: string;
  provider: string;
  outcome: ClosedLoopFeedbackEvent['outcome'];
  qualityScore: number;
  latencyMs: number;
  toolExecutionSuccess: boolean;
  effect: 'raised' | 'lowered';
  comment?: string;
}

export interface AdaptiveTelemetryState {
  posteriors: Record<string, ModelPosterior>;
  totalExplored: number;
  totalExploited: number;
  explorationRate: number;
  recentFeedbacks: ClosedLoopFeedbackEvent[];
  avgEntropy: number;
  slaP95CompliancePct: number | null;
}

export interface RouteExecution {
  id: string;
  timestamp: string;
  promptSnippet: string;
  fullPrompt: string;
  selectedModel: string;
  provider: string;
  reason: string;
  speedLatencyMs: number;
  costUsd: number;
  baselineCostUsd: number;
  baselineModel?: string;
  savedUsd: number;
  savedPercentage: number;
  responseText: string;
  mode: RoutingMode;
  clientOrigin?: string; // e.g., 'Claude Code', 'Cursor', 'Web Playground'
  failoverOccurred?: boolean;
  complexityTier?: string;
  entropyScore?: number;
  shannonEntropyBits?: number;
  thompsonScore?: number;
  wasExploration?: boolean;
  posteriorMean?: number;
  feedbackReceived?: boolean;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  hasMeasuredUsage?: boolean;
  isSimulated?: boolean;
}

export interface CustomRule {
  id: string;
  name: string;
  condition: 'contains_keyword' | 'task_type';
  value: string;
  targetModel: string;
  targetProvider: string;
  enabled: boolean;
}

export interface WorkspaceApiKey {
  id: string;
  name: string;
  key: string;
  createdAt: string;
  lastUsedAt?: string;
  clientName: string;
  workspaceId?: string;
}

// Clave tal como sale del servidor: el valor completo (key) solo viene en la respuesta de creacion.
export interface PublicWorkspaceKey {
  id: string;
  name: string;
  clientName: string;
  createdAt: string;
  lastUsedAt?: string;
  last4: string;
  key?: string;
  workspaceId?: string;
}

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  authProvider: 'email' | 'github';
  createdAt: string;
}

export interface WorkspaceRecord {
  id: string;
  name: string;
  ownerUserId: string;
  createdAt: string;
}

export interface AuthSessionResponse {
  token: string;
  user: UserRecord;
  workspace: WorkspaceRecord;
  subscription: SubscriptionState;
}

export type RetentionPolicy = 'metadata_only' | 'zero_retention' | 'full';

export interface RouterSettings {
  mode: RoutingMode;
  monthlyBudgetCapUsd: number;
  preferredFastModel: string;
  preferredSmartModel: string;
  autoFallbackEnabled: boolean;
  retentionPolicy?: RetentionPolicy;
  customRules: CustomRule[];
}

export type SubscriptionPlanId = 'developer' | 'pro' | 'enterprise';

export interface SubscriptionState {
  planId: SubscriptionPlanId;
  planName: string;
  status: 'active' | 'trialing' | 'canceled';
  monthlyQuota: number;
  usedThisMonth: number;
  currentPeriodEnd: string;
  paymentMethod?: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  };
  features: string[];
}

export interface DailyAnalyticsPoint {
  date: string;
  requests: number;
  actualCostUsd: number;
  referenceCostUsd: number;
  savedUsd: number;
}

export interface TopModelAnalytics {
  model: string;
  provider: string;
  requests: number;
  actualCostUsd: number;
  savedUsd: number;
  percentageOfTraffic: number;
}

export interface ReferenceModelConfig {
  id: string;
  label: string;
  provider: string;
  inputPerM: number;
  outputPerM: number;
  typicalLatencyMs?: number;
}

export interface AnalyticsSummary {
  periodDays: number;
  referenceModel: ReferenceModelConfig;
  totals: {
    totalRequests: number;
    actualCostUsd: number;
    referenceCostUsd: number;
    savedUsd: number;
    savingsPercentage: number;
  };
  daily: DailyAnalyticsPoint[];
  topModels: TopModelAnalytics[];
  provenance: {
    source: string;
    calculatedAt: string;
    retentionMode: string;
  };
}
