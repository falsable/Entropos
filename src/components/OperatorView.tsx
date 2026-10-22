import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Server,
  Activity,
  Zap,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Terminal,
  Lock,
  Layers,
  KeyRound,
  RefreshCw,
} from 'lucide-react';
import { adminHeaders, getAdminToken, setAdminToken } from '../lib/adminToken';
import { fetchJson, errorMessage, readJsonBody, httpFailureMessage } from '../lib/api';

export const OperatorView: React.FC = () => {
  const [tokenInput, setTokenInput] = useState<string>(getAdminToken());
  const [hasToken, setHasToken] = useState<boolean>(Boolean(getAdminToken()));
  const [status, setStatus] = useState<any>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [diagLog, setDiagLog] = useState<string>('Listo para ejecutar diagnósticos. Selecciona una acción de operador.');
  const [isRunningDiag, setIsRunningDiag] = useState<boolean>(false);
  const [diagError, setDiagError] = useState<string | null>(null);

  const fetchStatus = () => {
    fetchJson('/api/production-status')
      .then((d) => {
        setStatus(d);
        setStatusError(null);
      })
      .catch((e) => setStatusError(errorMessage(e)));
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleSaveToken = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = tokenInput.trim();
    setAdminToken(trimmed);
    setHasToken(Boolean(trimmed));
    setDiagLog(trimmed ? 'Token de administrador guardado. Acceso a diagnósticos autorizado.' : 'Token eliminado.');
  };

  const handleTestHealth = async () => {
    setIsRunningDiag(true);
    setDiagError(null);
    setDiagLog('Consultando probe de liveness: GET /healthz...');
    try {
      const start = performance.now();
      const res = await fetch('/healthz');
      const data = await readJsonBody(res);
      const latency = Math.round(performance.now() - start);
      setDiagLog(
        `[HEALTH CHECK OK] Status: ${res.status} | Latencia: ${latency}ms\n` +
        `Payload:\n${JSON.stringify(data, null, 2)}`
      );
    } catch (err) {
      setDiagError(`Fallo en /healthz: ${errorMessage(err)}`);
      setDiagLog('Error al conectar con /healthz.');
    } finally {
      setIsRunningDiag(false);
    }
  };

  const handleTestReadiness = async () => {
    setIsRunningDiag(true);
    setDiagError(null);
    setDiagLog('Consultando probe de readiness: GET /readyz...');
    try {
      const start = performance.now();
      const res = await fetch('/readyz');
      const data = await readJsonBody(res);
      const latency = Math.round(performance.now() - start);
      setDiagLog(
        `[READINESS PROBE] Status: ${res.status} | Latencia: ${latency}ms\n` +
        `Payload:\n${JSON.stringify(data, null, 2)}`
      );
    } catch (err) {
      setDiagError(`Fallo en /readyz: ${errorMessage(err)}`);
      setDiagLog('Error al conectar con /readyz.');
    } finally {
      setIsRunningDiag(false);
    }
  };

  const handleTripCircuit = async (providerId = 'anthropic') => {
    setIsRunningDiag(true);
    setDiagError(null);
    setDiagLog(`Disparando interruptor de circuito para ${providerId} (POST /api/diagnostics/trip-circuit)...`);
    try {
      const res = await fetch('/api/diagnostics/trip-circuit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...adminHeaders(),
        },
        body: JSON.stringify({ providerId }),
      });
      const data = await readJsonBody(res);
      if (!res.ok) {
        throw new Error(httpFailureMessage(res.status, data));
      }
      setDiagLog(
        `[CIRCUIT TRIPPED] Interruptor abierto para ${providerId}.\n` +
        `Resultado:\n${JSON.stringify(data, null, 2)}`
      );
      fetchStatus();
    } catch (err) {
      setDiagError(`Fallo al disparar circuito: ${errorMessage(err)}`);
      setDiagLog('Acción rechazada o fallida. Verifica el token de admin.');
    } finally {
      setIsRunningDiag(false);
    }
  };

  const handleResetCircuits = async () => {
    setIsRunningDiag(true);
    setDiagError(null);
    setDiagLog('Restaurando todos los interruptores de circuito (POST /api/diagnostics/reset-circuits)...');
    try {
      const res = await fetch('/api/diagnostics/reset-circuits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...adminHeaders(),
        },
      });
      const data = await readJsonBody(res);
      if (!res.ok) {
        throw new Error(httpFailureMessage(res.status, data));
      }
      setDiagLog(
        `[CIRCUITS RESET] Todos los interruptores restaurados a estado nominal.\n` +
        `Resultado:\n${JSON.stringify(data, null, 2)}`
      );
      fetchStatus();
    } catch (err) {
      setDiagError(`Fallo al resetear circuitos: ${errorMessage(err)}`);
      setDiagLog('Acción rechazada o fallida. Verifica el token de admin.');
    } finally {
      setIsRunningDiag(false);
    }
  };

  const circuitBreakers = status?.circuitBreakers || {
    anthropic: { state: 'closed', failureCount: 0, tripCount: 0 },
    gemini: { state: 'closed', failureCount: 0, tripCount: 0 },
    openai: { state: 'closed', failureCount: 0, tripCount: 0 },
    deepseek: { state: 'closed', failureCount: 0, tripCount: 0 },
    groq: { state: 'closed', failureCount: 0, tripCount: 0 },
  };

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400">
              <ShieldAlert className="w-5 h-5" />
            </span>
            <h2 className="text-lg font-bold text-white tracking-tight">Consola de Operador & Diagnóstico</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Controles internos de resiliencia, sondas de infraestructura y gestión de interruptores de circuito.
          </p>
        </div>

        <button
          onClick={fetchStatus}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-mono text-slate-300 hover:text-white transition-colors cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Actualizar Estado</span>
        </button>
      </div>

      {/* Admin Authentication Card */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
        <form onSubmit={handleSaveToken} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">Token de Administrador</span>
              {hasToken ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Configurado
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Requerido para mutaciones
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              Las acciones destructivas y de diagnóstico (`/api/diagnostics/*`) exigen el token fijado en `ENTROPOS_ADMIN_TOKEN`.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="password"
              placeholder="Introduce token de admin..."
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500 w-56"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors cursor-pointer"
            >
              Guardar
            </button>
          </div>
        </form>
      </div>

      {/* Subsystem Health & Circuit Breakers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Storage & Engine Status */}
        <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Server className="w-4 h-4 text-indigo-400" /> Almacén de Estado
            </span>
            <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              {status?.storage?.type === 'sqlite_wal' ? 'SQLite WAL Atómico' : 'Activo'}
            </span>
          </div>

          <div className="space-y-1.5 text-xs text-slate-400 font-mono">
            <div className="flex justify-between py-1 border-b border-slate-800/60">
              <span>Registros en SQLite:</span>
              <span className="text-white font-semibold">{status?.storage?.recordCount ?? 0}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-800/60">
              <span>Peticiones Acumuladas:</span>
              <span className="text-white font-semibold">{status?.usage?.totalRequests ?? 0}</span>
            </div>
            <div className="flex justify-between py-1">
              <span>Claves de Workspace:</span>
              <span className="text-white font-semibold">{status?.keysCount ?? 0}</span>
            </div>
          </div>
        </div>

        {/* Live Circuit Breakers */}
        <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" /> Interruptores de Circuito
            </span>
            <span className="text-[10px] text-slate-500 font-mono">Umbral: 3 fallos consecutivos</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(circuitBreakers).map(([id, cb]: [string, any]) => {
              const isOpen = cb.state === 'open';
              const isHalf = cb.state === 'half-open';
              return (
                <div
                  key={id}
                  className={`p-2.5 rounded-lg border text-xs font-mono transition-colors ${
                    isOpen
                      ? 'bg-rose-950/20 border-rose-800/60 text-rose-300'
                      : isHalf
                      ? 'bg-amber-950/20 border-amber-800/60 text-amber-300'
                      : 'bg-slate-950 border-slate-800 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="capitalize font-semibold">{id}</span>
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isOpen ? 'bg-rose-500 animate-pulse' : isHalf ? 'bg-amber-400' : 'bg-emerald-400'
                      }`}
                    />
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    {isOpen ? 'ABIERTO (Failover)' : isHalf ? 'PROBANDO' : 'NOMINAL (Cerrado)'}
                  </div>
                  {cb.tripCount > 0 && (
                    <div className="text-[9px] text-slate-600 mt-0.5">Trips: {cb.tripCount}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Operator Diagnostics Control Panel */}
      <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-4">
        <div>
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">Acciones de Diagnóstico en Vivo</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Ejecuta probes reales contra el servidor o simula fallos para verificar el failover transparente.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            disabled={isRunningDiag}
            onClick={handleTestHealth}
            className="p-3 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 text-left transition-colors cursor-pointer group disabled:opacity-50"
          >
            <div className="flex items-center gap-2 text-xs font-semibold text-white">
              <Activity className="w-3.5 h-3.5 text-indigo-400" />
              <span>Probar Liveness (/healthz)</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Comprueba que el proceso de Node responde</p>
          </button>

          <button
            disabled={isRunningDiag}
            onClick={handleTestReadiness}
            className="p-3 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 text-left transition-colors cursor-pointer group disabled:opacity-50"
          >
            <div className="flex items-center gap-2 text-xs font-semibold text-white">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Probar Readiness (/readyz)</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Verifica SQLite y proveedores conectados</p>
          </button>

          <button
            disabled={isRunningDiag}
            onClick={() => handleTripCircuit('anthropic')}
            className="p-3 rounded-lg bg-slate-950 border border-rose-900/40 hover:border-rose-700 hover:bg-rose-950/20 text-left transition-colors cursor-pointer group disabled:opacity-50"
          >
            <div className="flex items-center gap-2 text-xs font-semibold text-rose-300">
              <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
              <span>Simular Fallo (Trip Anthropic)</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Abre el circuito para forzar failover</p>
          </button>

          <button
            disabled={isRunningDiag}
            onClick={handleResetCircuits}
            className="p-3 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 text-left transition-colors cursor-pointer group disabled:opacity-50"
          >
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
              <RotateCcw className="w-3.5 h-3.5 text-indigo-400" />
              <span>Resetear Circuitos</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Restaura todos a estado nominal</p>
          </button>
        </div>

        {/* Terminal Output */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-indigo-400" />
              <span className="font-mono">Salida del Terminal de Operador:</span>
            </span>
            {isRunningDiag && <span className="text-indigo-400 animate-pulse text-[11px]">Ejecutando sonda...</span>}
          </div>

          <pre className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 font-mono text-[11px] overflow-x-auto whitespace-pre-wrap leading-relaxed min-h-[120px] max-h-[240px]">
            {diagLog}
          </pre>

          {diagError && (
            <div role="alert" className="bg-red-950/40 border border-red-800/60 text-red-200 text-xs rounded-lg p-3">
              {diagError}
            </div>
          )}
        </div>
      </div>

      {/* Internal Architecture & Roadmap (Only Visible to Authenticated Operators) */}
      {hasToken && (
        <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Arquitectura Interna & Resiliencia de Producción
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-400">
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <div className="font-semibold text-slate-200 mb-1">Persistencia SQLite WAL</div>
              <p className="text-[11px] leading-relaxed">
                Operaciones concurrentes $O(1)$ con soporte para múltiples instancias sin corrupción de ficheros.
              </p>
            </div>
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <div className="font-semibold text-slate-200 mb-1">Cifrado de Secretos AES-256-GCM</div>
              <p className="text-[11px] leading-relaxed">
                Claves API cifradas en reposo con IV único de 12 bytes. Nunca expuestas en texto plano.
              </p>
            </div>
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <div className="font-semibold text-slate-200 mb-1">Zero Data Retention (Enterprise)</div>
              <p className="text-[11px] leading-relaxed">
                Prompts y respuestas purgados por defecto de los registros en disco. Metadatos de motor sanitizados.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
