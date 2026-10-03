<script lang="ts">
  import type { Effect } from '../../engine/risk.ts';
  import { num } from '../format.ts';

  /** Effet sur l'EBITDA d'une hypothèse de son P10 à son P90, trié par amplitude. */
  interface Props {
    effects: Effect[];
    reference: number;
    labels: Record<string, string>;
    lowLabel?: string;
    highLabel?: string;
  }
  let { effects, reference, labels, lowLabel = 'au P10', highLabel = 'au P90' }: Props = $props();
  const rows = $derived([...effects].filter((e) => Number.isFinite(e.low) && Number.isFinite(e.high)).sort((a, b) => Math.abs(b.high - b.low) - Math.abs(a.high - a.low)));
  const span = $derived(Math.max(0.2, ...rows.map((r) => Math.max(Math.abs(r.low - reference), Math.abs(r.high - reference)))) * 1.05);
  const pos = (v: number) => 50 + ((v - reference) / span) * 50;
</script>

<div class="tornado">
  <div class="head small muted"><span></span><span>EBITDA, écart à {num(reference, 2)} GAr</span><span class="num">amplitude</span></div>
  {#each rows as r (r.code)}
    {@const a = pos(Math.min(r.low, r.high))}
    {@const b = pos(Math.max(r.low, r.high))}
    <div class="row">
      <span class="name small" title={labels[r.code]}>{r.code} {labels[r.code]}</span>
      <span class="track" title="{lowLabel} : {num(r.low, 2)} GAr · {highLabel} : {num(r.high, 2)} GAr">
        <i class="zero"></i>
        <i class="seg" style="left:{a}%; width:{Math.max(0.5, b - a)}%"></i>
        <i class="m lo" style="left:{pos(r.low)}%"></i>
        <i class="m hi" style="left:{pos(r.high)}%"></i>
      </span>
      <span class="v small num">{num(Math.abs(r.high - r.low) * 1000, 0)} MAr</span>
    </div>
  {/each}
  <div class="legend small muted"><span><i class="m lo"></i>{lowLabel}</span><span><i class="m hi"></i>{highLabel}</span></div>
</div>

<style>
  .tornado { display: grid; gap: 3px; }
  .head, .row { display: grid; grid-template-columns: minmax(90px, 36%) minmax(0, 1fr) 64px; gap: 8px; align-items: center; }
  .name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .track { position: relative; height: 18px; background: var(--soft); border-radius: 3px; }
  .zero { position: absolute; left: 50%; top: -2px; bottom: -2px; border-left: 1px solid var(--muted); }
  .seg { position: absolute; top: 4px; height: 10px; background: var(--bar); border-radius: 2px; }
  .m { position: absolute; top: 2px; width: 3px; height: 14px; margin-left: -1.5px; border-radius: 1px; }
  .m.lo { background: var(--ko); }
  .m.hi { background: var(--ok); }
  .v { color: var(--muted); font-size: 11px; }
  .legend { display: flex; gap: 14px; margin-top: 4px; }
  .legend .m { position: static; display: inline-block; height: 10px; margin-right: 5px; vertical-align: -1px; }
</style>
