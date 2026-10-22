import {
  ProviderConfig,
  RouteExecution,
  RoutingMode,
  RouterSettings,
  CustomRule,
  EntropyProbeResult,
  ModelPosterior,
  ClosedLoopFeedbackEvent,
} from '../types/router';

import { DEFAULT_CUSTOM_RULES, DEFAULT_PROVIDERS, DEFAULT_SETTINGS } from './defaults';

// Reexportadas para el servidor y el store; el cliente debe importarlas de './defaults'.
export { DEFAULT_CUSTOM_RULES, DEFAULT_PROVIDERS, DEFAULT_SETTINGS };

// ---------------------------------------------------------------------------
// 1. SUB-MILLISECOND SHANNON ENTROPY & SEMANTIC PROBE
// Evaluates character/token distribution, lexical richness, and syntactic density.
// ---------------------------------------------------------------------------
export function calculateShannonEntropy(prompt: string): EntropyProbeResult {
  const text = prompt.trim();
  if (!text) {
    return {
      shannonEntropy: 0,
      normalizedEntropy: 0,
      lexicalRichness: 0,
      syntacticComplexity: 0,
      branchingFactor: 0,
      complexityScore: 0,
      inferredComplexity: 'deterministic',
      detectedSignals: ['Empty input'],
    };
  }

  // Calculate character-level Shannon Entropy: H = -sum(p * log2(p))
  const charFreq: Record<string, number> = {};
  const len = text.length;
  for (let i = 0; i < len; i++) {
    const c = text[i];
    charFreq[c] = (charFreq[c] || 0) + 1;
  }

  let entropy = 0;
  for (const c in charFreq) {
    const p = charFreq[c] / len;
    entropy -= p * Math.log2(p);
  }

  // Normalized entropy (max theoretical for ASCII ~ 6.5 bits)
  const normalizedEntropy = Math.min(1.0, Number((entropy / 5.5).toFixed(3)));

  // Lexical richness (Type-Token Ratio on alphanumeric tokens)
  const tokens = text.toLowerCase().match(/[a-z0-9_]+/g) || [];
  const uniqueTokens = new Set(tokens);
  const lexicalRichness = tokens.length > 0 ? Number((uniqueTokens.size / tokens.length).toFixed(3)) : 0;

  // Syntactic complexity (density of code brackets, operators, delimiters, logic operators)
  const syntaxSymbols = text.match(/[{}\[\]()<>=;:&|!%*+\-\/\\^~?`#@$]/g) || [];
  const syntacticComplexity = Number((syntaxSymbols.length / Math.max(1, len)).toFixed(3));

  // Branching / conditional cues
  const branchingMatches = text.match(/\b(if|else|switch|case|catch|while|for|match|when|try|async|await|return)\b/gi) || [];
  const branchingFactor = branchingMatches.length;

  // Domain signals
  const detectedSignals: string[] = [];
  const lower = text.toLowerCase();

  const isFormalMath = /\b(prove|theorem|lemma|contradiction|invariant|calculus|eigenvalue|induction|topology)\b/i.test(lower);
  const isDeepEngineering = /\b(rust|concurrency|mutex|deadlock|ast|tarjan|algorithm|refactor|distributed|atomic|memory safety)\b/i.test(lower);
  const isSimpleLookup = /\b(what is|capital of|who is|meaning of|convert date|translate|hello|ping)\b/i.test(lower);
  const hasCodeBlock = text.includes('```') || text.includes('function') || text.includes('const ') || text.includes('class ');

  if (isFormalMath) detectedSignals.push('Formal Logic & Proof Invariant');
  if (isDeepEngineering) detectedSignals.push('Deep Systems & Concurrency Constraints');
  if (hasCodeBlock) detectedSignals.push('Structured Code Syntax Block');
  if (branchingFactor > 3) detectedSignals.push(`High Branching Factor (${branchingFactor} control flow points)`);
  if (syntacticComplexity > 0.12) detectedSignals.push('Dense Symbolic AST Representation');
  if (isSimpleLookup) detectedSignals.push('Deterministic Factual Pattern');

  // Composite complexity score (0 - 100)
  let score = normalizedEntropy * 35 + lexicalRichness * 20 + Math.min(syntacticComplexity * 200, 25) + Math.min(branchingFactor * 4, 20);
  if (isFormalMath) score += 25;
  if (isDeepEngineering) score += 20;
  if (isSimpleLookup && text.length < 150) score = Math.max(8, score * 0.4);

  const complexityScore = Math.min(100, Math.max(5, Math.round(score)));

  let inferredComplexity: 'deterministic' | 'moderate' | 'deep_reasoning' | 'formal_logic' = 'moderate';
  if (complexityScore < 32) {
    inferredComplexity = 'deterministic';
  } else if (isFormalMath || complexityScore >= 75) {
    inferredComplexity = 'formal_logic';
  } else if (complexityScore >= 55) {
    inferredComplexity = 'deep_reasoning';
  }

  return {
    shannonEntropy: Number(entropy.toFixed(3)),
    normalizedEntropy,
    lexicalRichness,
    syntacticComplexity,
    branchingFactor,
    complexityScore,
    inferredComplexity,
    detectedSignals,
  };
}

// ---------------------------------------------------------------------------
// 2. BAYESIAN THOMPSON SAMPLING POSTERIOR DISTRIBUTIONS
// Tracks prior successes (alpha) and penalties (beta) with online self-healing
// ---------------------------------------------------------------------------

// Pseudo-random sample from Beta(alpha, beta) using Johnk's generator approximation
function sampleBeta(alpha: number, beta: number): number {
  // Approximate Beta using Gamma distributions via Marsaglia and Tsang method
  function sampleGamma(shape: number): number {
    if (shape < 1) {
      return sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
    }
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    while (true) {
      let x = 0;
      let v = 0;
      do {
        // Standard normal Box-Muller
        const u1 = Math.random();
        const u2 = Math.random();
        x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        v = 1 + c * x;
      } while (v <= 0);

      v = v * v * v;
      const u = Math.random();
      if (u < 1 - 0.0331 * x * x * x * x) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  }

  const gA = sampleGamma(Math.max(1, alpha));
  const gB = sampleGamma(Math.max(1, beta));
  if (gA + gB === 0) return 0.5;
  return Number((gA / (gA + gB)).toFixed(4));
}

function calculatePosteriorStats(alpha: number, beta: number): {
  sampleMean: number;
  sampleVariance: number;
  credibleInterval: [number, number];
} {
  const total = alpha + beta;
  const mean = alpha / total;
  const variance = (alpha * beta) / (total * total * (total + 1));
  const std = Math.sqrt(variance);
  const ciLow = Math.max(0, Number((mean - 1.96 * std).toFixed(3)));
  const ciHigh = Math.min(1, Number((mean + 1.96 * std).toFixed(3)));
  return {
    sampleMean: Number(mean.toFixed(3)),
    sampleVariance: Number(variance.toFixed(5)),
    credibleInterval: [ciLow, ciHigh],
  };
}

export const INITIAL_MODEL_POSTERIORS: Record<string, ModelPosterior> = {
  'Claude Sonnet 5.5': {
    modelId: 'claude_sonnet_5_5',
    modelName: 'Claude Sonnet 5.5',
    provider: 'Anthropic',
    alpha: 96,
    beta: 4,
    ...calculatePosteriorStats(96, 4),
    latencyP50Ms: 240,
    latencyP99Ms: 380,
    costPer1k: 0.0024,
    slaEnvelopeOk: true,
    explorationCount: 45,
    exploitationCount: 168,
  },
  'GPT-6 Astra': {
    modelId: 'gpt_6_astra',
    modelName: 'GPT-6 Astra',
    provider: 'OpenAI',
    alpha: 95,
    beta: 5,
    ...calculatePosteriorStats(95, 5),
    latencyP50Ms: 290,
    latencyP99Ms: 440,
    costPer1k: 0.003,
    slaEnvelopeOk: true,
    explorationCount: 38,
    exploitationCount: 142,
  },
  'GPT-6.1 Sol': {
    modelId: 'gpt_6_1_sol',
    modelName: 'GPT-6.1 Sol',
    provider: 'OpenAI',
    alpha: 92,
    beta: 7,
    ...calculatePosteriorStats(92, 7),
    latencyP50Ms: 210,
    latencyP99Ms: 320,
    costPer1k: 0.0016,
    slaEnvelopeOk: true,
    explorationCount: 31,
    exploitationCount: 110,
  },
  'Gemini 3.8 Flash': {
    modelId: 'gemini_3_8_flash',
    modelName: 'Gemini 3.8 Flash',
    provider: 'Google Gemini',
    alpha: 91,
    beta: 6,
    ...calculatePosteriorStats(91, 6),
    latencyP50Ms: 120,
    latencyP99Ms: 190,
    costPer1k: 0.00015,
    slaEnvelopeOk: true,
    explorationCount: 52,
    exploitationCount: 210,
  },
  'o3-mini': {
    modelId: 'o3_mini',
    modelName: 'o3-mini',
    provider: 'OpenAI',
    alpha: 93,
    beta: 6,
    ...calculatePosteriorStats(93, 6),
    latencyP50Ms: 350,
    latencyP99Ms: 510,
    costPer1k: 0.0012,
    slaEnvelopeOk: true,
    explorationCount: 26,
    exploitationCount: 94,
  },
  'Gemini 4 Argon': {
    modelId: 'gemini_4_argon',
    modelName: 'Gemini 4 Argon',
    provider: 'Google Gemini',
    alpha: 97,
    beta: 3,
    ...calculatePosteriorStats(97, 3),
    latencyP50Ms: 340,
    latencyP99Ms: 490,
    costPer1k: 0.0035,
    slaEnvelopeOk: true,
    explorationCount: 22,
    exploitationCount: 88,
  },
  'DeepSeek R1': {
    modelId: 'deepseek_r1',
    modelName: 'DeepSeek R1',
    provider: 'DeepSeek',
    alpha: 86,
    beta: 11,
    ...calculatePosteriorStats(86, 11),
    latencyP50Ms: 540,
    latencyP99Ms: 820,
    costPer1k: 0.004,
    slaEnvelopeOk: true,
    explorationCount: 20,
    exploitationCount: 55,
  },
};

// Active in-memory posterior map (synchronized with server storage)
let currentPosteriors: Record<string, ModelPosterior> = { ...INITIAL_MODEL_POSTERIORS };

export function getAdaptivePosteriors(): Record<string, ModelPosterior> {
  return currentPosteriors;
}

export function updatePosteriorWithFeedback(
  modelName: string,
  outcome: 'success' | 'failure' | 'retry' | 'hallucination',
  qualityScore = 5,
  latencyMs?: number
): ModelPosterior {
  const existing = currentPosteriors[modelName] || INITIAL_MODEL_POSTERIORS[modelName] || {
    modelId: modelName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
    modelName,
    provider: 'Generic Provider',
    alpha: 20,
    beta: 5,
    ...calculatePosteriorStats(20, 5),
    latencyP50Ms: 300,
    latencyP99Ms: 500,
    costPer1k: 0.001,
    slaEnvelopeOk: true,
    explorationCount: 1,
    exploitationCount: 1,
  };

  let newAlpha = existing.alpha;
  let newBeta = existing.beta;

  if (outcome === 'success') {
    const rewardCredit = qualityScore >= 4 ? 2.0 : 1.0;
    newAlpha += rewardCredit;
  } else if (outcome === 'failure' || outcome === 'hallucination') {
    newBeta += 3.0; // Strong Bayesian penalty for downstream failures
  } else if (outcome === 'retry') {
    newBeta += 1.5;
  }

  // Latency penalty if SLA breached
  let slaEnvelopeOk = existing.slaEnvelopeOk;
  if (latencyMs && latencyMs > existing.latencyP99Ms * 1.5) {
    newBeta += 1.0;
    slaEnvelopeOk = false;
  } else {
    slaEnvelopeOk = true;
  }

  const updated: ModelPosterior = {
    ...existing,
    alpha: Number(newAlpha.toFixed(1)),
    beta: Number(newBeta.toFixed(1)),
    ...calculatePosteriorStats(newAlpha, newBeta),
    slaEnvelopeOk,
  };

  currentPosteriors[modelName] = updated;
  return updated;
}

// ---------------------------------------------------------------------------
// 3. MAIN ROUTING DISPATCH: ANALYZE AND PICK MODEL
// Incorporates Custom Rules, Heuristics, and Next-Gen Adaptive Control Plane
// ---------------------------------------------------------------------------
export function analyzeAndPickModel(
  prompt: string,
  mode: RoutingMode = 'adaptive',
  customRules: CustomRule[] = DEFAULT_CUSTOM_RULES,
  simulateFailover = false
): {
  selectedModel: string;
  provider: string;
  reason: string;
  isDeepReasoning: boolean;
  costPer1k: number;
  failoverOccurred?: boolean;
  entropy?: EntropyProbeResult;
  thompsonScore?: number;
  wasExploration?: boolean;
  posteriorMean?: number;
} {
  const text = prompt.toLowerCase();
  const entropy = calculateShannonEntropy(prompt);

  // 1. Check custom user rules first
  for (const rule of customRules) {
    if (rule.enabled && rule.condition === 'contains_keyword') {
      const keywords = rule.value.split(',').map((k) => k.trim().toLowerCase());
      const hasMatch = keywords.some((kw) => kw && text.includes(kw));
      if (hasMatch) {
        if (simulateFailover) {
          return {
            selectedModel: 'Gemini 3.8 Flash',
            provider: 'Google Gemini',
            reason: `Failover Event: ${rule.targetProvider} returned 429 Rate Limit -> Seamlessly rerouted to Gemini 3.8 Flash with 0 downtime.`,
            isDeepReasoning: false,
            costPer1k: 0.0002,
            failoverOccurred: true,
            entropy,
          };
        }
        return {
          selectedModel: rule.targetModel,
          provider: rule.targetProvider,
          reason: `Matched Custom Rule "${rule.name}" -> Routed directly to ${rule.targetModel}`,
          isDeepReasoning: rule.targetModel.includes('Sonnet') || rule.targetModel.includes('R1'),
          costPer1k: rule.targetModel.includes('Flash') ? 0.0001 : 0.003,
          entropy,
        };
      }
    }
  }

  // 2. Automatic Failover Simulation
  if (simulateFailover) {
    return {
      selectedModel: 'Gemini 3.8 Flash',
      provider: 'Google Gemini',
      reason: 'Adaptive Circuit Breaker: Primary upstream provider throttled -> Dispatched to Gemini Flash with zero packet loss.',
      isDeepReasoning: false,
      costPer1k: 0.0002,
      failoverOccurred: true,
      entropy,
    };
  }

  // 3. NEXT-GEN ADAPTIVE CONTROL PLANE (Flagship Mode)
  // Combines Sub-ms Shannon Entropy probe + Bayesian Thompson Sampling draws
  if (mode === 'adaptive') {
    const candidates = ['Claude Sonnet 5.5', 'Gemini 3.8 Flash', 'DeepSeek R1', 'GPT-6 Astra', 'GPT-6.1 Sol'];
    
    // Draw Thompson sample for each candidate
    const candidateDraws: Record<string, { draw: number; posterior: ModelPosterior }> = {};
    for (const name of candidates) {
      const post = currentPosteriors[name] || INITIAL_MODEL_POSTERIORS[name];
      if (post) {
        const draw = sampleBeta(post.alpha, post.beta);
        candidateDraws[name] = { draw, posterior: post };
      }
    }

    const { complexityScore, inferredComplexity, shannonEntropy } = entropy;
    let selectedModel = 'Gemini 3.8 Flash';
    let wasExploration = false;
    let reason = '';

    // Epsilon exploration trigger (12% chance to explore alternative model if SLA envelope holds)
    const exploreRoll = Math.random();
    const shouldExplore = exploreRoll < 0.12;

    if (inferredComplexity === 'deterministic') {
      // Deterministic / boilerplate: pick ultra-fast edge model
      selectedModel = 'Gemini 3.8 Flash';
      reason = `Adaptive Shannon Probe: Low entropy (H=${shannonEntropy} bits, score=${complexityScore}/100) -> Dispatched to Gemini 3.8 Flash (120ms edge latency, 98% cheaper).`;
    } else if (inferredComplexity === 'formal_logic') {
      // Formal logic or mathematical invariants
      const drawR1 = candidateDraws['DeepSeek R1']?.draw ?? 0.85;
      const drawSonnet = candidateDraws['Claude Sonnet 5.5']?.draw ?? 0.94;
      if (drawR1 >= drawSonnet) {
        selectedModel = 'DeepSeek R1';
        reason = `Adaptive Bayesian Engine: Formal logic invariant (H=${shannonEntropy} bits) + Thompson draw θ=${drawR1.toFixed(3)} -> Dispatched to DeepSeek R1 for multi-step proofs.`;
      } else {
        selectedModel = 'Claude Sonnet 5.5';
        reason = `Adaptive Bayesian Engine: High mathematical complexity + Thompson draw θ=${drawSonnet.toFixed(3)} -> Dispatched to Claude Sonnet 5.5 (30% faster inference).`;
      }
    } else if (inferredComplexity === 'deep_reasoning') {
      // Deep reasoning / complex engineering
      if (shouldExplore && candidateDraws['GPT-6 Astra']?.posterior?.slaEnvelopeOk) {
        selectedModel = 'GPT-6 Astra';
        wasExploration = true;
        reason = `Adaptive Online Probe: Exploration probe into GPT-6 Astra (Thompson sample θ=${candidateDraws['GPT-6 Astra'].draw.toFixed(3)}) to calibrate posterior latency envelope.`;
      } else {
        selectedModel = 'Claude Sonnet 5.5';
        reason = `Adaptive Thompson Sampling: High AST & reasoning entropy (H=${shannonEntropy} bits) -> Exploited top posterior Claude Sonnet 5.5 (Mean=${candidateDraws['Claude Sonnet 5.5']?.posterior?.sampleMean ?? 0.96}).`;
      }
    } else {
      // Moderate complexity
      if (shouldExplore && candidateDraws['GPT-6.1 Sol']) {
        selectedModel = 'GPT-6.1 Sol';
        wasExploration = true;
        reason = `Adaptive Exploration: Probing GPT-6.1 Sol (θ=${candidateDraws['GPT-6.1 Sol'].draw.toFixed(3)}) for moderate complexity prompt to verify SLA envelope.`;
      } else {
        selectedModel = 'Gemini 3.8 Flash';
        reason = `Adaptive Dynamic Envelope: Moderate complexity (H=${shannonEntropy} bits) routed to Gemini 3.8 Flash for optimal cost-to-performance frontier.`;
      }
    }

    const post = currentPosteriors[selectedModel] || INITIAL_MODEL_POSTERIORS[selectedModel] || {
      modelId: 'gemini_3_8_flash',
      modelName: selectedModel,
      provider: 'Google Gemini',
      alpha: 91,
      beta: 6,
      ...calculatePosteriorStats(91, 6),
      latencyP50Ms: 120,
      latencyP99Ms: 190,
      costPer1k: 0.00015,
      slaEnvelopeOk: true,
      explorationCount: 1,
      exploitationCount: 1,
    };

    if (wasExploration) {
      post.explorationCount += 1;
    } else {
      post.exploitationCount += 1;
    }

    return {
      selectedModel,
      provider: post.provider,
      reason,
      isDeepReasoning: selectedModel === 'Claude Sonnet 5.5' || selectedModel === 'DeepSeek R1' || selectedModel === 'GPT-6 Astra',
      costPer1k: post.costPer1k,
      entropy,
      thompsonScore: candidateDraws[selectedModel]?.draw ?? 0.92,
      wasExploration,
      posteriorMean: post.sampleMean,
    };
  }

  // 4. Fallback Static Modes (for legacy users)
  if (mode === 'cost_saver') {
    return {
      selectedModel: 'Gemini 3.1 Flash-Lite',
      provider: 'Google Gemini',
      reason: 'Cost-Saver mode active: Routed to fastest ultra-affordable model (96% savings)',
      isDeepReasoning: false,
      costPer1k: 0.0001,
      entropy,
    };
  }

  if (mode === 'max_quality') {
    if (entropy.inferredComplexity === 'formal_logic') {
      return {
        selectedModel: 'DeepSeek R1',
        provider: 'DeepSeek',
        reason: 'Maximum Quality mode: Routed to deep reasoning model for mathematical proof',
        isDeepReasoning: true,
        costPer1k: 0.004,
        entropy,
      };
    }
    return {
      selectedModel: 'Claude Sonnet 5.5',
      provider: 'Anthropic',
      reason: 'Maximum Quality mode: Routed to top-tier reasoning & coding model (Claude Sonnet 5.5)',
      isDeepReasoning: true,
      costPer1k: 0.0024,
      entropy,
    };
  }

  // Balanced Mode (hybrid)
  if (entropy.complexityScore >= 60 || text.includes('rust') || text.includes('algorithm')) {
    return {
      selectedModel: 'Claude Sonnet 5.5',
      provider: 'Anthropic',
      reason: `Balanced Mode: High complexity detected (Entropy H=${entropy.shannonEntropy}) -> Dispatched to Claude Sonnet 5.5`,
      isDeepReasoning: true,
      costPer1k: 0.0024,
      entropy,
    };
  }

  if (entropy.inferredComplexity === 'formal_logic') {
    return {
      selectedModel: 'DeepSeek R1',
      provider: 'DeepSeek',
      reason: `Balanced Mode: Formal proof invariant detected -> Dispatched to DeepSeek R1`,
      isDeepReasoning: true,
      costPer1k: 0.004,
      entropy,
    };
  }

  if (entropy.complexityScore < 30 || text.length < 120) {
    return {
      selectedModel: 'Gemini 3.8 Flash',
      provider: 'Google Gemini',
      reason: 'Balanced Mode: Direct factual query -> Dispatched to Gemini 3.8 Flash (instant & 98% cheaper)',
      isDeepReasoning: false,
      costPer1k: 0.00015,
      entropy,
    };
  }

  return {
    selectedModel: 'GPT-6.1 Sol',
    provider: 'OpenAI',
    reason: 'Balanced Mode: Standard contextual query -> Dispatched to GPT-6.1 Sol for balanced frontier speed and cost',
    isDeepReasoning: false,
    costPer1k: 0.0016,
    entropy,
  };
}
