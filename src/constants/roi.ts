export const ROI_CONSTANTS = {
  // Frontier benchmark baseline: $14.00 per million tokens (Frontier LLM blended rate)
  FRONTIER_BASELINE_USD_PER_M: 14.0,
  // Entropos blended execution cost: $2.52 per million tokens
  ENTROPOS_BLENDED_USD_PER_M: 2.52,
  // Projected cost reduction: (14.00 - 2.52) / 14.00 = 82%
  PROJECTED_SAVINGS_PCT: 82,
  PROJECTED_SAVINGS_LABEL: '82% proyectado',
  // Local proxy classification decision latency target
  LOCAL_DECISION_OVERHEAD_MS: 5,
} as const;

export interface RoiCalculationResult {
  baselineMonthly: number;
  entroposMonthly: number;
  monthlySavings: number;
  annualSavings: number;
  savingsPct: number;
}

export function calculateRoi(
  tokensMillions: number,
  baselineRateUsdPerM: number = ROI_CONSTANTS.FRONTIER_BASELINE_USD_PER_M
): RoiCalculationResult {
  const safeTokens = Math.max(0, tokensMillions || 0);
  const baselineMonthly = Math.round(safeTokens * baselineRateUsdPerM);
  const entroposMonthly = Math.round(safeTokens * ROI_CONSTANTS.ENTROPOS_BLENDED_USD_PER_M);
  const monthlySavings = baselineMonthly - entroposMonthly;
  const annualSavings = monthlySavings * 12;
  const savingsPct = baselineMonthly > 0 ? Math.round((monthlySavings / baselineMonthly) * 100) : ROI_CONSTANTS.PROJECTED_SAVINGS_PCT;

  return {
    baselineMonthly,
    entroposMonthly,
    monthlySavings,
    annualSavings,
    savingsPct,
  };
}
