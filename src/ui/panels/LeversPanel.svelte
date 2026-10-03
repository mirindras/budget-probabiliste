<script lang="ts">
  import LeverMap from '../charts/LeverMap.svelte';
  import type { CaseCode } from '../../engine/types.ts';
  import { num, pct, pts, signedMar } from '../format.ts';
  import { app } from '../state.svelte.ts';

  const r = $derived(app.result);
  const caseOf = (code: string) => r?.cases.find((c) => c.code === code);
  const active = (code: CaseCode) => app.scenario.actifs.includes(code);
  const setPackage = (codes: CaseCode[]) => {
    const same = codes.length === app.scenario.actifs.length && codes.every((c) => active(c));
    app.scenario.actifs = same ? [] : [...codes];
  };
</script>

<div class="levers">
  <h2>Ce qu'on peut faire</h2>
  <p class="small muted">Chaque case recalcule l'année sur les mêmes tirages que la base : l'écart mesure l'action, pas le hasard.</p>

  <h3>Leviers de gestion</h3>
  {#each app.scenario.leviers as l (l.code)}
    {@const c = caseOf(l.code)}
    <label class="case" title="{l.description}&#10;Règle : {l.regle}&#10;Coût direct : {l.coutLibelle}&#10;Propriétaire : {l.proprietaire}">
      <input type="checkbox" checked={active(l.code)} onchange={() => app.toggleCase(l.code)} disabled={!!c?.refus} data-testid="case-{l.code}" />
      <span class="lib"><b>{l.code}</b> {l.libelle}<span class="small muted desc">{l.description}</span></span>
      {#if c?.refus}
        <span class="eff small neg">{c.refus}</span>
      {:else if c}
        <span class="eff">
          <b class:pos={c.dProb > 0.0005} class:neg={c.dProb < -0.0005}>{pts(c.dProb)}</b>
          <span class="small muted">{signedMar(c.dP50)} médian</span>
          <span class="small muted">{signedMar(c.dEaR)} risque</span>
        </span>
      {/if}
    </label>
  {/each}

  <div class="packs">
    {#each [{ code: 'A', codes: ['L2', 'L3'] }, { code: 'B', codes: ['L1', 'L2', 'L3'] }] as p (p.code)}
      {@const c = caseOf(p.code)}
      {#if c}
        <button class="pack" onclick={() => setPackage(p.codes as CaseCode[])}>
          <b>Paquet {p.code}</b> <span class="small">{p.codes.join(' + ')}</span><br />
          <span class="small">probabilité {pct(c.stats.prob)} ({pts(c.dProb)}), P10 {num(c.stats.p10)} GAr</span>
        </button>
      {/if}
    {/each}
  </div>

  {#if r}
    <div class="map">
      <h3>Deux axes : probabilité et risque</h3>
      <LeverMap cases={r.cases} />
      <p class="small muted">En haut à droite : plus de chances et moins de risque. Réduire le risque n'augmente pas toujours la probabilité quand le médian est sous le budget.</p>
    </div>
  {/if}

  <h3>Stress tests (« et si… »)</h3>
  {#each app.scenario.stress as s (s.code)}
    {@const c = caseOf(s.code)}
    <label class="case" title="Règle : {s.regle}&#10;Un stress test n'a pas de probabilité : il répond à « et si », il ne prévoit rien (R-LE-05).">
      <input type="checkbox" checked={active(s.code)} onchange={() => app.toggleCase(s.code)} data-testid="case-{s.code}" />
      <span class="lib"><b>{s.code}</b> {s.libelle}<span class="small muted desc">{s.regle}</span></span>
      {#if c}
        <span class="eff"><b class="neg">{pts(c.dProb)}</b><span class="small muted">P50 {num(c.stats.p50)} GAr</span></span>
      {/if}
    </label>
  {/each}
  {#if caseOf('S1+S3')}
    {@const c = caseOf('S1+S3')!}
    <p class="small muted combo">S1 + S3 combinés : probabilité {pct(c.stats.prob, 1)}, P10 {num(c.stats.p10)} / P50 {num(c.stats.p50)} GAr.</p>
  {/if}
</div>

<style>
  .levers { display: grid; gap: 4px; }
  h3 { margin: 10px 0 2px; }
  .case { display: grid; grid-template-columns: 20px 1fr auto; gap: 6px; align-items: start; padding: 6px 4px; border-radius: 7px; cursor: pointer; }
  .case:hover { background: var(--soft); }
  .case input { margin-top: 2px; }
  .lib { display: grid; }
  .desc { line-height: 1.3; }
  .eff { display: grid; justify-items: end; text-align: right; white-space: nowrap; }
  .eff.small { white-space: normal; max-width: 120px; }
  .packs { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 4px; }
  .pack { text-align: left; padding: 6px 8px; }
  .map { margin-top: 6px; }
  .combo { margin: 2px 4px; }
</style>
