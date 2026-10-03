<script lang="ts">
  import FanChart from '../charts/FanChart.svelte';
  import { MOIS, num, pct } from '../format.ts';
  import { app } from '../state.svelte.ts';

  const r = $derived(app.result);
  const m = $derived(app.scenario.moisClos);
  const actual = $derived.by(() => {
    const a = app.actuals;
    if (!a || m === 0) return [];
    let c = 0;
    return a.lignes.slice(0, m).map((l) => (c += l[7]));
  });
  // Budget initial : point de mi-année. Atterrissage : fin d'exercice, les mois clos n'ayant plus de dispersion.
  const focus = $derived(m > 0 ? 12 : 6);
  const f = $derived(r?.fan[focus - 1]);
</script>

{#if r}
  <div class="traj">
    <div>
      <h2>
        {#if f && m > 0}Avec {m} mois clos, l'EBITDA de l'année est attendu entre {num(f.p10)} et {num(f.p90)} GAr, médian {num(f.p50)} pour un budget de {num(f.budget)}{:else if f}Fin {MOIS[focus - 1]}, l'EBITDA cumulé attendu est compris entre {num(f.p10)} et {num(f.p90)} GAr, médian {num(f.p50)} pour un budget de {num(f.budget)}{/if}
      </h2>
      <p class="small muted">Éventail P10-P90 de l'EBITDA cumulé, mois par mois. Un réalisé cumulé sous la borne basse sort de l'éventail et déclenche une revue des hypothèses.</p>
      <FanChart fan={r.fan} {actual} />
    </div>
    <aside class="landing">
      <h3>Atterrissage en cours d'année</h3>
      {#if app.isAlfa && app.actuals}
        <p class="small">Figez les mois clos au réel (réalisé synthétique ALFA 2027) : le change repart du dernier cours, les événements ne peuvent plus survenir que sur les mois restants, et la probabilité est recalculée.</p>
        <label class="small">Mois clos : <b>{m === 0 ? 'aucun (budget initial)' : `${m}, jusqu'à fin ${MOIS[m - 1]}`}</b>
          <input type="range" min="0" max="11" step="1" bind:value={app.scenario.moisClos} data-testid="mois-clos" />
        </label>
        {#if m > 0}
          <p>Probabilité glissante : <b>{pct(r.base.prob)}</b>. Réalisé cumulé fin {MOIS[m - 1]} : {num(actual[m - 1], 2)} GAr pour un budget de {num(r.fan[m - 1].budget, 2)}.</p>
          <p class="small muted">À mesure que l'incertitude se résout, la probabilité converge vers 0 % ou 100 %. Son décrochage signale tôt un budget hors d'atteinte.</p>
        {/if}
      {:else}
        <p class="small muted">Le mode atterrissage s'appuie sur le réalisé mensuel. Il est disponible sur le jeu ALFA (réalisé synthétique 2027).</p>
      {/if}
      <table class="small">
        <thead><tr><th>Mois</th><th class="num">P10</th><th class="num">P50</th><th class="num">P90</th><th class="num">Budget</th></tr></thead>
        <tbody>
          {#each r.fan as p (p.mois)}
            <tr class:closed={p.mois <= m}><td>{MOIS[p.mois - 1]}</td><td class="num">{num(p.p10, 2)}</td><td class="num">{num(p.p50, 2)}</td><td class="num">{num(p.p90, 2)}</td><td class="num">{num(p.budget, 2)}</td></tr>
          {/each}
        </tbody>
      </table>
    </aside>
  </div>
{/if}

<style>
  .traj { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(260px, 1fr); gap: 24px; }
  .landing { display: grid; gap: 8px; align-content: start; }
  .landing label { display: grid; gap: 4px; }
  tr.closed td { color: var(--muted); font-style: italic; }
  @media (max-width: 900px) { .traj { grid-template-columns: 1fr; } }
</style>
