<script lang="ts">
  /**
   * Leviers, stress tests et paquets du scénario : chacun se crée par son type, se règle par ses paramètres
   * et sa portée, se retire. Les règles de calcul en clair se déduisent des paramètres (edit.ts).
   */
  import { LEVER_LABEL, leverRule, leverTypesFor, newLever, newStress, removeCase, STRESS_LABEL, stressRule, stressTypesFor } from '../../engine/edit.ts';
  import { LEVER_PARAMS, type LeverDef, type LeverType, type Portee, type StressDef, type StressType } from '../../engine/types.ts';
  import { MOIS } from '../format.ts';
  import PorteeEditor from '../PorteeEditor.svelte';
  import { app } from '../state.svelte.ts';
  import { units } from '../units.svelte.ts';

  const s = $derived(app.scenario);
  const budget = $derived(app.budget);
  const reg = $derived(app.scenario.registre);
  const withPostes = $derived(budget.rubriques.filter((r) => budget.postes.some((p) => p.rubrique === r.code)));
  const charges = $derived(budget.rubriques.filter((r) => r.nature === 'charge'));

  /** Paramètres saisis en % (part, hausse, réduction, choc) ou en valeur (cours, élasticité, plafond, montants). */
  const PCT = new Set(['part', 'hausse', 'reduction', 'choc']);
  const PARAM_LABEL: Record<string, string> = {
    part: 'Part couverte (%)', cours: 'Cours garanti', hausse: 'Hausse de prix (%)', elasticite: 'Élasticité des volumes',
    variationAnnuelle: 'Variation annuelle (négative : économie)', plafond: 'Plafond', reduction: 'Réduction de l\'impact (%)', coutAnnuel: 'Coût annuel', choc: 'Choc (%)',
  };
  const unitOf = (k: string) => (k === 'variationAnnuelle' || k === 'coutAnnuel' ? ` (${units.principale})` : '');
  const shown = (k: string, v: number | undefined) => (v === undefined || !Number.isFinite(v) ? '' : String(PCT.has(k) ? Math.round(v * 100000) / 1000 : v).replace('.', ','));
  const parse = (raw: string): number | null => {
    const v = Number(raw.replace(/\s/g, '').replace(',', '.'));
    return raw.trim() !== '' && Number.isFinite(v) ? v : null;
  };

  /** Toute modification d'un levier recalcule sa règle en clair. */
  function touchLever(l: LeverDef) {
    const r = leverRule(l, budget);
    if (!l.regle || l.regle === l.description) l.description = r;
    l.regle = r;
  }
  function setLeverParam(l: LeverDef, k: string, raw: string) {
    const v = parse(raw);
    if (v === null) return;
    l.params = { ...l.params, [k]: PCT.has(k) ? v / 100 : v };
    if (l.type === 'attenuation' && k === 'coutAnnuel') l.cout = v;
    touchLever(l);
  }
  function setLever(l: LeverDef, key: 'libelle' | 'proprietaire' | 'faisabilite' | 'cout' | 'mois', raw: string) {
    if (key === 'cout') l.cout = raw.trim() === '' ? null : parse(raw);
    else if (key === 'mois') l.mois = Number(raw);
    else if (key === 'libelle') l.libelle = raw.trim() || l.libelle;
    else l[key] = raw;
    touchLever(l);
  }
  function setLeverPortee(l: LeverDef, p: Portee) {
    l.portee = p;
    if (l.type === 'plafond') l.hypotheses = p.hypothese ?? '';
    if (l.type === 'attenuation') l.hypotheses = p.evenement ?? '';
    touchLever(l);
  }
  function setStress(x: StressDef, key: 'libelle' | 'mois' | 'choc', raw: string) {
    if (key === 'libelle') x.libelle = raw.trim() || x.libelle;
    else if (key === 'mois') x.mois = Number(raw);
    else {
      const v = parse(raw);
      if (v === null) return;
      x.params = { ...x.params, choc: v / 100 };
    }
    x.regle = stressRule(x, budget);
  }
  function setStressPortee(x: StressDef, p: Portee) {
    x.portee = p;
    x.regle = stressRule(x, budget);
  }

  let addL = $state<LeverType>('montant');
  let addS = $state<StressType>('volume');
  const leverTypes = $derived(leverTypesFor(s));
  const stressTypes = $derived(stressTypesFor(s));
  function addLever() {
    const t = leverTypes.includes(addL) ? addL : leverTypes[0];
    s.leviers.push(newLever(s, budget, t));
  }
  function addStress() {
    const t = stressTypes.includes(addS) ? addS : stressTypes[0];
    s.stress.push(newStress(s, budget, t));
  }
  let removing = $state<string | null>(null);
  function remove(code: string) {
    removeCase(s, code);
    removing = null;
  }

  const allCases = $derived([...s.leviers.map((l) => l.code), ...s.stress.map((x) => x.code)]);
  function togglePack(i: number, code: string, on: boolean) {
    const p = s.paquets[i];
    const next = allCases.filter((c) => (c === code ? on : p.codes.includes(c)));
    if (next.length) p.codes = next;
  }
  function addPack() {
    const codes = s.leviers.slice(0, 2).map((l) => l.code);
    if (!codes.length) return;
    let n = 1;
    while (s.paquets.some((p) => p.code === `P${n}`)) n++;
    s.paquets.push({ code: `P${n}`, libelle: `Paquet ${n}`, codes });
  }
</script>

<section class="levers-edit">
  <h2>Leviers de gestion</h2>
  <p class="small muted">Ce que la direction peut décider pour améliorer la probabilité ou réduire le risque. Chaque levier a un coût direct et une date d'effet, sinon il est refusé (R-LE-02).</p>
  {#each s.leviers as l (l.code)}
    <div class="item" data-testid="levier-{l.code}">
      <div class="top">
        <b>{l.code}</b>
        <input class="lib" value={l.libelle} onchange={(e) => setLever(l, 'libelle', e.currentTarget.value)} aria-label="Libellé du levier" />
        <span class="small muted">{LEVER_LABEL[l.type]}</span>
        {#if removing === l.code}
          <button class="danger" onclick={() => remove(l.code)}>Retirer</button><button onclick={() => (removing = null)}>Annuler</button>
        {:else}<button class="link danger-link" onclick={() => (removing = l.code)}>retirer</button>{/if}
      </div>
      <div class="fields small">
        {#if l.type === 'prix'}
          <PorteeEditor portee={l.portee} kind="bu" {budget} onchange={(p) => setLeverPortee(l, p)} />
        {:else if l.type === 'montant'}
          <label>Rubrique
            <select value={l.portee.rubrique ?? ''} onchange={(e) => setLeverPortee(l, { rubrique: e.currentTarget.value })}>
              {#each withPostes as r (r.code)}<option value={r.code}>{r.libelle}</option>{/each}
            </select>
          </label>
        {:else if l.type === 'plafond'}
          <label>Hypothèse plafonnée
            <select value={l.portee.hypothese ?? ''} onchange={(e) => setLeverPortee(l, { hypothese: e.currentTarget.value })}>
              {#each reg.hypotheses.filter((h) => h.effet !== 'change') as h (h.code)}<option value={h.code}>{h.code} {h.libelle}</option>{/each}
            </select>
          </label>
        {:else if l.type === 'attenuation'}
          <label>Événement atténué
            <select value={l.portee.evenement ?? ''} onchange={(e) => setLeverPortee(l, { ...l.portee, evenement: e.currentTarget.value })}>
              {#each reg.evenements as ev (ev.code)}<option value={ev.code}>{ev.code} {ev.libelle}</option>{/each}
            </select>
          </label>
          <label>Coût compté dans
            <select value={l.portee.rubrique ?? ''} onchange={(e) => setLeverPortee(l, { ...l.portee, rubrique: e.currentTarget.value })}>
              {#each charges as r (r.code)}<option value={r.code}>{r.libelle}</option>{/each}
            </select>
          </label>
        {/if}
        {#each LEVER_PARAMS[l.type] as k (k)}
          <label>{PARAM_LABEL[k]}{unitOf(k)}<input inputmode="decimal" value={shown(k, l.params[k])} onchange={(e) => setLeverParam(l, k, e.currentTarget.value)} data-testid="param-{l.code}-{k}" /></label>
        {/each}
        <label>Coût direct ({units.principale})<input inputmode="decimal" value={l.cout === null ? '' : String(l.cout).replace('.', ',')} onchange={(e) => setLever(l, 'cout', e.currentTarget.value)} /></label>
        <label>Mois d'effet
          <select value={String(l.mois ?? '')} onchange={(e) => setLever(l, 'mois', e.currentTarget.value)}>
            {#each MOIS as m, i (m)}<option value={String(i + 1)}>{m}</option>{/each}
          </select>
        </label>
        <label>Propriétaire<input value={l.proprietaire} onchange={(e) => setLever(l, 'proprietaire', e.currentTarget.value)} /></label>
        <label>Faisabilité<input value={l.faisabilite} onchange={(e) => setLever(l, 'faisabilite', e.currentTarget.value)} /></label>
      </div>
      <p class="small muted rule">Règle : {l.regle}</p>
    </div>
  {/each}
  <div class="add small">
    Ajouter un levier
    <select bind:value={addL}>{#each leverTypes as t (t)}<option value={t}>{LEVER_LABEL[t]}</option>{/each}</select>
    <button onclick={addLever} data-testid="ajouter-levier">Ajouter</button>
  </div>

  <h2>Stress tests</h2>
  <p class="small muted">« Et si… » : un choc imposé, sans probabilité (R-LE-05). Il se lit à côté de la distribution, jamais à sa place.</p>
  {#each s.stress as x (x.code)}
    <div class="item" data-testid="stress-{x.code}">
      <div class="top">
        <b>{x.code}</b>
        <input class="lib" value={x.libelle} onchange={(e) => setStress(x, 'libelle', e.currentTarget.value)} aria-label="Libellé du stress test" />
        <span class="small muted">{STRESS_LABEL[x.type]}</span>
        {#if removing === x.code}
          <button class="danger" onclick={() => remove(x.code)}>Retirer</button><button onclick={() => (removing = null)}>Annuler</button>
        {:else}<button class="link danger-link" onclick={() => (removing = x.code)}>retirer</button>{/if}
      </div>
      <div class="fields small">
        {#if x.type === 'evenement'}
          <label>Événement forcé
            <select value={x.portee.evenement ?? ''} onchange={(e) => setStressPortee(x, { evenement: e.currentTarget.value })}>
              {#each reg.evenements as ev (ev.code)}<option value={ev.code}>{ev.code} {ev.libelle}</option>{/each}
            </select>
          </label>
        {:else if x.type === 'poste'}
          <PorteeEditor portee={x.portee} kind="postes" {budget} onchange={(p) => setStressPortee(x, p)} />
        {:else if x.type === 'volume'}
          <PorteeEditor portee={x.portee} kind="bu" {budget} onchange={(p) => setStressPortee(x, p)} />
        {/if}
        <label>{x.type === 'evenement' ? 'Impact (%)' : 'Choc (%)'}<input inputmode="decimal" value={shown('choc', x.params.choc)} onchange={(e) => setStress(x, 'choc', e.currentTarget.value)} data-testid="choc-{x.code}" /></label>
        <label>Dès le mois de
          <select value={String(x.mois)} onchange={(e) => setStress(x, 'mois', e.currentTarget.value)}>
            {#each MOIS as m, i (m)}<option value={String(i + 1)}>{m}</option>{/each}
          </select>
        </label>
      </div>
      <p class="small muted rule">Règle : {x.regle}</p>
    </div>
  {/each}
  <div class="add small">
    Ajouter un stress test
    <select bind:value={addS}>{#each stressTypes as t (t)}<option value={t}>{STRESS_LABEL[t]}</option>{/each}</select>
    <button onclick={addStress} data-testid="ajouter-stress">Ajouter</button>
  </div>

  <h2>Paquets et combinaisons</h2>
  <p class="small muted">Plusieurs leviers décidés ensemble, ou plusieurs chocs subis ensemble : toujours recalculés, jamais additionnés (R-LE-03).</p>
  {#each s.paquets as p, i (p.code)}
    <div class="item">
      <div class="top">
        <b>{p.code}</b>
        <input class="lib" value={p.libelle} onchange={(e) => (p.libelle = e.currentTarget.value.trim() || p.libelle)} aria-label="Libellé du paquet" />
        {#if removing === p.code}
          <button class="danger" onclick={() => remove(p.code)}>Retirer</button><button onclick={() => (removing = null)}>Annuler</button>
        {:else}<button class="link danger-link" onclick={() => (removing = p.code)}>retirer</button>{/if}
      </div>
      <div class="codes small">
        {#each allCases as c (c)}<label class="check"><input type="checkbox" checked={p.codes.includes(c)} onchange={(e) => togglePack(i, c, e.currentTarget.checked)} /> {c}</label>{/each}
      </div>
    </div>
  {/each}
  {#if s.leviers.length}<div class="add small"><button onclick={addPack}>Ajouter un paquet</button></div>{/if}
</section>

<style>
  .levers-edit { display: grid; gap: 8px; }
  .item { border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; display: grid; gap: 6px; }
  .top { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .top .lib { flex: 1 1 220px; }
  .fields { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: end; }
  .fields label { display: grid; gap: 2px; color: var(--muted); }
  .fields input { width: 120px; }
  .codes { display: flex; flex-wrap: wrap; gap: 4px 12px; }
  .check { display: flex; gap: 5px; align-items: center; }
  input, select { font: inherit; color: var(--ink); background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 4px 6px; min-width: 0; }
  .rule { margin: 0; }
  .add { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .danger { border-color: var(--ko); color: var(--ko); }
  .danger-link { color: var(--ko); margin-left: auto; }
</style>
