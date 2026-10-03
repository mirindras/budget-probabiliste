<script lang="ts">
  import { num } from '../format.ts';

  interface Props {
    base: Float64Array;
    overlay?: Float64Array | null;
    budget: number;
    overlayLabel?: string;
    height?: number;
    print?: boolean;
  }
  let { base, overlay = null, budget, overlayLabel = 'Avec la sélection', height = 250, print = false }: Props = $props();

  const W = 640;
  const M = { l: 44, r: 12, t: 26, b: 34 };

  function niceStep(span: number): number {
    const raw = span / 40;
    const p = 10 ** Math.floor(Math.log10(raw));
    for (const k of [1, 2, 2.5, 5, 10]) if (k * p >= raw) return k * p;
    return 10 * p;
  }

  const bins = $derived.by(() => {
    const all = overlay ? [base, overlay] : [base];
    let lo = Infinity;
    let hi = -Infinity;
    for (const a of all) {
      const s = Float64Array.from(a).sort();
      lo = Math.min(lo, s[Math.floor(s.length * 0.005)]);
      hi = Math.max(hi, s[s.length - 1]);
    }
    const step = niceStep(hi - lo);
    const start = Math.floor(lo / step) * step;
    const nb = Math.max(1, Math.ceil((hi - start) / step + 1e-9));
    const count = (a: Float64Array) => {
      const c = new Array(nb).fill(0);
      for (let i = 0; i < a.length; i++) c[Math.min(nb - 1, Math.max(0, Math.floor((a[i] - start) / step)))]++;
      return c;
    };
    const rawBase = count(base);
    const rawOverlay = overlay ? count(overlay) : null;
    return {
      start, step, nb,
      base: rawBase.map((x) => x / base.length),
      overlay: rawOverlay ? rawOverlay.map((x) => x / overlay!.length) : null,
      raw: rawBase,
    };
  });

  const H = $derived(height);
  const ymax = $derived(Math.max(...bins.base, ...(bins.overlay ?? [0])) * 1.08 || 1);
  const x = (v: number) => M.l + ((v - bins.start) / (bins.nb * bins.step)) * (W - M.l - M.r);
  const y = (p: number) => H - M.b - (p / ymax) * (H - M.t - M.b);
  const ticks = $derived.by(() => {
    const out: number[] = [];
    const span = bins.nb * bins.step;
    const t = span > 12 ? 2 : span > 4 ? 1 : 0.5;
    for (let v = Math.ceil(bins.start / t) * t; v <= bins.start + span + 1e-9; v += t) out.push(Math.round(v * 100) / 100);
    return out;
  });
  const yticks = $derived.by(() => {
    const t = ymax > 0.16 ? 0.05 : ymax > 0.08 ? 0.02 : ymax > 0.04 ? 0.01 : 0.005;
    const out: number[] = [];
    for (let v = 0; v <= ymax; v += t) out.push(Math.round(v * 1000) / 1000);
    return out;
  });
  const overlayPath = $derived.by(() => {
    if (!bins.overlay) return '';
    let d = `M${x(bins.start)},${y(0)}`;
    bins.overlay.forEach((p, i) => {
      const x0 = x(bins.start + i * bins.step);
      const x1 = x(bins.start + (i + 1) * bins.step);
      d += ` L${x0},${y(p)} L${x1},${y(p)}`;
    });
    return d + ` L${x(bins.start + bins.nb * bins.step)},${y(0)}`;
  });

  let hover = $state<number | null>(null);
</script>

<div class="hist">
  <svg viewBox="0 0 {W} {H}" role="img" aria-label="Distribution de l'EBITDA simulé, avec la ligne du budget à {num(budget)} GAr">
    {#each yticks as t (t)}
      <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} class="grid" />
      <text x={M.l - 6} y={y(t) + 4} class="tick" text-anchor="end">{num(t * 100, 0)} %</text>
    {/each}
    {#each bins.base as p, i (i)}
      {@const v0 = bins.start + i * bins.step}
      <rect
        x={x(v0) + 0.5}
        y={y(p)}
        width={Math.max(0, x(v0 + bins.step) - x(v0) - 1)}
        height={y(0) - y(p)}
        class={v0 + bins.step / 2 >= budget ? 'bar hit' : 'bar'}
        opacity={hover === null || hover === i ? 1 : 0.55}
      />
    {/each}
    {#if overlayPath}
      <path d={overlayPath} class="overlay" />
    {/if}
    <line x1={x(budget)} x2={x(budget)} y1={M.t - 8} y2={y(0)} class="budget" />
    <text x={x(budget) + 5} y={M.t - 1} class="budget-label">Budget {num(budget)} GAr</text>
    {#each ticks as t (t)}
      <text x={x(t)} y={H - M.b + 16} class="tick" text-anchor="middle">{num(t, Number.isInteger(t) ? 0 : 1)}</text>
    {/each}
    <text x={(W + M.l) / 2} y={H - 4} class="axis" text-anchor="middle">EBITDA annuel simulé, en GAr</text>
    {#if !print}
      {#each bins.base as _, i (i)}
        {@const v0 = bins.start + i * bins.step}
        <rect
          x={x(v0)}
          y={M.t}
          width={x(v0 + bins.step) - x(v0)}
          height={y(0) - M.t}
          fill="transparent"
          role="presentation"
          onmouseenter={() => (hover = i)}
          onmouseleave={() => (hover = null)}
        />
      {/each}
    {/if}
  </svg>
  {#if hover !== null && !print}
    {@const v0 = bins.start + hover * bins.step}
    <div class="tooltip" style="left: {Math.min(85, Math.max(15, (x(v0 + bins.step / 2) / W) * 100))}%">
      <strong>{hover === 0 ? `moins de ${num(v0 + bins.step, 1)}` : `${num(v0, 1)} à ${num(v0 + bins.step, 1)}`} GAr</strong><br />
      {bins.raw[hover].toLocaleString('fr-FR')} itérations ({num(bins.base[hover] * 100, 1)} %)
      {#if bins.overlay}<br /><span class="sel">{overlayLabel} : {num(bins.overlay[hover] * 100, 1)} %</span>{/if}
    </div>
  {/if}
  <div class="legend small">
    <span><i class="sw bar"></i>sous le budget</span>
    <span><i class="sw hit"></i>budget atteint</span>
    {#if overlay}<span><i class="sw line"></i>{overlayLabel}</span>{/if}
    <span><i class="sw dash"></i>budget</span>
  </div>
</div>

<style>
  .hist { position: relative; }
  svg { width: 100%; height: auto; display: block; }
  .grid { stroke: var(--line); stroke-width: 1; }
  .tick { font-size: 11px; fill: var(--muted); }
  .axis { font-size: 11px; fill: var(--muted); }
  .bar { fill: var(--bar); }
  .bar.hit { fill: var(--bar-hit); }
  .overlay { fill: none; stroke: var(--sel); stroke-width: 2.5; }
  .budget { stroke: var(--budget); stroke-width: 2; stroke-dasharray: 5 3; }
  .budget-label { font-size: 12px; font-weight: 600; fill: var(--budget); }
  .tooltip {
    position: absolute; top: 8px; transform: translateX(-50%); background: var(--ink); color: var(--panel);
    padding: 6px 9px; border-radius: 6px; font-size: 12px; pointer-events: none; white-space: nowrap; z-index: 2;
  }
  .tooltip .sel { font-weight: 700; }
  .legend { display: flex; gap: 14px; flex-wrap: wrap; color: var(--muted); padding: 2px 0 0 44px; }
  .sw { display: inline-block; width: 12px; height: 10px; margin-right: 5px; vertical-align: -1px; }
  .sw.bar { background: var(--bar); }
  .sw.hit { background: var(--bar-hit); }
  .sw.line { height: 0; border-top: 2.5px solid var(--sel); vertical-align: 3px; }
  .sw.dash { height: 0; border-top: 2px dashed var(--budget); vertical-align: 3px; }
  @media (max-width: 600px) {
    .tick, .axis { font-size: 18px; }
    .budget-label { font-size: 20px; }
  }
  @media print {
    .bar { fill: #bdbdbd; }
    .bar.hit { fill: #555; }
    .budget { stroke: #000; }
    .budget-label { fill: #000; }
    .tick, .axis { fill: #333; }
    .legend { color: #333; }
    .sw.bar { background: #bdbdbd; }
    .sw.hit { background: #555; }
    .sw.dash { border-top-color: #000; }
  }
</style>
