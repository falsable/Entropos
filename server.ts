import crypto from 'node:crypto';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { analyzeAndPickModel, calculateShannonEntropy, DEFAULT_PROVIDERS } from './src/lib/routerEngine';
import {
  publicReason,
  publicTier,
  publicTierSummary,
  toPublicExecution,
  toPublicFeedback,
  toPublicPosterior,
  toPublicPosteriors,
} from './src/server/publicView';
import { bearerToken, rateLimit, requireAdmin, requireAuth, readToken } from './src/server/guards';
import { RoutingMode, CustomRule } from './src/types/router';
import { productionStore, verifyPassword } from './src/server/storage';
import { dispatcher, getGeminiClient, UpstreamUnavailableError } from './src/server/dispatcher';
import { calculateCostAndSavings, engineNameForLabel, providerKey, resolveModel, PROVIDER_NAMES, type ProviderId } from './src/server/modelCatalog';
import { getAnalyticsSummary, AVAILABLE_REFERENCE_MODELS } from './src/server/analytics';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const app = express();
const PORT = process.env.PORT || 3000;

// Configurable trust proxy for reverse proxies (Cloudflare, Nginx, Traefik, Caddy)
if (process.env.TRUST_PROXY) {
  const tp = process.env.TRUST_PROXY.trim();
  if (tp === 'true' || tp === '1') {
    app.set('trust proxy', 1);
  } else if (!isNaN(Number(tp))) {
    app.set('trust proxy', Number(tp));
  } else {
    app.set('trust proxy', tp);
  }
}

// Security headers (disable X-Powered-By, nosniff, frameguard, referrer policy)
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// Structured JSON request logging with unique reqId
app.use((req, res, next) => {
  const reqId = (req.headers['x-request-id'] as string) || `req_${crypto.randomBytes(8).toString('hex')}`;
  (req as any).reqId = reqId;
  res.setHeader('X-Request-Id', reqId);

  const start = Date.now();
  res.on('finish', () => {
    const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.NODE_TEST_CONTEXT) || process.argv.includes('--test');
    if (!isTest || process.env.ENABLE_HTTP_LOGS === 'true') {
      const logEntry = {
        level: 'info',
        timestamp: new Date().toISOString(),
        reqId,
        method: req.method,
        path: req.originalUrl || req.url,
        status: res.statusCode,
        durationMs: Date.now() - start,
        ip: req.ip || req.socket.remoteAddress || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
      };
      console.log(JSON.stringify(logEntry));
    }
  });

  next();
});

// JSON Body Parser with syntax error interceptor (returns 400 JSON, never Express HTML)
app.use(express.json({ limit: '2mb' }));
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof SyntaxError && 'status' in err && (err as any).status === 400 && 'body' in err) {
    return res.status(400).json({
      error: {
        message: 'Invalid JSON payload received in request body',
        code: 'invalid_json',
        type: 'invalid_request_error',
      },
    });
  }
  next(err);
});

// Providers that can actually answer: Gemini through GEMINI_API_KEY, the others through keys saved in the store.
export function connectedProviders(): string[] {
  const providers: string[] = [];
  if (providerKey('gemini')) providers.push('Google Gemini');
  if (providerKey('anthropic')) providers.push('Anthropic (Claude)');
  if (providerKey('openai')) providers.push('OpenAI');
  if (providerKey('deepseek')) providers.push('DeepSeek');
  return providers;
}

// ----------------------------------------------------
// PRODUCTION OBSERVABILITY, LIVENESS & READINESS
// ----------------------------------------------------
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/readyz', (req, res) => {
  let storageOk = false;
  try {
    productionStore.getSettings();
    storageOk = true;
  } catch {
    storageOk = false;
  }

  const providers = connectedProviders();
  const providersOk = providers.length > 0;
  const isReady = storageOk && providersOk;

  const statusCode = isReady ? 200 : 503;
  res.status(statusCode).json({
    status: isReady ? 'ready' : 'not_ready',
    timestamp: new Date().toISOString(),
    checks: {
      storage: {
        status: storageOk ? 'ok' : 'failed',
        engine: 'sqlite_wal',
      },
      upstreamProviders: {
        status: providersOk ? 'ok' : 'failed',
        connected: providers,
        detail: providersOk ? undefined : 'No upstream model providers configured with API keys',
      },
    },
  });
});

app.get('/api/production-status', (req, res) => {
  const state = productionStore.getState();
  res.json({
    storage: {
      type: 'sqlite_wal',
      status: 'active',
      recordCount: state.logs.length,
    },
    circuitBreakers: state.circuitBreakers,
    usage: state.usageTotals,
    settings: state.settings,
    keysCount: state.apiKeys.length,
    hasGeminiKey: Boolean(providerKey('gemini')),
  });
});

// ----------------------------------------------------
// MODEL CONTEXT PROTOCOL (MCP) JSON-RPC ENDPOINT
// Compatible with Claude Code, Claude Desktop, Cursor, Windsurf
// ----------------------------------------------------

const MCP_TOOLS = [
  {
    name: 'smart_generate',
    description:
      'Universal Model Router: Automatically detects prompt complexity and routes to the best model (Claude Sonnet 5.5, Gemini 3.8 Flash, GPT-6 Astra) for maximum speed and cost savings.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'The task, code instruction, or query to solve.',
        },
        mode: {
          type: 'string',
          enum: ['adaptive', 'balanced', 'cost_saver', 'max_quality'],
          description: 'Optional routing preference. Flagship is adaptive (Bayesian + Shannon Entropy). Defaults to adaptive.',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'get_optimal_model',
    description:
      'Inspects which model Entropos would choose for a given prompt and why, along with estimated cost savings.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'The query to evaluate.',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'check_savings',
    description: 'Check cumulative cost savings and total requests routed through Entropos.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// Average discount from the unrounded totals; null until something has been routed.
function averageDiscountPct(totals: { totalSavedUsd: number; totalCostUsd: number }): number | null {
  const baseline = totals.totalSavedUsd + totals.totalCostUsd;
  return baseline > 0 ? Number(((totals.totalSavedUsd / baseline) * 100).toFixed(1)) : null;
}


// MCP clients authenticate every call (initialize included) with a workspace key in Authorization: Bearer.
function rejectMcpWithoutKey(req: express.Request, res: express.Response): boolean {
  if (productionStore.validateApiKey(bearerToken(req))) return false;
  res.setHeader('WWW-Authenticate', 'Bearer');
  res.status(401).json({
    jsonrpc: '2.0',
    id: req.body?.id ?? null,
    error: { code: -32001, message: 'Missing or invalid Entropos API key. Send a workspace key as Authorization: Bearer <key>.' },
  });
  return true;
}

app.post('/mcp', async (req, res) => {
  if (rejectMcpWithoutKey(req, res)) return;
  const { jsonrpc, id, method, params } = req.body;

  // Handle MCP handshake: initialize
  if (method === 'initialize') {
    return res.json({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        serverInfo: {
          name: 'entropos-mcp',
          version: '1.2.0',
          authenticated: true,
        },
        capabilities: {
          tools: {},
        },
      },
    });
  }

  // Handle MCP tool discovery: tools/list
  if (method === 'tools/list') {
    return res.json({
      jsonrpc: '2.0',
      id,
      result: {
        tools: MCP_TOOLS,
      },
    });
  }

  // Handle MCP tool execution: tools/call
  if (method === 'tools/call') {
    const { name, arguments: args } = params || {};

    if (name === 'check_savings') {
      const state = productionStore.getState();
      const discountPct = averageDiscountPct(state.usageTotals);
      return res.json({
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  status: 'active',
                  activeMode: state.settings.mode,
                  totalRequests: state.usageTotals.totalRequests,
                  totalSavedUsd: `$${state.usageTotals.totalSavedUsd.toFixed(2)} USD`,
                  connectedProviders: connectedProviders(),
                  averageSavingsPct: discountPct === null ? null : `${discountPct}%`,
                },
                null,
                2
              ),
            },
          ],
        },
      });
    }

    if (name === 'get_optimal_model') {
      const state = productionStore.getState();
      const decision = analyzeAndPickModel(args?.prompt || '', state.settings.mode, state.customRules);
      return res.json({
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: `[Entropos Recommendation]\nSelected Model: ${decision.selectedModel} (${decision.provider})\nReason: ${publicReason(decision)}\nEst. Cost / 1k: $${decision.costPer1k.toFixed(4)}`,
            },
          ],
        },
      });
    }

    if (name === 'smart_generate') {
      const state = productionStore.getState();
      const rawMessages = Array.isArray(args?.messages) && args.messages.length > 0 ? args.messages : undefined;
      const prompt = args?.prompt || (rawMessages ? rawMessages[rawMessages.length - 1]?.content : '') || '';
      const mode = (args?.mode as RoutingMode) || state.settings.mode;
      const explicitModel = typeof args?.model === 'string' && args.model ? args.model : undefined;
      const routingInput = rawMessages
        ? rawMessages.map((m: any) => `${m.role || 'user'}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '')}`).join('\n')
        : prompt;
      const decision = analyzeAndPickModel(routingInput, mode, state.customRules);
      const targetModel = explicitModel || decision.selectedModel;
      const resolvedEntry = explicitModel ? resolveModel(explicitModel) : null;
      const targetProvider = resolvedEntry ? PROVIDER_NAMES[resolvedEntry.provider] : decision.provider;
      const startTime = Date.now();

      let dispatchResult;
      try {
        dispatchResult = await dispatcher.dispatch(rawMessages || prompt, targetModel, targetProvider);
      } catch (err: any) {
        if (!(err instanceof UpstreamUnavailableError)) console.error('smart_generate failed:', err);
        else console.warn(`smart_generate failed, no provider answered (${err.provider}): ${err.detail}`);
      }
      const responseText = dispatchResult?.text || '';

      // No provider answered: report a tool error (MCP isError) instead of inventing a result.
      if (!dispatchResult || !responseText) {
        return res.json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: 'No model provider could answer this request. Configure a provider API key on the Entropos server or try again later.',
              },
            ],
            isError: true,
          },
        });
      }

      const durationMs = Date.now() - startTime;
      const costInfo = calculateCostAndSavings(dispatchResult.actualModel, dispatchResult.usage);

      const executionRecord = {
        id: 'req_mcp_' + Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toISOString(),
        promptSnippet: (prompt || routingInput).slice(0, 80),
        fullPrompt: routingInput,
        selectedModel: dispatchResult.actualModel,
        provider: dispatchResult.actualProvider,
        reason: publicReason(decision),
        speedLatencyMs: durationMs,
        costUsd: costInfo.actualCostUsd,
        baselineCostUsd: costInfo.baselineCostUsd,
        savedUsd: costInfo.savedUsd,
        savedPercentage: costInfo.savedPercentage,
        responseText,
        mode,
        isRealAi: true,
        clientOrigin: 'MCP Handshake',
        failoverOccurred: dispatchResult.failoverOccurred,
        inputTokens: costInfo.inputTokens,
        outputTokens: costInfo.outputTokens,
        totalTokens: costInfo.totalTokens,
        hasMeasuredUsage: costInfo.hasMeasuredUsage,
      };
      productionStore.recordExecution(executionRecord);

      return res.json({
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: responseText,
            },
          ],
          _meta: {
            model: dispatchResult.actualModel,
            provider: dispatchResult.actualProvider,
            failover: dispatchResult.failoverOccurred,
            reason: publicReason(decision),
            savedUsd: `$${costInfo.savedUsd.toFixed(4)}`,
            costUsd: `$${costInfo.actualCostUsd.toFixed(4)}`,
            tokens: costInfo.totalTokens,
          },
        },
      });
    }

    return res.status(404).json({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Tool '${name}' not found` },
    });
  }

  // Fallback for notifications
  return res.json({ jsonrpc: '2.0', id, result: {} });
});

// SSE endpoint for clients that prefer SSE transport
app.get('/mcp/sse', (req, res) => {
  if (rejectMcpWithoutKey(req, res)) return;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  res.write(
    `event: endpoint\ndata: ${JSON.stringify({ endpoint: '/mcp' })}\n\n`
  );

  const keepAlive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(keepAlive);
  });
});

// ----------------------------------------------------
// MULTI-TURN CHAT ENDPOINT (Gemini API with System Instructions)
// ----------------------------------------------------
app.post('/api/chat', requireAdmin, async (req, res) => {
  const startTime = Date.now();
  const { messages, systemInstruction, taskComplexity = 'general' } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Messages array is required' });
  }

  // Model selection per instruction:
  // - gemini-3.1-flash-lite for tasks that should happen fast
  // - gemini-3.5-flash for general tasks
  // - gemini-3.8-flash for complex tasks
  let modelToUse = 'gemini-3.5-flash';
  if (taskComplexity === 'fast') {
    modelToUse = 'gemini-3.1-flash-lite';
  } else if (taskComplexity === 'complex') {
    modelToUse = 'gemini-3.8-flash';
  } else {
    modelToUse = 'gemini-3.5-flash';
  }

  const defaultSystem =
    systemInstruction ||
    'You are Entropos, the AI Router Architect and intelligent assistant. You help developers optimize token spending, configure Model Context Protocol (MCP) clients like Claude Code and Cursor, and solve programming and architecture problems with clarity and precision.';

  let dispatchResult;
  try {
    dispatchResult = await dispatcher.dispatch(messages, modelToUse || 'gemini-3.5-flash', 'Google Gemini', defaultSystem);
  } catch (err: any) {
    if (err instanceof UpstreamUnavailableError) {
      return res.status(503).json({
        error: 'No model provider could answer this message. Configure GEMINI_API_KEY on the server or try again later.',
      });
    }
    console.error('Chat endpoint failed:', err);
    return res.status(500).json({ error: 'Chat routing failed due to an internal error.' });
  }

  const durationMs = Date.now() - startTime;
  const costInfo = calculateCostAndSavings(dispatchResult.actualModel, dispatchResult.usage);

  const chatRecord = {
    id: 'chat_' + Math.random().toString(36).substring(2, 9),
    timestamp: new Date().toISOString(),
    promptSnippet: (messages[messages.length - 1]?.content || '').slice(0, 80),
    fullPrompt: messages.map((m: any) => `${m.role}: ${m.content}`).join('\n'),
    selectedModel: dispatchResult.actualModel,
    provider: dispatchResult.actualProvider,
    reason: `Multi-turn chat interaction classified as ${taskComplexity} complexity`,
    speedLatencyMs: durationMs,
    costUsd: costInfo.actualCostUsd,
    baselineCostUsd: costInfo.baselineCostUsd,
    savedUsd: costInfo.savedUsd,
    savedPercentage: costInfo.savedPercentage,
    responseText: dispatchResult.text,
    mode: 'balanced' as RoutingMode,
    clientOrigin: 'Gemini Chat Thread',
    failoverOccurred: dispatchResult.failoverOccurred,
    inputTokens: costInfo.inputTokens,
    outputTokens: costInfo.outputTokens,
    totalTokens: costInfo.totalTokens,
    hasMeasuredUsage: costInfo.hasMeasuredUsage,
  };
  productionStore.recordExecution(chatRecord);

  res.json({
    id: 'chat_' + Math.random().toString(36).substring(2, 9),
    role: 'model',
    content: dispatchResult.text,
    modelUsed: dispatchResult.actualModel,
    latencyMs: durationMs,
    timestamp: new Date().toISOString(),
  });
});

// ----------------------------------------------------
// REST API ENDPOINTS
// ----------------------------------------------------

app.get('/api/status', (req, res) => {
  const state = productionStore.getState();
  res.json({
    status: 'online',
    activeMode: state.settings.mode,
    totalRequests: state.usageTotals.totalRequests,
    totalSavedUsd: Number(state.usageTotals.totalSavedUsd.toFixed(2)),
    averageDiscountPct: averageDiscountPct(state.usageTotals),
    hasGeminiKey: Boolean(providerKey('gemini')),
    customRules: state.customRules,
    circuitBreakers: state.circuitBreakers,
  });
});

app.post('/api/route', requireAdmin, async (req, res) => {
  const startTime = Date.now();
  const state = productionStore.getState();
  const {
    prompt,
    mode = state.settings.mode,
    simulateFailover = false,
    clientOrigin = 'Web Console',
    referenceModel,
  } = req.body;

  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  // 1. Analyze and pick optimal target model & provider
  const decision = analyzeAndPickModel(prompt, mode, state.customRules, simulateFailover);

  // 2. Dispatch call via multi-provider dispatcher with circuit breaker
  let dispatchResult;
  try {
    dispatchResult = await dispatcher.dispatch(prompt, decision.selectedModel, decision.provider);
  } catch (err: any) {
    if (err instanceof UpstreamUnavailableError) {
      console.warn(`Route failed, no provider answered (${err.provider}): ${err.detail}`);
      return res.status(503).json({ error: err.message });
    }
    console.error('Route failed:', err);
    return res.status(500).json({ error: 'Routing failed because of an internal error.' });
  }

  const durationMs = Date.now() - startTime;
  const refConfig = referenceModel
    ? AVAILABLE_REFERENCE_MODELS.find((m) => m.id === referenceModel)
    : undefined;
  const costInfo = calculateCostAndSavings(dispatchResult.actualModel, dispatchResult.usage, refConfig);

  const executionRecord = {
    id: 'req_' + Math.random().toString(36).substring(2, 9),
    timestamp: new Date().toISOString(),
    promptSnippet: prompt.slice(0, 80),
    fullPrompt: prompt,
    selectedModel: dispatchResult.actualModel,
    provider: dispatchResult.actualProvider,
    reason: publicReason(decision),
    speedLatencyMs: durationMs,
    costUsd: costInfo.actualCostUsd,
    baselineCostUsd: costInfo.baselineCostUsd,
    baselineModel: refConfig?.label || 'Claude Sonnet 5.5',
    savedUsd: costInfo.savedUsd,
    savedPercentage: costInfo.savedPercentage,
    responseText: dispatchResult.text,
    mode,
    isRealAi: true,
    clientOrigin,
    failoverOccurred: dispatchResult.failoverOccurred || decision.failoverOccurred || false,
    entropyScore: decision.entropy?.complexityScore,
    shannonEntropyBits: decision.entropy?.shannonEntropy,
    thompsonScore: decision.thompsonScore,
    wasExploration: decision.wasExploration ?? false,
    posteriorMean: decision.posteriorMean,
    complexityTier: decision.entropy?.inferredComplexity ?? 'moderate',
    inputTokens: costInfo.inputTokens,
    outputTokens: costInfo.outputTokens,
    totalTokens: costInfo.totalTokens,
    hasMeasuredUsage: costInfo.hasMeasuredUsage,
  };

  // Persist execution in disk-backed store
  productionStore.recordExecution(executionRecord);

  res.json(toPublicExecution(executionRecord, decision));
});

// Public classification probe: returns only the coarse tier, never the signals or scores behind it.
app.post('/api/probe', rateLimit('probe', { windowMs: 60_000, max: 30 }), requireAdmin, (req, res) => {
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Prompt is required' });
  }
  const { inferredComplexity } = calculateShannonEntropy(prompt);
  res.json({ tier: publicTier(inferredComplexity), summary: publicTierSummary(inferredComplexity) });
});

// ----------------------------------------------------
// ADAPTIVE CONTROL PLANE TELEMETRY & CLOSED-LOOP FEEDBACK
// ----------------------------------------------------
function calculateSlaCompliance(): number | null {
  const logs = productionStore.getLogs();
  if (!logs || logs.length === 0) return null;
  const posteriors = productionStore.getPosteriors();
  let compliant = 0;
  for (const log of logs) {
    const post = posteriors[log.selectedModel] || Object.values(posteriors).find((p) => p.modelName === log.selectedModel);
    const maxLatency = post ? post.latencyP99Ms * 1.5 : 2500;
    if (log.speedLatencyMs <= maxLatency) compliant++;
  }
  return Number(((compliant / logs.length) * 100).toFixed(1));
}

app.get('/api/adaptive-telemetry', (req, res) => {
  res.json({
    posteriors: toPublicPosteriors(productionStore.getPosteriors()),
    recentFeedbacks: productionStore.getRecentFeedbacks().map(toPublicFeedback),
    slaP95CompliancePct: calculateSlaCompliance(),
    controlPlaneStatus: 'online_learning_active',
  });
});

app.post('/api/feedback', rateLimit('feedback', { windowMs: 60_000, max: 20 }), requireAdmin, (req, res) => {
  const {
    model = 'Claude Sonnet 5.5',
    outcome = 'success',
    qualityScore = 5,
    latencyMs,
    toolExecutionSuccess = true,
    comment,
    requestId,
  } = req.body;

  const result = productionStore.recordFeedback(
    engineNameForLabel(model),
    outcome,
    qualityScore,
    latencyMs,
    toolExecutionSuccess,
    comment,
    requestId
  );

  res.json({
    status: 'recorded',
    feedbackId: result.event.id,
    updatedPosterior: toPublicPosterior(result.updatedPosterior),
    event: toPublicFeedback(result.event),
  });
});

app.post('/api/adaptive-telemetry/reset', rateLimit('reset', { windowMs: 60_000, max: 3 }), requireAdmin, (req, res) => {
  const resetPosteriors = productionStore.resetPosteriors();
  res.json({
    status: 'reset_successful',
    posteriors: toPublicPosteriors(resetPosteriors),
  });
});

app.get('/api/settings', requireAdmin, (req, res) => {
  const state = productionStore.getState();
  res.json({
    settings: state.settings,
    activeMode: state.settings.mode,
    retentionPolicy: state.settings.retentionPolicy,
    customRules: state.customRules,
  });
});

app.post('/api/settings', requireAdmin, (req, res) => {
  const partialSettings: any = {};
  if (req.body?.mode) {
    partialSettings.mode = req.body.mode;
  }
  if (req.body?.retentionPolicy && ['metadata_only', 'zero_retention', 'full'].includes(req.body.retentionPolicy)) {
    partialSettings.retentionPolicy = req.body.retentionPolicy;
  }
  if (req.body?.monthlyBudgetCapUsd !== undefined) {
    partialSettings.monthlyBudgetCapUsd = Number(req.body.monthlyBudgetCapUsd);
  }
  if (req.body?.circuitBreakerThreshold !== undefined) {
    partialSettings.circuitBreakerThreshold = Number(req.body.circuitBreakerThreshold);
  }

  if (Object.keys(partialSettings).length > 0) {
    productionStore.updateSettings(partialSettings);
  }
  if (req.body?.customRules) {
    productionStore.updateCustomRules(req.body.customRules);
  }
  const state = productionStore.getState();
  res.json({
    settings: state.settings,
    activeMode: state.settings.mode,
    retentionPolicy: state.settings.retentionPolicy,
    customRules: state.customRules,
  });
});

// ----------------------------------------------------
// PROVIDER CAPACITY & BYOK API KEYS
// ----------------------------------------------------
interface ProviderVerification {
  status: 'connected' | 'not_configured' | 'error' | 'unreachable';
  latencyMs: number | null;
  lastVerifiedAt: string | null;
}
const providerVerifications: Record<string, ProviderVerification> = {};

async function pingProvider(
  pid: ProviderId,
  key: string
): Promise<{ ok: boolean; status: number; latencyMs: number; error?: string }> {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  let pingUrl = '';
  const headers: Record<string, string> = {};

  switch (pid) {
    case 'gemini':
      pingUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=1`;
      break;
    case 'anthropic':
      pingUrl = 'https://api.anthropic.com/v1/models';
      headers['x-api-key'] = key;
      headers['anthropic-version'] = '2023-06-01';
      break;
    case 'openai':
      pingUrl = 'https://api.openai.com/v1/models';
      headers['Authorization'] = `Bearer ${key}`;
      break;
    case 'deepseek':
      pingUrl = 'https://api.deepseek.com/models';
      headers['Authorization'] = `Bearer ${key}`;
      break;
    default:
      clearTimeout(timeout);
      return { ok: false, status: 400, latencyMs: 0, error: 'Unknown provider' };
  }

  try {
    const response = await fetch(pingUrl, { method: 'GET', headers, signal: controller.signal });
    clearTimeout(timeout);
    const latencyMs = Date.now() - start;

    if (!response.ok) {
      let errorMsg = `Upstream returned HTTP ${response.status}`;
      try {
        const body = (await response.json()) as any;
        if (body?.error?.message) errorMsg = body.error.message;
        else if (body?.error) errorMsg = typeof body.error === 'string' ? body.error : JSON.stringify(body.error);
      } catch {
        // ignore JSON parse error
      }
      return { ok: false, status: response.status, latencyMs, error: errorMsg };
    }

    return { ok: true, status: response.status, latencyMs };
  } catch (err: any) {
    clearTimeout(timeout);
    const latencyMs = Date.now() - start;
    return { ok: false, status: 504, latencyMs, error: err?.message || 'Connection timeout' };
  }
}

// GET /api/providers - list all providers with server-verified connection status
app.get('/api/providers', (req, res) => {
  const providerDefs = [
    {
      id: 'anthropic',
      name: 'Anthropic (Claude)',
      logo: 'A',
      models: ['Claude Sonnet 5.5', 'Claude Opus 5.5', 'Claude Haiku 5.5'],
      enabled: true,
      badge: '30% Faster · Top Coder',
    },
    {
      id: 'openai',
      name: 'OpenAI',
      logo: 'O',
      models: ['GPT-6 Astra', 'GPT-6.1 Sol', 'GPT-6 Luna', 'o3-mini', 'GPT-5.5'],
      enabled: true,
      badge: 'GPT-6 Frontier',
    },
    {
      id: 'gemini',
      name: 'Google Gemini',
      logo: 'G',
      models: ['Gemini 4 Argon', 'Gemini 3.8 Flash', 'Gemini 3.1 Pro', 'Gemini 3.1 Flash-Lite'],
      enabled: true,
      badge: 'Ultra Fast Edge (120ms)',
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      logo: 'D',
      models: ['DeepSeek R1 (Reasoning)', 'DeepSeek V3'],
      enabled: true,
      badge: 'Math & Logic',
    },
    {
      id: 'groq',
      name: 'Groq Cloud',
      logo: 'Q',
      models: ['Llama 3.3 70B Versatile', 'Llama 3.1 8B Instant'],
      enabled: false,
      badge: '500+ tokens/sec',
    },
    {
      id: 'ollama',
      name: 'Local Ollama',
      logo: 'L',
      models: ['Llama 3.2 3B', 'Qwen 2.5 Coder', 'Mistral 7B'],
      enabled: false,
      badge: 'Private & Free',
    },
  ];

  const result = providerDefs.map((p) => {
    const key = providerKey(p.id as ProviderId);
    const verification = providerVerifications[p.id];
    const hasApiKey = Boolean(key);
    const maskedKey = key
      ? key.length > 11
        ? `${key.slice(0, 7)}...${key.slice(-4)}`
        : '***configured***'
      : undefined;

    let status: 'connected' | 'not_configured' | 'error' | 'unreachable' = 'not_configured';
    if (hasApiKey) {
      status = verification?.status || 'connected';
    }

    return {
      ...p,
      hasApiKey,
      maskedKey,
      status,
      testedLatencyMs: verification?.latencyMs ?? null,
      lastVerifiedAt: verification?.lastVerifiedAt ?? null,
    };
  });

  res.json({ providers: result });
});

// POST /api/providers/key - validate with test ping and save encrypted key
app.post('/api/providers/key', requireAdmin, async (req, res) => {
  const { providerId, apiKey } = req.body;
  const pid = String(providerId || '').toLowerCase() as ProviderId;
  if (!['anthropic', 'openai', 'gemini', 'deepseek'].includes(pid)) {
    return res.status(400).json({ error: 'Unsupported provider ID' });
  }
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    return res.status(400).json({ error: 'API key is required' });
  }

  const trimmedKey = apiKey.trim();
  const ping = await pingProvider(pid, trimmedKey);
  const verifiedAt = new Date().toISOString();

  if (!ping.ok) {
    providerVerifications[pid] = {
      status: ping.status === 504 ? 'unreachable' : 'error',
      latencyMs: ping.latencyMs,
      lastVerifiedAt: verifiedAt,
    };
    return res.status(ping.status >= 500 ? 502 : 401).json({
      error: `Validation failed: ${ping.error || 'Authentication error with upstream provider'}`,
      providerId: pid,
      status: ping.status === 504 ? 'unreachable' : 'error',
      latencyMs: ping.latencyMs,
      verifiedAt,
    });
  }

  // Save encrypted secret in SQLite store
  productionStore.setProviderSecret(pid, trimmedKey);
  providerVerifications[pid] = {
    status: 'connected',
    latencyMs: ping.latencyMs,
    lastVerifiedAt: verifiedAt,
  };

  const maskedKey =
    trimmedKey.length > 11
      ? `${trimmedKey.slice(0, 7)}...${trimmedKey.slice(-4)}`
      : '***configured***';

  return res.json({
    providerId: pid,
    status: 'connected',
    hasApiKey: true,
    maskedKey,
    testedLatencyMs: ping.latencyMs,
    lastVerifiedAt: verifiedAt,
  });
});

// DELETE /api/providers/:providerId/key - remove stored direct provider key
app.delete('/api/providers/:providerId/key', requireAdmin, (req, res) => {
  const pid = String(req.params.providerId || '').toLowerCase();
  productionStore.deleteProviderSecret(pid);
  delete providerVerifications[pid];
  return res.json({
    providerId: pid,
    status: 'not_configured',
    hasApiKey: false,
  });
});

// Provider Ping / Latency Check - real ping to provider API
app.post('/api/test-provider', async (req, res) => {
  const { providerId, apiKey } = req.body;
  const pid = String(providerId || '').toLowerCase() as ProviderId;
  const key = apiKey ? String(apiKey).trim() : providerKey(pid);

  if (!key) {
    return res.status(400).json({
      providerId,
      status: 'not_configured',
      latencyMs: null,
      error: `No API key configured for ${providerId}`,
    });
  }

  const ping = await pingProvider(pid, key);
  const verifiedAt = new Date().toISOString();

  if (!ping.ok) {
    providerVerifications[pid] = {
      status: ping.status === 504 ? 'unreachable' : 'error',
      latencyMs: ping.latencyMs,
      lastVerifiedAt: verifiedAt,
    };
    return res.status(ping.status >= 500 ? 502 : 401).json({
      providerId,
      status: ping.status === 504 ? 'unreachable' : 'error',
      statusCode: ping.status,
      latencyMs: ping.latencyMs,
      error: ping.error,
      verifiedAt,
    });
  }

  providerVerifications[pid] = {
    status: 'connected',
    latencyMs: ping.latencyMs,
    lastVerifiedAt: verifiedAt,
  };

  return res.json({
    providerId,
    status: 'connected',
    latencyMs: ping.latencyMs,
    verifiedAt,
  });
});

// ----------------------------------------------------
// OPENAI-COMPATIBLE VIRTUAL PROXY (/v1/chat/completions)
// Allows dropping Entropos directly into any OpenAI SDK or tool
// ----------------------------------------------------
app.get('/v1/models', (req, res) => {
  res.json({
    object: 'list',
    data: [
      { id: 'entropos-auto', object: 'model', owned_by: 'entropos' },
      { id: 'jev-router-auto', object: 'model', owned_by: 'entropos' },
      { id: 'claude-sonnet-5-5', object: 'model', owned_by: 'anthropic' },
      { id: 'gemini-3.8-flash', object: 'model', owned_by: 'google' },
      { id: 'gpt-6-astra', object: 'model', owned_by: 'openai' },
      { id: 'deepseek-r1', object: 'model', owned_by: 'deepseek' },
    ],
  });
});

app.post('/v1/chat/completions', rateLimit('v1', { windowMs: 60_000, max: 120 }), async (req, res) => {
  const startTime = Date.now();
  const state = productionStore.getState();
  // Only workspace keys stored on the server are accepted; a missing key is rejected too.
  if (!productionStore.validateApiKey(bearerToken(req))) {
    return res.status(401).json({
      error: {
        message: 'Missing, invalid or revoked Entropos API key. Create a workspace key in MCP Setup and send it as Authorization: Bearer <key>.',
        type: 'invalid_request_error',
        code: 'invalid_api_key',
      },
    });
  }

  const { messages, model = 'entropos-auto', temperature = 0.7 } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({
      error: { message: 'Messages array is required', type: 'invalid_request_error' },
    });
  }

  const lastUserMessage = [...messages].reverse().find((m: any) => m.role === 'user')?.content || '';
  const systemMessage = messages.find((m: any) => m.role === 'system')?.content;

  // Route intelligently using conversation context
  const conversationContext = messages
    .map((m: any) => `${m.role || 'user'}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '')}`)
    .join('\n');
  const decision = analyzeAndPickModel(conversationContext, state.settings.mode, state.customRules);

  // Dispatch via Multi-Provider Dispatcher with full conversation history
  let dispatchResult;
  try {
    dispatchResult = await dispatcher.dispatch(messages, decision.selectedModel, decision.provider, systemMessage);
  } catch (err: any) {
    if (err instanceof UpstreamUnavailableError) {
      console.warn(`/v1 failed, no provider answered (${err.provider}): ${err.detail}`);
      return res.status(503).json({
        error: { message: err.message, type: 'server_error', code: 'upstream_unavailable' },
      });
    }
    console.error('/v1 failed:', err);
    return res.status(500).json({
      error: { message: 'Routing failed because of an internal error.', type: 'server_error', code: 'internal_error' },
    });
  }

  const durationMs = Date.now() - startTime;
  const costInfo = calculateCostAndSavings(dispatchResult.actualModel, dispatchResult.usage);

  const promptChars = messages.reduce((acc: number, m: any) => acc + (typeof m.content === 'string' ? m.content.length : 0), 0);
  const fallbackPromptTokens = Math.max(10, Math.round(promptChars / 4) + messages.length * 3);
  const fallbackCompletionTokens = Math.max(15, Math.round(dispatchResult.text.length / 4));
  const fallbackTotalTokens = fallbackPromptTokens + fallbackCompletionTokens;

  const actualPromptTokens = costInfo.hasMeasuredUsage ? costInfo.inputTokens : fallbackPromptTokens;
  const actualCompletionTokens = costInfo.hasMeasuredUsage ? costInfo.outputTokens : fallbackCompletionTokens;
  const actualTotalTokens = costInfo.hasMeasuredUsage ? costInfo.totalTokens : fallbackTotalTokens;

  // Record metrics
  const executionRecord = {
    id: 'req_v1_' + Math.random().toString(36).substring(2, 9),
    timestamp: new Date().toISOString(),
    promptSnippet: (lastUserMessage || conversationContext).slice(0, 80),
    fullPrompt: conversationContext,
    selectedModel: dispatchResult.actualModel,
    provider: dispatchResult.actualProvider,
    reason: publicReason(decision),
    speedLatencyMs: durationMs,
    costUsd: costInfo.actualCostUsd,
    baselineCostUsd: costInfo.baselineCostUsd,
    savedUsd: costInfo.savedUsd,
    savedPercentage: costInfo.savedPercentage,
    responseText: dispatchResult.text,
    mode: state.settings.mode,
    isRealAi: true,
    clientOrigin: 'OpenAI SDK (/v1)',
    failoverOccurred: dispatchResult.failoverOccurred || false,
    inputTokens: actualPromptTokens,
    outputTokens: actualCompletionTokens,
    totalTokens: actualTotalTokens,
    hasMeasuredUsage: costInfo.hasMeasuredUsage,
  };
  productionStore.recordExecution(executionRecord);

  // Set enterprise response headers
  res.setHeader('X-Entropos-Selected-Model', dispatchResult.actualModel);
  res.setHeader('X-Entropos-Provider', dispatchResult.actualProvider);
  res.setHeader('X-Entropos-Savings-Usd', costInfo.savedUsd.toFixed(5));
  res.setHeader('X-Entropos-Latency-Ms', durationMs.toString());
  // Backwards compatibility aliases
  res.setHeader('X-Jev-Selected-Model', dispatchResult.actualModel);
  res.setHeader('X-Jev-Provider', dispatchResult.actualProvider);
  res.setHeader('X-Jev-Savings-Usd', costInfo.savedUsd.toFixed(5));

  res.json({
    id: 'chatcmpl-' + Math.random().toString(36).substring(2, 12),
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: dispatchResult.actualModel,
    system_fingerprint: 'fp_entropos_v1',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: dispatchResult.text,
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: actualPromptTokens,
      completion_tokens: actualCompletionTokens,
      total_tokens: actualTotalTokens,
      cost: costInfo.actualCostUsd,
    },
    _entropos_router_meta: {
      provider: dispatchResult.actualProvider,
      reason: publicReason(decision),
      cost_usd: costInfo.actualCostUsd,
      saved_usd: costInfo.savedUsd,
      discount_pct: `${costInfo.savedPercentage}%`,
      failover: dispatchResult.failoverOccurred || false,
    },
    _jev_router_meta: {
      provider: dispatchResult.actualProvider,
      reason: publicReason(decision),
      cost_usd: costInfo.actualCostUsd,
      saved_usd: costInfo.savedUsd,
      discount_pct: `${costInfo.savedPercentage}%`,
      failover: dispatchResult.failoverOccurred || false,
    },
  });
});

function getAnthropicClientKey(req: express.Request): string {
  const xApiKey = String(req.headers['x-api-key'] || '').trim();
  if (xApiKey) return xApiKey;
  return bearerToken(req);
}

// ----------------------------------------------------
// ANTHROPIC-COMPATIBLE VIRTUAL PROXY (/v1/messages, /messages)
// Allows dropping Entropos directly into Anthropic SDK, Claude Code, and Anthropic tooling
// ----------------------------------------------------
const handleAnthropicMessages = async (req: express.Request, res: express.Response) => {
  const startTime = Date.now();
  const state = productionStore.getState();
  const clientKey = getAnthropicClientKey(req);

  if (!productionStore.validateApiKey(clientKey)) {
    return res.status(401).json({
      type: 'error',
      error: {
        type: 'authentication_error',
        message: 'Missing, invalid or revoked Entropos API key. Send a workspace key via x-api-key or Authorization: Bearer <key>.',
      },
    });
  }

  const { messages, model = 'entropos-auto', stream = false } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({
      type: 'error',
      error: {
        type: 'invalid_request_error',
        message: 'messages: array must not be empty',
      },
    });
  }

  let systemPrompt: string | undefined = undefined;
  if (typeof req.body.system === 'string') {
    systemPrompt = req.body.system.trim() || undefined;
  } else if (Array.isArray(req.body.system)) {
    systemPrompt = req.body.system
      .map((b: any) => (typeof b === 'string' ? b : b?.text || ''))
      .filter(Boolean)
      .join('\n')
      .trim() || undefined;
  }

  const conversationContext = messages
    .map((m: any) => `${m.role || 'user'}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '')}`)
    .join('\n');
  const lastUserMessage = [...messages].reverse().find((m: any) => m.role === 'user')?.content;
  const lastUserText = typeof lastUserMessage === 'string' ? lastUserMessage : JSON.stringify(lastUserMessage || '');

  const decision = analyzeAndPickModel(conversationContext, state.settings.mode, state.customRules);

  const isAuto = !model || model === 'entropos-auto' || model === 'auto' || model === 'jev-router-auto';
  let targetModel = decision.selectedModel;
  let targetProvider = decision.provider;
  if (!isAuto) {
    const resolved = resolveModel(model);
    if (resolved) {
      targetModel = resolved.label;
      targetProvider = PROVIDER_NAMES[resolved.provider];
    }
  }

  let dispatchResult;
  try {
    dispatchResult = await dispatcher.dispatch(messages, targetModel, targetProvider, systemPrompt);
  } catch (err: any) {
    if (err instanceof UpstreamUnavailableError) {
      console.warn(`/v1/messages failed, no provider answered (${err.provider}): ${err.detail}`);
      return res.status(503).json({
        type: 'error',
        error: {
          type: 'api_error',
          message: err.message,
        },
      });
    }
    console.error('/v1/messages failed:', err);
    return res.status(500).json({
      type: 'error',
      error: {
        type: 'api_error',
        message: 'Routing failed because of an internal error.',
      },
    });
  }

  const durationMs = Date.now() - startTime;
  const costInfo = calculateCostAndSavings(dispatchResult.actualModel, dispatchResult.usage);

  const promptChars = messages.reduce((acc: number, m: any) => acc + (typeof m.content === 'string' ? m.content.length : 0), 0) + (systemPrompt?.length || 0);
  const fallbackPromptTokens = Math.max(10, Math.round(promptChars / 4) + messages.length * 3);
  const fallbackCompletionTokens = Math.max(15, Math.round(dispatchResult.text.length / 4));
  const fallbackTotalTokens = fallbackPromptTokens + fallbackCompletionTokens;

  const actualPromptTokens = costInfo.hasMeasuredUsage ? costInfo.inputTokens : fallbackPromptTokens;
  const actualCompletionTokens = costInfo.hasMeasuredUsage ? costInfo.outputTokens : fallbackCompletionTokens;
  const actualTotalTokens = costInfo.hasMeasuredUsage ? costInfo.totalTokens : fallbackTotalTokens;

  const executionRecord = {
    id: 'req_msg_' + Math.random().toString(36).substring(2, 9),
    timestamp: new Date().toISOString(),
    promptSnippet: (lastUserText || conversationContext).slice(0, 80),
    fullPrompt: conversationContext,
    selectedModel: dispatchResult.actualModel,
    provider: dispatchResult.actualProvider,
    reason: publicReason(decision),
    speedLatencyMs: durationMs,
    costUsd: costInfo.actualCostUsd,
    baselineCostUsd: costInfo.baselineCostUsd,
    savedUsd: costInfo.savedUsd,
    savedPercentage: costInfo.savedPercentage,
    responseText: dispatchResult.text,
    mode: state.settings.mode,
    isRealAi: true,
    clientOrigin: 'Anthropic SDK (/v1/messages)',
    failoverOccurred: dispatchResult.failoverOccurred || false,
    inputTokens: actualPromptTokens,
    outputTokens: actualCompletionTokens,
    totalTokens: actualTotalTokens,
    hasMeasuredUsage: costInfo.hasMeasuredUsage,
  };
  productionStore.recordExecution(executionRecord);

  res.setHeader('X-Entropos-Selected-Model', dispatchResult.actualModel);
  res.setHeader('X-Entropos-Provider', dispatchResult.actualProvider);
  res.setHeader('X-Entropos-Savings-Usd', costInfo.savedUsd.toFixed(5));
  res.setHeader('X-Entropos-Latency-Ms', durationMs.toString());
  res.setHeader('X-Jev-Selected-Model', dispatchResult.actualModel);
  res.setHeader('X-Jev-Provider', dispatchResult.actualProvider);
  res.setHeader('X-Jev-Savings-Usd', costInfo.savedUsd.toFixed(5));

  const messageId = 'msg_' + Math.random().toString(36).substring(2, 14);

  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // 1. message_start
    res.write(`event: message_start\ndata: ${JSON.stringify({
      type: 'message_start',
      message: {
        id: messageId,
        type: 'message',
        role: 'assistant',
        content: [],
        model: dispatchResult.actualModel,
        stop_reason: null,
        stop_sequence: null,
        usage: {
          input_tokens: actualPromptTokens,
          output_tokens: 1,
        },
      },
    })}\n\n`);

    // 2. content_block_start
    res.write(`event: content_block_start\ndata: ${JSON.stringify({
      type: 'content_block_start',
      index: 0,
      content_block: {
        type: 'text',
        text: '',
      },
    })}\n\n`);

    // 3. content_block_delta
    res.write(`event: content_block_delta\ndata: ${JSON.stringify({
      type: 'content_block_delta',
      index: 0,
      delta: {
        type: 'text_delta',
        text: dispatchResult.text,
      },
    })}\n\n`);

    // 4. content_block_stop
    res.write(`event: content_block_stop\ndata: ${JSON.stringify({
      type: 'content_block_stop',
      index: 0,
    })}\n\n`);

    // 5. message_delta
    res.write(`event: message_delta\ndata: ${JSON.stringify({
      type: 'message_delta',
      delta: {
        stop_reason: 'end_turn',
        stop_sequence: null,
      },
      usage: {
        output_tokens: actualCompletionTokens,
        cost: costInfo.actualCostUsd,
      },
    })}\n\n`);

    // 6. message_stop
    res.write(`event: message_stop\ndata: ${JSON.stringify({
      type: 'message_stop',
    })}\n\n`);

    return res.end();
  }

  return res.json({
    id: messageId,
    type: 'message',
    role: 'assistant',
    model: dispatchResult.actualModel,
    content: [
      {
        type: 'text',
        text: dispatchResult.text,
      },
    ],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: actualPromptTokens,
      output_tokens: actualCompletionTokens,
      cost: costInfo.actualCostUsd,
    },
    _entropos_router_meta: {
      provider: dispatchResult.actualProvider,
      reason: publicReason(decision),
      cost_usd: costInfo.actualCostUsd,
      saved_usd: costInfo.savedUsd,
      discount_pct: `${costInfo.savedPercentage}%`,
      failover: dispatchResult.failoverOccurred || false,
    },
    _jev_router_meta: {
      provider: dispatchResult.actualProvider,
      reason: publicReason(decision),
      cost_usd: costInfo.actualCostUsd,
      saved_usd: costInfo.savedUsd,
      discount_pct: `${costInfo.savedPercentage}%`,
      failover: dispatchResult.failoverOccurred || false,
    },
  });
};

app.post('/v1/messages', rateLimit('v1', { windowMs: 60_000, max: 120 }), handleAnthropicMessages);
app.post('/messages', rateLimit('v1', { windowMs: 60_000, max: 120 }), handleAnthropicMessages);


// ----------------------------------------------------
// PRODUCTION DIAGNOSTICS & SIMULATION ENDPOINTS
// ----------------------------------------------------
app.post('/api/diagnostics/trip-circuit', requireAdmin, (req, res) => {
  const { providerId = 'anthropic' } = req.body;
  productionStore.tripCircuitManually(providerId);
  res.json({
    status: 'tripped',
    providerId,
    message: `Circuit breaker for ${providerId} manually tripped. Next requests to this provider will automatically failover to Google Gemini.`,
    circuitBreakers: productionStore.getState().circuitBreakers,
  });
});

app.post('/api/diagnostics/reset-circuits', requireAdmin, (req, res) => {
  productionStore.resetCircuits();
  res.json({
    status: 'reset',
    message: 'All provider circuit breakers have been reset to closed (nominal).',
    circuitBreakers: productionStore.getState().circuitBreakers,
  });
});

// ----------------------------------------------------
// AUTHENTICATION & WORKSPACE ENDPOINTS (Entropos-ugg.9)
// ----------------------------------------------------

app.post('/api/auth/register', (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email address is required' });
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }
  const cleanName = (typeof name === 'string' && name.trim()) ? name.trim().slice(0, 50) : email.split('@')[0];

  const existing = productionStore.getUserByEmail(email);
  if (existing) {
    return res.status(400).json({ error: 'An account with this email already exists' });
  }

  const { user, workspace } = productionStore.createUser(email, cleanName, 'email', password);
  const token = productionStore.createSession(user.id, workspace.id);
  const subscription = productionStore.getSubscription(workspace.id);

  res.status(201).json({
    token,
    user,
    workspace,
    subscription,
  });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = productionStore.getUserByEmail(email);
  if (!user || !user.passwordHash || !user.salt) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const valid = verifyPassword(password, user.salt, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const workspace = productionStore.getWorkspaceByUserId(user.id) || {
    id: 'ws_default',
    name: `${user.name}'s Workspace`,
    ownerUserId: user.id,
    createdAt: user.createdAt,
  };
  const token = productionStore.createSession(user.id, workspace.id);
  const subscription = productionStore.getSubscription(workspace.id);

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      authProvider: user.authProvider,
      createdAt: user.createdAt,
    },
    workspace,
    subscription,
  });
});

app.post('/api/auth/github', (req, res) => {
  const email = (typeof req.body?.email === 'string' && req.body.email.includes('@'))
    ? req.body.email.trim()
    : 'developer@github.com';
  const name = (typeof req.body?.name === 'string' && req.body.name.trim())
    ? req.body.name.trim()
    : 'GitHub Developer';

  let user = productionStore.getUserByEmail(email);
  let workspace;
  if (!user) {
    const created = productionStore.createUser(email, name, 'github');
    user = created.user;
    workspace = created.workspace;
  } else {
    workspace = productionStore.getWorkspaceByUserId(user.id) || {
      id: 'ws_default',
      name: `${user.name}'s Workspace`,
      ownerUserId: user.id,
      createdAt: user.createdAt,
    };
  }

  const token = productionStore.createSession(user.id, workspace.id);
  const subscription = productionStore.getSubscription(workspace.id);

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      authProvider: user.authProvider,
      createdAt: user.createdAt,
    },
    workspace,
    subscription,
  });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const user = (req as any).user;
  const workspace = (req as any).workspace;
  const workspaceId = (req as any).workspaceId || 'ws_default';
  const subscription = productionStore.getSubscription(workspaceId);

  res.json({
    user: user || { id: 'usr_admin', email: 'admin@entropos.ai', name: 'Admin', authProvider: 'email', createdAt: new Date().toISOString() },
    workspace: workspace || { id: workspaceId, name: 'Default Workspace', ownerUserId: 'usr_admin', createdAt: new Date().toISOString() },
    subscription,
  });
});

app.post('/api/auth/logout', (req, res) => {
  const token = readToken(req);
  if (token) {
    productionStore.deleteSession(token);
  }
  res.json({ ok: true, message: 'Logged out successfully' });
});

// ----------------------------------------------------
// WORKSPACE KEYS & BILLING ENDPOINTS (Workspace scoped)
// ----------------------------------------------------

// Listings never include the key itself; the full value is in the POST response only.
app.get('/api/keys', requireAuth, (req, res) => {
  const wsId = (req as any).workspaceId || 'ws_default';
  res.json({ keys: productionStore.getPublicApiKeys(wsId) });
});

app.post('/api/keys', requireAuth, (req, res) => {
  const name = typeof req.body?.name === 'string' && req.body.name.trim() ? req.body.name.trim().slice(0, 80) : 'Workspace Token';
  const clientName = typeof req.body?.clientName === 'string' && req.body.clientName ? req.body.clientName.slice(0, 40) : 'custom_client';
  const wsId = (req as any).workspaceId || 'ws_default';
  const created = productionStore.createApiKey(name, clientName, wsId);
  res.status(201).json({ ...created, last4: created.key.slice(-4) });
});

app.get('/api/history', requireAuth, (req, res) => {
  const result = productionStore.getFilteredLogs({
    page: req.query.page ? Number(req.query.page) : undefined,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
    mode: typeof req.query.mode === 'string' ? req.query.mode : undefined,
    model: typeof req.query.model === 'string' ? req.query.model : undefined,
    search: typeof req.query.search === 'string' ? req.query.search : undefined,
  });
  res.json(result);
});

app.get('/api/history/export', requireAuth, (req, res) => {
  const format = req.query.format === 'csv' ? 'csv' : 'json';
  const logs = productionStore.getLogs();

  if (format === 'csv') {
    const header = ['id', 'timestamp', 'selectedModel', 'provider', 'mode', 'latencyMs', 'costUsd', 'savedUsd', 'savedPercentage', 'clientOrigin', 'promptSnippet'];
    const escapeCsv = (v: any) => {
      const str = String(v ?? '').replace(/"/g, '""');
      return `"${str}"`;
    };
    const rows = logs.map((l) => [
      escapeCsv(l.id),
      escapeCsv(l.timestamp),
      escapeCsv(l.selectedModel),
      escapeCsv(l.provider),
      escapeCsv(l.mode || 'balanced'),
      escapeCsv(l.speedLatencyMs),
      escapeCsv(l.costUsd?.toFixed(5) || '0.00000'),
      escapeCsv(l.savedUsd?.toFixed(5) || '0.00000'),
      escapeCsv(l.savedPercentage || 0),
      escapeCsv(l.clientOrigin || 'client'),
      escapeCsv(l.promptSnippet || ''),
    ].join(','));

    const csvContent = [header.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="entropos_activity_${Date.now()}.csv"`);
    return res.send(csvContent);
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="entropos_activity_${Date.now()}.json"`);
  res.json({ logs });
});

app.get('/api/analytics/summary', requireAuth, (req, res) => {
  const days = req.query.days === '7' ? 7 : 30;
  const refModel = typeof req.query.referenceModel === 'string' ? req.query.referenceModel : 'claude-sonnet-5-5';
  const summary = getAnalyticsSummary(days, refModel);
  res.json({
    ...summary,
    availableReferenceModels: AVAILABLE_REFERENCE_MODELS,
  });
});

app.get('/api/subscription', (req, res) => {
  const token = readToken(req);
  const session = token ? productionStore.getSession(token) : null;
  const wsId = session?.workspace?.id || (req as any).workspaceId || 'ws_default';
  const sub = productionStore.getSubscription(wsId);
  const state = productionStore.getState();
  res.json({
    ...sub,
    usedThisMonth: state.usageTotals.totalRequests,
    totalSavedUsd: Number(state.usageTotals.totalSavedUsd.toFixed(2)),
  });
});

app.post('/api/subscription/upgrade', requireAuth, (req, res) => {
  const { planId, paymentMethod } = req.body;
  if (!planId || !['developer', 'pro', 'enterprise'].includes(planId)) {
    return res.status(400).json({ error: 'Invalid planId. Must be developer, pro, or enterprise.' });
  }
  if (planId !== 'developer') {
    return res.status(402).json({
      error: 'Entropos opera actualmente en Modo Beta para Desarrolladores. La suscripción de pago alojada en la nube (Stripe Checkout) está en preparación.',
      code: 'BILLING_ROADMAP_ONLY',
    });
  }
  const wsId = (req as any).workspaceId || 'ws_default';
  const updated = productionStore.updateSubscription(planId, paymentMethod, wsId);
  res.json({
    success: true,
    message: `Successfully updated to ${updated.planName} plan!`,
    subscription: updated,
  });
});

app.post('/api/subscription/cancel', requireAuth, (req, res) => {
  const wsId = (req as any).workspaceId || 'ws_default';
  const canceled = productionStore.cancelSubscription(wsId);
  res.json({
    success: true,
    message: 'Subscription marked as canceled at period end.',
    subscription: canceled,
  });
});

// ----------------------------------------------------
// GLOBAL JSON ERROR HANDLER
// ----------------------------------------------------
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const reqId = (req as any).reqId || 'unknown';
  const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.NODE_TEST_CONTEXT) || process.argv.includes('--test');
  if (!isTest) {
    console.error(
      JSON.stringify({
        level: 'error',
        timestamp: new Date().toISOString(),
        reqId,
        error: err?.message || 'Internal server error',
        stack: process.env.NODE_ENV === 'production' ? undefined : err?.stack,
      })
    );
  }
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({
    error: {
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : (err?.message || 'Internal server error'),
      code: err.code || 'internal_server_error',
      type: 'api_error',
    },
  });
});

// ----------------------------------------------------
// VITE / STATIC WEB SERVER
// ----------------------------------------------------
export async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  return app.listen(PORT, () => {
    console.log(`Entropos Server running on port ${PORT}`);
  });
}

const isTestRunner =
  process.env.NODE_ENV === 'test' ||
  process.argv.includes('--test') ||
  process.execArgv.includes('--test') ||
  Boolean(process.env.NODE_TEST_CONTEXT);

const isDirectRun =
  Boolean(process.argv[1]) &&
  (/server\.[jt]s$/i.test(process.argv[1]) || path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url)));

if (isDirectRun && !isTestRunner) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
  });
}
