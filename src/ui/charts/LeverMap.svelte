<script lang="ts">
  import type { CaseResult } from '../../engine/simulate.ts';
  import { num } from '../format.ts';

  /** Comparatif des leviers sur deux axes (R-LE-04) : Δ probabilité et Δ EaR. */
  let { cases }: { cases: CaseResult[] } = $props();
  const W = 300;
  const H = 210;
  const M = { l: 40, r: 12, t: 12, b: 36 };
  const pts = $derived(cases.filter((c) => c.type !== 'stress' && !c.refus));
  const xs = $derived(Math.max(4, ...pts.map((c) => Math.abs(c.dProb * 100))) * 1.15);
  const ys = $derived(Math.max(0.2, ...pts.map((c) => Math.abs(c.dEaR))) * 1.2);
  const x = (v: number) => M.l + ((v + xs) / (2 * xs)) * (W - M.l - M.r);
  const y = (v: number) => M.t + ((v + ys) / (2 * ys)) * (H - M.t - M.b);
</script>

<svg viewBox="0 0 {W} {H}" role="img" aria-label="Leviers sur deux axes : gain de probabilité et variation du risque">
  <rect x={x(0)} y={M.t} width={x(xs) - x(0)} height={y(0) - M.t} class="good" />
  <line x1={M.l} x2={W - M.r} y1={y(0)} y2={y(0)} class="axis" />
  <line x1={x(0)} x2={x(0)} y1={M.t} y2={H - M.b} class="axis" />
  {#each pts as c (c.code)}
    <circle cx={x(c.dProb * 100)} cy={y(c.dEaR)} r={c.type === 'paquet' ? 6 : 4.5} class={c.type} />
    <text x={x(c.dProb * 100) + 7} y={y(c.dEaR) + (c.code === 'A' ? 12 : -4)} class="lbl">{c.code}</text>
  {/each}
  <text x={W - M.r} y={H - M.b + 14} text-anchor="end" class="tick">+{num(xs, 0)} pts</text>
  <text x={M.l} y={H - M.b + 14} class="tick">−{num(xs, 0)} pts</text>
  <text x={(W + M.l) / 2} y={H - 4} text-anchor="middle" class="tick">Δ probabilité d'atteinte →</text>
  <text x={M.l - 4} y={M.t + 8} text-anchor="end" class="tick">moins</text>
  <text x={M.l - 4} y={H - M.b} text-anchor="end" class="tick">plus</text>
  <text x="10" y={(H - M.b + M.t) / 2} transform="rotate(-90 10 {(H - M.b + M.t) / 2})" text-anchor="middle" class="tick">risque (Δ EaR)</text>
</svg>

<style>
  svg { width: 100%; height: auto; display: block; }
  .good { fill: var(--ok); opacity: 0.07; }
  .axis { stroke: var(--muted); stroke-width: 1; }
  .levier { fill: var(--accent); }
  .paquet { fill: var(--sel); }
  .lbl { font-size: 11px; font-weight: 600; fill: var(--ink); }
  .tick { font-size: 10px; fill: var(--muted); }
</style>
