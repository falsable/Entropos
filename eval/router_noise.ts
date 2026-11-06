// Offline measurement of the adaptive router, no model calls and no cost. Run: npx tsx eval/router_noise.ts [repeats]
//
// Protocol (fixed before the first run, see ~/meta/hallazgos/2026-11-05-antes-de-creer-una-mejora-de-harness-o-de-router-...):
//   - Arm: mode "adaptive", default custom rules, untouched posteriors. The arm is repeated R times (default 200) with no change,
//     so run-to-run noise (Thompson draw, 12 % exploration roll) is measured before any delta is believed.
//   - Corpus: eval/router_corpus.ts, 40 hand-written prompts, dev and held-out reported separately.
//   - Cheap models: Gemini Flash family. Everything else counts as strong. Baseline cost: always Claude Sonnet 5.5.
//   - Metrics per split: cost ratio vs baseline, under-route rate (needs_strong prompt sent to a cheap model),
//     over-route rate (cheap prompt sent to a strong model), and the flip rate (share of prompts whose model differs between runs).
//   - What this cannot say: whether the answer of the routed model was good. That needs a model call and is out of scope.
import { analyzeAndPickModel, INITIAL_MODEL_POSTERIORS } from '../src/lib/routerEngine';
import { CORPUS } from './router_corpus';

const R = Number(process.argv[2] || 200);
const isCheap = (m: string) => /Flash/.test(m);
const baseline = INITIAL_MODEL_POSTERIORS['Claude Sonnet 5.5'].costPer1k;

type Cell = { cost: number; baseCost: number; under: number; strongN: number; over: number; cheapN: number };
const runs: Record<string, Cell>[] = [];
const picks = new Map<string, Map<string, number>>();

for (let r = 0; r < R; r++) {
  const cells: Record<string, Cell> = {};
  for (const c of CORPUS) {
    const out = analyzeAndPickModel(c.prompt, 'adaptive');
    const m = picks.get(c.id) ?? new Map<string, number>();
    m.set(out.selectedModel, (m.get(out.selectedModel) || 0) + 1);
    picks.set(c.id, m);
    for (const key of [c.split, 'all', `${c.split}/${c.label}/${c.length}`]) {
      const x = (cells[key] ??= { cost: 0, baseCost: 0, under: 0, strongN: 0, over: 0, cheapN: 0 });
      x.cost += out.costPer1k;
      x.baseCost += baseline;
      if (c.label === 'strong') { x.strongN++; if (isCheap(out.selectedModel)) x.under++; }
      else { x.cheapN++; if (!isCheap(out.selectedModel)) x.over++; }
    }
  }
  runs.push(cells);
}

const stat = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1));
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { mean: +mean.toFixed(4), sd: +sd.toFixed(4), min: +s[0].toFixed(4), p2_5: +q(0.025).toFixed(4), p97_5: +q(0.975).toFixed(4), max: +s[s.length - 1].toFixed(4) };
};

const report: Record<string, unknown> = { repeats: R, baselineCostPer1k: baseline };
for (const key of Object.keys(runs[0])) {
  const cs = runs.map((r) => r[key]);
  report[key] = {
    costRatioVsSonnet: stat(cs.map((c) => c.cost / c.baseCost)),
    underRoute: cs[0].strongN ? stat(cs.map((c) => c.under / c.strongN)) : null,
    overRoute: cs[0].cheapN ? stat(cs.map((c) => c.over / c.cheapN)) : null,
  };
}
const flip = (split: string) => {
  const ids = CORPUS.filter((c) => c.split === split).map((c) => c.id);
  const modal = ids.map((id) => Math.max(...picks.get(id)!.values()) / R);
  return { prompts: ids.length, flippingPrompts: modal.filter((s) => s < 1).length, meanModalShare: +(modal.reduce((a, b) => a + b, 0) / modal.length).toFixed(4) };
};
report.flip = { dev: flip('dev'), heldout: flip('heldout') };
report.perPrompt = CORPUS.map((c) => ({ id: c.id, split: c.split, shares: Object.fromEntries([...picks.get(c.id)!].map(([m, n]) => [m, +(n / R).toFixed(3)])) }));
console.log(JSON.stringify(report, null, 1));
