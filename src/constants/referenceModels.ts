import { ReferenceModelConfig } from '../types/router';

export const AVAILABLE_REFERENCE_MODELS: ReferenceModelConfig[] = [
  {
    id: 'claude-sonnet-5-5',
    label: 'Claude Sonnet 5.5',
    provider: 'Anthropic',
    inputPerM: 2.0,
    outputPerM: 10.0,
    typicalLatencyMs: 1420,
  },
  {
    id: 'gpt-6-astra',
    label: 'GPT-6 Astra',
    provider: 'OpenAI',
    inputPerM: 10.0,
    outputPerM: 50.0,
    typicalLatencyMs: 2200,
  },
  {
    id: 'gpt-6.1-sol',
    label: 'GPT-6.1 Sol',
    provider: 'OpenAI',
    inputPerM: 2.0,
    outputPerM: 10.0,
    typicalLatencyMs: 1100,
  },
  {
    id: 'o3-mini',
    label: 'o3-mini',
    provider: 'OpenAI',
    inputPerM: 1.1,
    outputPerM: 4.4,
    typicalLatencyMs: 1850,
  },
  {
    id: 'claude-opus-5-5',
    label: 'Claude Opus 5.5 (Frontera Estándar)',
    provider: 'Anthropic',
    inputPerM: 4.0,
    outputPerM: 20.0,
    typicalLatencyMs: 3100,
  },
];
