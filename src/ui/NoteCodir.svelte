<script lang="ts">
  import Histogram from './charts/Histogram.svelte';
  import { gar, num, pct, pct5, pts } from './format.ts';
  import { app } from './state.svelte.ts';

  /** Note CODIR d'une page (section 13.1) : message clé, Q1 à Q4, distribution, décision, limites. */
  let { screen = false }: { screen?: boolean } = $props();
  const r = $derived(app.result);
  const budget = $derived(app.budget.ebitdaPublie);
  const labels = $derived(Object.fromEntries([...app.scenario.registre.hypotheses, ...app.scenario.registre.evenements].map((h) => [h.code, h.libelle])));
  const levers = $derived(r ? r.cases.filter((c) => c.type === 'levier' && !c.refus).sort((a, b) => b.dProb - a.dProb) : []);
  const best = $derived(levers.filter((c) => c.dProb > 0.005));
  const pkgA = $derived(r?.cases.find((c) => c.code === 'A'));
  const pkgB = $derived(r?.cases.find((c) => c.code === 'B'));
  const hedge = $derived(r?.cases.find((c) => c.code === 'L1'));
  const topBlock = $derived(r ? [...r.contributions.blocks].sort((a, b) => b.part - a.part)[0] : null);
  const topCommercial = $derived(r?.contributions.items.find((i) => ['H01', 'H02', 'H03', 'H04', 'H05', 'H11', 'E02'].includes(i.code)));
  const bt = $derived(app.backtest);
  const ptsInt = (x: number) => `${x >= 0 ? '+' : '−'}${num(Math.abs(x * 100), 0)} points`;
</script>

{#if r && !r.partial}
  <article class="note" class:print-only={!screen} class:screen aria-hidden={!screen}>
    <header>
      <h1>Note CODIR · {app.budget.libelle}</h1>
      <p>Budget probabiliste : chances de tenir l'EBITDA budgété, risque, leviers.</p>
    </header>
    <p class="key">
      <strong>Message clé : l'EBITDA budgété de {num(budget)} GAr a {pct5(r.base.prob)} de chances d'être atteint.
      {#if pkgA && pkgA.dProb > 0.01}
        {best.slice(0, 2).map((c) => c.libelle.toLowerCase()).join(' et ').replace(/^./, (c) => c.toUpperCase())} {best.length > 1 ? 'portent' : 'porte'} cette probabilité à {pct5(pkgA.stats.prob)} pour {num(pkgA.cout ?? 0, 2)} GAr de coût direct.
      {/if}</strong>
    </p>
    <ul>
      <li><b>Q1, probabilité :</b> {pct5(r.base.prob)}. Le résultat médian attendu est de {gar(r.base.p50)}, {num(Math.abs(budget - r.base.p50))} GAr {r.base.p50 < budget ? 'sous' : 'au-dessus du'} budget.</li>
      <li><b>Q2, risque :</b> une année défavorable à 1 chance sur 10 donne {gar(r.base.p10)}. Dans les 10 % pires cas, l'EBITDA moyen tombe à {gar(r.base.cvar10)}.</li>
      <li><b>Q3, origine :</b>
        {#if topBlock}le bloc {topBlock.libelle.toLowerCase()} porte {pct(topBlock.part)} du risque{#if topBlock.code === 'macro'} : le change et ce qu'il entraîne (prix locaux, carburant, frais généraux){/if}.{/if}
        {#if topCommercial}{labels[topCommercial.code]} est le premier risque commercial.{/if}
      </li>
      <li><b>Q4, leviers :</b>
        {best.slice(0, 2).map((c) => `${c.libelle.toLowerCase()}, ${ptsInt(c.dProb)}`).join(' ; ')}.
        {#if hedge && hedge.dEaR < -0.01}La couverture de change réduit le risque de {num((-hedge.dEaR / r.base.ear) * 100, 0)} % mais {hedge.dProb < 0 ? `retire ${num(-hedge.dProb * 100, 0)} points de probabilité` : `ajoute ${num(hedge.dProb * 100, 0)} points`}.{/if}
      </li>
    </ul>
    <div class="chart">
      <p class="ct">Distribution de 10 000 années simulées : {pct5(r.base.prob)} des années atteignent le budget</p>
      <Histogram base={r.annual} budget={budget} height={210} print />
    </div>
    <p><b>Décision attendue :</b>
      {#if pkgA && pkgB}valider le paquet A (probabilité {pct5(pkgA.stats.prob)}), ou le paquet B si le CODIR privilégie la protection du bas de fourchette (P10 à {gar(pkgB.stats.p10)} au lieu de {num(pkgA.stats.p10)}). Le choix dépend de ce que le CODIR redoute le plus : rater le budget, ou subir une mauvaise année.{/if}
    </p>
    {#if bt}<p class="small">{bt.synthese}</p>{/if}
    <footer>
      <p><b>Limites :</b> {app.isAlfa ? 'données de démonstration, ' : ''}corrélations estimées sur 5 ans, risques hors registre non couverts ; probabilités arrondies à 5 points, écarts entre leviers au point près ({levers.map((c) => `${c.code} ${pts(c.dProb, 1)}`).join(', ')}).</p>
      <p><b>Référence :</b> {r.ref.texte}.</p>
    </footer>
  </article>
{/if}

<style>
  .note { font: 10.5pt/1.4 Georgia, 'Times New Roman', serif; color: #000; max-height: 270mm; overflow: hidden; }
  .note.screen { background: #fff; color: #111; max-height: none; padding: 28px 32px; border-radius: 4px; box-shadow: 0 2px 18px rgba(0, 0, 0, 0.25); max-width: 760px; margin: 0 auto; }
  .note.screen :global(.bar) { fill: #bdbdbd; }
  .note.screen :global(.bar.hit) { fill: #555; }
  .note.screen :global(.budget) { stroke: #000; }
  .note.screen :global(.budget-label), .note.screen :global(.tick), .note.screen :global(.axis) { fill: #333; }
  .note.screen :global(.legend) { color: #333; }
  .note.screen :global(.sw.bar) { background: #bdbdbd; }
  .note.screen :global(.sw.hit) { background: #555; }
  .note.screen :global(.sw.dash) { border-top-color: #000; }
  header h1 { font: 700 15pt/1.2 system-ui, sans-serif; margin: 0; }
  header p { margin: 2px 0 8px; color: #333; font-size: 9.5pt; }
  .key { font-size: 11.5pt; border-left: 3px solid #000; padding-left: 8px; margin: 8px 0; }
  ul { padding-left: 16px; margin: 6px 0; }
  li { margin: 3px 0; }
  .chart { margin: 6px 0; break-inside: avoid; }
  .ct { font: 600 10pt system-ui, sans-serif; margin: 0 0 2px; }
  footer { border-top: 1px solid #999; margin-top: 8px; padding-top: 4px; font-size: 9pt; }
  footer p { margin: 2px 0; }
</style>
