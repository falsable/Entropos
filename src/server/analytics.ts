import { productionStore } from './storage';
import {
  AnalyticsSummary,
  ReferenceModelConfig,
  DailyAnalyticsPoint,
  TopModelAnalytics,
} from '../types/router';

import { AVAILABLE_REFERENCE_MODELS } from '../constants/referenceModels';
export { AVAILABLE_REFERENCE_MODELS };

export function getAnalyticsSummary(
  days: number = 30,
  referenceModelId: string = 'claude-sonnet-5-5'
): AnalyticsSummary {
  const effectiveDays = days === 7 ? 7 : 30;
  const cutoffMs = Date.now() - effectiveDays * 24 * 60 * 60 * 1000;
  const cutoffIso = new Date(cutoffMs).toISOString();

  // Find reference model configuration
  const refConfig =
    AVAILABLE_REFERENCE_MODELS.find((m) => m.id === referenceModelId) ||
    AVAILABLE_REFERENCE_MODELS[0];

  const logs = productionStore.getLogsSince(cutoffIso);

  // Initialize continuous daily bucket list for the period
  const dailyMap = new Map<string, DailyAnalyticsPoint>();
  for (let i = effectiveDays - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().slice(0, 10);
    dailyMap.set(dateStr, {
      date: dateStr,
      requests: 0,
      actualCostUsd: 0,
      referenceCostUsd: 0,
      savedUsd: 0,
    });
  }

  const modelStatsMap = new Map<
    string,
    { model: string; provider: string; requests: number; actualCostUsd: number; savedUsd: number }
  >();

  let totalRequests = 0;
  let totalActualCostUsd = 0;
  let totalReferenceCostUsd = 0;
  let totalSavedUsd = 0;

  for (const log of logs) {
    totalRequests += 1;

    // Tokens
    const inputTokens =
      (log as any).inputTokens ?? Math.max(10, Math.round(((log as any).totalTokens || 100) * 0.75));
    const outputTokens =
      (log as any).outputTokens ?? Math.max(10, Math.round(((log as any).totalTokens || 100) * 0.25));

    // Calculate baseline cost against chosen reference model
    const refCost = Number(
      ((inputTokens / 1_000_000) * refConfig.inputPerM +
        (outputTokens / 1_000_000) * refConfig.outputPerM).toFixed(5)
    );
    const actualCost = Number((log.costUsd || 0).toFixed(5));
    const saved = Number(Math.max(0, refCost - actualCost).toFixed(5));

    totalActualCostUsd += actualCost;
    totalReferenceCostUsd += refCost;
    totalSavedUsd += saved;

    const dateStr = log.timestamp.slice(0, 10);
    const dayEntry = dailyMap.get(dateStr) || {
      date: dateStr,
      requests: 0,
      actualCostUsd: 0,
      referenceCostUsd: 0,
      savedUsd: 0,
    };
    dayEntry.requests += 1;
    dayEntry.actualCostUsd = Number((dayEntry.actualCostUsd + actualCost).toFixed(5));
    dayEntry.referenceCostUsd = Number((dayEntry.referenceCostUsd + refCost).toFixed(5));
    dayEntry.savedUsd = Number((dayEntry.savedUsd + saved).toFixed(5));
    dailyMap.set(dateStr, dayEntry);

    // Group by model
    const modelKey = log.selectedModel || 'Unknown';
    const modelEntry = modelStatsMap.get(modelKey) || {
      model: modelKey,
      provider: log.provider || 'Provider',
      requests: 0,
      actualCostUsd: 0,
      savedUsd: 0,
    };
    modelEntry.requests += 1;
    modelEntry.actualCostUsd = Number((modelEntry.actualCostUsd + actualCost).toFixed(5));
    modelEntry.savedUsd = Number((modelEntry.savedUsd + saved).toFixed(5));
    modelStatsMap.set(modelKey, modelEntry);
  }

  const daily = Array.from(dailyMap.values());
  const topModels: TopModelAnalytics[] = Array.from(modelStatsMap.values())
    .sort((a, b) => b.requests - a.requests)
    .map((m) => ({
      ...m,
      percentageOfTraffic:
        totalRequests > 0 ? Number(((m.requests / totalRequests) * 100).toFixed(1)) : 0,
    }));

  const savingsPercentage =
    totalReferenceCostUsd > 0
      ? Number(((totalSavedUsd / totalReferenceCostUsd) * 100).toFixed(1))
      : 0;

  return {
    periodDays: effectiveDays,
    referenceModel: refConfig,
    totals: {
      totalRequests,
      actualCostUsd: Number(totalActualCostUsd.toFixed(4)),
      referenceCostUsd: Number(totalReferenceCostUsd.toFixed(4)),
      savedUsd: Number(totalSavedUsd.toFixed(4)),
      savingsPercentage,
    },
    daily,
    topModels,
    provenance: {
      source: 'SQLite route_logs (WAL storage)',
      retentionMode: productionStore.getRetentionPolicy(),
      calculatedAt: new Date().toISOString(),
    },
  };
}
