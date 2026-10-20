<script lang="ts">
  import { changeEffect, defaultEventPortee, dependents, EFFECT_HELP, EFFECT_LABEL, EVENT_EFFECT_LABEL, newEvent, newHypothesis, removeDriver } from '../engine/edit.ts';
  import { DECISION_LABEL, eventGuide, frequencyToProbability, fullReview, hypGuide, RISK_CATEGORIES, suggestRefs } from '../engine/guide.ts';
  import { chooseLaw } from '../engine/laws.ts';
  import { buMask, driverCodes, postesOf } from '../engine/model.ts';
  import { describePortee, joinFr } from '../engine/portee.ts';
  import { readiness, uncoveredPostes, type ReadinessItem, type Step } from '../engine/readiness.ts';
  import { EVENT_EFFECTS, HYP_EFFECTS, RISK_DECISIONS, signOf, type EventEffect, type HypEffect, type Hypothesis, type Portee, type RiskEvent, type RiskReview } from '../engine/types.ts';
  import { budgetTemplate, workbookBytes } from '../io/excel.ts';
  import { download } from './download.ts';
  import { amount, num, pct, rate } from './format.ts';
  import { importFiles, type ImportOutcome } from './importer.svelte.ts';
  import PorteeEditor from './PorteeEditor.svelte';
  import { app } from './state.svelte.ts';
  import { units } from './units.svelte.ts';

  let { onclose, onImport }: { onclose: () => void; onImport: (o: ImportOutcome) => void } = $props();
  const EMBEDDED = import.meta.env.VITE_HOST === 'artifact';

  const STEPS: { id: Step | 'bilan'; titre: string; aide: string }[] = [
    { id: 'budget', titre: 'Budget de base', aide: 'La structure du P&L et le chiffre de référence.' },
    { id: 'hypotheses', titre: 'Hypothèses', aide: 'Ce qui fait varier le budget : une fourchette par hypothèse.' },
    { id: 'evenements', titre: 'Événements', aide: 'Ce qui peut arriver ou non : une probabilité et un impact.' },
    { id: 'correlations', titre: 'Liens entre hypothèses', aide: 'Ce qui bouge ensemble.' },
    { id: 'revue', titre: 'Revue des risques', aide: 'Chaque famille de risque reçoit une décision.' },
    { id: 'bilan', titre: 'Bilan', aide: 'Ce qui reste à faire avant le CODIR.' },
  ];
  let step = $state<Step | 'bilan'>('hypotheses');
  let open = $state<string | null>(null);
  /** Retrait en attente de confirmation. */
  let removing = $state<string | null>(null);

  const reg = $derived(app.scenario.registre);
  const budget = $derived(app.budget);
  const c01 = $derived(app.result && !app.result.partial ? (app.result.controls.find((c) => c.code === 'C01')?.ok ?? null) : null);
  const rd = $derived(readiness(app.scenario, { budgetImporte: !app.isAlfa, reconciliationOk: c01, budget: app.budget }));
  const item = (code: string) => rd.items.find((i) => i.code === code);
  const pending = (s: Step | 'bilan') => (s === 'bilan' ? 0 : rd.items.filter((i) => i.etape === s && i.statut !== 'pret').length);
  const STATUT_LABEL: Record<ReadinessItem['statut'], string> = { pret: 'prêt', 'a-revoir': 'à revoir', bloquant: 'bloquant' };
  const FAMILLES = ['Commercial', 'Macroéconomie', 'Approvisionnement', 'Coûts', 'Opérations', 'Réglementaire'];
  const familles = $derived([...new Set([...reg.hypotheses.map((h) => h.famille), ...reg.evenements.map((e) => e.famille), ...FAMILLES])]);
  const sum = (x: number[]) => x.reduce((a, v) => a + v, 0);

  // --- Saisie : toute modification passe par markRegistryEdited (nouvelle version si le registre était validé ou gelé).
  const parse = (s: string): number | null => {
    const v = Number(s.replace(/\s/g, '').replace(',', '.'));
    return s.trim() !== '' && Number.isFinite(v) ? v : null;
  };
  const isPoints = (h: Hypothesis) => h.effet === 'marge';
  const shownPct = (v: number | undefined) => (v == null ? '' : String(Math.round(v * 10000) / 100).replace('.', ','));
  /** Une hypothèse en facteur se saisit en écart au budget, en % : 0,97 s'affiche −3. */
  const shown = (h: Hypothesis, v: number | null | undefined) => (v == null ? '' : isPoints(h) ? String(v).replace('.', ',') : String(Math.round((v - 1) * 10000) / 100).replace('.', ','));
  function setHyp(h: Hypothesis, key: 'p10' | 'p50' | 'p90', raw: string) {
    const v = parse(raw);
    if (v === null) return;
    app.markRegistryEdited();
    h[key] = isPoints(h) ? v : Math.round((1 + v / 100) * 10000) / 10000;
  }
  function setFx(h: Hypothesis, key: 'depart' | 'derive_annuelle' | 'volatilite_mensuelle', raw: string) {
    const v = parse(raw);
    if (v === null) return;
    app.markRegistryEdited();
    h[key] = key === 'depart' ? v : v / 100;
  }
  function setText(x: Hypothesis | RiskEvent, key: 'proprietaire' | 'justification' | 'libelle' | 'famille', v: string) {
    if ((key === 'libelle' || key === 'famille') && !v.trim()) return;
    app.markRegistryEdited();
    x[key] = key === 'libelle' || key === 'famille' ? v.trim() : v;
  }
  function setValidated(x: Hypothesis | RiskEvent, ok: boolean) {
    app.markRegistryEdited();
    x.statut = ok ? 'valide' : 'brouillon';
  }
  function setEffect(h: Hypothesis, effet: HypEffect) {
    app.markRegistryEdited();
    changeEffect(app.scenario, app.budget, h, effet);
  }
  function setPortee(x: Hypothesis | RiskEvent, p: Portee) {
    app.markRegistryEdited();
    // La cible en clair d'un événement suit sa portée, tant qu'elle n'a pas été réécrite à la main.
    if ('sens' in x && (!x.cible || x.cible === describePortee(x.portee, budget))) x.cible = describePortee(p, budget);
    x.portee = p;
  }
  /** Effets proposés : le change seulement si le budget a des postes en devises, et une seule hypothèse de change. */
  const effetsFor = (h: Hypothesis | null) =>
    HYP_EFFECTS.filter((x) => x !== 'change' || (budget.change && !reg.hypotheses.some((o) => o.effet === 'change' && o.code !== h?.code)));

  function setEvent(e: RiskEvent, key: 'p' | 'a0' | 'a1' | 's0' | 's1', raw: string) {
    const v = parse(raw);
    if (v === null) return;
    app.markRegistryEdited();
    if (key === 'p') e.p = v / 100;
    if (key === 'a0') e.amplitude = [v / 100, e.amplitude[1]];
    if (key === 'a1') e.amplitude = [e.amplitude[0], v / 100];
    if (key === 's0' && e.surcout) e.surcout = [v, e.surcout[1]];
    if (key === 's1' && e.surcout) e.surcout = [e.surcout[0], v];
  }
  function setEvEffect(e: RiskEvent, effet: EventEffect) {
    if (e.effet === effet) return;
    app.markRegistryEdited();
    e.effet = effet;
    e.sens = effet === 'volume' ? 'baisse' : 'hausse';
    setPortee(e, defaultEventPortee(budget, effet));
  }
  function setEvChoice(e: RiskEvent, key: 'sens' | 'duree', v: string) {
    app.markRegistryEdited();
    if (key === 'sens') e.sens = v === 'hausse' ? 'hausse' : 'baisse';
    else e.duree = v === 'mois' ? 'mois' : 'fin';
  }
  function setCible(e: RiskEvent, v: string) {
    app.markRegistryEdited();
    e.cible = v;
  }
  const charges = $derived(budget.rubriques.filter((r) => r.nature === 'charge'));
  function toggleSurcout(e: RiskEvent, on: boolean) {
    app.markRegistryEdited();
    if (on) {
      e.surcout = [0, Math.round(Math.abs(budget.ebitdaPublie) * 0.01 * 1000) / 1000];
      e.rubriqueSurcout = charges[0]?.code;
    } else {
      delete e.surcout;
      delete e.rubriqueSurcout;
    }
  }
  function setSurcoutRubrique(e: RiskEvent, code: string) {
    app.markRegistryEdited();
    e.rubriqueSurcout = code;
  }

  let freq = $state<Record<string, { k: string; n: string }>>({});
  const fq = (code: string) => freq[code] ?? { k: '', n: '' };
  function setFreq(code: string, key: 'k' | 'n', v: string) {
    freq[code] = { ...fq(code), [key]: v };
  }
  function applyFreq(e: RiskEvent) {
    const f = fq(e.code);
    const p = frequencyToProbability(Number(f.k), Number(f.n));
    if (!Number.isFinite(p)) return;
    app.markRegistryEdited();
    e.p = Math.round(p * 100) / 100;
  }

  // --- Ajouter, retirer.
  let addEffet = $state<HypEffect>('poste');
  let addLib = $state('');
  function addHyp(effet: HypEffect = addEffet, libelle = addLib, portee?: Portee) {
    const h = newHypothesis(app.scenario, app.budget, effet, libelle);
    if (portee) h.portee = portee;
    app.markRegistryEdited();
    reg.hypotheses.push(h);
    addLib = '';
    open = h.code;
  }
  function addHypFor(code: string) {
    const p = budget.postes.find((x) => x.code === code)!;
    addHyp('poste', p.libelle, { postes: [code] });
  }
  let addEvEffet = $state<EventEffect>('volume');
  let addEvLib = $state('');
  function addEvent() {
    const e = newEvent(app.scenario, app.budget, addEvEffet, addEvLib);
    app.markRegistryEdited();
    reg.evenements.push(e);
    addEvLib = '';
    open = e.code;
  }
  function removeText(code: string): string {
    const d = dependents(app.scenario, code);
    const also = [
      ...d.leviers.map((c) => `le levier ${c}`),
      ...d.stress.map((c) => `le stress test ${c}`),
      ...(d.correlations ? [`${d.correlations} corrélation${d.correlations > 1 ? 's' : ''}`] : []),
    ];
    return also.length ? `Seront aussi retirés : ${joinFr(also)}.` : '';
  }
  function remove(code: string) {
    app.markRegistryEdited();
    removeDriver(app.scenario, code);
    removing = null;
    open = null;
  }
  function setCertain(code: string, on: boolean) {
    app.markRegistryEdited();
    const cur = reg.postes_certains ?? [];
    reg.postes_certains = on ? [...cur, code] : cur.filter((c) => c !== code);
  }
  const left = $derived(uncoveredPostes(app.scenario, budget));
  const certains = $derived((reg.postes_certains ?? []).filter((c) => budget.postes.some((p) => p.code === c)));
  const posteOf = (code: string) => budget.postes.find((p) => p.code === code)!;
  const rubLabel = (code: string) => budget.rubriques.find((r) => r.code === code)?.libelle ?? code;

  // --- Budget : chaque rubrique, son montant, et ce qui la fait varier.
  const rubRows = $derived.by(() => {
    const caRubs = new Set(budget.rubriques.filter((r) => r.nature === 'ca').map((r) => r.code));
    const follows = (i: number) => caRubs.has(budget.postes[i].rubrique) || budget.postes[i].assiette !== 'fixe';
    const onBu = (p: Portee, i: number) => budget.postes[i].bu === null || buMask(budget, p)[budget.bu.indexOf(budget.postes[i].bu!)] === 1;
    return budget.rubriques.map((r) => {
      const idx = budget.postes.map((p, i) => (p.rubrique === r.code ? i : -1)).filter((i) => i >= 0);
      const codes: string[] = [];
      for (const h of reg.hypotheses) {
        const hit =
          h.effet === 'poste' ? postesOf(budget, h.portee).some((i) => idx.includes(i))
          : h.effet === 'volume' ? idx.some((i) => follows(i) && onBu(h.portee, i))
          : h.effet === 'prix' ? idx.some((i) => (caRubs.has(r.code) || budget.postes[i].assiette === 'ca') && onBu(h.portee, i))
          : h.effet === 'change' ? idx.some((i) => budget.postes[i].devises > 0)
          : h.portee.rubrique === r.code;
        if (hit) codes.push(h.code);
      }
      for (const e of reg.evenements) {
        const hit = e.effet === 'poste' ? postesOf(budget, e.portee).some((i) => idx.includes(i)) : idx.some((i) => follows(i) && onBu(e.portee, i)) || (!!e.surcout && e.rubriqueSurcout === r.code);
        if (hit) codes.push(e.code);
      }
      return { r, n: idx.length, total: sum(idx.map((i) => sum(budget.postes[i].montants))), codes };
    });
  });
  const ebitdaRecalc = $derived(rubRows.reduce((a, x) => a + signOf(x.r.nature) * x.total, 0));

  function corrSet(i: number, key: 'v' | 'j', raw: string) {
    app.markRegistryEdited();
    const c = reg.correlations_rang[i];
    if (key === 'v') {
      const v = parse(raw);
      if (v !== null) c[2] = v;
    } else c[3] = raw;
  }
  function corrDelete(i: number) {
    app.markRegistryEdited();
    reg.correlations_rang = reg.correlations_rang.filter((_, k) => k !== i);
  }
  const codes = $derived(driverCodes(reg));
  let newA = $state('');
  let newB = $state('');
  const pickA = $derived(codes.includes(newA) ? newA : (codes[0] ?? ''));
  const pickB = $derived(codes.includes(newB) ? newB : (codes[1] ?? ''));
  function corrAdd() {
    const a = pickA;
    const b = pickB;
    if (!a || !b || a === b || reg.correlations_rang.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) return;
    app.markRegistryEdited();
    reg.correlations_rang = [...reg.correlations_rang, [a, b, 0, '']];
  }
  const force = (v: number) => (Math.abs(v) >= 0.5 ? 'fort' : Math.abs(v) >= 0.3 ? 'modéré' : Math.abs(v) > 0 ? 'faible' : 'nul');
  const libelleOf = (code: string) => reg.hypotheses.find((h) => h.code === code)?.libelle ?? reg.evenements.find((e) => e.code === code)?.libelle ?? code;

  function review(): RiskReview[] {
    if (!reg.revue_risques || reg.revue_risques.length !== RISK_CATEGORIES.length) reg.revue_risques = fullReview(reg.revue_risques);
    return reg.revue_risques;
  }
  const reviewRows = $derived(fullReview(reg.revue_risques));
  function setReview(code: string, key: 'decision' | 'ref' | 'commentaire', v: string) {
    app.markRegistryEdited();
    const r = review().find((x) => x.categorie === code)!;
    if (key === 'decision') r.decision = (RISK_DECISIONS as string[]).includes(v) ? (v as RiskReview['decision']) : null;
    else r[key] = v;
  }

  /** Lecture en clair d'une fourchette, pour que le propriétaire vérifie qu'elle dit bien ce qu'il pense. */
  function reading(h: Hypothesis): string {
    const law = chooseLaw(h);
    const cur = budget.change ? ` ${budget.change.locale} pour 1 ${budget.change.devise}` : '';
    if (law === 'marche-aleatoire') return `Cours de départ ${rate(h.depart!)}${cur}, dérive de ${num(h.derive_annuelle! * 100, 1)} % par an, variation mensuelle typique de ${num(h.volatilite_mensuelle! * 100, 1)} %.`;
    if (isPoints(h)) return `1 chance sur 10 d'être sous ${num(h.p10!, 1)} point, 1 chance sur 10 d'être au-dessus de ${num(h.p90!, 1)} point.`;
    if (law === 'pert') return `Entre ${num(h.min!, 3)} et ${num(h.max!, 3)}, valeur la plus probable ${num(h.p50!, 3)}.`;
    const f = (v: number) => `${v >= 1 ? '+' : '−'}${num(Math.abs(v - 1) * 100, 1)} %`;
    return `1 chance sur 10 d'être à ${f(h.p10!)} du budget ou moins, 1 chance sur 10 d'être à ${f(h.p90!)} ou plus${h.p50 != null ? `, valeur centrale ${f(h.p50)}` : ''}.`;
  }

  function nextOpen(list: string[]) {
    const i = list.indexOf(open ?? '');
    const rest = [...list.slice(i + 1), ...list.slice(0, i + 1)];
    open = rest.find((c) => item(c)?.statut !== 'pret') ?? null;
  }
  function goto(i: ReadinessItem) {
    step = i.etape;
    open = i.code;
  }

  let fileInput = $state<HTMLInputElement>();
  async function picked(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    onImport(await importFiles(Array.from(input.files ?? [])));
    input.value = '';
  }
  const horsModele = $derived(reviewRows.filter((r) => r.decision === 'hors-modele'));
</script>

<datalist id="familles">{#each familles as f (f)}<option value={f}></option>{/each}</datalist>

<div class="overlay screen-only" role="dialog" aria-modal="true" aria-labelledby="assistant-titre" data-testid="assistant">
  <div class="box panel">
    <header>
      <div>
        <h2 id="assistant-titre">Saisie guidée</h2>
        <p class="small muted">Chaque entrée de l'outil, une question à la fois : ajoutez, modifiez ou retirez hypothèses et événements. Rien n'est envoyé : tout reste sur ce poste.</p>
      </div>
      <div class="prog">
        <span class="count" data-testid="assistant-progression"><b>{rd.prets}</b> sur {rd.total} prêts</span>
        {#if rd.bloquants}<span class="chip bloquant">{rd.bloquants} bloquant{rd.bloquants > 1 ? 's' : ''}</span>{/if}
        <button onclick={onclose} data-testid="fermer-assistant">Fermer</button>
      </div>
    </header>
    <div class="bar" aria-hidden="true"><i style="width:{(rd.prets / rd.total) * 100}%"></i></div>

    <div class="body">
      <nav aria-label="Étapes">
        {#each STEPS as s, i (s.id)}
          <button class:active={step === s.id} onclick={() => { step = s.id; open = null; }} aria-current={step === s.id ? 'step' : undefined}>
            <span class="n">{i + 1}</span>
            <span class="t">{s.titre}<span class="small muted">{s.aide}</span></span>
            {#if s.id !== 'bilan'}{@const p = pending(s.id)}<span class="chip" class:pret={p === 0}>{p === 0 ? 'prêt' : p}</span>{/if}
          </button>
        {/each}
      </nav>

      <section class="content">
        {#if step === 'budget'}
          {@const b = item('BUDGET')!}
          <h3>Le budget de base</h3>
          <p>Le modèle <b>BUDGET_BASE.xlsx</b> décrit votre P&L de gestion, quel que soit le métier : <b>PARAMETRES</b> (unité des montants, EBITDA publié, devise et cours budget s'il y a des achats en devises), <b>RUBRIQUES</b> (les lignes du P&L jusqu'à l'EBITDA : chiffre d'affaires, autres produits, charges) et <b>POSTES</b> (une ligne par poste : sa BU, son assiette fixe, volume ou chiffre d'affaires, sa part en devises, ses douze montants). L'outil recalcule l'EBITDA et doit retrouver l'EBITDA publié.</p>
          <p class="small muted">À l'import, si le registre en cours ne nomme pas les BU et les postes de ce budget, un registre de départ est créé : une hypothèse de volume par BU, une de prix, une par rubrique de charges, le change s'il y a des postes en devises. Vous l'ajustez ensuite aux étapes suivantes.</p>
          <p class="small muted">Budget actuel : {app.isAlfa ? 'jeu de démonstration ALFA (données synthétiques)' : `${budget.libelle}, importé`} · {budget.bu.length} BU · {budget.postes.length} postes · EBITDA publié {amount(budget.ebitdaPublie, 2)}{c01 === true ? ' · réconciliation vérifiée' : ''}.</p>
          <table class="small rubs" data-testid="budget-rubriques">
            <thead><tr><th>Rubrique</th><th class="num">Budget annuel</th><th class="num">Postes</th><th>Varie avec</th></tr></thead>
            <tbody>
              {#each rubRows as x (x.r.code)}
                <tr>
                  <td>{x.r.libelle} <span class="muted">{x.r.nature === 'ca' ? "chiffre d'affaires" : x.r.nature === 'produit' ? 'produit' : 'charge'}</span></td>
                  <td class="num">{amount(x.total, 2)}</td>
                  <td class="num">{x.n}</td>
                  <td>{#if x.codes.length}{x.codes.join(', ')}{:else if x.n}<span class="warn">rien : reste au budget</span>{:else}<span class="muted">–</span>{/if}</td>
                </tr>
              {/each}
              <tr class="total"><td>EBITDA recalculé</td><td class="num">{amount(ebitdaRecalc, 2)}</td><td></td><td class="muted">publié : {amount(budget.ebitdaPublie, 2)}</td></tr>
            </tbody>
          </table>
          {#each b.constats as f (f.texte)}<p class="finding {f.niveau}">{f.texte}</p>{/each}
          <div class="actions">
            {#if !EMBEDDED}<button onclick={() => download(workbookBytes(budgetTemplate($state.snapshot(app.budget))), 'BUDGET_BASE.xlsx')}>Télécharger le modèle BUDGET_BASE, prérempli avec ce budget</button>{/if}
            <button class="primary" onclick={() => fileInput?.click()}>Importer mon budget</button>
            <input bind:this={fileInput} type="file" accept=".xlsx,.csv" hidden onchange={picked} />
          </div>

        {:else if step === 'hypotheses'}
          <h3>Les hypothèses</h3>
          <p class="small muted">Pour chacune : ce qu'elle fait varier (effet et portée), la question à poser à son propriétaire, sa fourchette en écart au budget (−3 = 3 % sous le budget), puis la source de sa réponse. Ajoutez celles qui manquent à votre métier, retirez celles qui ne vous concernent pas.</p>
          {#each reg.hypotheses as h (h.code)}
            {@const it = item(h.code)!}
            {@const g = hypGuide(h, budget, app.isAlfa)}
            {@const law = chooseLaw(h)}
            <div class="card" class:open={open === h.code}>
              <button class="head" onclick={() => (open = open === h.code ? null : h.code)} aria-expanded={open === h.code} data-testid="guide-{h.code}">
                <span class="code">{h.code}</span>
                <span class="lib">{h.libelle}<span class="small muted">&nbsp;· {EFFECT_LABEL[h.effet].toLowerCase()}, {describePortee(h.portee, budget)}</span></span>
                <span class="chip {it.statut}">{STATUT_LABEL[it.statut]}</span>
              </button>
              {#if open === h.code}
                <div class="edit">
                  <div class="trio">
                    <label>Libellé<input value={h.libelle} onchange={(e) => setText(h, 'libelle', e.currentTarget.value)} data-testid="lib-{h.code}" /></label>
                    <label>Famille de risque<input list="familles" value={h.famille} onchange={(e) => setText(h, 'famille', e.currentTarget.value)} /></label>
                    <label>Ce qui varie
                      <select value={h.effet} onchange={(e) => setEffect(h, e.currentTarget.value as HypEffect)} data-testid="effet-{h.code}">
                        {#each effetsFor(h) as x (x)}<option value={x}>{EFFECT_LABEL[x]}</option>{/each}
                      </select>
                    </label>
                  </div>
                  <p class="small muted">{EFFECT_HELP[h.effet].replace(/^./, (c) => c.toUpperCase())}.</p>
                  {#if h.effet === 'change'}
                    <p class="small">Postes exposés : {joinFr(budget.postes.filter((p) => p.devises > 0).map((p) => p.libelle)) || 'aucun'}.</p>
                  {:else}
                    <PorteeEditor portee={h.portee} kind={h.effet === 'poste' ? 'postes' : h.effet === 'marge' ? 'marge' : 'bu'} {budget} onchange={(p) => setPortee(h, p)} />
                  {/if}
                  <p class="q">{g.question}</p>
                  <dl class="small"><dt>Qui répond</dt><dd>{g.qui}</dd><dt>Où chercher</dt><dd>{g.sources}</dd><dt>Piège</dt><dd>{g.piege}</dd></dl>
                  {#if law === 'marche-aleatoire'}
                    <div class="trio">
                      <label>Cours de départ ({budget.change ? `${budget.change.locale} pour 1 ${budget.change.devise}` : 'cours'})<input inputmode="decimal" value={String(h.depart).replace('.', ',')} onchange={(e) => setFx(h, 'depart', e.currentTarget.value)} /></label>
                      <label>Dérive annuelle (%)<input inputmode="decimal" value={shownPct(h.derive_annuelle)} onchange={(e) => setFx(h, 'derive_annuelle', e.currentTarget.value)} /></label>
                      <label>Volatilité mensuelle (%)<input inputmode="decimal" value={shownPct(h.volatilite_mensuelle)} onchange={(e) => setFx(h, 'volatilite_mensuelle', e.currentTarget.value)} /></label>
                    </div>
                  {:else if law !== 'pert'}
                    <div class="trio">
                      <label>P10 · 1 chance sur 10 d'être en dessous<span class="unit">{isPoints(h) ? 'points' : '% vs budget'}</span><input inputmode="decimal" value={shown(h, h.p10)} onchange={(e) => setHyp(h, 'p10', e.currentTarget.value)} data-testid="p10-{h.code}" /></label>
                      {#if h.p50 != null}<label>P50 · valeur centrale<span class="unit">{isPoints(h) ? 'points' : '% vs budget'}</span><input inputmode="decimal" value={shown(h, h.p50)} onchange={(e) => setHyp(h, 'p50', e.currentTarget.value)} data-testid="p50-{h.code}" /></label>{/if}
                      <label>P90 · 1 chance sur 10 d'être au-dessus<span class="unit">{isPoints(h) ? 'points' : '% vs budget'}</span><input inputmode="decimal" value={shown(h, h.p90)} onchange={(e) => setHyp(h, 'p90', e.currentTarget.value)} data-testid="p90-{h.code}" /></label>
                    </div>
                  {:else}
                    <p class="small muted">Loi PERT (minimum, mode, maximum) : se modifie dans l'onglet Registre ou le classeur Excel.</p>
                  {/if}
                  <p class="reading small" data-testid="lecture-{h.code}">{reading(h)}</p>
                  <div class="gov">
                    <label>Propriétaire<input value={h.proprietaire} onchange={(e) => setText(h, 'proprietaire', e.currentTarget.value)} data-testid="prop-{h.code}" /></label>
                    <label>Justification : la source de la fourchette<textarea rows="2" value={h.justification} onchange={(e) => setText(h, 'justification', e.currentTarget.value)} data-testid="just-{h.code}"></textarea></label>
                    <label class="check"><input type="checkbox" checked={h.statut !== 'brouillon'} onchange={(e) => setValidated(h, e.currentTarget.checked)} /> Validée par le propriétaire</label>
                  </div>
                  {#each it.constats as f (f.texte)}<p class="finding {f.niveau}">{f.texte}</p>{/each}
                  <div class="actions">
                    <button onclick={() => nextOpen(reg.hypotheses.map((x) => x.code))}>Hypothèse suivante à compléter</button>
                    {#if removing === h.code}
                      <span class="small">Retirer {h.code} du registre ? {removeText(h.code)}</span>
                      <button class="danger" onclick={() => remove(h.code)} data-testid="confirmer-retrait-{h.code}">Retirer</button>
                      <button onclick={() => (removing = null)}>Annuler</button>
                    {:else}
                      <button class="link danger-link" onclick={() => (removing = h.code)} data-testid="retirer-{h.code}">Retirer cette hypothèse</button>
                    {/if}
                  </div>
                </div>
              {/if}
            </div>
          {/each}

          <div class="add" data-testid="ajout-hypothese">
            <b>Ajouter une hypothèse</b>
            <div class="row">
              <select bind:value={addEffet} aria-label="Ce qui varie">{#each effetsFor(null) as x (x)}<option value={x}>{EFFECT_LABEL[x]}</option>{/each}</select>
              <input bind:value={addLib} placeholder="Libellé, par exemple « Loyers des agences »" aria-label="Libellé" data-testid="ajout-libelle" />
              <button class="primary" onclick={() => addHyp()} data-testid="ajouter-hypothese">Ajouter</button>
            </div>
            <p class="small muted">{EFFECT_HELP[addEffet].replace(/^./, (c) => c.toUpperCase())}. Elle part en brouillon, avec une fourchette par défaut et un propriétaire à désigner.</p>
          </div>

          {@const pi = item('POSTES')}
          {#if pi}
            <div class="card postes" data-testid="postes-non-couverts">
              <div class="rh"><b>Postes sans hypothèse</b><span class="chip {pi.statut}">{STATUT_LABEL[pi.statut]}</span></div>
              {#if left.length}
                <p class="small muted">Ils restent au budget, sans incertitude : le risque serait sous-estimé. Pour chacun, créer une hypothèse, ou le confirmer certain (un loyer contractuel, par exemple).</p>
                <ul class="small">
                  {#each left as c (c)}
                    {@const p = posteOf(c)}
                    <li>{p.libelle} <span class="muted">· {rubLabel(p.rubrique)}{p.bu ? `, ${p.bu}` : ''} · {amount(sum(p.montants), 2)}</span>
                      <button class="link" onclick={() => addHypFor(c)}>créer une hypothèse</button>
                      <button class="link" onclick={() => setCertain(c, true)} data-testid="certain-{c}">confirmer certain</button></li>
                  {/each}
                </ul>
              {:else}
                <p class="finding ok">Chaque poste varie avec au moins une hypothèse ou un événement, ou est confirmé certain.</p>
              {/if}
              {#if certains.length}
                <p class="small">Confirmés certains :
                  {#each certains as c, i (c)}{i ? ', ' : ''}{posteOf(c).libelle} <button class="link" onclick={() => setCertain(c, false)}>annuler</button>{/each}
                </p>
              {/if}
            </div>
          {/if}

        {:else if step === 'evenements'}
          <h3>Les événements</h3>
          <p class="small muted">Un événement arrive ou n'arrive pas dans l'année. Sa probabilité se lit sur le passé : combien d'années touchées sur combien d'années observées. Son impact est une fourchette, en % de ce qu'il touche.</p>
          {#each reg.evenements as e (e.code)}
            {@const it = item(e.code)!}
            {@const g = eventGuide(e, budget, app.isAlfa)}
            {@const f = fq(e.code)}
            <div class="card" class:open={open === e.code}>
              <button class="head" onclick={() => (open = open === e.code ? null : e.code)} aria-expanded={open === e.code} data-testid="guide-{e.code}">
                <span class="code">{e.code}</span>
                <span class="lib">{e.libelle}<span class="small muted">&nbsp;· {e.sens} {e.effet === 'volume' ? 'des volumes' : 'du montant'}, {describePortee(e.portee, budget)}</span></span>
                <span class="chip {it.statut}">{STATUT_LABEL[it.statut]}</span>
              </button>
              {#if open === e.code}
                <div class="edit">
                  <div class="trio">
                    <label>Libellé<input value={e.libelle} onchange={(ev) => setText(e, 'libelle', ev.currentTarget.value)} /></label>
                    <label>Famille de risque<input list="familles" value={e.famille} onchange={(ev) => setText(e, 'famille', ev.currentTarget.value)} /></label>
                    <label>Ce qu'il touche
                      <select value={e.effet} onchange={(ev) => setEvEffect(e, ev.currentTarget.value as EventEffect)}>
                        {#each EVENT_EFFECTS as x (x)}<option value={x}>{EVENT_EFFECT_LABEL[x]}</option>{/each}
                      </select>
                    </label>
                  </div>
                  <div class="trio">
                    <label>Sens
                      <select value={e.sens} onchange={(ev) => setEvChoice(e, 'sens', ev.currentTarget.value)}>
                        <option value="baisse">baisse</option><option value="hausse">hausse</option>
                      </select>
                    </label>
                    <label>Durée de l'effet
                      <select value={e.duree} onchange={(ev) => setEvChoice(e, 'duree', ev.currentTarget.value)}>
                        <option value="fin">jusqu'à la fin de l'exercice</option><option value="mois">le mois de survenance</option>
                      </select>
                    </label>
                    <label>Ce que l'événement touche, en clair<input value={e.cible} onchange={(ev) => setCible(e, ev.currentTarget.value)} /></label>
                  </div>
                  <PorteeEditor portee={e.portee} kind={e.effet === 'poste' ? 'postes' : 'bu'} {budget} onchange={(p) => setPortee(e, p)} />
                  <p class="q">{g.question}</p>
                  <dl class="small"><dt>Qui répond</dt><dd>{g.qui}</dd><dt>Où chercher</dt><dd>{g.sources}</dd><dt>Piège</dt><dd>{g.piege}</dd></dl>
                  <div class="freq small">
                    <span>Aide au calcul :</span>
                    <input inputmode="numeric" aria-label="Années touchées" value={f.k} oninput={(ev) => setFreq(e.code, 'k', ev.currentTarget.value)} placeholder="2" data-testid="freq-k-{e.code}" /> années touchées sur
                    <input inputmode="numeric" aria-label="Années observées" value={f.n} oninput={(ev) => setFreq(e.code, 'n', ev.currentTarget.value)} placeholder="5" data-testid="freq-n-{e.code}" /> observées
                    {#if f.k !== '' && f.n !== '' && Number.isFinite(frequencyToProbability(Number(f.k), Number(f.n)))}
                      {@const p = frequencyToProbability(Number(f.k), Number(f.n))}
                      <span>: observé {pct(Number(f.k) / Number(f.n))}, estimation prudente <b>{pct(p)}</b></span>
                      <button class="link" onclick={() => applyFreq(e)} data-testid="freq-apply-{e.code}">appliquer</button>
                    {/if}
                  </div>
                  <div class="trio">
                    <label>Probabilité dans l'année (%)<input inputmode="decimal" value={String(Math.round(e.p * 1000) / 10).replace('.', ',')} onchange={(ev) => setEvent(e, 'p', ev.currentTarget.value)} data-testid="p-{e.code}" /></label>
                    <label>Impact minimal (%)<input inputmode="decimal" value={String(Math.round(e.amplitude[0] * 1000) / 10).replace('.', ',')} onchange={(ev) => setEvent(e, 'a0', ev.currentTarget.value)} /></label>
                    <label>Impact maximal (%)<input inputmode="decimal" value={String(Math.round(e.amplitude[1] * 1000) / 10).replace('.', ',')} onchange={(ev) => setEvent(e, 'a1', ev.currentTarget.value)} /></label>
                  </div>
                  <label class="check"><input type="checkbox" checked={!!e.surcout} onchange={(ev) => toggleSurcout(e, ev.currentTarget.checked)} /> Un surcoût ponctuel le mois de survenance (réparation, fret express, pénalité)</label>
                  {#if e.surcout}
                    <div class="trio">
                      <label>Surcoût minimal ({units.principale})<input inputmode="decimal" value={String(e.surcout[0]).replace('.', ',')} onchange={(ev) => setEvent(e, 's0', ev.currentTarget.value)} /></label>
                      <label>Surcoût maximal ({units.principale})<input inputmode="decimal" value={String(e.surcout[1]).replace('.', ',')} onchange={(ev) => setEvent(e, 's1', ev.currentTarget.value)} /></label>
                      <label>Compté dans
                        <select value={e.rubriqueSurcout ?? ''} onchange={(ev) => setSurcoutRubrique(e, ev.currentTarget.value)}>
                          {#each charges as r (r.code)}<option value={r.code}>{r.libelle}</option>{/each}
                        </select>
                      </label>
                    </div>
                  {/if}
                  <p class="reading small">Environ {e.p > 0 ? `1 année sur ${num(1 / e.p, e.p > 0.5 ? 1 : 0)}` : 'jamais'} ({pct(e.p)}), {e.sens === 'baisse' ? 'une baisse' : 'une hausse'} de {num(e.amplitude[0] * 100, 0)} % à {num(e.amplitude[1] * 100, 0)} % {e.effet === 'volume' ? 'des volumes' : 'du montant'} ({describePortee(e.portee, budget)}){e.duree === 'mois' ? ', le mois touché' : ", jusqu'à la fin de l'exercice"}.</p>
                  <div class="gov">
                    <label>Propriétaire<input value={e.proprietaire} onchange={(ev) => setText(e, 'proprietaire', ev.currentTarget.value)} /></label>
                    <label>Justification : l'historique observé<textarea rows="2" value={e.justification} onchange={(ev) => setText(e, 'justification', ev.currentTarget.value)}></textarea></label>
                    <label class="check"><input type="checkbox" checked={e.statut !== 'brouillon'} onchange={(ev) => setValidated(e, ev.currentTarget.checked)} /> Validé par le propriétaire</label>
                  </div>
                  {#each it.constats as x (x.texte)}<p class="finding {x.niveau}">{x.texte}</p>{/each}
                  <div class="actions">
                    {#if removing === e.code}
                      <span class="small">Retirer {e.code} du registre ? {removeText(e.code)}</span>
                      <button class="danger" onclick={() => remove(e.code)} data-testid="confirmer-retrait-{e.code}">Retirer</button>
                      <button onclick={() => (removing = null)}>Annuler</button>
                    {:else}
                      <button class="link danger-link" onclick={() => (removing = e.code)} data-testid="retirer-{e.code}">Retirer cet événement</button>
                    {/if}
                  </div>
                </div>
              {/if}
            </div>
          {/each}
          <div class="add" data-testid="ajout-evenement">
            <b>Ajouter un événement</b>
            <div class="row">
              <select bind:value={addEvEffet} aria-label="Ce qu'il touche">{#each EVENT_EFFECTS as x (x)}<option value={x}>{EVENT_EFFECT_LABEL[x]}</option>{/each}</select>
              <input bind:value={addEvLib} placeholder="Libellé, par exemple « Perte d'un grand client »" aria-label="Libellé" />
              <button class="primary" onclick={addEvent} data-testid="ajouter-evenement">Ajouter</button>
            </div>
          </div>

        {:else if step === 'correlations'}
          {@const it = item('CORR')!}
          <h3>Ce qui bouge ensemble</h3>
          <p class="small muted">Quand deux hypothèses ont une cause commune (le change fait monter les achats et les frais), il faut le dire, sinon le risque est sous-estimé. Valeur entre −0,9 et +0,9 : positive si elles montent ensemble, négative si l'une baisse quand l'autre monte.</p>
          {#each it.constats as f (f.texte)}<p class="finding {f.niveau}">{f.texte}</p>{/each}
          <table class="small corr">
            <thead><tr><th>Lien</th><th class="num">Valeur</th><th>Pourquoi</th><th></th></tr></thead>
            <tbody>
              {#each reg.correlations_rang as c, i (c[0] + c[1])}
                <tr>
                  <td><b>{c[0]}</b> {libelleOf(c[0])} et <b>{c[1]}</b> {libelleOf(c[1])}<br /><span class="muted">{c[2] > 0 ? 'montent ensemble' : c[2] < 0 ? "l'une baisse quand l'autre monte" : 'aucun lien saisi'}, lien {force(c[2])}</span></td>
                  <td class="num"><input class="v" inputmode="decimal" value={String(c[2]).replace('.', ',')} onchange={(e) => corrSet(i, 'v', e.currentTarget.value)} /></td>
                  <td><input value={c[3] ?? ''} onchange={(e) => corrSet(i, 'j', e.currentTarget.value)} placeholder="cause commune" /></td>
                  <td><button class="link" onclick={() => corrDelete(i)}>retirer</button></td>
                </tr>
              {/each}
            </tbody>
          </table>
          {#if codes.length > 1}
            <div class="actions small">
              Ajouter un lien entre
              <select value={pickA} onchange={(e) => (newA = e.currentTarget.value)}>{#each codes as d (d)}<option value={d}>{d} {libelleOf(d)}</option>{/each}</select> et
              <select value={pickB} onchange={(e) => (newB = e.currentTarget.value)}>{#each codes as d (d)}<option value={d}>{d} {libelleOf(d)}</option>{/each}</select>
              <button onclick={corrAdd}>Ajouter</button>
            </div>
          {/if}

        {:else if step === 'revue'}
          <h3>Ne rien oublier : la revue des risques</h3>
          <p class="small muted">Chaque famille de risque reçoit une décision : couverte par le registre, couverte par un stress test, non significative, ou hors modèle. Un risque hors modèle est signalé dans la note CODIR. S'il manque une hypothèse ou un événement, ajoutez-le aux étapes précédentes.</p>
          {#each reviewRows as r (r.categorie)}
            {@const c = RISK_CATEGORIES.find((x) => x.code === r.categorie)!}
            {@const it = item(r.categorie)!}
            {@const sug = suggestRefs(c, reg)}
            <div class="risk" data-testid="revue-{r.categorie}">
              <div class="rh"><b>{c.libelle}</b><span class="chip {it.statut}">{STATUT_LABEL[it.statut]}</span></div>
              <p class="small">{c.question}{#if sug.length}{' '}<span class="muted">Dans votre registre : {sug.join(', ')}.</span>{#if !r.ref.trim()}{' '}<button class="link" onclick={() => setReview(r.categorie, 'ref', sug.join(', '))}>reprendre</button>{/if}{/if}</p>
              <div class="rr">
                <select value={r.decision ?? ''} onchange={(e) => setReview(r.categorie, 'decision', e.currentTarget.value)} aria-label="Décision pour {c.libelle}" data-testid="decision-{r.categorie}">
                  <option value="">À décider</option>
                  {#each RISK_DECISIONS as d (d)}<option value={d}>{DECISION_LABEL[d]}</option>{/each}
                </select>
                <input value={r.ref} placeholder={sug.join(', ') || 'H.., E.., S..'} onchange={(e) => setReview(r.categorie, 'ref', e.currentTarget.value)} aria-label="Référence" />
                <input value={r.commentaire} placeholder="Pourquoi" onchange={(e) => setReview(r.categorie, 'commentaire', e.currentTarget.value)} aria-label="Commentaire" data-testid="commentaire-{r.categorie}" />
              </div>
              {#each it.constats as f (f.texte)}<p class="finding {f.niveau} small">{f.texte}</p>{/each}
            </div>
          {/each}

        {:else}
          <h3>Bilan</h3>
          <p><b>{rd.prets}</b> éléments prêts sur {rd.total}{rd.bloquants ? `, dont ${rd.bloquants} bloquant${rd.bloquants > 1 ? 's' : ''} : le calcul est refusé tant qu'ils ne sont pas corrigés` : ''}.</p>
          {#if rd.prets === rd.total}
            <p class="finding ok">Tout est prêt : le registre peut être gelé et présenté au CODIR.</p>
          {:else}
            <ul class="todo">
              {#each rd.items.filter((i) => i.statut !== 'pret') as i (i.code)}
                <li><button class="link" onclick={() => goto(i)}>{['BUDGET', 'CORR', 'POSTES'].includes(i.code) ? '' : `${i.code} `}{i.libelle}</button> <span class="chip {i.statut}">{STATUT_LABEL[i.statut]}</span><span class="small muted"> {i.constats[0]?.texte}</span></li>
              {/each}
            </ul>
          {/if}
          {#if horsModele.length}
            <h4>Signalé au CODIR comme hors modèle</h4>
            <ul class="small">{#each horsModele as r (r.categorie)}<li><b>{RISK_CATEGORIES.find((c) => c.code === r.categorie)?.libelle}</b> : {r.commentaire}</li>{/each}</ul>
          {/if}
        {/if}
      </section>
    </div>
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; z-index: 70; background: color-mix(in srgb, var(--bg) 70%, #000 30%); overflow-y: auto; padding: calc(12px + env(safe-area-inset-top, 0px)) 16px 24px; }
  .box { max-width: 1120px; margin: 0 auto; display: grid; gap: 10px; padding: 14px 16px; }
  header { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: start; }
  header > div:first-child { flex: 1 1 320px; min-width: 0; }
  h2 { font-size: 19px; }
  .prog { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .count { font-size: 14px; }
  .bar { height: 6px; background: var(--soft); border-radius: 3px; overflow: hidden; }
  .bar i { display: block; height: 100%; background: var(--ok); }
  .body { display: grid; grid-template-columns: 250px minmax(0, 1fr); gap: 16px; align-items: start; }
  nav { display: grid; gap: 3px; position: sticky; top: 8px; }
  nav button { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; gap: 8px; align-items: center; text-align: left; border: none; background: none; padding: 7px 8px; border-radius: 8px; }
  nav button:hover { background: var(--soft); }
  nav button.active { background: var(--soft); font-weight: 600; }
  nav .n { width: 22px; height: 22px; border-radius: 50%; background: var(--line); display: grid; place-items: center; font-size: 12px; }
  nav button.active .n { background: var(--accent); color: #fff; }
  nav .t { display: grid; }
  nav .t .small { font-weight: 400; }
  .content { display: grid; gap: 8px; min-width: 0; align-content: start; }
  .content h3 { font-size: 16px; margin: 0; text-transform: none; letter-spacing: 0; color: var(--ink); }
  .card { border: 1px solid var(--line); border-radius: 8px; }
  .card.open { border-color: var(--accent); }
  .card.postes { padding: 8px 12px; display: grid; gap: 4px; }
  .card.postes ul { margin: 0; padding-left: 18px; display: grid; gap: 3px; }
  .head { width: 100%; display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; gap: 8px; align-items: center; text-align: left; border: none; background: none; padding: 8px 10px; }
  .code { font-weight: 650; color: var(--muted); font-size: 12px; }
  .lib { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .edit { padding: 0 12px 12px; display: grid; gap: 8px; }
  .q { font-weight: 600; margin: 0; }
  dl { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 2px 10px; margin: 0; }
  dt { color: var(--muted); }
  dd { margin: 0; }
  .trio { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  label { display: grid; gap: 2px; font-size: 12px; color: var(--muted); }
  label .unit { font-size: 11px; }
  input, textarea, select { font: inherit; font-size: 14px; color: var(--ink); background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 5px 7px; min-width: 0; }
  textarea { resize: vertical; }
  .check { display: flex; gap: 6px; align-items: center; color: var(--ink); font-size: 13px; }
  .gov { display: grid; gap: 6px; }
  .reading { margin: 0; padding: 6px 9px; background: var(--soft); border-radius: 6px; }
  .finding { margin: 0; padding: 5px 9px; border-left: 3px solid var(--warn); background: color-mix(in srgb, var(--warn) 8%, var(--panel)); border-radius: 0 6px 6px 0; font-size: 13px; }
  .finding.bloquant { border-left-color: var(--ko); background: color-mix(in srgb, var(--ko) 8%, var(--panel)); }
  .finding.ok { border-left-color: var(--ok); background: color-mix(in srgb, var(--ok) 8%, var(--panel)); }
  .chip { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; background: color-mix(in srgb, var(--warn) 15%, var(--panel)); color: var(--warn); white-space: nowrap; }
  .chip.pret { background: color-mix(in srgb, var(--ok) 15%, var(--panel)); color: var(--ok); }
  .chip.bloquant { background: color-mix(in srgb, var(--ko) 15%, var(--panel)); color: var(--ko); }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .danger { border-color: var(--ko); color: var(--ko); }
  .danger-link { color: var(--ko); margin-left: auto; }
  .add { border: 1px dashed var(--line); border-radius: 8px; padding: 8px 12px; display: grid; gap: 6px; }
  .add .row { display: grid; grid-template-columns: 200px minmax(0, 1fr) auto; gap: 6px; }
  .add p { margin: 0; }
  .warn { color: var(--warn); font-weight: 600; }
  .rubs .total td { font-weight: 650; border-top: 1px solid var(--line); }
  .freq { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .freq input { width: 52px; }
  .corr input { width: 100%; }
  .corr input.v { width: 64px; text-align: right; }
  .corr td { vertical-align: top; }
  .risk { border-bottom: 1px solid var(--line); padding: 6px 0 8px; display: grid; gap: 4px; }
  .rh { display: flex; justify-content: space-between; gap: 8px; }
  .risk p { margin: 0; }
  .rr { display: grid; grid-template-columns: 220px 140px minmax(0, 1fr); gap: 6px; }
  .todo { display: grid; gap: 4px; padding-left: 18px; margin: 0; }
  h4 { margin: 8px 0 0; }
  @media (max-width: 800px) {
    .body { grid-template-columns: minmax(0, 1fr); }
    nav { position: static; display: flex; overflow-x: auto; gap: 4px; padding-bottom: 4px; }
    nav button { grid-template-columns: 22px auto auto; white-space: nowrap; flex: none; }
    nav .t .small { display: none; }
    .trio, .rr, .add .row { grid-template-columns: minmax(0, 1fr); }
  }
</style>
