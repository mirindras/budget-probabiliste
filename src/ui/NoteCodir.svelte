<script lang="ts">
  import Histogram from './charts/Histogram.svelte';
  import { RISK_CATEGORIES } from '../engine/guide.ts';
  import { familyCode } from '../engine/risk.ts';
  import { amount, num, pct, pct5, pts } from './format.ts';
  import { arbitrage } from './options.ts';
  import { app } from './state.svelte.ts';

  /** Note CODIR d'une page (section 13.1) : message clé, Q1 à Q4, distribution, décision, limites. */
  let { screen = false }: { screen?: boolean } = $props();
  const r = $derived(app.result);
  const budget = $derived(app.budget.ebitdaPublie);
  const labels = $derived(Object.fromEntries([...app.scenario.registre.hypotheses, ...app.scenario.registre.evenements].map((h) => [h.code, h.libelle])));
  const levers = $derived(r ? r.cases.filter((c) => c.type === 'levier' && !c.refus).sort((a, b) => b.dProb - a.dProb) : []);
  const best = $derived(levers.filter((c) => c.dProb > 0.005));
  const options = $derived(r ? arbitrage(r.cases, app.scenario.paquets) : []);
  /** Paquet mis en avant : le plus probable des paquets de leviers. */
  const pkgA = $derived(options[0]?.c ?? (r ? r.cases.filter((c) => c.type === 'paquet' && !c.refus).sort((a, b) => b.stats.prob - a.stats.prob)[0] : undefined));
  const hedgeCode = $derived(app.scenario.leviers.find((l) => l.type === 'couverture')?.code);
  const hedge = $derived(hedgeCode ? r?.cases.find((c) => c.code === hedgeCode) : undefined);
  const topBlock = $derived(r ? [...r.contributions.blocks].sort((a, b) => b.part - a.part)[0] : null);
  const drivers = $derived([...app.scenario.registre.hypotheses, ...app.scenario.registre.evenements]);
  const topCommercial = $derived(r?.contributions.items.find((i) => drivers.find((d) => d.code === i.code)?.famille === 'Commercial'));
  /** Le bloc en tête contient-il le change ? */
  const fxFamily = $derived.by(() => {
    const h = app.scenario.registre.hypotheses.find((x) => x.effet === 'change');
    return h ? familyCode(h.famille) : null;
  });
  const bt = $derived(app.backtest);
  /** Revue des risques : ceux qui restent hors modèle sont nommés, ceux qui n'ont pas été revus aussi. */
  const revue = $derived(app.scenario.registre.revue_risques ?? []);
  const horsModele = $derived(revue.filter((x) => x.decision === 'hors-modele').map((x) => RISK_CATEGORIES.find((c) => c.code === x.categorie)?.libelle.toLowerCase()).filter(Boolean));
  const nonRevus = $derived(RISK_CATEGORIES.length - revue.filter((x) => x.decision).length);
  const ptsInt = (x: number) => `${x >= 0 ? '+' : '−'}${num(Math.abs(x * 100), 0)} points`;
</script>

{#if r && !r.partial}
  <article class="note" class:print-only={!screen} class:screen aria-hidden={!screen}>
    <header>
      <h1>Note CODIR · {app.budget.libelle}</h1>
      <p>Budget probabiliste : chances de tenir l'EBITDA budgété, risque, leviers.</p>
    </header>
    <p class="key">
      <strong>Message clé : l'EBITDA budgété de {amount(budget)} a {pct5(r.base.prob)} de chances d'être atteint.
      {#if pkgA && pkgA.dProb > 0.01 && best.length}
        {best.slice(0, 2).map((c) => c.libelle.toLowerCase()).join(' et ').replace(/^./, (c) => c.toUpperCase())} {best.length > 1 ? 'portent' : 'porte'} cette probabilité à {pct5(pkgA.stats.prob)} pour {amount(pkgA.cout ?? 0, 2)} de coût direct.
      {/if}</strong>
    </p>
    <ul>
      <li><b>Q1, probabilité :</b> {pct5(r.base.prob)}. Le résultat médian attendu est de {amount(r.base.p50)}, {amount(Math.abs(budget - r.base.p50))} {r.base.p50 < budget ? 'sous le' : 'au-dessus du'} budget.</li>
      <li><b>Q2, risque :</b> une année défavorable à 1 chance sur 10 donne {amount(r.base.p10)}. Dans les 10 % pires cas, l'EBITDA moyen tombe à {amount(r.base.cvar10)}.</li>
      <li><b>Q3, origine :</b>
        {#if topBlock}le bloc {topBlock.libelle.toLowerCase()} concentre {pct(topBlock.part)} des contributions relatives au risque (corrélations de rang, résultat du modèle){#if topBlock.code === fxFamily}{' : '}le change et ce qu'il entraîne{app.isAlfa ? ' (prix locaux, carburant, frais généraux)' : ''}{/if}.{/if}
        {#if topCommercial}{labels[topCommercial.code]} est le premier risque commercial.{/if}
      </li>
      <li><b>Q4, leviers :</b>
        {best.length ? `${best.slice(0, 2).map((c) => `${c.libelle.toLowerCase()}, ${ptsInt(c.dProb)}`).join(' ; ')}.` : 'aucun levier n\'améliore sensiblement la probabilité.'}
        {#if hedge && hedge.dEaR < -0.01}La couverture de change réduit le risque de {num((-hedge.dEaR / r.base.ear) * 100, 0)} % mais {hedge.dProb < 0 ? `retire ${num(-hedge.dProb * 100, 0)} points de probabilité` : `ajoute ${num(hedge.dProb * 100, 0)} points`}.{/if}
      </li>
    </ul>
    <div class="chart">
      <p class="ct">Distribution de 10 000 années simulées : {pct5(r.base.prob)} des années atteignent le budget</p>
      <Histogram base={r.annual} budget={budget} height={210} print />
    </div>
    <p><b>Décision attendue :</b>
      {#if options.length === 2}valider le paquet {options[0].c.code} (probabilité {pct5(options[0].c.stats.prob)}), ou le paquet {options[1].c.code} si le CODIR privilégie la protection du bas de fourchette (P10 à {amount(options[1].c.stats.p10)} au lieu de {num(options[0].c.stats.p10)}). Le choix dépend de ce que le CODIR redoute le plus : rater le budget, ou subir une mauvaise année.{:else if pkgA}valider le paquet {pkgA.code} (probabilité {pct5(pkgA.stats.prob)}).{:else if best.length}retenir {best[0].libelle.toLowerCase()} (probabilité {pct5(best[0].stats.prob)}).{:else}aucune action ne change sensiblement la probabilité : le budget est à revoir, ou à assumer tel quel.{/if}
    </p>
    {#if bt}<p class="small">{bt.synthese}</p>{/if}
    <footer>
      <p><b>Limites :</b> {app.isAlfa ? 'données de démonstration, ' : ''}corrélations estimées sur 5 ans ; {#if horsModele.length}risques hors modèle : {horsModele.join(', ')}{#if nonRevus}, et {nonRevus} famille{nonRevus > 1 ? 's' : ''} de risque non revue{nonRevus > 1 ? 's' : ''}{/if}{:else if nonRevus}{nonRevus} famille{nonRevus > 1 ? 's' : ''} de risque non revue{nonRevus > 1 ? 's' : ''}{:else}toutes les familles de risque revues{/if} ; probabilités arrondies à 5 points, écarts entre leviers au point près ({levers.map((c) => `${c.code} ${pts(c.dProb, 1)}`).join(', ')}).</p>
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
