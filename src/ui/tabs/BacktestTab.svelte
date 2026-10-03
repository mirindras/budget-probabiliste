<script lang="ts">
  import { onMount } from 'svelte';
  import { applyCalibration } from '../../engine/backtest.ts';
  import { num, pct } from '../format.ts';
  import { app } from '../state.svelte.ts';

  let error = $state<string | null>(null);
  onMount(() => {
    app.loadBacktest().catch((e: Error) => (error = e.message));
  });
  const bt = $derived(app.backtest);
  const labels = $derived(Object.fromEntries(app.scenario.registre.hypotheses.map((h) => [h.code, h.libelle])));
  const applied = $derived(app.scenario.registre.hypotheses.every((h) => (h.k ?? 1) !== 1));

  function apply() {
    if (!bt) return;
    app.scenario.registre = applyCalibration($state.snapshot(app.scenario.registre), $state.snapshot(bt) as typeof bt);
    app.showToast(`Calibration appliquée : k = ${num(bt.global.k, 2)}, nouvelle version de registre en brouillon.`);
  }
</script>

{#if error}
  <p class="neg">{error}</p>
{:else if !bt}
  <p class="muted">Rejeu des budgets 2024 à 2026…</p>
{:else}
  <div class="bt">
    <section>
      <h2>Les fourchettes passées étaient trop étroites : elles n'ont couvert que {pct(bt.global.couverture)} des réalisés, pour 80 % visés</h2>
      <p class="small muted">Rejeu des budgets 2024, 2025 et 2026 avec les registres de l'époque, sans information postérieure (R-BT-01). Trois années ne suffisent pas à valider une probabilité annuelle : le test porte sur chaque hypothèse et chaque trimestre ({bt.global.n} observations). Les trimestres d'un même exercice restent liés : les seuils sont des alertes qui déclenchent une revue.</p>
      <table class="small">
        <thead><tr><th>Test</th><th>Mesure</th><th>Seuil</th><th></th></tr></thead>
        <tbody>
          {#each bt.verdicts as v (v.test)}
            <tr><td>{v.test}</td><td>{v.mesure}</td><td class="muted">{v.seuil}</td><td><span class="dot" class:ok={v.ok} aria-label={v.ok ? 'conforme' : 'alerte'}></span></td></tr>
          {/each}
        </tbody>
      </table>
      <div class="cal">
        <p><b>Calibration proposée :</b> k = 1,2816 / Φ⁻¹((1 + c) / 2) = <b>{num(bt.global.k, 2)}</b> sur toutes les hypothèses (borné entre 1 et 2, R-BT-03), et P50 des volumes abaissé du biais observé quand il dépasse 1 %, avec l'accord des propriétaires.</p>
        <button class="primary" onclick={apply} disabled={applied}>{applied ? 'Calibration appliquée au registre' : `Appliquer k = ${num(bt.global.k, 2)} au registre`}</button>
        <p class="small muted">L'application crée une nouvelle version du registre, en brouillon (R-HY-04). La probabilité d'atteinte baisse en général : des fourchettes plus larges disent la vérité sur l'incertitude.</p>
      </div>
      <h3>Rang du réalisé dans sa distribution (PIT), 5 classes</h3>
      <div class="pit">
        {#each bt.global.pitClasses as c, i (i)}
          <div class="col"><i style="height:{(c / Math.max(...bt.global.pitClasses)) * 100}%"></i><span class="small">{i * 20}-{i * 20 + 20} %</span><span class="small muted">{c}</span></div>
        {/each}
      </div>
      <p class="small muted">Un modèle calibré remplit chaque classe à 20 %. Des classes extrêmes trop pleines signalent des fourchettes trop étroites.</p>
    </section>
    <section>
      <h3>Par hypothèse (12 trimestres chacune)</h3>
      <div class="table-wrap">
        <table class="small">
          <thead><tr><th>Hypothèse</th><th class="num">Couverture</th><th class="num">Sous P10</th><th class="num">Sur P90</th><th class="num">Biais</th><th class="num">k brut</th><th>Alerte</th></tr></thead>
          <tbody>
            {#each bt.parHypothese as h (h.code)}
              <tr>
                <td>{h.code} {labels[h.code]}</td>
                <td class="num">{pct(h.couverture)}</td><td class="num">{pct(h.sousP10)}</td><td class="num">{pct(h.surP90)}</td>
                <td class="num" class:neg={Math.abs(h.biais) > 0.01}>{h.code === 'H05' ? `${num(h.biais * 100, 2)} pt` : `${num(h.biais * 100, 1)} %`}</td>
                <td class="num">{Number.isFinite(h.kBrut) ? num(h.kBrut, 2) : '∞'}</td>
                <td class="muted">{h.alerte ?? ''}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <h3>EBITDA trimestriel : budget, distribution d'époque et réalisé (GAr)</h3>
      <div class="table-wrap">
        <table class="small">
          <thead><tr><th>Trimestre</th><th class="num">Budget</th><th class="num">P10</th><th class="num">P50</th><th class="num">P90</th><th class="num">Réalisé</th><th class="num">Probabilité annoncée</th></tr></thead>
          <tbody>
            {#each bt.trimestres as q (q.annee * 10 + q.trimestre)}
              <tr>
                <td>{q.annee} T{q.trimestre}</td><td class="num">{num(q.budget, 2)}</td><td class="num">{num(q.p10, 2)}</td><td class="num">{num(q.p50, 2)}</td><td class="num">{num(q.p90, 2)}</td>
                <td class="num" class:neg={q.realise < q.p10} class:pos={q.realise > q.p90}>{num(q.realise, 2)}</td><td class="num">{pct(q.prob)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if app.synthetic}
        <h3>Journal des événements survenus (synthétique)</h3>
        <ul class="small">
          {#each app.synthetic.journal as j (j.annee * 100 + j.mois * 3 + j.code.charCodeAt(2))}
            <li>{j.annee}, mois {j.mois} : {j.libelle} ({num(j.amplitude * 100, 1)} %)</li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>
{/if}

<style>
  .bt { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(420px, 100%), 1fr)); gap: 18px 28px; }
  section { min-width: 0; }
  section { display: grid; gap: 8px; align-content: start; }
  .dot { display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: var(--warn); }
  .dot.ok { background: var(--ok); }
  .cal { background: var(--soft); padding: 10px 12px; border-radius: 8px; display: grid; gap: 6px; justify-items: start; }
  .pit { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; height: 120px; align-items: end; }
  .pit .col { display: grid; grid-template-rows: 1fr auto auto; height: 100%; text-align: center; }
  .pit .col i { align-self: end; background: var(--bar-hit); border-radius: 3px 3px 0 0; }
  ul { margin: 0; padding-left: 18px; }
  @media (max-width: 520px) { .bt { grid-template-columns: 1fr; } }
</style>
