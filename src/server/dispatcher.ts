import { GoogleGenAI } from '@google/genai';
import { productionStore } from './storage';
import { FALLBACK_MODEL, PROVIDER_NAMES, providerKey, resolveModel, type CatalogEntry } from './modelCatalog';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface DispatchResult {
  text: string;
  actualModel: string;
  actualProvider: string;
  durationMs: number;
  failoverOccurred: boolean;
  failoverReason?: string;
  usage?: TokenUsage;
}

// Ningun proveedor pudo responder: el endpoint devuelve un error real, nunca un texto inventado.
export class UpstreamUnavailableError extends Error {
  provider: string;
  detail: string;

  constructor(provider: string, detail: string) {
    super('No model provider could answer this request. Configure a provider API key on the server or try again later.');
    this.name = 'UpstreamUnavailableError';
    this.provider = provider;
    this.detail = detail;
  }
}

const geminiClients = new Map<string, GoogleGenAI>();

// Gemini client for the configured key (environment or store), or null when there is none.
export function getGeminiClient(): GoogleGenAI | null {
  const apiKey = providerKey('gemini');
  if (!apiKey) return null;
  let client = geminiClients.get(apiKey);
  if (!client) {
    client = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
    geminiClients.set(apiKey, client);
  }
  return client;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type DispatchInput = string | ChatMessage[];

function extractTextContent(content: any): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && typeof part.text === 'string') return part.text;
        return '';
      })
      .join('');
  }
  return content ? String(content) : '';
}

export function normalizeMessages(input: DispatchInput, systemInstruction?: string): ChatMessage[] {
  const result: ChatMessage[] = [];

  if (typeof input === 'string') {
    if (systemInstruction?.trim()) {
      result.push({ role: 'system', content: systemInstruction.trim() });
    }
    result.push({ role: 'user', content: input });
    return result;
  }

  if (Array.isArray(input)) {
    if (systemInstruction?.trim() && !input.some((m) => m && m.role === 'system')) {
      result.push({ role: 'system', content: systemInstruction.trim() });
    }
    for (const m of input) {
      if (!m) continue;
      const text = extractTextContent(m.content);
      const role =
        m.role === 'assistant'
          ? 'assistant'
          : m.role === 'system' || (m.role as any) === 'developer'
            ? 'system'
            : 'user';
      result.push({ role, content: text });
    }
    return result.length > 0 ? result : [{ role: 'user', content: '' }];
  }

  return [{ role: 'user', content: '' }];
}

export class MultiProviderDispatcher {
  public async dispatch(
    input: DispatchInput,
    targetModel: string,
    targetProvider: string,
    systemInstruction?: string
  ): Promise<DispatchResult> {
    const start = Date.now();
    const messages = normalizeMessages(input, systemInstruction);
    const entry = resolveModel(targetModel);
    let reason: string;

    if (!entry) {
      reason = `${targetModel} has no API model configured`;
    } else if (!providerKey(entry.provider)) {
      // Not configured is not a failure: the circuit breaker stays untouched.
      reason = `${PROVIDER_NAMES[entry.provider]} has no API key configured`;
    } else if (!productionStore.isCircuitAvailable(entry.provider)) {
      reason = `Circuit breaker open for ${PROVIDER_NAMES[entry.provider]} (consecutive failures)`;
    } else {
      try {
        const { text, usage } = await this.call(entry, messages);
        productionStore.recordCircuitSuccess(entry.provider);
        return {
          text,
          actualModel: entry.label,
          actualProvider: PROVIDER_NAMES[entry.provider],
          durationMs: Date.now() - start,
          failoverOccurred: false,
          usage,
        };
      } catch (err: any) {
        console.warn(`Provider call failed for ${entry.label}:`, err?.message);
        productionStore.recordCircuitFailure(entry.provider);
        reason = `${entry.label} returned an error (${err?.message || 'timeout'})`;
      }
    }

    // Fallback: answered by another real model and flagged as failover, never reported as the chosen one.
    const fallbackCandidates = [FALLBACK_MODEL, 'GPT-6 Astra', 'Claude Sonnet 5.5', 'DeepSeek R1'];
    for (const fbName of fallbackCandidates) {
      const fallback = resolveModel(fbName);
      const sameModel = fallback && entry && fallback.provider === entry.provider && fallback.apiModel === entry.apiModel;
      if (!fallback || sameModel || !providerKey(fallback.provider) || !productionStore.isCircuitAvailable(fallback.provider)) {
        continue;
      }

      try {
        const { text, usage } = await this.call(fallback, messages);
        productionStore.recordCircuitSuccess(fallback.provider);
        return {
          text,
          actualModel: fallback.label,
          actualProvider: PROVIDER_NAMES[fallback.provider],
          durationMs: Date.now() - start,
          failoverOccurred: true,
          failoverReason: `${reason}. Rerouted to ${fallback.label}.`,
          usage,
        };
      } catch (fbErr: any) {
        console.warn(`Fallback ${fallback.label} also failed:`, fbErr?.message);
        productionStore.recordCircuitFailure(fallback.provider);
        reason = `${reason}; fallback ${fallback.label} also failed (${fbErr?.message || 'timeout'})`;
      }
    }

    throw new UpstreamUnavailableError(entry ? PROVIDER_NAMES[entry.provider] : targetProvider, reason);
  }

  private async call(
    entry: CatalogEntry,
    messages: ChatMessage[]
  ): Promise<{ text: string; usage?: TokenUsage }> {
    const apiKey = providerKey(entry.provider) as string;
    let result: { text: string; usage?: TokenUsage };
    switch (entry.provider) {
      case 'gemini':
        result = await this.callGemini(entry.apiModel, messages);
        break;
      case 'anthropic':
        result = await this.callAnthropic(apiKey, entry.apiModel, messages);
        break;
      case 'openai':
        result = await this.callOpenAICompatible('https://api.openai.com/v1/chat/completions', 'OpenAI', 12000, apiKey, entry.apiModel, messages);
        break;
      case 'deepseek':
        result = await this.callOpenAICompatible('https://api.deepseek.com/chat/completions', 'DeepSeek', 15000, apiKey, entry.apiModel, messages);
        break;
    }
    // An empty answer is not an answer: it must not be recorded as a successful (and saving) request.
    if (!result.text) throw new Error(`${entry.label} returned no text`);
    return result;
  }

  private async callGemini(
    model: string,
    messages: ChatMessage[]
  ): Promise<{ text: string; usage?: TokenUsage }> {
    const client = getGeminiClient();
    if (!client) throw new Error('No Gemini API key configured');

    const systemParts = messages.filter((m) => m.role === 'system').map((m) => m.content);
    const systemInstruction = systemParts.length > 0 ? systemParts.join('\n\n') : undefined;

    const conversation = messages.filter((m) => m.role !== 'system');
    const merged: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

    for (const msg of conversation) {
      const role: 'user' | 'model' = msg.role === 'assistant' ? 'model' : 'user';
      if (merged.length > 0 && merged[merged.length - 1].role === role) {
        merged[merged.length - 1].parts[0].text += '\n\n' + msg.content;
      } else {
        merged.push({ role, parts: [{ text: msg.content }] });
      }
    }

    if (merged.length === 0) {
      merged.push({ role: 'user', parts: [{ text: '' }] });
    } else if (merged[0].role !== 'user') {
      merged.unshift({ role: 'user', parts: [{ text: '' }] });
    }

    const response = await client.models.generateContent({
      model,
      contents: merged,
      config: systemInstruction ? { systemInstruction } : undefined,
    });
    const text = response.text || '';
    const meta = response.usageMetadata;
    const inputTokens = meta?.promptTokenCount ?? 0;
    const outputTokens = (meta?.candidatesTokenCount ?? 0) + (meta?.thoughtsTokenCount ?? 0);
    const usage: TokenUsage | undefined =
      meta && (inputTokens > 0 || outputTokens > 0)
        ? {
            inputTokens,
            outputTokens,
            totalTokens: meta?.totalTokenCount ?? inputTokens + outputTokens,
          }
        : undefined;

    return { text, usage };
  }

  private async callAnthropic(
    apiKey: string,
    model: string,
    messages: ChatMessage[]
  ): Promise<{ text: string; usage?: TokenUsage }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const systemParts = messages.filter((m) => m.role === 'system').map((m) => m.content);
    const system = systemParts.length > 0 ? systemParts.join('\n\n') : undefined;

    const conversation = messages.filter((m) => m.role !== 'system');
    const merged: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    for (const msg of conversation) {
      const role: 'user' | 'assistant' = msg.role === 'assistant' ? 'assistant' : 'user';
      if (merged.length > 0 && merged[merged.length - 1].role === role) {
        merged[merged.length - 1].content += '\n\n' + msg.content;
      } else {
        merged.push({ role, content: msg.content });
      }
    }

    if (merged.length === 0) {
      merged.push({ role: 'user', content: '' });
    } else if (merged[0].role !== 'user') {
      merged.unshift({ role: 'user', content: '' });
    }

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 2048,
          system,
          messages: merged,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Anthropic HTTP error ${res.status}`);
      }

      const data = await res.json();
      if (data?.stop_reason === 'refusal') {
        throw new Error('Anthropic refused the request');
      }
      // Current Claude models may open with a thinking block: keep only the text blocks.
      const blocks: any[] = Array.isArray(data?.content) ? data.content : [];
      const text = blocks
        .filter((b) => b?.type === 'text')
        .map((b) => b.text)
        .join('');
      const inputTokens = typeof data?.usage?.input_tokens === 'number' ? data.usage.input_tokens : 0;
      const outputTokens = typeof data?.usage?.output_tokens === 'number' ? data.usage.output_tokens : 0;
      const usage: TokenUsage | undefined =
        inputTokens > 0 || outputTokens > 0
          ? {
              inputTokens,
              outputTokens,
              totalTokens: inputTokens + outputTokens,
            }
          : undefined;

      return { text, usage };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async callOpenAICompatible(
    url: string,
    providerName: string,
    timeoutMs: number,
    apiKey: string,
    model: string,
    messages: ChatMessage[]
  ): Promise<{ text: string; usage?: TokenUsage }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`${providerName} HTTP error ${res.status}`);
      }

      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content || '';
      const inputTokens = typeof data?.usage?.prompt_tokens === 'number' ? data.usage.prompt_tokens : 0;
      const outputTokens = typeof data?.usage?.completion_tokens === 'number' ? data.usage.completion_tokens : 0;
      const usage: TokenUsage | undefined =
        inputTokens > 0 || outputTokens > 0
          ? {
              inputTokens,
              outputTokens,
              totalTokens:
                typeof data?.usage?.total_tokens === 'number'
                  ? data.usage.total_tokens
                  : inputTokens + outputTokens,
            }
          : undefined;

      return { text, usage };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const dispatcher = new MultiProviderDispatcher();
