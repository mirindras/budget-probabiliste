<script lang="ts">
  import Histogram from '../charts/Histogram.svelte';
  import { chances, gar, num, pct, pts, signed } from '../format.ts';
  import { app } from '../state.svelte.ts';

  const r = $derived(app.result);
  const sel = $derived(r?.selection ?? null);
  const shown = $derived(sel?.stats ?? r?.base ?? null);
  const budget = $derived(app.budget.ebitdaPublie);

  /** Titre du graphique : le constat, pas le sujet (R-RE-03). */
  const headline = $derived.by(() => {
    if (!r) return '';
    const b = r.base;
    const gap = budget - b.p50;
    const where = gap > 0.05 ? `le résultat médian attendu est ${num(gap)} GAr sous le budget` : gap < -0.05 ? `le résultat médian attendu est ${num(-gap)} GAr au-dessus du budget` : 'le résultat médian attendu est au niveau du budget';
    return `Le budget de ${num(budget)} GAr a ${pct(b.prob)} de chances d'être atteint : ${where}.`;
  });
  const selLabel = $derived(sel ? sel.codes.join(' + ') : '');
</script>

<div class="result">
  {#if !r}
    <div class="loading">Calcul de 10 000 années possibles…</div>
  {:else}
    <h2 class="headline">{headline}</h2>
    <div class="kpis">
      <div class="big" data-testid="probabilite">
        <span class="label">Probabilité d'atteindre le budget</span>
        <span class="value">{pct(shown!.prob)}</span>
        <span class="small muted">{chances(shown!.prob)}{#if sel}, contre {pct(r.base.prob)} sans les actions cochées{/if}</span>
        {#if sel}<span class="delta" class:pos={sel.stats.prob > r.base.prob} class:neg={sel.stats.prob < r.base.prob}>{pts(sel.stats.prob - r.base.prob)} avec {selLabel}</span>{/if}
      </div>
      <div class="kpi">
        <span class="label tip" title="P10 : 1 chance sur 10 de faire moins">Année défavorable</span>
        <span class="value">{gar(shown!.p10)}</span>
        <span class="sub">1 chance sur 10 de faire moins</span>
        {#if sel}<span class="small" class:pos={sel.stats.p10 > r.base.p10} class:neg={sel.stats.p10 < r.base.p10}>{signed(sel.stats.p10 - r.base.p10, 2)}</span>{/if}
      </div>
      <div class="kpi">
        <span class="label tip" title="P50 : médiane des itérations">Résultat médian</span>
        <span class="value">{gar(shown!.p50)}</span>
        <span class="sub">1 chance sur 2</span>
        {#if sel}<span class="small" class:pos={sel.stats.p50 > r.base.p50} class:neg={sel.stats.p50 < r.base.p50}>{signed(sel.stats.p50 - r.base.p50, 2)}</span>{/if}
      </div>
      <div class="kpi">
        <span class="label tip" title="P90 : 1 chance sur 10 de faire mieux">Année favorable</span>
        <span class="value">{gar(shown!.p90)}</span>
        <span class="sub">1 chance sur 10 de faire mieux</span>
      </div>
      <div class="kpi">
        <span class="label tip" title="EBITDA-at-Risk 90 = P50 − P10 : ce qu'une année défavorable à 1 chance sur 10 coûte par rapport au médian">Risque (EaR 90)</span>
        <span class="value">{gar(shown!.ear)}</span>
        <span class="sub">perdus sur le médian en année défavorable</span>
        {#if sel}<span class="small" class:pos={sel.stats.ear < r.base.ear} class:neg={sel.stats.ear > r.base.ear}>{signed(sel.stats.ear - r.base.ear, 2)}</span>{/if}
      </div>
      <div class="kpi">
        <span class="label tip" title="CVaR 10 : moyenne des 10 % d'itérations les plus basses">10 % pires cas</span>
        <span class="value">{gar(shown!.cvar10)}</span>
        <span class="sub">en moyenne (CVaR 10)</span>
      </div>
    </div>
    <Histogram base={r.annual} overlay={sel?.annual ?? null} budget={budget} overlayLabel={`Avec ${selLabel}`} />
    <p class="ref small muted" data-testid="run-ref">
      {#if app.running}<span class="spin" aria-hidden="true"></span> recalcul…{:else}Run :{/if}
      {r.ref.texte}{#if r.partial} · analyses en cours{/if}
    </p>
  {/if}
</div>

<style>
  .result { display: grid; gap: 10px; container-type: inline-size; min-width: 0; }
  .loading { padding: 80px 0; text-align: center; color: var(--muted); }
  .headline { font-size: 17px; font-weight: 650; text-wrap: balance; overflow-wrap: anywhere; }
  .kpis { display: grid; grid-template-columns: minmax(0, 1.4fr) repeat(5, minmax(0, 1fr)); gap: 8px; }
  .big, .kpi { display: grid; align-content: start; gap: 2px; padding: 8px 10px; background: var(--soft); border-radius: 8px; }
  .big { grid-row: span 1; }
  .big .value { font-size: 40px; font-weight: 750; line-height: 1.05; color: var(--accent); }
  .label { font-size: 12px; color: var(--muted); }
  .kpi .value { font-size: 18px; font-weight: 650; }
  .sub { font-size: 11px; color: var(--muted); line-height: 1.25; }
  .label.tip { justify-self: start; }
  .delta { font-weight: 600; font-size: 13px; }
  .ref { margin: 0; overflow-wrap: anywhere; }
  .spin { display: inline-block; width: 10px; height: 10px; border: 2px solid var(--muted); border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; vertical-align: -1px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  /* Le panneau central change de largeur avec les colonnes voisines : on s'adapte à sa largeur, pas à celle de l'écran. */
  @container (max-width: 820px) {
    .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .big { grid-column: 1 / -1; }
  }
  @container (max-width: 440px) {
    .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
</style>
