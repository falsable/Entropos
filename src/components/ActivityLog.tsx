import React, { useState, useEffect, useCallback } from 'react';
import { RouteExecution } from '../types/router';
import {
  Search,
  Download,
  ChevronRight,
  ChevronLeft,
  X,
  FileSpreadsheet,
  FileCode,
  Filter,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { fetchJson, errorMessage } from '../lib/api';

interface ActivityLogProps {
  history?: RouteExecution[];
}

export const ActivityLog: React.FC<ActivityLogProps> = ({ history: propHistory = [] }) => {
  const [logs, setLogs] = useState<RouteExecution[]>(propHistory);
  const [total, setTotal] = useState<number>(propHistory.length);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [modeFilter, setModeFilter] = useState<string>('all');
  const [modelFilter, setModelFilter] = useState<string>('all');

  const [selectedExecution, setSelectedExecution] = useState<RouteExecution | null>(null);

  // Fetch paginated & filtered logs from server
  const fetchLogs = useCallback(
    async (p: number, search: string, mode: string, model: string) => {
      setLoading(true);
      setError(null);
      try {
        const queryParams = new URLSearchParams();
        queryParams.set('page', String(p));
        queryParams.set('limit', '20');
        if (search.trim()) queryParams.set('search', search.trim());
        if (mode !== 'all') queryParams.set('mode', mode);
        if (model !== 'all') queryParams.set('model', model);

        const res = await fetchJson<{
          logs: RouteExecution[];
          total: number;
          page: number;
          totalPages: number;
        }>(`/api/history?${queryParams.toString()}`);

        if (Array.isArray(res?.logs)) {
          setLogs(res.logs);
          setTotal(res.total ?? res.logs.length);
          setPage(res.page ?? 1);
          setTotalPages(res.totalPages ?? 1);
        }
      } catch (err) {
        // Fallback to client-side filtering if server error
        setError(errorMessage(err));
        const filtered = propHistory.filter((item) => {
          const matchSearch =
            !search.trim() ||
            item.promptSnippet.toLowerCase().includes(search.toLowerCase()) ||
            item.selectedModel.toLowerCase().includes(search.toLowerCase()) ||
            item.provider.toLowerCase().includes(search.toLowerCase());
          const matchMode = mode === 'all' || item.mode === mode;
          const matchModel = model === 'all' || item.selectedModel === model;
          return matchSearch && matchMode && matchModel;
        });
        setLogs(filtered);
        setTotal(filtered.length);
      } finally {
        setLoading(false);
      }
    },
    [propHistory]
  );

  // Debounce search query and trigger fetch
  useEffect(() => {
    const handler = setTimeout(() => {
      fetchLogs(page, searchTerm, modeFilter, modelFilter);
    }, 250);
    return () => clearTimeout(handler);
  }, [page, searchTerm, modeFilter, modelFilter, fetchLogs]);

  // Keyboard listener: Escape key closes modal drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedExecution) {
        setSelectedExecution(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedExecution]);

  // Export to CSV
  const handleExportCsv = () => {
    const header = [
      'ID',
      'Fecha (ISO)',
      'Modelo Asignado',
      'Proveedor',
      'Estrategia',
      'Latencia (ms)',
      'Coste Real (USD)',
      'Ahorro (USD)',
      'Ahorro (%)',
      'Origen Cliente',
      'Prompt',
      'Justificacion',
    ];

    const escapeCsv = (val: any) => {
      const str = String(val ?? '').replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = logs.map((item) =>
      [
        escapeCsv(item.id),
        escapeCsv(item.timestamp),
        escapeCsv(item.selectedModel),
        escapeCsv(item.provider),
        escapeCsv(item.mode || 'balanced'),
        escapeCsv(item.speedLatencyMs),
        escapeCsv(item.costUsd?.toFixed(5) || '0.00000'),
        escapeCsv(item.savedUsd?.toFixed(5) || '0.00000'),
        escapeCsv(item.savedPercentage || 0),
        escapeCsv(item.clientOrigin || 'client'),
        escapeCsv(item.promptSnippet || ''),
        escapeCsv(item.reason || ''),
      ].join(',')
    );

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent([header.join(','), ...rows].join('\n'));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', csvContent);
    downloadAnchor.setAttribute('download', `entropos_actividad_${Date.now()}.csv`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Export to JSON
  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(logs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `entropos_actividad_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-indigo-950/60 border border-indigo-800/60 text-[11px] font-mono text-indigo-300 mb-2">
            <span>Registro Transaccional Persistente</span>
            <span>·</span>
            <span>Paginado y Filtrable</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Historial de Actividad & Auditoría
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Auditoría de cada prompt evaluado por Entropos a través de MCP o API REST, con latencia medida, coste real y motivo público de clasificación.
          </p>
        </div>

        {/* Export Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 text-xs font-mono border border-emerald-800/60 transition-colors cursor-pointer shadow-sm"
            title="Descargar historial en formato CSV para hojas de cálculo"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Exportar CSV</span>
          </button>
          <button
            onClick={handleExportJson}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-mono border border-slate-800 transition-colors cursor-pointer"
            title="Descargar historial en formato JSON crudo"
          >
            <FileCode className="w-3.5 h-3.5 text-slate-400" />
            <span>Exportar JSON</span>
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-3 bg-red-950/40 border border-red-800/60 rounded-xl text-xs text-red-200">
          Aviso de sincronización: {error}
        </div>
      )}

      {/* Filter & Search Bar Toolbar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {/* Search Input */}
        <div className="sm:col-span-1 lg:col-span-2 relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            placeholder="Filtrar por prompt, modelo o proveedor..."
            className="w-full bg-slate-900/60 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Mode Filter */}
        <div>
          <select
            value={modeFilter}
            onChange={(e) => {
              setModeFilter(e.target.value);
              setPage(1);
            }}
            className="w-full bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="all">Todas las estrategias</option>
            <option value="adaptive">Modo Adaptativo (Flagship)</option>
            <option value="balanced">Modo Equilibrado</option>
            <option value="cost_saver">Ahorro Máximo (Edge)</option>
            <option value="max_quality">Máxima Calidad (Frontera)</option>
          </select>
        </div>

        {/* Model Filter */}
        <div>
          <select
            value={modelFilter}
            onChange={(e) => {
              setModelFilter(e.target.value);
              setPage(1);
            }}
            className="w-full bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="all">Todos los modelos</option>
            <option value="Claude Sonnet 5.5">Claude Sonnet 5.5</option>
            <option value="Gemini 3.8 Flash">Gemini 3.8 Flash</option>
            <option value="DeepSeek R1">DeepSeek R1 / V4 Pro</option>
            <option value="GPT-6 Astra">GPT-6 Astra</option>
            <option value="GPT-6.1 Sol">GPT-6.1 Sol</option>
            <option value="o3-mini">o3-mini</option>
          </select>
        </div>
      </div>

      {/* High-Density Data Grid (Accessible Table) */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-950/70 border-b border-slate-800 text-slate-400 select-none">
              <tr>
                <th scope="col" className="py-2.5 px-4 font-medium">Hora</th>
                <th scope="col" className="py-2.5 px-4 font-medium">Prompt Snippet</th>
                <th scope="col" className="py-2.5 px-4 font-medium">Modelo Asignado</th>
                <th scope="col" className="py-2.5 px-4 font-medium">Estrategia</th>
                <th scope="col" className="py-2.5 px-4 font-medium text-right">Latencia</th>
                <th scope="col" className="py-2.5 px-4 font-medium text-right">Coste Real</th>
                <th scope="col" className="py-2.5 px-4 font-medium text-right">Ahorro</th>
                <th scope="col" className="py-2.5 px-4 font-medium text-right">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    Cargando registro del servidor…
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    {total === 0
                      ? 'Sin peticiones registradas aún. Las consultas desde tus clientes conectados y el Playground aparecerán aquí.'
                      : 'No se encontraron peticiones con los filtros seleccionados.'}
                  </td>
                </tr>
              ) : (
                logs.map((item) => (
                  <tr
                    key={item.id}
                    tabIndex={0}
                    role="button"
                    aria-label={`Ver detalle de petición ${item.id} (${item.selectedModel})`}
                    onClick={() => setSelectedExecution(item)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedExecution(item);
                      }
                    }}
                    className="hover:bg-slate-800/40 focus:bg-indigo-950/30 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors cursor-pointer"
                  >
                    <td className="py-2.5 px-4 text-slate-400 whitespace-nowrap tabular-nums">
                      {new Date(item.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>

                    <td className="py-2.5 px-4 max-w-sm truncate text-slate-200">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {item.isSimulated && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/30 shrink-0">
                            Simulado
                          </span>
                        )}
                        <span className="truncate">"{item.promptSnippet || '—'}"</span>
                      </div>
                    </td>

                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <span className="text-white font-medium">{item.selectedModel}</span>
                      <span className="text-slate-500 text-[11px] ml-1.5 font-normal">({item.provider})</span>
                    </td>

                    <td className="py-2.5 px-4 whitespace-nowrap text-slate-400 capitalize">
                      {item.mode || 'balanced'}
                    </td>

                    <td className="py-2.5 px-4 text-right text-slate-300 tabular-nums">
                      {item.speedLatencyMs}ms
                    </td>

                    <td className="py-2.5 px-4 text-right text-slate-400 tabular-nums">
                      ${item.costUsd.toFixed(5)}
                    </td>

                    <td className="py-2.5 px-4 text-right font-medium text-emerald-400 tabular-nums">
                      {item.savedPercentage}%
                    </td>

                    <td className="py-2.5 px-4 text-right text-slate-500">
                      <ChevronRight className="w-4 h-4 inline" aria-hidden="true" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View (< sm) */}
        <div className="sm:hidden divide-y divide-slate-800/60">
          {loading ? (
            <div className="py-12 text-center text-slate-500">
              Cargando registro del servidor...
            </div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center text-slate-500 px-4">
              {total === 0
                ? "Sin peticiones registradas aún."
                : "No se encontraron peticiones con los filtros seleccionados."}
            </div>
          ) : (
            logs.map((item) => (
              <div
                key={item.id}
                tabIndex={0}
                role="button"
                aria-label={"Ver detalle de petición " + item.id + " (" + item.selectedModel + ")"}
                onClick={() => setSelectedExecution(item)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedExecution(item);
                  }
                }}
                className="p-3.5 space-y-2 hover:bg-slate-800/40 focus:bg-indigo-950/30 focus:outline-none transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>{new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                  <span className="font-medium text-emerald-400">Ahorro: {item.savedPercentage}%</span>
                </div>
                <div className="text-xs text-slate-200 font-mono truncate">
                  {item.isSimulated && (
                    <span className="mr-1.5 px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      Simulado
                    </span>
                  )}
                  {'"' + (item.promptSnippet || "—") + '"'}
                </div>
                <div className="flex items-center justify-between text-xs pt-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-white font-medium">{item.selectedModel}</span>
                    <span className="text-slate-500 text-[11px]">({item.provider})</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-400 font-mono text-[11px]">
                    <span>{item.speedLatencyMs}ms</span>
                    <span>·</span>
                    <span>{"$" + item.costUsd.toFixed(5)}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Server-Side Pagination Bar */}
        <div className="p-3 bg-slate-950/80 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-slate-400">
          <div>
            <span>Total: </span>
            <strong className="text-white">{total}</strong>
            <span> peticiones registradas</span>
          </div>

          <div className="flex items-center gap-2">
            <span>
              Página <strong className="text-white">{page}</strong> de{' '}
              <strong className="text-white">{totalPages}</strong>
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="p-1 rounded bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                title="Página anterior"
                aria-label="Página anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="p-1 rounded bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                title="Página siguiente"
                aria-label="Página siguiente"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Accessible Inspector Modal Drawer (Escape to close) */}
      {selectedExecution && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-execution-title"
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in"
        >
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 space-y-4 font-mono text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 id="modal-execution-title" className="text-sm font-semibold text-white">
                    Registro de Telemetría Transaccional
                  </h3>
                  {selectedExecution.isSimulated && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      Simulado
                    </span>
                  )}
                </div>
                <span className="text-slate-500 text-[11px]">ID de Petición: {selectedExecution.id}</span>
              </div>
              <button
                onClick={() => setSelectedExecution(null)}
                aria-label="Cerrar modal (Escape)"
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              {/* Prompt Box */}
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-slate-500 uppercase text-[10px]">Prompt Evaluado:</span>
                <div className="text-slate-200 font-sans text-xs leading-relaxed max-h-36 overflow-y-auto">
                  {selectedExecution.fullPrompt || selectedExecution.promptSnippet || '—'}
                </div>
              </div>

              {/* Classification Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 uppercase text-[10px]">Modelo Asignado:</span>
                  <div className="text-white font-semibold mt-0.5">{selectedExecution.selectedModel}</div>
                  <div className="text-slate-400 text-[11px]">{selectedExecution.provider}</div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-slate-500 uppercase text-[10px]">Coste y Ahorro:</span>
                  <div className="text-white font-semibold mt-0.5">${selectedExecution.costUsd.toFixed(5)}</div>
                  <div className="text-emerald-400 text-[11px] font-bold">
                    +{selectedExecution.savedPercentage}% (${selectedExecution.savedUsd.toFixed(5)})
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 col-span-2 sm:col-span-1">
                  <span className="text-slate-500 uppercase text-[10px]">Latencia Medida:</span>
                  <div className="text-slate-200 font-semibold mt-0.5">{selectedExecution.speedLatencyMs} ms</div>
                  <div className="text-slate-500 text-[11px]">Modo: {selectedExecution.mode || 'balanced'}</div>
                </div>
              </div>

              {/* Classification Justification */}
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-slate-500 uppercase text-[10px]">Justificación Pública de Enrutamiento:</span>
                <div className="text-slate-300 text-xs">{selectedExecution.reason || 'Enrutado por complejidad del prompt.'}</div>
              </div>

              {/* Model Output (if retained) */}
              {selectedExecution.responseText && (
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-slate-500 uppercase text-[10px]">Respuesta del Motor:</span>
                  <div className="text-slate-300 max-h-36 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                    {selectedExecution.responseText}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                onClick={() => setSelectedExecution(null)}
                className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
