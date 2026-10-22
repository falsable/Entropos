import React, { useState } from 'react';
import {
  Check,
  Sparkles,
  CreditCard,
  ShieldCheck,
  TrendingDown,
  Calendar,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { SubscriptionPlanId, SubscriptionState } from '../types/router';
import { errorMessage, fetchJson } from '../lib/api';
import { PLANS_LIST } from '../constants/plans';
import { calculateRoi, ROI_CONSTANTS } from '../constants/roi';

interface PricingRoiProps {
  subscription: SubscriptionState;
  onOpenCheckout: (planId: SubscriptionPlanId) => void;
  onRefreshSubscription: () => void;
}

export const PricingRoi: React.FC<PricingRoiProps> = ({
  subscription,
  onOpenCheckout,
  onRefreshSubscription,
}) => {
  const [tokensMillions, setTokensMillions] = useState<number>(20);
  const [currentCostPerM, setCurrentCostPerM] = useState<number>(ROI_CONSTANTS.FRONTIER_BASELINE_USD_PER_M);
  const [canceling, setCanceling] = useState(false);
  const [cancelNotice, setCancelNotice] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const { baselineMonthly, entroposMonthly, monthlySavings, annualSavings, savingsPct } = calculateRoi(
    tokensMillions,
    currentCostPerM
  );

  const plans = PLANS_LIST.map((p) => {
    const isCurrent = subscription.planId === p.id;
    let buttonText = p.buttonText;
    if (isCurrent) {
      buttonText = 'Plan Activo';
    } else if (p.id === 'developer') {
      buttonText = 'Seleccionar Developer';
    } else {
      buttonText = `Lista de Espera (${p.name} Próximamente)`;
    }
    return {
      id: p.id,
      name: p.name,
      audience: p.tagline,
      price: p.priceDisplay,
      period: p.periodDisplay,
      features: p.features,
      buttonText,
      isPopular: p.isPopular,
    };
  });

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel your paid subscription? Your quota will remain until the end of the billing period.')) {
      return;
    }
    setCanceling(true);
    setCancelError(null);
    try {
      await fetchJson('/api/subscription/cancel', { method: 'POST' });
      setCancelNotice('Subscription set to cancel at end of billing cycle.');
      onRefreshSubscription();
    } catch (err) {
      setCancelError(`Cancellation failed: ${errorMessage(err)} Your subscription is unchanged; try again.`);
    } finally {
      setCanceling(false);
    }
  };

  const usagePercent = Math.min(
    100,
    Math.round((subscription.usedThisMonth / (subscription.monthlyQuota || 1)) * 100)
  );

  return (
    <div className="space-y-8">
      {/* Active Subscription Status Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase font-mono tracking-wider text-slate-400">
                Workspace Subscription
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
                  subscription.status === 'active'
                    ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
                    : 'bg-amber-950/80 text-amber-400 border border-amber-800/60'
                }`}
              >
                {subscription.status}
              </span>
              {subscription.planId === 'pro' && (
                <span className="px-2 py-0.5 rounded bg-indigo-950/80 text-indigo-300 border border-indigo-800/60 text-[10px] font-mono">
                  Pro Activated
                </span>
              )}
            </div>

            <div className="flex items-baseline gap-2">
              <h2 className="text-2xl font-bold text-white">{subscription.planName} Tier</h2>
              <span className="text-xs text-slate-400 font-mono">
                {subscription.monthlyQuota >= 10000000
                  ? 'Unlimited routing volume'
                  : `${subscription.monthlyQuota.toLocaleString()} queries / month quota`}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-slate-400 pt-1">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <span>Next renewal: {subscription.currentPeriodEnd}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-slate-500" />
                <span>
                  {subscription.paymentMethod
                    ? `${subscription.paymentMethod.brand} •••• ${subscription.paymentMethod.last4}`
                    : 'No payment method'}
                </span>
              </span>
            </div>
          </div>

          {/* Quota Progress Meter */}
          <div className="w-full md:w-64 space-y-2 p-3 bg-slate-950/80 rounded-xl border border-slate-800">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-400">Monthly Usage:</span>
              <span className="text-white font-bold tabular-nums">
                {subscription.usedThisMonth.toLocaleString()} /{' '}
                {subscription.monthlyQuota >= 10000000 ? '∞' : subscription.monthlyQuota.toLocaleString()}
              </span>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 rounded-full transition-all duration-500"
                style={{ width: `${Math.max(2, usagePercent)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] font-mono text-slate-500">
              <span>{usagePercent}% utilized</span>
              <span className="text-emerald-400">Zero throttles</span>
            </div>
          </div>
        </div>

        {cancelNotice && (
          <div className="mt-4 p-3 bg-amber-950/60 border border-amber-800/80 rounded-lg text-xs text-amber-300 font-mono flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{cancelNotice}</span>
          </div>
        )}

        {cancelError && (
          <div role="alert" className="mt-4 bg-red-950/40 border border-red-800/60 text-red-200 text-xs rounded-lg p-3">
            {cancelError}
          </div>
        )}

        {subscription.planId !== 'developer' && subscription.status === 'active' && !cancelNotice && (
          <div className="mt-4 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono">
            <span className="text-slate-500">Need to modify your billing or corporate invoice?</span>
            <button
              onClick={handleCancel}
              disabled={canceling}
              className="text-slate-400 hover:text-red-400 transition-colors cursor-pointer"
            >
              {canceling ? 'Canceling...' : 'Cancel subscription'}
            </button>
          </div>
        )}
      </div>

      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Plans & Return on Investment
        </h1>
        <p className="text-sm text-slate-400 mt-1 max-w-2xl leading-relaxed">
          Transparent pricing designed to pay for itself immediately through automated token offloading.
        </p>
      </div>

      {/* ROI Calculator Strip */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-sm font-semibold text-white">
              Estimated Token Savings Calculator
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Simulate your monthly bill reduction when routing non-critical prompts away from expensive frontier models.
            </p>
          </div>

          <div className="text-xs font-mono text-emerald-400 font-semibold">
            Average TCO Reduction: <span className="tabular-nums font-bold">~{savingsPct}%</span>
          </div>
        </div>

        {/* Sliders */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2 text-xs font-mono">
            <div className="flex justify-between text-slate-300">
              <span>Monthly Token Consumption:</span>
              <span className="text-white font-bold tabular-nums">{tokensMillions}M tokens</span>
            </div>
            <input
              type="range"
              min="2"
              max="150"
              step="2"
              value={tokensMillions}
              onChange={(e) => setTokensMillions(parseInt(e.target.value))}
              className="w-full accent-indigo-500 cursor-pointer"
            />
            <div className="flex justify-between text-[11px] text-slate-500">
              <span>2M (Solo)</span>
              <span>50M (Active Dev)</span>
              <span>150M+ (Team)</span>
            </div>
          </div>

          <div className="space-y-2 text-xs font-mono">
            <div className="flex justify-between text-slate-300">
              <span>Current Blended Rate / 1M Tokens:</span>
              <span className="text-white font-bold tabular-nums">${currentCostPerM} USD</span>
            </div>
            <input
              type="range"
              min="4"
              max="25"
              step="1"
              value={currentCostPerM}
              onChange={(e) => setCurrentCostPerM(parseInt(e.target.value))}
              className="w-full accent-indigo-500 cursor-pointer"
            />
            <div className="flex justify-between text-[11px] text-slate-500">
              <span>$5 (Edge / Flash)</span>
              <span>$14 (Sonnet 5.5 / GPT-6 Astra)</span>
              <span>$25 (Opus 5.5 / o3-pro)</span>
            </div>
          </div>
        </div>

        {/* Calculation Readout */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 font-mono text-center">
          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
            <div className="text-[10px] text-slate-500 uppercase">Direct Frontier Bill</div>
            <div className="text-lg font-bold text-slate-300 tabular-nums mt-1">
              ${baselineMonthly.toLocaleString('en-US', { maximumFractionDigits: 0 })} / mo
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
            <div className="text-[10px] text-slate-500 uppercase">With Entropos</div>
            <div className="text-lg font-bold text-slate-200 tabular-nums mt-1">
              ${entroposMonthly.toLocaleString('en-US', { maximumFractionDigits: 0 })} / mo
            </div>
          </div>

          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
            <div className="text-[10px] text-slate-500 uppercase">Projected Annual Savings</div>
            <div className="text-lg font-bold text-emerald-400 tabular-nums mt-1">
              ${annualSavings.toLocaleString('en-US', { maximumFractionDigits: 0 })} USD
            </div>
          </div>
        </div>
      </div>

      {/* Plan Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((p) => {
          const isCurrent = subscription.planId === p.id;
          return (
            <div
              key={p.id}
              className={`rounded-xl p-6 border flex flex-col justify-between ${
                isCurrent
                  ? 'bg-slate-900 border-emerald-500 shadow-md ring-1 ring-emerald-500/30'
                  : p.isPopular
                  ? 'bg-slate-900 border-indigo-500 shadow-sm'
                  : 'bg-slate-900/40 border-slate-800'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-base font-semibold text-white">{p.name}</h3>
                  {isCurrent ? (
                    <span className="text-[10px] font-mono text-emerald-400 font-semibold bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/50">
                      Active
                    </span>
                  ) : p.isPopular ? (
                    <span className="text-[10px] font-mono text-indigo-400 font-medium">
                      Recommended
                    </span>
                  ) : null}
                </div>

                <p className="text-xs text-slate-400 mb-4">{p.audience}</p>

                <div className="flex items-baseline gap-1 my-3 font-mono">
                  <span className="text-3xl font-bold text-white tabular-nums">{p.price}</span>
                  <span className="text-xs text-slate-500">{p.period}</span>
                </div>

                <div className="space-y-2.5 text-xs text-slate-300 my-6">
                  {p.features.map((feat, fIdx) => (
                    <div key={fIdx} className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={() => {
                  if (isCurrent) return;
                  onOpenCheckout(p.id);
                }}
                disabled={isCurrent}
                className={`w-full py-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  isCurrent
                    ? 'bg-slate-800 text-slate-400 cursor-default'
                    : p.isPopular
                    ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                }`}
              >
                {p.buttonText}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
