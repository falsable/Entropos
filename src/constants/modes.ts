import { RoutingMode } from '../types/router';

export interface RoutingModeDefinition {
  id: RoutingMode;
  name: string;
  shortName: string;
  buttonLabel: string;
  badge?: string;
  subtitle: string;
  description: string;
  modelsSummary: string;
  isFlagship?: boolean;
}

export const ROUTING_MODES: Record<RoutingMode, RoutingModeDefinition> = {
  adaptive: {
    id: 'adaptive',
    name: 'Adaptive Control Plane',
    shortName: 'Adaptive',
    buttonLabel: '⚡ Adaptive',
    badge: 'Flagship',
    subtitle: 'Enrutamiento adaptativo en lazo cerrado (~82% ahorro proyectado)',
    description:
      'Control de próxima generación: clasifica cada petición antes del despacho y calibra en línea a partir de los resultados de agentes posteriores. Resiliente ante caídas de proveedores y adaptativo al feedback de ejecución.',
    modelsSummary: 'Enrutamiento dinámico: Claude Sonnet 5.5 · GPT-6 Astra · Gemini 3.8 Flash · DeepSeek R1',
    isFlagship: true,
  },
  balanced: {
    id: 'balanced',
    name: 'Balanced Smart Heuristic',
    shortName: 'Balanced',
    buttonLabel: 'Balanced',
    badge: 'Popular',
    subtitle: 'Clasificación heurística dinámica de complejidad (~82% ahorro proyectado)',
    description:
      'Evalúa la complejidad sintáctica del prompt en tiempo real. Demostraciones matemáticas, código arquitectónico y refactorizaciones van a Claude Sonnet 5.5 o GPT-6 Astra; consultas generales usan Gemini 3.8 Flash.',
    modelsSummary: 'Claude Sonnet 5.5 (código complejo) · Gemini 3.8 Flash (consultas generales)',
  },
  cost_saver: {
    id: 'cost_saver',
    name: 'Speed & Cost Saver',
    shortName: 'Cost Saver',
    buttonLabel: 'Cost Saver',
    subtitle: 'Orientación a máximo ahorro y throughput (~95% ahorro proyectado)',
    description:
      'Prioriza modelos ligeros de ultra-alta velocidad (Gemini 3.1 Flash-Lite, Claude Haiku 5.5, GPT-6 Luna). Ideal para flujos de alta frecuencia, extracción de datos y automatización interna.',
    modelsSummary: 'Gemini 3.8 Flash · Claude Haiku 5.5 · GPT-6 Luna',
  },
  max_quality: {
    id: 'max_quality',
    name: 'Maximum Quality',
    shortName: 'Max Quality',
    buttonLabel: 'Max Quality',
    subtitle: 'Priorización de razonamiento frontera (~50% ahorro proyectado)',
    description:
      'Dirige tareas de razonamiento no triviales, verificación formal y generación crítica directamente a modelos de frontera superiores (Claude Sonnet 5.5 / Opus 5.5, GPT-6 Astra, DeepSeek R1, o3-mini).',
    modelsSummary: 'Claude Sonnet 5.5 · GPT-6 Astra · DeepSeek R1 · o3-mini',
  },
};

export const ROUTING_MODES_LIST: RoutingModeDefinition[] = [
  ROUTING_MODES.adaptive,
  ROUTING_MODES.balanced,
  ROUTING_MODES.cost_saver,
  ROUTING_MODES.max_quality,
];
