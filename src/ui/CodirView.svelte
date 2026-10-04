<script lang="ts">
  /**
   * Synthèse CODIR : la réponse d'abord (probabilité, enjeu en GAr), puis le pourquoi,
   * les décisions sur la table et les « et si ». Vocabulaire de décideur (R-RE-04),
   * termes techniques en info-bulle.
   */
  import Gauge from './charts/Gauge.svelte';
  import Histogram from './charts/Histogram.svelte';
  import type { CaseResult } from '../engine/simulate.ts';
  import type { CaseCode } from '../engine/types.ts';
  import { chances, gar, num, pct } from './format.ts';
  import { app } from './state.svelte.ts';

  const r = $derived(app.result);
  const budget = $derived(app.budget.ebitdaPublie);
  const sel = $derived(r?.selection ?? null);
  const shown = $derived(sel?.stats ?? r?.base ?? null);
  const labels = $derived(Object.fromEntries([...app.scenario.registre.hypotheses, ...app.scenario.registre.evenements].map((h) => [h.code, h.libelle])));
  const exercice = $derived(app.budget.exercice);

  const verdict = $derived.by(() => {
    const p = r?.base.prob ?? 0;
    if (p < 0.2) return { texte: 'Budget très exigeant', ton: 'ko' };
    if (p < 0.4) return { texte: 'Budget exigeant', ton: 'warn' };
    if (p < 0.6) return { texte: 'Budget équilibré', ton: 'ok' };
    return { texte: 'Budget prudent', ton: 'ok' };
  });

  const ecart = (v: number) => {
    const d = v - budget;
    if (Math.abs(d) < 0.05) return 'au niveau du budget';
    return `${num(Math.abs(d))} GAr ${d < 0 ? 'sous' : 'au-dessus du'} budget`;
  };

  /** Phrase en clair sur une hypothèse : sa valeur dans une mauvaise année contre la moyenne. */
  function why(code: string): string {
    const p = r?.profile.find((x) => x.code === code);
    if (!p) return '';
    if (code === 'H06') return `Dans une mauvaise année, l'euro vaut en moyenne ${num(p.p10Year, 0)} MGA, contre ${num(p.all, 0)} sur l'ensemble des années simulées.`;
    if (code.startsWith('E')) return `Survient dans ${pct(p.p10Year)} des mauvaises années, contre ${pct(p.all)} en moyenne.`;
    if (code === 'H05') return `Écart de mix de ${num(p.p10Year, 2)} point dans une mauvaise année, contre ${num(p.all, 2)} en moyenne.`;
    const f = (x: number) => `${x > 1.0005 ? '+' : x < 0.9995 ? '−' : ''}${num(Math.abs(x - 1) * 100, 1)} %`;
    return `${f(p.p10Year)} par rapport au budget dans une mauvaise année, contre ${f(p.all)} en moyenne.`;
  }

  const drivers = $derived(r && !r.partial ? r.contributions.items.slice(0, 4) : []);
  const blocks = $derived(r && !r.partial ? [...r.contributions.blocks].sort((a, b) => b.part - a.part) : []);
  const levers = $derived(r ? r.cases.filter((c) => c.type === 'levier').sort((a, b) => b.dProb - a.dProb) : []);
  const bestCode = $derived(levers.find((c) => !c.refus && c.dProb > 0.01)?.code);
  const stress = $derived(r ? r.cases.filter((c) => c.type === 'stress') : []);
  const optA = $derived(r?.cases.find((c) => c.code === 'A'));
  const optB = $derived(r?.cases.find((c) => c.code === 'B'));

  function tag(c: CaseResult): { texte: string; ton: string } | null {
    if (c.refus) return { texte: 'Fiche incomplète', ton: 'ko' };
    if (c.code === bestCode) return { texte: 'Meilleur gain', ton: 'ok' };
    if (c.dEaR <= -0.1) return { texte: 'Réduit le risque', ton: 'info' };
    if (Math.abs(c.dProb) < 0.005 && Math.abs(c.dEaR) < 0.05) return { texte: 'Sans effet notable', ton: 'neutre' };
    if (c.dProb < -0.005) return { texte: 'Contre-productif', ton: 'ko' };
    if (c.dProb > 0.005) return { texte: 'Améliore les chances', ton: 'ok' };
    return null;
  }

  const active = (code: string) => app.scenario.actifs.includes(code as CaseCode);
  const lever = (code: string) => app.scenario.leviers.find((l) => l.code === code);
  const stressDef = (code: string) => app.scenario.stress.find((s) => s.code === code);
  function setOnly(codes: CaseCode[]) {
    const same = codes.length === app.scenario.actifs.length && codes.every((c) => active(c));
    app.scenario.actifs = same ? [] : [...codes];
  }
  const greens = $derived(r && !r.partial ? r.controls.filter((c) => c.ok).length : 0);
  const delta = (x: number) => `${x > 0.0005 ? '+' : x < -0.0005 ? '−' : ''}${num(Math.abs(x * 100), 0)} pt${Math.abs(x * 100) >= 1.5 ? 's' : ''}`;
</script>

{#if !r}
  <div class="loading panel">Simulation de 10 000 années possibles…</div>
{:else}
  <div class="codir">
    <!-- 1. La réponse -->
    <section class="hero panel" aria-labelledby="reponse">
      <div class="answer">
        <span class="eyebrow">Budget {exercice} · EBITDA de {gar(budget)}</span>
        <h2 id="reponse">Le budget a <em>{pct(r.base.prob)}</em> de chances d'être atteint.</h2>
        <p class="lead">Le résultat médian, avec autant de chances de faire mieux que moins, est de {gar(r.base.p50)}, {ecart(r.base.p50)}. Une année défavorable, à 1 chance sur 10, donnerait {gar(r.base.p10)}.</p>
        <span class="pill {verdict.ton}">{verdict.texte}</span>
        {#if sel}
          <div class="sel" role="status">
            <span>Avec {sel.codes.join(' + ')} : <b>{pct(sel.stats.prob)}</b> de chances ({delta(sel.stats.prob - r.base.prob)}), année défavorable à {gar(sel.stats.p10)}.</span>
            <button class="link" onclick={() => (app.scenario.actifs = [])}>Revenir au budget seul</button>
          </div>
        {/if}
      </div>
      <div class="gauge" data-testid="probabilite">
        <Gauge value={shown!.prob} base={sel ? r.base.prob : null} label="Probabilité d'atteindre le budget : {pct(shown!.prob)}" />
        <span class="value">{pct(shown!.prob)}</span>
        <span class="small muted">{chances(shown!.prob)}{#if sel}, avec {sel.codes.join(' + ')}{/if}</span>
      </div>
    </section>

    <!-- 2. Les chiffres clés -->
    <section class="kpis" aria-label="Chiffres clés">
      <div class="kpi">
        <span class="k tip" title="P50 : 1 chance sur 2 de faire moins, 1 chance sur 2 de faire mieux">Résultat médian</span>
        <span class="v">{gar(shown!.p50)}</span>
        <span class="s">{ecart(shown!.p50)}</span>
      </div>
      <div class="kpi">
        <span class="k tip" title="P10 : 1 chance sur 10 de faire moins">Année défavorable</span>
        <span class="v">{gar(shown!.p10)}</span>
        <span class="s">1 chance sur 10 de faire moins</span>
      </div>
      <div class="kpi">
        <span class="k tip" title="P90 : 1 chance sur 10 de faire mieux">Année favorable</span>
        <span class="v">{gar(shown!.p90)}</span>
        <span class="s">1 chance sur 10 de faire mieux</span>
      </div>
      <div class="kpi">
        <span class="k tip" title="P20 : atteint ou dépassé dans 8 années simulées sur 10">Objectif à 80 % de chances</span>
        <span class="v">{gar(shown!.p20)}</span>
        <span class="s">tenu 8 années sur 10</span>
      </div>
    </section>

    <!-- 3. La distribution et le pourquoi -->
    <div class="two">
      <section class="panel" aria-labelledby="distrib">
        <h3 id="distrib">Sur 10 000 années simulées, {num(Math.round(shown!.prob * 10), 0)} sur 10 atteignent le budget{sel ? ` avec ${sel.codes.join(' + ')}` : ''}</h3>
        <Histogram base={r.annual} overlay={sel?.annual ?? null} budget={budget} overlayLabel={sel ? `Avec ${sel.codes.join(' + ')}` : ''} />
      </section>
      <section class="panel why" aria-labelledby="pourquoi">
        <h3 id="pourquoi">Pourquoi : ce qui fait bouger le résultat</h3>
        {#if r.partial}
          <p class="muted small">Analyse en cours…</p>
        {:else}
          <div class="blocks" aria-label="Part du risque par famille">
            {#each blocks as b (b.code)}
              <div class="block {b.code}" style="flex: {Math.max(b.part, 0.06)}" title="{b.libelle} : {pct(b.part)} de la variance de l'EBITDA simulé">
                <b>{pct(b.part)}</b><span>{b.libelle}</span>
              </div>
            {/each}
          </div>
          <ol class="drivers">
            {#each drivers as d (d.code)}
              <li>
                <div class="dh"><b>{labels[d.code]}</b><span class="share">{pct(d.part)} du risque</span></div>
                <p class="small muted">{why(d.code)}</p>
              </li>
            {/each}
          </ol>
          <p class="small muted">Part de la variance de l'EBITDA simulé (corrélation de rang au carré, normalisée à 100 %). C'est un résultat du modèle, qui découle des fourchettes et corrélations saisies au registre, pas une mesure du risque réel de l'entreprise{#if app.isAlfa} ; ici, données synthétiques ALFA{/if}.</p>
        {/if}
      </section>
    </div>

    <!-- 4. Les décisions sur la table -->
    <section class="panel" aria-labelledby="decisions">
      <div class="sh">
        <h3 id="decisions">Les décisions sur la table</h3>
        <span class="small muted">Cochez « Simuler » pour voir l'effet sur la distribution. Les gains ne s'additionnent pas : chaque combinaison est recalculée.</span>
      </div>
      <div class="levers">
        {#each levers as c (c.code)}
          {@const l = lever(c.code)}
          {@const t = tag(c)}
          <article class="lever" class:on={active(c.code)}>
            <header>
              <span class="code">{c.code}</span>
              {#if t}<span class="pill small {t.ton}">{t.texte}</span>{/if}
            </header>
            <h4>{c.libelle}</h4>
            <p class="small muted desc">{l?.description}</p>
            {#if c.refus}
              <p class="small neg">{c.refus}</p>
            {:else}
              <div class="effect">
                <span class="after">{pct(c.stats.prob)}</span>
                <span class="chip" class:up={c.dProb > 0.005} class:down={c.dProb < -0.005}>{delta(c.dProb)}</span>
                <span class="small muted">de chances, contre {pct(r.base.prob)}</span>
              </div>
              <p class="line small"><span class="muted">Année défavorable</span> <b>{gar(c.stats.p10)}</b> <span class:pos={c.dP10 > 0.05} class:neg={c.dP10 < -0.05}>({c.dP10 >= 0 ? '+' : '−'}{num(Math.abs(c.dP10))})</span></p>
              <p class="line small"><span class="muted">Coût direct</span> {l?.coutLibelle}</p>
            {/if}
            <label class="sim"><input type="checkbox" checked={active(c.code)} disabled={!!c.refus} onchange={() => app.toggleCase(c.code as CaseCode)} data-testid="case-{c.code}" /> Simuler</label>
          </article>
        {/each}
      </div>

      {#if optA && optB}
        <h3 class="mt">Deux options à arbitrer</h3>
        <div class="options">
          {#each [{ c: optA, nom: 'Option A', codes: ['L2', 'L3'], pour: 'maximise les chances de tenir le budget' }, { c: optB, nom: 'Option B', codes: ['L1', 'L2', 'L3'], pour: 'protège le bas de fourchette' }] as o (o.nom)}
            <article class="option" class:on={o.codes.length === app.scenario.actifs.length && o.codes.every((x) => active(x))}>
              <h4>{o.nom} <span class="small muted">{o.codes.join(' + ')}</span></h4>
              <p class="small">Elle {o.pour}.</p>
              <dl>
                <dt>Chances</dt><dd><b>{pct(o.c.stats.prob)}</b> ({delta(o.c.dProb)})</dd>
                <dt>Année défavorable</dt><dd><b>{gar(o.c.stats.p10)}</b></dd>
                <dt>Coût direct</dt><dd>{gar(o.c.cout ?? 0, 2)}</dd>
              </dl>
              <button onclick={() => setOnly(o.codes as CaseCode[])}>{o.codes.length === app.scenario.actifs.length && o.codes.every((x) => active(x)) ? 'Retirer' : 'Voir sur la distribution'}</button>
            </article>
          {/each}
        </div>
        <p class="small muted">Le choix dépend de ce que le CODIR redoute le plus : rater le budget (option A), ou subir une mauvaise année (option B, qui remonte l'année défavorable de {num(optB.stats.p10 - optA.stats.p10)} GAr).</p>
      {/if}
    </section>

    <!-- 5. Et si… -->
    <section class="panel" aria-labelledby="etsi">
      <div class="sh">
        <h3 id="etsi">Et si… : la résistance du budget aux chocs</h3>
        <span class="small muted">Un stress test ne prévoit rien : il mesure ce que deviendraient les chances si le choc survenait.</span>
      </div>
      <div class="stress">
        {#each stress as c (c.code)}
          {@const s = stressDef(c.code)}
          <article class="st" class:on={c.code !== 'S1+S3' && active(c.code)}>
            <h4>{c.libelle}</h4>
            <p class="small muted">{s?.regle ?? 'Dépréciation brutale et choc carburant ensemble'}</p>
            <p class="big">{pct(c.stats.prob)} <span class="small muted">de chances</span></p>
            <p class="small">Résultat médian : {gar(c.stats.p50)}</p>
            {#if c.code !== 'S1+S3'}
              <label class="sim"><input type="checkbox" checked={active(c.code)} onchange={() => app.toggleCase(c.code as CaseCode)} data-testid="case-{c.code}" /> Simuler</label>
            {/if}
          </article>
        {/each}
      </div>
    </section>

    <!-- 6. Fiabilité -->
    <section class="trust small">
      <span class="pill {r.partial ? 'neutre' : r.blocking ? 'ko' : 'ok'}">{r.partial ? 'Contrôles en cours' : r.blocking ? 'Contrôle bloquant en échec' : `${greens} contrôles sur ${r.controls.length} au vert`}</span>
      <span class="muted">{app.isAlfa ? 'Données de démonstration. ' : ''}Probabilités au point près ; la note CODIR les arrondit à 5 points.</span>
      <span class="muted ref" data-testid="run-ref">{#if app.running}recalcul… {/if}Réf. {r.ref.texte}{#if r.partial} · analyses en cours{/if}</span>
      <button class="link" onclick={() => app.setVue('analyse')}>Voir l'analyse détaillée</button>
    </section>
  </div>
{/if}

<style>
  .codir { display: grid; gap: 14px; max-width: 1240px; margin: 0 auto; width: 100%; }
  .panel { padding: 16px 18px; min-width: 0; }
  .loading { padding: 80px 0; text-align: center; color: var(--muted); }
  h3 { text-transform: none; letter-spacing: 0; font-size: 15px; color: var(--ink); text-wrap: balance; }
  h4 { font-size: 14px; font-weight: 650; margin: 0; }
  .mt { margin-top: 16px; }
  .eyebrow { font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }

  .hero { display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: 24px; align-items: center; }
  .answer { display: grid; gap: 8px; justify-items: start; }
  .answer h2 { font-size: 30px; line-height: 1.15; font-weight: 750; text-wrap: balance; }
  .answer h2 em { font-style: normal; color: var(--accent); }
  .lead { font-size: 16px; max-width: 62ch; margin: 0; }
  .sel { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: baseline; background: color-mix(in srgb, var(--sel) 12%, var(--panel)); border: 1px solid color-mix(in srgb, var(--sel) 45%, transparent); padding: 8px 12px; border-radius: 8px; }
  .gauge { display: grid; justify-items: center; text-align: center; }
  .gauge .value { font-size: 44px; font-weight: 800; color: var(--accent); margin-top: -46px; line-height: 1; }

  .pill { display: inline-block; padding: 3px 10px; border-radius: 999px; font-weight: 600; font-size: 13px; border: 1px solid transparent; }
  .pill.small { font-size: 11px; padding: 2px 8px; }
  .pill.ok { background: color-mix(in srgb, var(--ok) 14%, var(--panel)); color: var(--ok); border-color: color-mix(in srgb, var(--ok) 35%, transparent); }
  .pill.warn { background: color-mix(in srgb, var(--warn) 14%, var(--panel)); color: var(--warn); border-color: color-mix(in srgb, var(--warn) 35%, transparent); }
  .pill.ko { background: color-mix(in srgb, var(--ko) 12%, var(--panel)); color: var(--ko); border-color: color-mix(in srgb, var(--ko) 35%, transparent); }
  .pill.info { background: color-mix(in srgb, var(--accent) 12%, var(--panel)); color: var(--accent); border-color: color-mix(in srgb, var(--accent) 35%, transparent); }
  .pill.neutre { background: var(--soft); color: var(--muted); }

  .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
  .kpi { display: grid; gap: 2px; padding: 12px 14px; background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); }
  .kpi .k { font-size: 13px; color: var(--muted); justify-self: start; }
  .kpi .v { font-size: 24px; font-weight: 700; }
  .kpi .s { font-size: 12px; color: var(--muted); }

  .two { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr); gap: 14px; }
  .two > section { display: grid; gap: 10px; align-content: start; }
  .blocks { display: flex; gap: 3px; }
  .block { display: grid; padding: 6px 9px; border-radius: 6px; color: #fff; min-width: 0; overflow: hidden; background: var(--bar); }
  .block.macro { background: var(--bar-hit); }
  .block span { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .drivers { margin: 0; padding: 0; list-style: none; display: grid; gap: 10px; counter-reset: d; }
  .drivers li { display: grid; gap: 2px; padding-left: 26px; position: relative; counter-increment: d; }
  .drivers li::before { content: counter(d); position: absolute; left: 0; top: 1px; width: 18px; height: 18px; border-radius: 50%; background: var(--soft); color: var(--muted); font-size: 11px; font-weight: 700; display: grid; place-items: center; }
  .dh { display: flex; justify-content: space-between; gap: 8px; }
  .share { color: var(--muted); white-space: nowrap; font-size: 13px; }
  .drivers p { margin: 0; }

  .sh { display: grid; gap: 2px; margin-bottom: 10px; }
  .levers { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px; }
  .lever, .option, .st { display: grid; gap: 6px; align-content: start; padding: 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); }
  .lever.on, .option.on, .st.on { border-color: var(--sel); box-shadow: 0 0 0 1px var(--sel) inset; }
  .lever header { display: flex; justify-content: space-between; align-items: center; gap: 6px; }
  .code { font-size: 12px; font-weight: 700; color: var(--muted); }
  .desc { margin: 0; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 3px 10px; margin: 2px 0; font-size: 13px; }
  dt { color: var(--muted); }
  dd { margin: 0; text-align: right; }
  .effect { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; margin-top: 2px; }
  .after { font-size: 26px; font-weight: 750; line-height: 1.1; }
  .chip { font-size: 12px; font-weight: 700; padding: 1px 7px; border-radius: 999px; background: var(--soft); color: var(--muted); }
  .chip.up { background: color-mix(in srgb, var(--ok) 15%, var(--panel)); color: var(--ok); }
  .chip.down { background: color-mix(in srgb, var(--ko) 13%, var(--panel)); color: var(--ko); }
  .line { margin: 0; display: flex; flex-wrap: wrap; gap: 0 6px; }
  .sim { display: flex; gap: 6px; align-items: center; font-size: 13px; font-weight: 600; cursor: pointer; margin-top: 2px; }
  .options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 8px 0; }
  .option button { justify-self: start; }
  .stress { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 10px; }
  .st p { margin: 0; }
  .st .big { font-size: 26px; font-weight: 700; color: var(--ko); }

  .trust { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; padding: 4px 2px; }
  .trust .ref { overflow-wrap: anywhere; }

  @media (max-width: 1000px) {
    .two { grid-template-columns: minmax(0, 1fr); }
    .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 640px) {
    .hero { grid-template-columns: minmax(0, 1fr); }
    .gauge { order: -1; }
    .answer h2 { font-size: 24px; }
    .options { grid-template-columns: minmax(0, 1fr); }
  }
</style>
