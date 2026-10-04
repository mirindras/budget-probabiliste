<script lang="ts">
  import Tornado from '../charts/Tornado.svelte';
  import { gar, num, pct } from '../format.ts';
  import { app } from '../state.svelte.ts';

  const r = $derived(app.result);
  const labels = $derived(Object.fromEntries([...app.scenario.registre.hypotheses, ...app.scenario.registre.evenements].map((h) => [h.code, h.libelle])));
  const top = $derived(r?.contributions.blocks.length ? [...r.contributions.blocks].sort((a, b) => b.part - a.part)[0] : null);
  const commercial = $derived(r?.contributions.items.find((i) => ['H01', 'H02', 'H03', 'H04', 'H05', 'H11', 'E02'].includes(i.code)));

  function profileFmt(code: string, v: number): string {
    if (code === 'H06') return num(v, 0);
    if (code.startsWith('E')) return `${pct(v)} des cas`;
    if (code === 'H05') return `${num(v, 2)} pt`;
    const d = (v - 1) * 100;
    return `${d > 0.05 ? '+' : d < -0.05 ? '−' : ''}${num(Math.abs(d), 1)} %`;
  }
</script>

{#if !r || r.partial}
  <p class="muted">Analyses en cours…</p>
{:else}
  <div class="grid">
    <section>
      <h2>{top ? `Le bloc ${top.libelle.toLowerCase()} porte ${pct(top.part)} du risque` : 'Origine du risque'}</h2>
      <p class="small muted">Contribution à la variance : carré de la corrélation de rang entre chaque hypothèse et l'EBITDA, normalisé à 100 %. Avec des hypothèses corrélées, les contributions se recouvrent : lisez les blocs. Ces parts sont un résultat du modèle, qui découle des fourchettes et corrélations du registre, pas une mesure du risque réel de l'entreprise.</p>
      <div class="blocks">
        {#each [...r.contributions.blocks].sort((a, b) => b.part - a.part) as b (b.code)}
          <div class="block" style="flex: {Math.max(b.part, 0.04)}"><b>{pct(b.part)}</b><span class="small">{b.libelle}</span></div>
        {/each}
      </div>
      <table class="small">
        <thead><tr><th>Hypothèse</th><th class="num">Corrélation de rang</th><th>Part du risque</th></tr></thead>
        <tbody>
          {#each r.contributions.items as c (c.code)}
            <tr>
              <td>{c.code} {labels[c.code]}</td>
              <td class="num">{num(c.rho, 2)}</td>
              <td><span class="pbar"><i style="width:{c.part * 100}%"></i></span> {pct(c.part)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      {#if commercial}<p class="small muted">Premier risque commercial : {labels[commercial.code]} ({pct(commercial.part)}).</p>{/if}
    </section>

    <section>
      <h2>Effet isolé : ce qu'une action ciblée peut changer</h2>
      <p class="small muted">EBITDA quand l'hypothèse seule passe de son P10 à son P90, toutes les autres à leur P50 ({gar(r.isolated.base, 2)}). Les événements sont appliqués à leur amplitude moyenne, en juillet.</p>
      <Tornado effects={r.isolated.effects} reference={r.isolated.base} {labels} lowLabel="au P10 (ou sans l'événement)" highLabel="au P90 (ou avec l'événement)" />
      <h2 class="mt">Effet total : ce que l'entreprise subit, corrélations comprises</h2>
      <p class="small muted">EBITDA médian quand l'hypothèse est autour de son P10 (bande P5-P15) puis de son P90 (bande P85-P95). Classement distinct de l'effet isolé (R-RI-03).</p>
      <Tornado effects={r.totalEffects} reference={r.base.p50} {labels} lowLabel="hypothèse autour de son P10" highLabel="autour de son P90" />
    </section>

    <section>
      <h2>Événements : l'écart entre les années avec et sans</h2>
      <table class="small">
        <thead><tr><th>Événement</th><th class="num">Fréquence</th><th class="num">P50 si survenu</th><th class="num">P50 sinon</th></tr></thead>
        <tbody>
          {#each r.events as e (e.code)}
            <tr><td>{e.code} {labels[e.code]}</td><td class="num">{pct(e.freq, 1)}</td><td class="num">{num(e.p50If, 2)}</td><td class="num">{num(e.p50Else, 2)}</td></tr>
          {/each}
        </tbody>
      </table>
      <p class="small muted">L'écart d'un événement corrélé au change inclut le change : une révision du carburant survient surtout les années de dépréciation.</p>

      <h2 class="mt">Une année « 1 chance sur 10 » n'est pas une catastrophe</h2>
      <p class="small muted">Moyenne des hypothèses sur les itérations comprises entre P5 et P15 de l'EBITDA, contre l'ensemble.</p>
      <table class="small">
        <thead><tr><th>Hypothèse</th><th class="num">Année P10</th><th class="num">Ensemble</th></tr></thead>
        <tbody>
          {#each r.profile as p (p.code)}
            <tr><td>{p.code} {labels[p.code]}</td><td class="num">{profileFmt(p.code, p.p10Year)}</td><td class="num">{profileFmt(p.code, p.all)}</td></tr>
          {/each}
        </tbody>
      </table>
    </section>

    <section>
      <h2>D'autres objectifs, la même distribution</h2>
      <table class="small">
        <thead><tr><th>Objectif d'EBITDA</th><th class="num">Probabilité</th></tr></thead>
        <tbody>
          {#each r.targets as t (t.objectif)}<tr><td>{gar(t.objectif)}</td><td class="num">{pct(t.prob)}</td></tr>{/each}
          <tr><td>Objectif tenu 8 fois sur 10 (P20)</td><td class="num">{gar(r.base.p20)}</td></tr>
        </tbody>
      </table>
      <h2 class="mt">Par trimestre</h2>
      <table class="small">
        <thead><tr><th>Trimestre</th><th class="num">Budget</th><th class="num">P10</th><th class="num">P50</th><th class="num">P90</th><th class="num">Probabilité</th></tr></thead>
        <tbody>
          {#each r.quarters as q (q.trimestre)}
            <tr><td>T{q.trimestre}</td><td class="num">{num(q.budget, 2)}</td><td class="num">{num(q.p10, 2)}</td><td class="num">{num(q.p50, 2)}</td><td class="num">{num(q.p90, 2)}</td><td class="num">{pct(q.prob)}</td></tr>
          {/each}
        </tbody>
      </table>
      <h2 class="mt">Marge brute par BU</h2>
      <table class="small">
        <thead><tr><th>BU</th><th class="num">Budget</th><th class="num">P10</th><th class="num">P50</th><th class="num">P90</th><th class="num">Probabilité</th></tr></thead>
        <tbody>
          {#each r.bus as b (b.bu)}
            <tr><td>{b.bu}</td><td class="num">{num(b.budget, 2)}</td><td class="num">{num(b.p10, 2)}</td><td class="num">{num(b.p50, 2)}</td><td class="num">{num(b.p90, 2)}</td><td class="num">{pct(b.prob)}</td></tr>
          {/each}
        </tbody>
      </table>
      <p class="small muted">Montants en GAr. Écart-type de l'EBITDA annuel : {gar(r.base.std)} ; moyenne : {gar(r.base.mean)}.</p>
    </section>
  </div>
{/if}

<style>
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(380px, 100%), 1fr)); gap: 18px 28px; }
  section { min-width: 0; }
  section { display: grid; gap: 8px; align-content: start; }
  .mt { margin-top: 12px; }
  .blocks { display: flex; gap: 3px; }
  .block { display: grid; padding: 6px 8px; background: var(--bar); color: #fff; border-radius: 5px; min-width: 0; overflow: hidden; }
  .block:first-child { background: var(--bar-hit); }
  .block span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pbar { display: inline-block; width: 90px; height: 8px; background: var(--soft); border-radius: 4px; vertical-align: 0; margin-right: 4px; }
  .pbar i { display: block; height: 8px; background: var(--bar-hit); border-radius: 4px; }
  @media (max-width: 520px) { .grid { grid-template-columns: 1fr; } }
</style>
