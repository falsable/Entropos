import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { Play, RotateCcw, Zap, Activity, Info, ShieldCheck } from 'lucide-react';
import { RouteExecution } from '../types/router';

interface NodeData extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  type: 'client' | 'gateway' | 'provider' | 'model';
  category: string;
  count: number;
  color: string;
  status: 'active' | 'idle';
  meta?: string;
}

interface LinkData extends d3.SimulationLinkDatum<NodeData> {
  source: string | NodeData;
  target: string | NodeData;
  trafficCount: number;
  value: number;
  activePulse?: boolean;
}

interface RoutingFlowGraphProps {
  recentExecutions: RouteExecution[];
  onTriggerSimulation?: () => void;
}

export const RoutingFlowGraph: React.FC<RoutingFlowGraphProps> = ({
  recentExecutions,
  onTriggerSimulation,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [selectedNode, setSelectedNode] = useState<NodeData | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'code' | 'lookup' | 'reasoning'>('all');

  // Dynamic topology derived from actual executions (or reference architecture when 0)
  const flowNodes: NodeData[] = useMemo(() => {
    const total = recentExecutions.length;

    const clientCounts = {
      claude_code: 0,
      cursor: 0,
      desktop: 0,
      windsurf: 0,
    };
    const providerCounts = {
      anthropic: 0,
      gemini: 0,
      deepseek: 0,
      openai: 0,
    };
    const modelCounts = {
      sonnet: 0,
      flash: 0,
      gpt6: 0,
      r1: 0,
    };

    recentExecutions.forEach((e) => {
      const origin = (e.clientOrigin || '').toLowerCase();
      if (origin.includes('cursor')) clientCounts.cursor++;
      else if (origin.includes('desktop')) clientCounts.desktop++;
      else if (origin.includes('windsurf')) clientCounts.windsurf++;
      else clientCounts.claude_code++;

      const prov = (e.provider || '').toLowerCase();
      if (prov.includes('gemini') || prov.includes('google')) providerCounts.gemini++;
      else if (prov.includes('deepseek')) providerCounts.deepseek++;
      else if (prov.includes('openai')) providerCounts.openai++;
      else providerCounts.anthropic++;

      const model = (e.selectedModel || '').toLowerCase();
      if (model.includes('flash')) modelCounts.flash++;
      else if (model.includes('r1') || model.includes('deepseek')) modelCounts.r1++;
      else if (model.includes('gpt') || model.includes('openai')) modelCounts.gpt6++;
      else modelCounts.sonnet++;
    });

    const hasData = total > 0;

    return [
      // Layer 1: MCP Clients (Left)
      {
        id: 'client_claude_code',
        name: 'Claude Code CLI',
        type: 'client',
        category: 'Source',
        count: clientCounts.claude_code,
        color: '#f59e0b',
        status: clientCounts.claude_code > 0 ? 'active' : 'idle',
        meta: 'CLI Terminal',
      },
      {
        id: 'client_cursor',
        name: 'Cursor IDE',
        type: 'client',
        category: 'Source',
        count: clientCounts.cursor,
        color: '#38bdf8',
        status: clientCounts.cursor > 0 ? 'active' : 'idle',
        meta: 'Developer Editor',
      },
      {
        id: 'client_desktop',
        name: 'Claude Desktop',
        type: 'client',
        category: 'Source',
        count: clientCounts.desktop,
        color: '#fb923c',
        status: clientCounts.desktop > 0 ? 'active' : 'idle',
        meta: 'Desktop App',
      },
      {
        id: 'client_windsurf',
        name: 'Windsurf',
        type: 'client',
        category: 'Source',
        count: clientCounts.windsurf,
        color: '#818cf8',
        status: clientCounts.windsurf > 0 ? 'active' : 'idle',
        meta: 'Agentic IDE',
      },

      // Layer 2: Core Gateway (Center)
      {
        id: 'gateway_entropos',
        name: 'Entropos Gateway',
        type: 'gateway',
        category: 'Core Engine',
        count: total,
        color: '#6366f1',
        status: hasData ? 'active' : 'idle',
        meta: hasData ? `${total} routed queries` : 'Standby · Ready for MCP queries',
      },

      // Layer 3: Providers (Right-Middle)
      {
        id: 'prov_anthropic',
        name: 'Anthropic',
        type: 'provider',
        category: 'Upstream',
        count: providerCounts.anthropic,
        color: '#d97706',
        status: providerCounts.anthropic > 0 ? 'active' : 'idle',
        meta: 'Claude Pool',
      },
      {
        id: 'prov_gemini',
        name: 'Google Gemini',
        type: 'provider',
        category: 'Upstream',
        count: providerCounts.gemini,
        color: '#10b981',
        status: providerCounts.gemini > 0 ? 'active' : 'idle',
        meta: 'Flash & Pro Pool',
      },
      {
        id: 'prov_deepseek',
        name: 'DeepSeek',
        type: 'provider',
        category: 'Upstream',
        count: providerCounts.deepseek,
        color: '#8b5cf6',
        status: providerCounts.deepseek > 0 ? 'active' : 'idle',
        meta: 'R1 Reasoning Pool',
      },
      {
        id: 'prov_openai',
        name: 'OpenAI',
        type: 'provider',
        category: 'Upstream',
        count: providerCounts.openai,
        color: '#14b8a6',
        status: providerCounts.openai > 0 ? 'active' : 'idle',
        meta: 'GPT Models Pool',
      },

      // Layer 4: Target Models (Far Right)
      {
        id: 'model_sonnet',
        name: 'Claude Sonnet 5.5',
        type: 'model',
        category: 'Model',
        count: modelCounts.sonnet,
        color: '#f59e0b',
        status: modelCounts.sonnet > 0 ? 'active' : 'idle',
        meta: 'Frontier Coding',
      },
      {
        id: 'model_flash',
        name: 'Gemini 3.8 Flash',
        type: 'model',
        category: 'Model',
        count: modelCounts.flash,
        color: '#10b981',
        status: modelCounts.flash > 0 ? 'active' : 'idle',
        meta: 'Low-latency Fast',
      },
      {
        id: 'model_gpt6',
        name: 'GPT-6 Astra',
        type: 'model',
        category: 'Model',
        count: modelCounts.gpt6,
        color: '#14b8a6',
        status: modelCounts.gpt6 > 0 ? 'active' : 'idle',
        meta: 'Frontier Reasoning',
      },
      {
        id: 'model_r1',
        name: 'DeepSeek R1',
        type: 'model',
        category: 'Model',
        count: modelCounts.r1,
        color: '#8b5cf6',
        status: modelCounts.r1 > 0 ? 'active' : 'idle',
        meta: 'Math & Logic Reasoning',
      },
    ];
  }, [recentExecutions]);

  const flowLinks: LinkData[] = useMemo(() => {
    const total = recentExecutions.length;
    const computeVal = (cnt: number) => {
      if (!total || !cnt) return 1.5;
      return Math.max(1.5, Math.min(5, (cnt / total) * 5 + 1));
    };

    const nodeMap = new Map(flowNodes.map((n) => [n.id, n.count]));

    return [
      // Clients -> Gateway
      { source: 'client_claude_code', target: 'gateway_entropos', trafficCount: nodeMap.get('client_claude_code') || 0, value: computeVal(nodeMap.get('client_claude_code') || 0) },
      { source: 'client_cursor', target: 'gateway_entropos', trafficCount: nodeMap.get('client_cursor') || 0, value: computeVal(nodeMap.get('client_cursor') || 0) },
      { source: 'client_desktop', target: 'gateway_entropos', trafficCount: nodeMap.get('client_desktop') || 0, value: computeVal(nodeMap.get('client_desktop') || 0) },
      { source: 'client_windsurf', target: 'gateway_entropos', trafficCount: nodeMap.get('client_windsurf') || 0, value: computeVal(nodeMap.get('client_windsurf') || 0) },

      // Gateway -> Providers
      { source: 'gateway_entropos', target: 'prov_anthropic', trafficCount: nodeMap.get('prov_anthropic') || 0, value: computeVal(nodeMap.get('prov_anthropic') || 0) },
      { source: 'gateway_entropos', target: 'prov_gemini', trafficCount: nodeMap.get('prov_gemini') || 0, value: computeVal(nodeMap.get('prov_gemini') || 0) },
      { source: 'gateway_entropos', target: 'prov_deepseek', trafficCount: nodeMap.get('prov_deepseek') || 0, value: computeVal(nodeMap.get('prov_deepseek') || 0) },
      { source: 'gateway_entropos', target: 'prov_openai', trafficCount: nodeMap.get('prov_openai') || 0, value: computeVal(nodeMap.get('prov_openai') || 0) },

      // Providers -> Models
      { source: 'prov_anthropic', target: 'model_sonnet', trafficCount: nodeMap.get('model_sonnet') || 0, value: computeVal(nodeMap.get('model_sonnet') || 0) },
      { source: 'prov_gemini', target: 'model_flash', trafficCount: nodeMap.get('model_flash') || 0, value: computeVal(nodeMap.get('model_flash') || 0) },
      { source: 'prov_openai', target: 'model_gpt6', trafficCount: nodeMap.get('model_gpt6') || 0, value: computeVal(nodeMap.get('model_gpt6') || 0) },
      { source: 'prov_deepseek', target: 'model_r1', trafficCount: nodeMap.get('model_r1') || 0, value: computeVal(nodeMap.get('model_r1') || 0) },
    ];
  }, [flowNodes, recentExecutions]);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const width = containerRef.current.clientWidth || 900;
    const height = 480;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', '100%').attr('height', height);

    // Definitions for arrowheads and glow filters
    const defs = svg.append('defs');

    // Subtle glow filter
    const filter = defs.append('filter').attr('id', 'glow').attr('x', '-20%').attr('y', '-20%').attr('width', '140%').attr('height', '140%');
    filter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'coloredBlur');
    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Arrow markers
    defs.append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 22)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-4L8,0L0,4')
      .attr('fill', '#475569');

    // Static layer positioning for clean visual architecture
    const nodesCopy = flowNodes.map((d) => ({ ...d }));
    const linksCopy = flowLinks.map((d) => ({ ...d }));

    // Pre-calculate clean layered layout positions
    const clients = nodesCopy.filter((n) => n.type === 'client');
    clients.forEach((c, i) => {
      c.x = 110;
      c.y = 80 + i * ((height - 160) / (clients.length - 1 || 1));
    });

    const gateway = nodesCopy.find((n) => n.type === 'gateway');
    if (gateway) {
      gateway.x = width * 0.40;
      gateway.y = height / 2;
    }

    const providers = nodesCopy.filter((n) => n.type === 'provider');
    providers.forEach((p, i) => {
      p.x = width * 0.68;
      p.y = 80 + i * ((height - 160) / (providers.length - 1 || 1));
    });

    const models = nodesCopy.filter((n) => n.type === 'model');
    models.forEach((m, i) => {
      m.x = width * 0.88;
      m.y = 80 + i * ((height - 160) / (models.length - 1 || 1));
    });

    // Create container group for zoom/pan
    const g = svg.append('g').attr('class', 'graph-container');

    // Zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.7, 2.0])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    // Links Path Generator (Smooth Cubic Beziers)
    const linkPath = (d: any) => {
      const source = typeof d.source === 'object' ? d.source : nodesCopy.find((n) => n.id === d.source);
      const target = typeof d.target === 'object' ? d.target : nodesCopy.find((n) => n.id === d.target);
      if (!source || !target) return '';

      const sx = source.x;
      const sy = source.y;
      const tx = target.x;
      const ty = target.y;

      if (sx === undefined || sy === undefined || tx === undefined || ty === undefined) return '';

      const dx = tx - sx;

      return `M ${sx} ${sy} C ${sx + dx * 0.5} ${sy}, ${sx + dx * 0.5} ${ty}, ${tx} ${ty}`;
    };

    // Render Link Lines
    const linkGroup = g.append('g').attr('class', 'links');
    linkGroup
      .selectAll('path')
      .data(linksCopy)
      .enter()
      .append('path')
      .attr('d', linkPath)
      .attr('fill', 'none')
      .attr('stroke', '#334155')
      .attr('stroke-width', (d) => Math.max(1.5, Math.min(4, d.value)))
      .attr('stroke-opacity', 0.6)
      .attr('marker-end', 'url(#arrow)');

    // Render Flow Particles (Animated request packets traveling along links)
    const particleGroup = g.append('g').attr('class', 'particles');

    const animateParticles = () => {
      linksCopy.forEach((linkObj, idx) => {
        const source = typeof linkObj.source === 'object' ? linkObj.source : nodesCopy.find((n) => n.id === linkObj.source);
        const target = typeof linkObj.target === 'object' ? linkObj.target : nodesCopy.find((n) => n.id === linkObj.target);
        if (!source || !target) return;

        const particle = particleGroup
          .append('circle')
          .attr('r', 3)
          .attr('fill', source.type === 'client' ? '#38bdf8' : '#818cf8')
          .attr('opacity', 0.9)
          .attr('filter', 'url(#glow)');

        const sx = source.x;
        const sy = source.y;
        const tx = target.x;
        const ty = target.y;

        if (sx === undefined || sy === undefined || tx === undefined || ty === undefined) return;

        const dx = tx - sx;

        // Custom bezier interpolation
        const duration = 1400 + (idx % 4) * 300;
        particle
          .transition()
          .duration(duration)
          .ease(d3.easeLinear)
          .attrTween('transform', () => {
            return (t: number) => {
              const p0 = { x: sx, y: sy };
              const p1 = { x: sx + dx * 0.5, y: sy };
              const p2 = { x: sx + dx * 0.5, y: ty };
              const p3 = { x: tx, y: ty };

              const cx = 3 * (p1.x - p0.x);
              const bx = 3 * (p2.x - p1.x) - cx;
              const ax = p3.x - p0.x - cx - bx;

              const cy = 3 * (p1.y - p0.y);
              const by = 3 * (p2.y - p1.y) - cy;
              const ay = p3.y - p0.y - cy - by;

              const xt = ax * Math.pow(t, 3) + bx * Math.pow(t, 2) + cx * t + p0.x;
              const yt = ay * Math.pow(t, 3) + by * Math.pow(t, 2) + cy * t + p0.y;

              return `translate(${xt}, ${yt})`;
            };
          })
          .on('end', function () {
            d3.select(this).remove();
          });
      });
    };

    // Initial and recurring particle stream
    animateParticles();
    const interval = setInterval(animateParticles, 1800);

    // Render Nodes Group
    const nodeGroup = g.append('g').attr('class', 'nodes');
    const node = nodeGroup
      .selectAll('g')
      .data(nodesCopy)
      .enter()
      .append('g')
      .attr('transform', (d) => `translate(${d.x}, ${d.y})`)
      .attr('cursor', 'pointer')
      .on('click', (event, d) => {
        setSelectedNode(d);
      })
      .on('mouseenter', function (event, d) {
        d3.select(this).select('circle.outer').attr('stroke', '#818cf8').attr('stroke-width', 2.5);
      })
      .on('mouseleave', function (event, d) {
        d3.select(this).select('circle.outer').attr('stroke', '#475569').attr('stroke-width', 1.5);
      });

    // Outer Circle (ring)
    node
      .append('circle')
      .attr('class', 'outer')
      .attr('r', (d) => (d.type === 'gateway' ? 24 : d.type === 'provider' ? 18 : 14))
      .attr('fill', '#0f172a')
      .attr('stroke', '#475569')
      .attr('stroke-width', 1.5);

    // Inner Core Circle
    node
      .append('circle')
      .attr('r', (d) => (d.type === 'gateway' ? 14 : d.type === 'provider' ? 10 : 7))
      .attr('fill', (d) => d.color);

    // Node Labels
    node
      .append('text')
      .attr('dy', (d) => (d.type === 'gateway' ? 36 : 28))
      .attr('text-anchor', 'middle')
      .attr('font-size', '11px')
      .attr('font-family', 'ui-monospace, monospace')
      .attr('font-weight', (d) => (d.type === 'gateway' ? '700' : '500'))
      .attr('fill', '#f1f5f9')
      .text((d) => d.name);

    // Secondary count / metadata subtitle
    node
      .append('text')
      .attr('dy', (d) => (d.type === 'gateway' ? 48 : 40))
      .attr('text-anchor', 'middle')
      .attr('font-size', '9px')
      .attr('font-family', 'ui-monospace, monospace')
      .attr('fill', '#94a3b8')
      .text((d) => `${d.count} reqs`);

    return () => {
      clearInterval(interval);
    };
  }, [flowNodes, flowLinks, isSimulating]);

  const handleSimulatePulse = () => {
    setIsSimulating((prev) => !prev);
    if (onTriggerSimulation) {
      onTriggerSimulation();
    }
  };

  const avgLatency =
    recentExecutions.length > 0
      ? Math.round(
          recentExecutions.reduce((acc, r) => acc + (r.speedLatencyMs || 0), 0) / recentExecutions.length
        )
      : null;

  return (
    <div className="space-y-6">
      {/* Editorial Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-white">
              MCP Routing Flow Topology
            </h1>
            <span className="text-xs font-mono font-normal text-slate-400">
              (D3 Force Topology)
            </span>
            {recentExecutions.length === 0 ? (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400 border border-slate-700">
                Topología de referencia
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                {recentExecutions.length} peticiones enrutadas
              </span>
            )}
          </div>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Grafo dirigido de enrutamiento que refleja el flujo de peticiones Model Context Protocol hacia los proveedores LLM y modelos especializados.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleSimulatePulse}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer"
            title="Envía una consulta de prueba aislada sin alterar contadores de producción"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400 fill-current" />
            <span>Simular pulso de tráfico</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/30">
              Simulado
            </span>
          </button>
        </div>
      </div>

      {/* Main Graph Visualization Container */}
      <div
        ref={containerRef}
        className="relative bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-sm"
      >
        {/* Top Legend Bar */}
        <div className="px-5 py-3 border-b border-slate-800/80 bg-slate-950/70 flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
          <div className="flex items-center gap-5 text-slate-400">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
              <span>MCP Client Sources</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
              <span>Entropos Core Gateway</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <span>Target Upstream Providers</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-violet-400" />
              <span>Specialized Models</span>
            </div>
          </div>

          <div className="text-slate-500 text-[11px]">
            Arrastra o haz zoom • Clic en cualquier nodo para inspeccionar
          </div>
        </div>

        {/* SVG Canvas */}
        <svg ref={svgRef} className="w-full bg-[#070b14] select-none block" />

        {/* Interactive Node Inspection Card Overlay */}
        {selectedNode && (
          <div className="absolute top-16 right-4 p-4 rounded-xl bg-slate-950/95 border border-slate-800 font-mono text-xs w-72 shadow-2xl space-y-2 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="font-bold text-white">{selectedNode.name}</div>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-slate-500 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1 text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-500">Node Type:</span>
                <span className="capitalize text-slate-200">{selectedNode.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Routed Requests:</span>
                <span className="text-emerald-400 font-bold tabular-nums">{selectedNode.count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status:</span>
                <span className="text-slate-200 capitalize">{selectedNode.status}</span>
              </div>
              {selectedNode.meta && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Details:</span>
                  <span className="text-slate-300 text-[11px] truncate max-w-[140px]">
                    {selectedNode.meta}
                  </span>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-slate-800/80 text-[10px] text-slate-500">
              {selectedNode.status === 'active'
                ? `Endpoint activo • ${selectedNode.count} peticiones procesadas`
                : 'Endpoint en espera (standby) • Sin tráfico registrado aún'}
            </div>
          </div>
        )}
      </div>

      {/* Summary KPI Strip Below Graph */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 space-y-1">
          <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
            Flow Routing Latency
          </div>
          <div className="text-lg font-bold font-mono text-white tabular-nums">
            {avgLatency !== null ? (
              <>
                {avgLatency}ms <span className="text-xs text-slate-400 font-normal">latencia media medida</span>
              </>
            ) : (
              <>
                — <span className="text-xs text-slate-500 font-normal">sin tráfico medido aún</span>
              </>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {avgLatency !== null
              ? `Promedio real medido sobre ${recentExecutions.length} ejecuciones enrutadas.`
              : 'Medido sobre tráfico real. Sobrecarga de clasificación local en memoria < 5ms.'}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 space-y-1">
          <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
            Active MCP Transports
          </div>
          <div className="text-lg font-bold font-mono text-emerald-400 tabular-nums">
            HTTP JSON-RPC & Server-Sent Events (SSE)
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Dual protocol support for CLI tools (Claude Code) and IDE persistent streams (Cursor, Windsurf).
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 space-y-1">
          <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
            Routing Fault Tolerance
          </div>
          <div className="text-lg font-bold font-mono text-indigo-400 tabular-nums">
            Conmutación por error automática
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Circuit breakers multi-proveedor que desvían automáticamente a modelos de respaldo si el upstream satura o devuelve 429/5xx.
          </p>
        </div>
      </div>
    </div>
  );
};
