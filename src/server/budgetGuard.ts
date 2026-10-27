import type { NextFunction, Request, Response } from 'express';
import { bearerToken } from './guards';
import { productionStore } from './storage';

/**
 * Monthly budget cap enforcement (settings.monthlyBudgetCapUsd).
 *
 * Spend is the sum of `costUsd` already recorded in route telemetry since the first
 * instant of the current calendar month (UTC). The month boundary is the reset: on the
 * 1st at 00:00 UTC the sum starts again from zero without any stored counter to clear.
 *
 * A cap that is not a finite number greater than zero disables enforcement.
 * Requests are refused with HTTP 429 once spend >= cap; from ALERT_THRESHOLD of the cap
 * onwards, allowed requests carry an X-Entropos-Budget-Warning header.
 */

export const ALERT_THRESHOLD = 0.8;

export interface BudgetStatus {
  capUsd: number;
  spentUsd: number;
  periodStart: string;
  resetsAt: string;
  exceeded: boolean;
  alert: boolean;
  usedPct: number;
}

export interface BudgetSource {
  getSettings(): { monthlyBudgetCapUsd: number };
  getCostSince(fromIso: string, toIso?: string): number;
  validateApiKey(token: string): boolean;
}

export function monthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function nextMonthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

const round6 = (n: number) => Number(n.toFixed(6));

/** Returns null when no cap is enforced. */
export function evaluateBudget(source: BudgetSource, now: Date = new Date()): BudgetStatus | null {
  const cap = Number(source.getSettings().monthlyBudgetCapUsd);
  if (!Number.isFinite(cap) || cap <= 0) return null;
  const start = monthStartUtc(now);
  const end = nextMonthStartUtc(now);
  const spent = round6(source.getCostSince(start.toISOString(), end.toISOString()));
  return {
    capUsd: cap,
    spentUsd: spent,
    periodStart: start.toISOString(),
    resetsAt: end.toISOString(),
    exceeded: spent >= cap,
    alert: spent >= cap * ALERT_THRESHOLD,
    usedPct: Math.round((spent / cap) * 1000) / 10,
  };
}

function exceededMessage(s: BudgetStatus): string {
  return `Monthly budget cap reached: $${s.spentUsd.toFixed(4)} spent of the $${s.capUsd.toFixed(2)} cap. Requests resume at ${s.resetsAt} or when monthlyBudgetCapUsd is raised.`;
}

function budgetFields(s: BudgetStatus) {
  return {
    monthly_budget_cap_usd: s.capUsd,
    spent_usd: s.spentUsd,
    period_start: s.periodStart,
    resets_at: s.resetsAt,
  };
}

type Protocol = 'openai' | 'anthropic' | 'mcp';

function reject(res: Response, protocol: Protocol, s: BudgetStatus, mcpId: unknown) {
  const retryAfter = Math.max(1, Math.ceil((Date.parse(s.resetsAt) - Date.now()) / 1000));
  res.setHeader('Retry-After', String(retryAfter));
  const message = exceededMessage(s);
  if (protocol === 'anthropic') {
    return res.status(429).json({
      type: 'error',
      error: { type: 'rate_limit_error', code: 'monthly_budget_exceeded', message, ...budgetFields(s) },
    });
  }
  if (protocol === 'mcp') {
    return res.status(429).json({
      jsonrpc: '2.0',
      id: mcpId ?? null,
      error: { code: -32029, message, data: { code: 'monthly_budget_exceeded', ...budgetFields(s) } },
    });
  }
  return res.status(429).json({
    error: { type: 'insufficient_quota', code: 'monthly_budget_exceeded', message, ...budgetFields(s) },
  });
}

function clientKey(req: Request): string {
  const xApiKey = String(req.headers['x-api-key'] || '').trim();
  return xApiKey || bearerToken(req);
}

/**
 * Express middleware factory. Mount it after the rate limiter and before the handler.
 * Unauthenticated requests are passed through untouched so the handler answers 401
 * and the spend figures are never disclosed to callers without a workspace key.
 * For MCP only `tools/call` of `smart_generate` (the tool that spends) is gated.
 */
export function monthlyBudgetGuard(protocol: Protocol, source: BudgetSource = productionStore, clock: () => Date = () => new Date()) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!source.validateApiKey(clientKey(req))) return next();
    if (protocol === 'mcp') {
      const body = req.body;
      if (body?.method !== 'tools/call' || body?.params?.name !== 'smart_generate') return next();
    }
    let status: BudgetStatus | null;
    try {
      status = evaluateBudget(source, clock());
    } catch (err) {
      // Fail open: a telemetry read error must not take the gateway down, but say so.
      console.error('budget guard could not read spend, allowing request:', err);
      return next();
    }
    if (!status) return next();
    if (status.exceeded) return reject(res, protocol, status, req.body?.id);
    if (status.alert) {
      res.setHeader(
        'X-Entropos-Budget-Warning',
        `${status.usedPct}% of the $${status.capUsd.toFixed(2)} monthly cap used ($${status.spentUsd.toFixed(4)})`
      );
    }
    next();
  };
}
