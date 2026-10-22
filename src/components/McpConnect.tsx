import React, { useState, useEffect } from 'react';
import {
  Copy,
  Check,
  Terminal,
  Play,
  RefreshCw,
  CheckCircle2,
  Key,
  ShieldCheck,
  Zap,
  Eye,
  EyeOff,
  Lock,
  Share2,
  ArrowRight,
  Radio,
  Sparkles,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { PublicWorkspaceKey, RouteExecution } from '../types/router';
import { buildClientSnippets, maskKey, ClientId, KEY_PLACEHOLDER } from '../lib/mcpSnippets';
import { errorMessage, fetchJson } from '../lib/api';

interface McpConnectProps {
  apiKeys: PublicWorkspaceKey[];
  // Creates the key on the server; the returned record is the only one that carries the full key.
  onCreateApiKey: (name: string, clientName: string) => Promise<PublicWorkspaceKey>;
  onSimulateMcpCall: () => void;
  onNavigateToTab?: (tab: string) => void;
  latestExecution?: RouteExecution | null;
}

export const McpConnect: React.FC<McpConnectProps> = ({
  apiKeys,
  onCreateApiKey,
  onSimulateMcpCall,
  onNavigateToTab,
  latestExecution: initialLatestExecution,
}) => {
  const [selectedClient, setSelectedClient] = useState<ClientId>('claude_code');
  const [copied, setCopied] = useState<string | null>(null);
  const [activeKeyId, setActiveKeyId] = useState<string>(apiKeys[0]?.id ?? '');
  const [keyError, setKeyError] = useState<string | null>(null);
  const [isCreatingKey, setIsCreatingKey] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState<boolean>(false);
  const [maskInPreview, setMaskInPreview] = useState<boolean>(true);
  const [newKeyName, setNewKeyName] = useState('');
  const [showKeyModal, setShowKeyModal] = useState(false);

  // One-time key reveal dialog after creation
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<PublicWorkspaceKey | null>(null);
  const [copiedRevealedKey, setCopiedRevealedKey] = useState(false);

  // Stepper progression tracking
  const [hasCopiedSnippet, setHasCopiedSnippet] = useState(false);

  // Server-polled latest execution for real-time request detection
  const [detectedExecution, setDetectedExecution] = useState<RouteExecution | null>(
    initialLatestExecution || null
  );
  const [isPolling, setIsPolling] = useState(true);

  // MCP protocol ping test
  const [mcpTestResult, setMcpTestResult] = useState<any | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [simulationSent, setSimulationSent] = useState(false);
  const [copiedShareLink, setCopiedShareLink] = useState(false);

  const baseOrigin = window.location.origin;

  // Sync latest execution from parent prop
  useEffect(() => {
    if (initialLatestExecution) {
      setDetectedExecution(initialLatestExecution);
    }
  }, [initialLatestExecution]);

  // Real-time polling: checks the server every 2.5s to detect the first real request
  useEffect(() => {
    let isMounted = true;
    const interval = setInterval(async () => {
      try {
        const res = await fetchJson<{ logs: RouteExecution[] }>('/api/history');
        if (isMounted && Array.isArray(res?.logs) && res.logs.length > 0) {
          setDetectedExecution(res.logs[0]);
        }
      } catch {
        // Fallback silently if unauthenticated or network drop
      }
    }, 2500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Update activeKeyId if apiKeys changes and no active key selected
  useEffect(() => {
    if (!activeKeyId && apiKeys.length > 0) {
      setActiveKeyId(apiKeys[0].id);
    }
  }, [apiKeys, activeKeyId]);

  // Keys load asynchronously; fall back to the first one when the selection is missing.
  const selectedKey = apiKeys.find((k) => k.id === activeKeyId) ?? apiKeys[0];
  // The full key is only known right after creation; otherwise snippets use a placeholder.
  const activeKey = selectedKey?.key ?? (newlyCreatedKey?.id === selectedKey?.id ? newlyCreatedKey?.key : '') ?? '';
  const keyLabel = activeKey ? maskKey(activeKey) : selectedKey ? `••••••••${selectedKey.last4}` : 'No key yet';

  const clientConfigs = buildClientSnippets(baseOrigin, activeKey || KEY_PLACEHOLDER);
  const previewConfigs = buildClientSnippets(baseOrigin, activeKey ? maskKey(activeKey) : KEY_PLACEHOLDER);
  const active = clientConfigs[selectedClient];
  // Copy always copies the real key; the mask only hides it on screen.
  const realSnippetToCopy = active.snippet;
  const snippetToDisplay = maskInPreview ? previewConfigs[selectedClient].snippet : realSnippetToCopy;

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    if (id === 'stepper_copy' || id === selectedClient) {
      setHasCopiedSnippet(true);
    }
    setTimeout(() => setCopied(null), 2000);
  };

  const handleCreateNewKey = async () => {
    if (!newKeyName.trim() || isCreatingKey) return;
    setIsCreatingKey(true);
    setKeyError(null);
    try {
      const created = await onCreateApiKey(newKeyName.trim(), selectedClient);
      setActiveKeyId(created.id);
      setNewKeyName('');
      setShowKeyModal(false);
      // Open the one-time reveal modal
      setNewlyCreatedKey(created);
      setCopiedRevealedKey(false);
    } catch (err) {
      setKeyError(`Could not create the key: ${errorMessage(err)}`);
    } finally {
      setIsCreatingKey(false);
    }
  };

  const handleCopyRevealedKey = () => {
    if (newlyCreatedKey?.key) {
      navigator.clipboard.writeText(newlyCreatedKey.key);
      setCopiedRevealedKey(true);
      setTimeout(() => setCopiedRevealedKey(false), 2500);
    }
  };

  const handleDismissRevealModal = () => {
    setNewlyCreatedKey(null);
  };

  const handleRunSimulation = () => {
    onSimulateMcpCall();
    setSimulationSent(true);
    setTimeout(() => setSimulationSent(false), 3000);
  };

  const handleCopyShareLink = () => {
    const shareUrl = `${window.location.origin}/app/connect`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedShareLink(true);
    setTimeout(() => setCopiedShareLink(false), 2000);
  };

  const handleTestMcp = async () => {
    if (!activeKey) return;
    setIsTesting(true);
    setMcpTestResult(null);
    try {
      const res = await fetch('/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${activeKey}` },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
        }),
      });
      const text = await res.text();
      let body: any = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = null;
      }
      const tools = body?.result?.tools;
      if (res.ok && Array.isArray(tools)) {
        setMcpTestResult({ ok: true, status: res.status, toolCount: tools.length, body });
      } else {
        const reason =
          body?.error?.message ??
          (typeof body?.error === 'string' ? body.error : null) ??
          body?.message ??
          (res.ok ? 'The response has no result.tools list.' : 'The server rejected the handshake.');
        setMcpTestResult({ ok: false, status: res.status, message: String(reason), body });
      }
    } catch {
      setMcpTestResult({
        ok: false,
        status: 0,
        message: 'Could not reach the Entropos server. Check that it is running and try again.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-8 font-sans">
      {/* Editorial Title & Share Link */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-indigo-950/60 border border-indigo-800/60 text-[11px] font-mono text-indigo-300 mb-2">
            <span>Asistente de Activación Rápida</span>
            <span>·</span>
            <span>Tiempo medido &lt; 5 minutos</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Model Context Protocol & SDK Setup
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Conecta tu asistente de código (Claude Code, Cursor, Windsurf o Python SDK) a Entropos. Cada petición se analiza antes del gasto y se enruta de forma transparente al motor más eficiente.
          </p>
        </div>
        <button
          onClick={handleCopyShareLink}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-mono text-slate-300 hover:text-white transition-colors cursor-pointer shrink-0 self-start sm:self-auto"
          title="Copiar enlace directo a esta pantalla"
        >
          {copiedShareLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5 text-indigo-400" />}
          <span>{copiedShareLink ? '¡Enlace copiado!' : 'Compartir enlace'}</span>
        </button>
      </div>

      {/* 3-Step Guided Onboarding Stepper */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Step 1: Workspace Token */}
        <div className={`p-4 rounded-xl border space-y-2.5 transition-all ${
          apiKeys.length > 0
            ? 'bg-slate-900/60 border-slate-800'
            : 'bg-indigo-950/20 border-indigo-500/50 shadow-sm'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-indigo-400 font-semibold uppercase flex items-center gap-1.5">
              <span>Paso 1</span>
              {apiKeys.length > 0 && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
            </span>
            <span className="text-xs text-slate-500 font-mono">Workspace Token</span>
          </div>
          <div className="text-sm font-semibold text-white">Crea tu clave en el servidor</div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Generada en el servidor y mostrada una sola vez. Identifica este workspace y autoriza el tráfico.
          </p>

          <div className="pt-1 flex items-center gap-2">
            <select
              value={selectedKey?.id ?? ''}
              onChange={(e) => setActiveKeyId(e.target.value)}
              disabled={apiKeys.length === 0}
              className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs font-mono text-slate-300 focus:outline-none focus:border-indigo-500 flex-1 truncate"
            >
              {apiKeys.length === 0 && <option value="">Sin claves generadas</option>}
              {apiKeys.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name} (••••{k.last4})
                </option>
              ))}
            </select>
            <button
              onClick={() => setShowKeyModal(true)}
              className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-mono font-medium transition-colors cursor-pointer flex items-center gap-1 shrink-0"
              title="Generar nueva clave"
            >
              <Key className="w-3 h-3" />
              <span>+ Nueva</span>
            </button>
          </div>

          {/* Key Concealment & Quick Copy Strip */}
          <div className="flex items-center justify-between gap-2 p-2 rounded bg-slate-950/80 border border-slate-800/80 text-[11px] font-mono">
            <div className="flex items-center gap-1.5 text-slate-400 truncate">
              <Lock className="w-3 h-3 text-slate-500 shrink-0" />
              <span className="text-slate-300 select-all truncate">
                {showSecretKey && activeKey ? activeKey : keyLabel}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setShowSecretKey(!showSecretKey)}
                disabled={!activeKey}
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                title={showSecretKey ? 'Ocultar valor' : 'Revelar valor'}
              >
                {showSecretKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => handleCopy(activeKey, 'key_only')}
                disabled={!activeKey}
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                title="Copiar token"
              >
                {copied === 'key_only' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>
          {!activeKey && (
            <p className="text-[11px] text-amber-300/90 leading-relaxed">
              {selectedKey
                ? 'Las claves se muestran una sola vez al crearse. Genera una nueva clave con "+ Nueva" para obtener un snippet listo para pegar.'
                : 'No hay claves en este workspace. Genera una con "+ Nueva" para continuar.'}
            </p>
          )}
        </div>

        {/* Step 2: Configuration */}
        <div className={`p-4 rounded-xl border space-y-2.5 transition-all ${
          hasCopiedSnippet
            ? 'bg-slate-900/60 border-slate-800'
            : apiKeys.length > 0
            ? 'bg-indigo-950/20 border-indigo-500/50 shadow-sm'
            : 'bg-slate-900/60 border-slate-800 opacity-80'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-indigo-400 font-semibold uppercase flex items-center gap-1.5">
              <span>Paso 2</span>
              {hasCopiedSnippet && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
            </span>
            <span className="text-xs text-slate-500 font-mono">Configuración</span>
          </div>
          <div className="text-sm font-semibold text-white">Elige cliente y copia snippet</div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Pega el snippet con tu clave en Claude Code, Cursor o tu SDK preferido.
          </p>
          <div className="pt-2">
            <button
              onClick={() => handleCopy(realSnippetToCopy, 'stepper_copy')}
              className="w-full py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono border border-slate-700 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              {copied === 'stepper_copy' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-300 font-semibold">✓ Copiado al portapapeles</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                  <span>Copiar configuración activa</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Step 3: Verification & Real Request Detection */}
        <div className={`p-4 rounded-xl border space-y-2.5 transition-all ${
          detectedExecution
            ? 'bg-emerald-950/20 border-emerald-500/50 shadow-sm'
            : 'bg-slate-900/60 border-slate-800'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-indigo-400 font-semibold uppercase flex items-center gap-1.5">
              <span>Paso 3</span>
              {detectedExecution && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
            </span>
            <span className="text-xs text-slate-500 font-mono">Verificación en Vivo</span>
          </div>

          {detectedExecution ? (
            /* Request Detected State */
            <div className="space-y-2 animate-in fade-in">
              <div className="text-sm font-semibold text-emerald-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>¡Petición recibida con éxito!</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                El gateway procesó tu llamada enrutándola a{' '}
                <strong className="text-white">{detectedExecution.selectedModel}</strong>.
              </p>
              {onNavigateToTab && (
                <div className="pt-1">
                  <button
                    onClick={() => onNavigateToTab('history')}
                    className="w-full py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <span>Ver tu ahorro en el panel</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Waiting for First Request Radar State */
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                </span>
                <span className="text-sm font-semibold text-white">
                  Esperando tu primera petición…
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Escuchando llamadas entrantes en <code className="text-slate-300 font-mono">/mcp</code> y{' '}
                <code className="text-slate-300 font-mono">/v1</code>.
              </p>
              <div className="pt-2">
                <button
                  onClick={handleRunSimulation}
                  className="w-full py-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  title="Ejecuta una petición de prueba inmediata"
                >
                  <Play className="w-3 h-3 text-indigo-400 fill-current" />
                  <span>{simulationSent ? '✓ Consulta enviada' : 'Probar petición de prueba'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* One-Time Full Key Reveal Modal */}
      {newlyCreatedKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  Clave de Workspace Creada
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Por seguridad, esta clave <strong>se muestra una sola vez</strong>. Guárdala en tu gestor de secretos o cópiala directamente en la configuración de tu cliente.
                </p>
              </div>
            </div>

            {/* Secret Key Display Box */}
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                <span>{newlyCreatedKey.name}</span>
                <span className="text-emerald-400">Generada en el servidor</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={newlyCreatedKey.key}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs font-mono text-indigo-300 select-all focus:outline-none"
                />
                <button
                  onClick={handleCopyRevealedKey}
                  className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-mono font-medium transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
                >
                  {copiedRevealedKey ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedRevealedKey ? '¡Copiada!' : 'Copiar'}</span>
                </button>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-indigo-950/40 border border-indigo-800/40 text-xs text-indigo-300 space-y-1">
              <p className="font-semibold">Siguiente paso:</p>
              <p className="text-[11px] text-indigo-300/80">
                Esta clave ya ha sido preseleccionada en tu snippet de configuración abajo. Puedes continuar al Paso 2 para copiar el comando listo para ejecutar.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={handleDismissRevealModal}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <span>Continuar al Paso 2 (Configurar cliente)</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Key Input Modal */}
      {showKeyModal && (
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 font-mono text-xs">
          <div className="text-slate-300 font-semibold">Generar Nueva Clave de Workspace:</div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="p. ej. Mi Portátil (Claude Code)"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-800 rounded p-2 text-white focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={handleCreateNewKey}
              disabled={isCreatingKey}
              className="px-3 py-2 bg-indigo-600 text-white rounded font-medium hover:bg-indigo-500 cursor-pointer disabled:opacity-50"
            >
              {isCreatingKey ? 'Generando…' : 'Crear en el Servidor'}
            </button>
            <button
              onClick={() => setShowKeyModal(false)}
              className="px-3 py-2 bg-slate-800 text-slate-400 rounded hover:text-white cursor-pointer"
            >
              Cancelar
            </button>
          </div>
          {keyError && (
            <p role="alert" className="text-red-300">
              {keyError}
            </p>
          )}
          <p className="text-slate-500">
            La clave real se creará en SQLite mediante scrypt y se mostrará en pantalla una sola vez.
          </p>
        </div>
      )}

      {/* Vía de Integración & Ahorro Real (Entropos-ugg.11) */}
      <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 text-xs space-y-2">
        <div className="flex items-center gap-2 text-indigo-400 font-semibold font-mono text-[11px] uppercase tracking-wider">
          <Zap className="w-3.5 h-3.5" />
          <span>¿Cómo ahorra cada vía de conexión?</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-slate-300">
          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-1">
            <span className="font-semibold text-white">SDK / Proxy OpenAI (/v1):</span>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Enruta <strong>el 100% del tráfico</strong> de tus aplicaciones y scripts. Sustituye la base_url de OpenAI para reducir costes en cada llamada sin cambiar tu código.
            </p>
          </div>
          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-1">
            <span className="font-semibold text-white">Herramientas MCP (/mcp):</span>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Ahorra en <strong>las tareas que el agente delega</strong> a <code className="text-indigo-300 font-mono">smart_generate</code>. Para interceptar las llamadas internas del modelo principal de Claude Code se requiere gateway Anthropic (ANTHROPIC_BASE_URL, roadmap Fase 2).
            </p>
          </div>
        </div>
      </div>

      {/* Main Configuration Card */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
        {/* Client Switcher Tabs */}
        <div className="flex items-center gap-1 p-2 bg-slate-950/70 border-b border-slate-800 overflow-x-auto scrollbar-none">
          {(Object.keys(clientConfigs) as (keyof typeof clientConfigs)[]).map((key) => {
            const isSelected = selectedClient === key;
            return (
              <button
                key={key}
                onClick={() => setSelectedClient(key)}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <span>{clientConfigs[key].name}</span>
                <span className="text-[10px] text-slate-500 font-mono">({clientConfigs[key].label})</span>
              </button>
            );
          })}
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-300 max-w-xl">
              {active.instruction}
            </p>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400 hover:text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={maskInPreview}
                  onChange={(e) => setMaskInPreview(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-0 w-3.5 h-3.5"
                />
                <span>Ocultar clave en vista previa</span>
              </label>

              <button
                onClick={() => handleCopy(realSnippetToCopy, selectedClient)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-mono font-medium transition-colors cursor-pointer shadow-sm active:scale-95"
              >
                {copied === selectedClient ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5 text-white" />}
                <span>{copied === selectedClient ? '¡Copiado!' : 'Copiar configuración'}</span>
              </button>
            </div>
          </div>

          {/* Terminal / Code Box */}
          <div className="relative rounded-lg bg-slate-950 border border-slate-800/90 overflow-hidden font-mono text-xs">
            <div className="px-4 py-2 border-b border-slate-800/80 bg-slate-900/40 flex items-center justify-between text-slate-400 text-[11px]">
              <span>{active.kind === 'command' ? 'Terminal Command' : 'JSON Configuration'}</span>
              <span className="text-slate-500 truncate max-w-sm">
                Server URL: {baseOrigin}/mcp
              </span>
            </div>
            <pre className="p-4 text-slate-200 overflow-x-auto leading-relaxed scrollbar-thin">
              {snippetToDisplay}
            </pre>
          </div>
        </div>
      </div>

      {/* Real-Time Request Detection Banner / First Usage Card */}
      {detectedExecution && (
        <div className="p-5 rounded-xl bg-slate-900/40 border border-slate-800 space-y-4 animate-in fade-in">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-white">
                  Primera Petición Enrutada con Éxito
                </h3>
                <p className="text-xs text-slate-400">
                  Detectada en vivo desde el servidor · Latencia y coste registrados
                </p>
              </div>
            </div>

            {onNavigateToTab && (
              <button
                onClick={() => onNavigateToTab('history')}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <span>Ver tu ahorro completo</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Detailed Request Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-lg bg-slate-950/80 border border-slate-800/80 font-mono text-xs">
            <div>
              <span className="text-[10px] text-slate-500 uppercase">Modelo Asignado</span>
              <div className="text-white font-semibold mt-0.5 truncate">{detectedExecution.selectedModel}</div>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase">Proveedor</span>
              <div className="text-indigo-400 font-semibold mt-0.5">{detectedExecution.provider}</div>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase">Coste Real</span>
              <div className="text-slate-200 font-semibold mt-0.5">${detectedExecution.costUsd.toFixed(5)} USD</div>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase">Ahorro vs Frontera</span>
              <div className="text-emerald-400 font-semibold mt-0.5">
                {detectedExecution.savedPercentage}% (${detectedExecution.savedUsd.toFixed(4)})
              </div>
            </div>
          </div>

          {detectedExecution.promptSnippet && (
            <div className="text-xs text-slate-400 font-mono truncate">
              <span className="text-slate-500">Prompt: </span>
              <span>"{detectedExecution.promptSnippet}"</span>
            </div>
          )}
        </div>
      )}

      {/* Protocol Health & Testing */}
      <div className="p-5 rounded-xl bg-slate-900/40 border border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-xs font-semibold text-white">
              Handshake Protocol Ping
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Envía tu clave a /mcp y comprueba que el servidor responde con el catálogo MCP 2024-11-05.
            </p>
          </div>

          <button
            onClick={handleTestMcp}
            disabled={isTesting || !activeKey}
            title={activeKey ? undefined : 'Crea una clave primero para probar el handshake.'}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono border border-slate-700 transition-colors cursor-pointer disabled:opacity-50"
          >
            {isTesting ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 text-indigo-400 fill-current" />
            )}
            <span>Probar Handshake</span>
          </button>
        </div>

        {mcpTestResult && mcpTestResult.ok && (
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-xs font-mono space-y-1.5">
            <div className="flex items-center gap-1.5 text-emerald-400 font-semibold text-[11px]">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>HTTP {mcpTestResult.status} — Handshake Exitoso ({mcpTestResult.toolCount} herramientas registradas)</span>
            </div>
            <pre className="text-slate-300 text-[11px] overflow-x-auto max-h-36 scrollbar-thin">
              {JSON.stringify(mcpTestResult.body, null, 2)}
            </pre>
          </div>
        )}
        {mcpTestResult && !mcpTestResult.ok && (
          <div role="alert" className="bg-red-950/40 border border-red-800/60 text-red-200 text-xs rounded-lg p-3 space-y-1.5">
            <div className="font-semibold">
              Handshake fallido{mcpTestResult.status ? ` (HTTP ${mcpTestResult.status})` : ''}: {mcpTestResult.message}
            </div>
            {mcpTestResult.body && (
              <pre className="text-red-200/80 text-[11px] overflow-x-auto max-h-36 scrollbar-thin">
                {JSON.stringify(mcpTestResult.body, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
