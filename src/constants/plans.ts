import { SubscriptionPlanId } from '../types/router';

export interface PlanDefinition {
  id: SubscriptionPlanId;
  name: string;
  tagline: string;
  priceMonthlyUsd: number;
  priceAnnualMonthlyUsd: number;
  priceDisplay: string;
  periodDisplay: string;
  quotaDisplay: string;
  quotaMonthly: number;
  features: string[];
  buttonText: string;
  isPopular?: boolean;
}

export const PLANS: Record<SubscriptionPlanId, PlanDefinition> = {
  developer: {
    id: 'developer',
    name: 'Developer',
    tagline: 'Para desarrolladores individuales que conectan Claude Code, Cursor o Windsurf.',
    priceMonthlyUsd: 0,
    priceAnnualMonthlyUsd: 0,
    priceDisplay: '$0',
    periodDisplay: '/ mes',
    quotaDisplay: '50.000 peticiones / mes',
    quotaMonthly: 50_000,
    features: [
      'Hasta 50.000 peticiones enrutadas al mes',
      'Endpoint Model Context Protocol (MCP) HTTP/SSE',
      'Proxy virtual compatible con OpenAI (/v1)',
      'Enrutamiento adaptativo de coste y calidad',
      'Política de cero retención de datos configurable',
      'Soporte comunitario estándar',
    ],
    buttonText: 'Comenzar Gratis',
    isPopular: false,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    tagline: 'Para ingenieros y desarrolladores con flujos diarios de alta intensidad.',
    priceMonthlyUsd: 29,
    priceAnnualMonthlyUsd: 24,
    priceDisplay: '$29',
    periodDisplay: '/ mes',
    quotaDisplay: '1.000.000 peticiones / mes',
    quotaMonthly: 1_000_000,
    features: [
      'Hasta 1.000.000 peticiones enrutadas al mes',
      'Todo lo incluido en el plan Developer',
      'Uso de claves de proveedor propias (BYOK Anthropic, OpenAI, Gemini)',
      'Estrategias de enrutamiento y reglas heurísticas personalizadas',
      'Analítica detallada de latencia y ahorro de tokens con exportación CSV',
      'Soporte técnico prioritario',
    ],
    buttonText: 'Actualizar a Pro ($29/mes)',
    isPopular: true,
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Para organizaciones con gobernanza centralizada y presupuestos compartidos.',
    priceMonthlyUsd: 199,
    priceAnnualMonthlyUsd: 159,
    priceDisplay: '$199',
    periodDisplay: '/ mes',
    quotaDisplay: 'Peticiones ilimitadas',
    quotaMonthly: 10_000_000,
    features: [
      'Peticiones enrutadas ilimitadas para toda la organización',
      'Todo lo incluido en el plan Pro',
      'Instancia MCP aislada dedicada con aislamiento estricto',
      'Claves de workspace multi-equipo con límites presupuestarios',
      'Integración con modelos locales autoalojados (Ollama / vLLM)',
      'SLA de latencia y acuerdos de nivel de servicio corporativos',
    ],
    buttonText: 'Suscribir Enterprise ($199/mes)',
    isPopular: false,
  },
};

export const PLANS_LIST: PlanDefinition[] = [
  PLANS.developer,
  PLANS.pro,
  PLANS.enterprise,
];
