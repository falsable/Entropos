import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  DollarSign,
  Layers,
  Calendar,
  CheckCircle2,
  Cpu,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Terminal,
  Play,
  BarChart2,
  Sparkles,
} from 'lucide-react';
import { AnalyticsSummary, ReferenceModelConfig, DailyAnalyticsPoint, TopModelAnalytics } from '../types/router';
import { fetchJson, errorMessage } from '../lib/api';

interface OverviewDashboardProps {
  onNavigateToTab?: (tab: string) => void;
  serverStatus?: {
    totalRequests: number;
    totalSavedUsd: number;
    averageDiscountPct: number | null;
    activeMode: string;
  };
}

export const OverviewDashboard: React.FC<OverviewDashboardProps> = ({
  onNavigateToTab,
  serverStatus,
}) => {
  const [days, setDays] = useState<7 | 30>(30);
  const [referenceModel, setReferenceModel] = useState<string>(() => {
    return localStorage.getItem('entropos_reference_model') || 'claude-sonnet-5-5';
  });
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredDay, setHoveredDay] = useState<DailyAnalyticsPoint | null>(null);

  const fetchAnalytics = (d: 7 | 30, refModel: string) => {
    setLoading(true);
    setError(null);
    fetchJson<AnalyticsSummary>(`/api/analytics/summary?days=${d}&referenceModel=${encodeURIComponent(refModel)}`)
      .then((data) => {
        setAnalytics(data);
      })
      .catch((err) => {
        setError(errorMessage(err));
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchAnalytics(days, referenceModel);
  }, [days, referenceModel]);

  const maxDailyRefCost = Math.max(
    0.001,
    ...(analytics?.daily.map((d) => Math.max(d.referenceCostUsd, d.actualCostUsd)) || [0.001])
  );

  return (
    <div className="space-y-8 font-sans">
      {/* Editorial Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-indigo-950/60 border border-indigo-800/60 text-[11px] font-mono text-indigo-300 mb-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Métricas Auditadas en Servidor · Sin Datos Sintéticos</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Gasto y Ahorro en Tiempo Real
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Compara tu gasto real a través de Entropos contra el modelo que utilizas habitualmente. Todas las cifras provienen del registro de transacciones en SQLite.
          </p>
        </div>

        {/* Global Controls: Period & Reference Model */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {/* 7d vs 30d Toggle */}
          <div className="inline-flex rounded-lg bg-slate-900 border border-slate-800 p-0.5 text-xs font-mono">
            <button
              onClick={() => setDays(7)}
              className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                days === 7 ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-400 hover:text-white'
              }`}
            >
              7 días
            </button>
            <button
              onClick={() => setDays(30)}
              className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                days === 30 ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-400 hover:text-white'
              }`}
            >
              30 días
            </button>
          </div>

          {/* Reference Model Selector */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs font-mono">
            <span className="text-slate-500 hidden sm:inline">Hoy uso:</span>
            <select
              value={referenceModel}
              onChange={(e) => {
                const val = e.target.value;
                setReferenceModel(val);
                try {
                  localStorage.setItem('entropos_reference_model', val);
                } catch {
                  // ignore
                }
              }}
              className="bg-transparent text-indigo-300 focus:outline-none cursor-pointer"
            >
              <option value="claude-sonnet-5-5" className="bg-slate-900 text-white">
                Claude Sonnet 5.5 ($2 / $10)
              </option>
              <option value="gpt-6-astra" className="bg-slate-900 text-white">
                GPT-6 Astra ($10 / $50)
              </option>
              <option value="gpt-6.1-sol" className="bg-slate-900 text-white">
                GPT-6.1 Sol ($2 / $10)
              </option>
              <option value="o3-mini" className="bg-slate-900 text-white">
                o3-mini ($1.1 / $4.4)
              </option>
              <option value="claude-opus-5-5" className="bg-slate-900 text-white">
                Claude Opus 5.5 ($4 / $20)
              </option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-3 bg-red-950/40 border border-red-800/60 rounded-xl text-xs text-red-200">
          No se pudieron cargar las analíticas: {error}
        </div>
      )}

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Gasto Real Entropos */}
        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
          <div className="text-[11px] text-slate-500 uppercase font-mono tracking-wider">
            Gasto Real con Entropos
          </div>
          <div className="text-2xl font-bold font-mono text-white tabular-nums">
            ${(analytics?.totals.actualCostUsd ?? 0).toFixed(4)} USD
          </div>
          <div className="text-xs text-slate-400 font-mono">
            {analytics?.totals.totalRequests ?? 0} peticiones procesadas ({days}d)
          </div>
        </div>

        {/* Card 2: Gasto Estimado Referencia */}
        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
          <div className="text-[11px] text-slate-500 uppercase font-mono tracking-wider truncate" title={`Gasto usando ${analytics?.referenceModel.label || 'Referencia'}`}>
            Sin Entropos ({analytics?.referenceModel.label || 'Referencia'})
          </div>
          <div className="text-2xl font-bold font-mono text-slate-300 tabular-nums">
            ${(analytics?.totals.referenceCostUsd ?? 0).toFixed(4)} USD
          </div>
          <div className="text-xs text-slate-500 font-mono truncate">
            Tarifa: ${analytics?.referenceModel.inputPerM ?? 2}/1M in · ${analytics?.referenceModel.outputPerM ?? 10}/1M out
          </div>
        </div>

        {/* Card 3: Ahorro Neto Auditado */}
        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
          <div className="text-[11px] text-slate-500 uppercase font-mono tracking-wider">
            Ahorro Neto Auditado
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400 tabular-nums flex items-baseline gap-2">
            <span>${(analytics?.totals.savedUsd ?? 0).toFixed(4)} USD</span>
            {Boolean(analytics?.totals.savingsPercentage) && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-800/60 text-emerald-300">
                {analytics?.totals.savingsPercentage}% menos
              </span>
            )}
          </div>
          <div className="text-xs text-slate-400 font-mono">
            Frente al modelo de referencia
          </div>
        </div>

        {/* Card 4: Fuente y Procedencia */}
        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
          <div className="text-[11px] text-slate-500 uppercase font-mono tracking-wider">
            Fuente y Auditoría
          </div>
          <div className="text-sm font-semibold text-indigo-300 font-mono flex items-center gap-1.5 pt-1">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>SQLite WAL Audit</span>
          </div>
          <div className="text-[11px] text-slate-500 font-mono leading-tight">
            Tabla <code className="text-slate-400">route_logs</code> · Cero extrapolación sintética
          </div>
        </div>
      </div>

      {/* Main Visuals: Daily Timeline Chart & Top Models */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daily Timeline Bar Chart (2 columns) */}
        <div className="lg:col-span-2 p-5 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-indigo-400" />
                <span>Evolución Diaria del Gasto y Ahorro</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Barra verde: ahorro conseguido. Barra gris: coste real abonado.
              </p>
            </div>

            {/* Hover details readout */}
            {hoveredDay && (
              <div className="text-xs font-mono px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-slate-300 animate-in fade-in">
                <strong className="text-white">{hoveredDay.date}</strong>: {hoveredDay.requests} reqs · Coste: ${hoveredDay.actualCostUsd.toFixed(4)} · Ahorro: <span className="text-emerald-400 font-bold">${hoveredDay.savedUsd.toFixed(4)}</span>
              </div>
            )}
          </div>

          {/* Timeline Chart Container */}
          <div className="h-48 pt-4 flex items-end gap-1 sm:gap-2 border-b border-slate-800 pb-2 px-1">
            {analytics?.daily.map((day, idx) => {
              const refHeightPct = Math.min(100, Math.max(8, (day.referenceCostUsd / maxDailyRefCost) * 100));
              const actualHeightPct = Math.min(100, Math.max(4, (day.actualCostUsd / maxDailyRefCost) * 100));
              const savedHeightPct = Math.max(0, refHeightPct - actualHeightPct);
              const hasTraffic = day.requests > 0;

              return (
                <div
                  key={day.date}
                  onMouseEnter={() => setHoveredDay(day)}
                  onMouseLeave={() => setHoveredDay(null)}
                  className="flex-1 flex flex-col items-center justify-end h-full group relative cursor-pointer"
                >
                  {/* Tooltip on hover */}
                  <div className="absolute -top-12 z-20 hidden group-hover:flex flex-col items-center bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[10px] font-mono text-slate-200 whitespace-nowrap shadow-xl pointer-events-none">
                    <div>{day.date} ({day.requests} peticiones)</div>
                    <div>Ahorro: <strong className="text-emerald-400">${day.savedUsd.toFixed(4)}</strong></div>
                  </div>

                  {/* Visual Bar Stack */}
                  <div className="w-full max-w-[28px] flex flex-col justify-end items-center h-full">
                    {hasTraffic ? (
                      <div className="w-full flex flex-col justify-end rounded-t overflow-hidden transition-all duration-200 group-hover:brightness-125" style={{ height: `${refHeightPct}%` }}>
                        {savedHeightPct > 0 && (
                          <div
                            className="w-full bg-emerald-500/80 transition-all"
                            style={{ height: `${(savedHeightPct / refHeightPct) * 100}%` }}
                            title={`Ahorro: $${day.savedUsd.toFixed(4)}`}
                          />
                        )}
                        <div
                          className="w-full bg-slate-600 transition-all"
                          style={{ height: `${(actualHeightPct / refHeightPct) * 100}%` }}
                          title={`Coste real: $${day.actualCostUsd.toFixed(4)}`}
                        />
                      </div>
                    ) : (
                      <div className="w-full h-1 bg-slate-800/80 rounded" />
                    )}
                  </div>

                  {/* Day label on bottom (show sparse dates on mobile / small screens) */}
                  <div className="text-[9px] font-mono text-slate-500 mt-2 truncate w-full text-center">
                    {(days === 7 || idx % 4 === 0 || idx === analytics.daily.length - 1)
                      ? day.date.slice(5)
                      : ''}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 pt-1">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
                <span>Ahorro neto conseguido</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-slate-600" />
                <span>Coste real consumido</span>
              </span>
            </div>
            <span>Periodo: últimos {days} días</span>
          </div>
        </div>

        {/* Top Models & Traffic Breakdown (1 column) */}
        <div className="p-5 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Cpu className="w-4 h-4 text-indigo-400" />
              <span>Distribución por Modelo</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Cómo se distribuye tu tráfico entre motores edge y razonamiento frontera.
            </p>
          </div>

          {analytics?.topModels && analytics.topModels.length > 0 ? (
            <div className="space-y-3.5 pt-1">
              {analytics.topModels.map((item) => (
                <div key={item.model} className="space-y-1 font-mono text-xs">
                  <div className="flex items-center justify-between text-slate-300">
                    <div className="flex items-center gap-1.5 truncate max-w-[180px]">
                      <span className="font-semibold text-white truncate">{item.model}</span>
                      <span className="text-[10px] text-slate-500">({item.provider})</span>
                    </div>
                    <span className="text-slate-400 tabular-nums">
                      {item.requests} reqs ({item.percentageOfTraffic}%)
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full"
                      style={{ width: `${item.percentageOfTraffic}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span>Coste: ${item.actualCostUsd.toFixed(4)}</span>
                    <span className="text-emerald-400">Ahorro: +${item.savedUsd.toFixed(4)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-44 flex flex-col items-center justify-center text-center p-4 text-slate-500 space-y-2 font-mono text-xs">
              <Cpu className="w-6 h-6 text-slate-600" />
              <p>Sin peticiones registradas aún en este periodo.</p>
            </div>
          )}
        </div>
      </div>

      {/* Empty State Onboarding Bridge */}
      {(!analytics || analytics.totals.totalRequests === 0) && (
        <div className="p-6 rounded-2xl bg-indigo-950/20 border border-indigo-900/40 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="space-y-1 text-center sm:text-left">
            <h4 className="text-sm font-bold text-white flex items-center justify-center sm:justify-start gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span>Comienza a enviar peticiones para activar tu analítica</span>
            </h4>
            <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
              Conecta tu editor en menos de 5 minutos mediante Model Context Protocol o prueba el motor ahora mismo en el Playground.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onNavigateToTab && (
              <>
                <button
                  onClick={() => onNavigateToTab('mcp')}
                  className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
                >
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Configurar MCP</span>
                </button>
                <button
                  onClick={() => onNavigateToTab('playground')}
                  className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Playground</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
