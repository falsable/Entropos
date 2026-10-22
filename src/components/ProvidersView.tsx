import React, { useState, useEffect } from 'react';
import { ProviderConfig } from '../types/router';
import { DEFAULT_PROVIDERS } from '../lib/defaults';
import { adminHeaders } from '../lib/adminToken';
import {
  Check,
  RefreshCw,
  Activity,
  Key,
  ShieldCheck,
  AlertCircle,
  Trash2,
  Eye,
  EyeOff,
  CheckCircle2,
} from 'lucide-react';
import { fetchJson, errorMessage } from '../lib/api';

export const ProvidersView: React.FC = () => {
  const [providers, setProviders] = useState<ProviderConfig[]>(DEFAULT_PROVIDERS);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Key editing state
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [tempApiKey, setTempApiKey] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [saveKeyError, setSaveKeyError] = useState<string | null>(null);

  // Ping testing state
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [pingErrors, setPingErrors] = useState<Record<string, string>>({});
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const loadProviders = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await fetchJson<{ providers: ProviderConfig[] }>('/api/providers', {
        headers: { ...adminHeaders() },
      });
      if (Array.isArray(data?.providers)) {
        setProviders(data.providers);
      }
    } catch (err) {
      console.error('Failed to load providers:', err);
      setLoadError(errorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProviders();
  }, []);

  const handleToggle = (id: string) => {
    setProviders((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              enabled: !p.enabled,
            }
          : p
      )
    );
  };

  const handleSaveAndVerifyKey = async (providerId: string) => {
    if (!tempApiKey.trim() || isSavingKey) return;
    setIsSavingKey(true);
    setSaveKeyError(null);
    setActionNotice(null);

    try {
      const res = await fetchJson<{
        providerId: string;
        status: 'connected' | 'not_configured' | 'error' | 'unreachable';
        hasApiKey: boolean;
        maskedKey?: string;
        testedLatencyMs?: number;
        lastVerifiedAt?: string;
      }>('/api/providers/key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...adminHeaders() },
        body: JSON.stringify({
          providerId,
          apiKey: tempApiKey.trim(),
        }),
      });

      // Update provider in state
      setProviders((prev) =>
        prev.map((p) =>
          p.id === providerId
            ? {
                ...p,
                status: 'connected',
                hasApiKey: true,
                maskedKey: res.maskedKey,
                testedLatencyMs: res.testedLatencyMs,
                lastVerifiedAt: res.lastVerifiedAt,
              }
            : p
        )
      );

      setEditingProvider(null);
      setTempApiKey('');
      setShowPassword(false);
      setActionNotice(
        `Clave verificada y cifrada en el servidor para ${providerId.toUpperCase()} (${res.testedLatencyMs}ms).`
      );
      setTimeout(() => setActionNotice(null), 5000);
    } catch (err) {
      console.error('Failed to verify and save provider key:', err);
      setSaveKeyError(errorMessage(err));
    } finally {
      setIsSavingKey(false);
    }
  };

  const handleDeleteKey = async (providerId: string) => {
    if (!confirm(`¿Eliminar la clave cifrada de ${providerId}? El proveedor pasará a estado no configurado.`)) {
      return;
    }

    try {
      await fetchJson(`/api/providers/${providerId}/key`, {
        method: 'DELETE',
        headers: { ...adminHeaders() },
      });

      setProviders((prev) =>
        prev.map((p) =>
          p.id === providerId
            ? {
                ...p,
                status: 'not_configured',
                hasApiKey: false,
                maskedKey: undefined,
                testedLatencyMs: null,
                lastVerifiedAt: null,
              }
            : p
        )
      );
      setActionNotice(`Clave de ${providerId.toUpperCase()} eliminada.`);
      setTimeout(() => setActionNotice(null), 4000);
    } catch (err) {
      alert(`No se pudo eliminar la clave: ${errorMessage(err)}`);
    }
  };

  const handleTestConnection = async (id: string) => {
    setTestingProvider(id);
    setPingErrors((prev) => {
      const { [id]: _removed, ...rest } = prev;
      return rest;
    });

    try {
      const data = await fetchJson<{
        status: 'connected' | 'not_configured' | 'error' | 'unreachable';
        latencyMs: number | null;
        verifiedAt?: string;
      }>('/api/test-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...adminHeaders() },
        body: JSON.stringify({ providerId: id }),
      });

      if (typeof data?.latencyMs !== 'number') {
        throw new Error('El servidor respondió sin medición de latencia.');
      }

      setProviders((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                status: data.status,
                testedLatencyMs: data.latencyMs,
                lastVerifiedAt: data.verifiedAt || new Date().toISOString(),
              }
            : p
        )
      );
    } catch (e) {
      setPingErrors((prev) => ({ ...prev, [id]: `Ping fallido: ${errorMessage(e)}` }));
    } finally {
      setTestingProvider(null);
    }
  };

  const activeCount = providers.filter((p) => p.enabled && p.status === 'connected').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <span>Proveedores y Claves Propias (BYOK)</span>
            <ShieldCheck className="w-5 h-5 text-emerald-400" aria-hidden="true" />
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Configura tus credenciales directas de OpenAI, Anthropic, Gemini o DeepSeek. Las claves se validan en tiempo real contra la API upstream y se almacenan cifradas en reposo con AES-256-GCM.
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono">
          <span className="text-slate-400">
            Conectados:{' '}
            <strong className="text-emerald-400 tabular-nums">
              {activeCount} de {providers.length}
            </strong>
          </span>
          <button
            onClick={loadProviders}
            disabled={isLoading}
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:text-white text-slate-400 transition-colors cursor-pointer"
            title="Refrescar estado de proveedores"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {actionNotice && (
        <div
          role="status"
          className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-xs text-emerald-300 flex items-center gap-2 font-mono animate-in fade-in"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{actionNotice}</span>
        </div>
      )}

      {loadError && (
        <div
          role="alert"
          className="p-3 bg-red-950/40 border border-red-800/60 rounded-xl text-xs text-red-200"
        >
          Error al cargar proveedores: {loadError}
        </div>
      )}

      {/* Grid of Providers */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {providers.map((provider) => {
          const isConfiguring = editingProvider === provider.id;
          const isTesting = testingProvider === provider.id;

          return (
            <div
              key={provider.id}
              className={`rounded-xl p-5 border transition-all flex flex-col justify-between ${
                provider.status === 'connected'
                  ? 'bg-slate-900/60 border-slate-800'
                  : 'bg-slate-950/50 border-slate-900/80'
              }`}
            >
              <div className="space-y-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center font-bold text-sm text-indigo-400">
                      {provider.logo}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white">{provider.name}</h3>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {provider.status === 'connected' ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
                            <Check className="w-2.5 h-2.5" />
                            <span>Conectado</span>
                          </span>
                        ) : provider.status === 'error' ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-red-950/80 text-red-300 border border-red-800/60">
                            <AlertCircle className="w-2.5 h-2.5" />
                            <span>Error de Clave</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-mono bg-slate-950 text-slate-500 border border-slate-800">
                            <span>No configurado</span>
                          </span>
                        )}
                        {provider.badge && (
                          <span className="text-[10px] text-slate-500 font-mono truncate max-w-[130px]">
                            {provider.badge}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Active in Pool Toggle */}
                  <button
                    onClick={() => handleToggle(provider.id)}
                    aria-label={`Activar o desactivar ${provider.name} en el pool`}
                    title={provider.enabled ? 'Activo en el pool' : 'Desactivado'}
                    className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer shrink-0 mt-1 ${
                      provider.enabled ? 'bg-indigo-600' : 'bg-slate-800'
                    }`}
                  >
                    <span
                      className={`block w-3.5 h-3.5 rounded-full bg-white transition-transform absolute top-0.75 ${
                        provider.enabled ? 'left-4.5' : 'left-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Model Roster */}
                <div className="space-y-1">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">
                    Modelos Disponibles:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {provider.models.map((m, mIdx) => (
                      <span
                        key={mIdx}
                        className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800/80 text-[11px] font-mono text-slate-300"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Key Status & Live Telemetry Strip */}
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 text-xs font-mono space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 text-[11px]">Credencial BYOK:</span>
                    {provider.hasApiKey && provider.maskedKey ? (
                      <span className="text-indigo-300 font-semibold">{provider.maskedKey}</span>
                    ) : (
                      <span className="text-slate-500 text-[11px]">Sin clave guardada</span>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 text-[11px]">Edge Ping Real:</span>
                    {provider.testedLatencyMs ? (
                      <span className="text-emerald-400 font-semibold tabular-nums">
                        {provider.testedLatencyMs}ms (medido)
                      </span>
                    ) : (
                      <span className="text-slate-500 text-[11px]">No medido</span>
                    )}
                  </div>

                  {provider.lastVerifiedAt && (
                    <div className="flex items-center justify-between text-[10px] text-slate-500 pt-0.5 border-t border-slate-900">
                      <span>Verificado:</span>
                      <span className="tabular-nums">
                        {new Date(provider.lastVerifiedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </div>
                  )}
                </div>

                {pingErrors[provider.id] && (
                  <div
                    role="alert"
                    className="bg-red-950/40 border border-red-800/60 text-red-200 text-xs rounded-lg p-2.5 flex items-start gap-1.5 font-mono"
                  >
                    <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                    <span>{pingErrors[provider.id]}</span>
                  </div>
                )}
              </div>

              {/* Key Management Form & Footer */}
              <div className="pt-4 mt-4 border-t border-slate-800/80 space-y-3">
                {isConfiguring ? (
                  <div className="space-y-2.5 animate-in fade-in">
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder={`Introduce la API key de ${provider.name}...`}
                        value={tempApiKey}
                        onChange={(e) => setTempApiKey(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 pr-9 text-xs font-mono text-white focus:outline-none focus:border-indigo-500 placeholder-slate-600"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                        title={showPassword ? 'Ocultar' : 'Mostrar'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>

                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      La clave se validará con una llamada de prueba inmediata y se cifrará con AES-256-GCM. La clave completa nunca se mostrará de nuevo.
                    </p>

                    {saveKeyError && (
                      <div
                        role="alert"
                        className="p-2 rounded bg-red-950/40 border border-red-800/60 text-red-200 text-xs font-mono flex items-start gap-1.5"
                      >
                        <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                        <span>{saveKeyError}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => handleSaveAndVerifyKey(provider.id)}
                        disabled={isSavingKey || !tempApiKey.trim()}
                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                      >
                        {isSavingKey ? (
                          <>
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            <span>Verificando...</span>
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>Guardar y Verificar</span>
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => {
                          setEditingProvider(null);
                          setTempApiKey('');
                          setSaveKeyError(null);
                        }}
                        className="px-2.5 py-1.5 text-slate-400 text-xs hover:text-white transition-colors cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-xs text-slate-400 font-mono gap-2">
                    <button
                      onClick={() => handleTestConnection(provider.id)}
                      disabled={isTesting || !provider.hasApiKey}
                      className="hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                      title={provider.hasApiKey ? 'Ejecutar ping de verificación' : 'Configura una clave para verificar'}
                    >
                      {isTesting ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        <Activity className="w-3.5 h-3.5 text-indigo-400" />
                      )}
                      <span>{isTesting ? 'Verificando...' : 'Test Ping'}</span>
                    </button>

                    <div className="flex items-center gap-2">
                      {provider.hasApiKey && (
                        <button
                          onClick={() => handleDeleteKey(provider.id)}
                          className="text-slate-500 hover:text-red-400 transition-colors p-1"
                          title="Eliminar clave cifrada del servidor"
                          aria-label={`Eliminar clave de ${provider.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        onClick={() => {
                          setEditingProvider(provider.id);
                          setTempApiKey('');
                          setSaveKeyError(null);
                        }}
                        className="text-indigo-400 hover:text-indigo-300 text-[11px] underline underline-offset-2 cursor-pointer"
                      >
                        {provider.hasApiKey ? 'Cambiar Clave' : 'Configurar Clave'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
