<script lang="ts">
  import type { FanPoint } from '../../engine/risk.ts';
  import { MOIS_COURT, num } from '../format.ts';

  interface Props {
    fan: FanPoint[];
    /** EBITDA cumulé réalisé des mois clos. */
    actual?: number[];
  }
  let { fan, actual = [] }: Props = $props();

  const W = 640;
  const H = 280;
  const M = { l: 44, r: 16, t: 14, b: 34 };
  const vmax = $derived(Math.max(...fan.map((f) => Math.max(f.p90, f.budget)), ...actual) * 1.05);
  const vmin = $derived(Math.min(0, ...fan.map((f) => f.p10)));
  const x = (m: number) => M.l + ((m - 0.5) / 12) * (W - M.l - M.r);
  const y = (v: number) => H - M.b - ((v - vmin) / (vmax - vmin)) * (H - M.t - M.b);
  const band = $derived(
    `M${fan.map((f) => `${x(f.mois)},${y(f.p90)}`).join(' L')} L${[...fan].reverse().map((f) => `${x(f.mois)},${y(f.p10)}`).join(' L')} Z`,
  );
  const line = (k: 'p50' | 'budget') => `M${fan.map((f) => `${x(f.mois)},${y(f[k])}`).join(' L')}`;
  const yticks = $derived.by(() => {
    const step = vmax > 12 ? 2 : 1;
    const out: number[] = [];
    for (let v = Math.ceil(vmin / step) * step; v <= vmax; v += step) out.push(v);
    return out;
  });
  let hover = $state<number | null>(null);
</script>

<div class="fan">
  <svg viewBox="0 0 {W} {H}" role="img" aria-label="Éventail de l'EBITDA cumulé, mois par mois, avec le budget cumulé">
    {#each yticks as t (t)}
      <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} class="grid" />
      <text x={M.l - 6} y={y(t) + 4} class="tick" text-anchor="end">{num(t, 0)}</text>
    {/each}
    <path d={band} class="band" />
    <path d={line('p50')} class="p50" />
    <path d={line('budget')} class="budget" />
    {#if actual.length}
      <path d={`M${actual.map((v, i) => `${x(i + 1)},${y(v)}`).join(' L')}`} class="actual" />
      {#each actual as v, i (i)}<circle cx={x(i + 1)} cy={y(v)} r="3.5" class="dot" />{/each}
    {/if}
    {#each fan as f (f.mois)}
      <text x={x(f.mois)} y={H - M.b + 16} class="tick" text-anchor="middle">{MOIS_COURT[f.mois - 1]}</text>
      <rect x={x(f.mois) - (W - M.l - M.r) / 24} y={M.t} width={(W - M.l - M.r) / 12} height={H - M.t - M.b} fill="transparent" role="presentation" onmouseenter={() => (hover = f.mois)} onmouseleave={() => (hover = null)} />
    {/each}
    {#if hover}<line x1={x(hover)} x2={x(hover)} y1={M.t} y2={H - M.b} class="cursor" />{/if}
    <text x={(W + M.l) / 2} y={H - 3} class="tick" text-anchor="middle">EBITDA cumulé depuis janvier, en GAr</text>
  </svg>
  {#if hover}
    {@const f = fan[hover - 1]}
    <div class="tooltip" style="left: {Math.min(80, Math.max(20, (x(hover) / W) * 100))}%">
      <strong>Fin {MOIS_COURT[hover - 1]}</strong><br />
      entre {num(f.p10)} et {num(f.p90)} GAr (8 chances sur 10)<br />
      médian {num(f.p50)} GAr · budget {num(f.budget)} GAr
      {#if actual[hover - 1] !== undefined}<br />réalisé {num(actual[hover - 1])} GAr{/if}
    </div>
  {/if}
  <div class="legend small">
    <span><i class="sw band"></i>8 chances sur 10 (P10 à P90)</span>
    <span><i class="sw p50"></i>médian (P50)</span>
    <span><i class="sw budget"></i>budget cumulé</span>
    {#if actual.length}<span><i class="sw actual"></i>réalisé</span>{/if}
  </div>
</div>

<style>
  .fan { position: relative; }
  svg { width: 100%; height: auto; display: block; }
  .grid { stroke: var(--line); }
  .tick { font-size: 11px; fill: var(--muted); }
  @media (max-width: 600px) { .tick { font-size: 18px; } }
  .band { fill: var(--band); stroke: none; }
  .p50 { fill: none; stroke: var(--accent); stroke-width: 2; }
  .budget { fill: none; stroke: var(--budget); stroke-width: 2; stroke-dasharray: 5 3; }
  .actual { fill: none; stroke: var(--ink); stroke-width: 2.5; }
  .dot { fill: var(--ink); }
  .cursor { stroke: var(--muted); stroke-dasharray: 2 2; }
  .tooltip { position: absolute; top: 6px; transform: translateX(-50%); background: var(--ink); color: var(--panel); padding: 6px 9px; border-radius: 6px; font-size: 12px; pointer-events: none; white-space: nowrap; }
  .legend { display: flex; gap: 14px; flex-wrap: wrap; color: var(--muted); padding-left: 44px; }
  .sw { display: inline-block; width: 14px; height: 10px; margin-right: 5px; vertical-align: -1px; }
  .sw.band { background: var(--band); }
  .sw.p50 { height: 0; border-top: 2px solid var(--accent); vertical-align: 3px; }
  .sw.budget { height: 0; border-top: 2px dashed var(--budget); vertical-align: 3px; }
  .sw.actual { height: 0; border-top: 2.5px solid var(--ink); vertical-align: 3px; }
</style>
