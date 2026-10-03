<script lang="ts">
  import { chooseLaw } from '../../engine/laws.ts';
  import type { Hypothesis, RiskEvent } from '../../engine/types.ts';
  import { num, pct } from '../format.ts';
  import { app } from '../state.svelte.ts';

  const GROUPS: { titre: string; codes: string[] }[] = [
    { titre: 'Commercial', codes: ['H01', 'H02', 'H03', 'H04', 'H05', 'H11'] },
    { titre: 'Macroéconomie', codes: ['H06', 'H08', 'H09', 'H10', 'H12'] },
    { titre: 'Approvisionnement', codes: ['H07'] },
  ];
  const LAW_LABEL: Record<string, string> = {
    normale: 'normale', 'split-normale': 'split-normale (asymétrique)', lognormale: 'lognormale', pert: 'PERT', 'marche-aleatoire': 'marche aléatoire',
  };

  let open = $state<string | null>(null);
  const reg = $derived(app.scenario.registre);
  const hyp = (code: string) => reg.hypotheses.find((h) => h.code === code)!;

  function range(h: Hypothesis): { min: number; max: number; step: number } {
    if (h.unite.startsWith('points')) return { min: -2, max: 2, step: 0.05 };
    return { min: 0.85, max: 1.15, step: 0.001 };
  }

  function setP(h: Hypothesis, key: 'p10' | 'p50' | 'p90', v: number) {
    const r = range(h);
    const gap = r.step;
    if (key === 'p10') v = Math.min(v, (h.p50 ?? h.p90!) - gap);
    if (key === 'p90') v = Math.max(v, (h.p50 ?? h.p10!) + gap);
    if (key === 'p50') v = Math.min(Math.max(v, h.p10! + gap), h.p90! - gap);
    app.markRegistryEdited();
    h[key] = Math.round(v / r.step) * r.step;
  }

  function setFx(h: Hypothesis, key: 'depart' | 'derive_annuelle' | 'volatilite_mensuelle', v: number) {
    app.markRegistryEdited();
    h[key] = v;
  }

  function setEv(e: RiskEvent, key: 'p' | 'a0' | 'a1', v: number) {
    app.markRegistryEdited();
    if (key === 'p') e.p = v;
    if (key === 'a0') e.amplitude = [Math.min(v, e.amplitude[1]), e.amplitude[1]];
    if (key === 'a1') e.amplitude = [e.amplitude[0], Math.max(v, e.amplitude[0])];
  }

  /** Position d'une valeur sur la mini-règle, en %. */
  function bar(h: Hypothesis) {
    const r = range(h);
    const k = h.k ?? 1;
    const p50 = h.p50 ?? Math.sqrt(h.p10! * h.p90!);
    const lo = p50 - k * (p50 - h.p10!);
    const hi = p50 + k * (h.p90! - p50);
    const f = (v: number) => Math.max(0, Math.min(100, ((v - r.min) / (r.max - r.min)) * 100));
    return { lo: f(lo), hi: f(hi), mid: f(p50), budget: f(h.unite.startsWith('points') ? 0 : 1) };
  }
  const tip = (h: { proprietaire: string; justification: string }, extra = '') => `Propriétaire : ${h.proprietaire}\n${h.justification}${extra}`;
</script>

<div class="hyps">
  <div class="title">
    <h2>Ce qu'on suppose</h2>
    <span class="small muted">registre {reg.version}{reg.statut === 'brouillon' ? ' (brouillon)' : reg.statut === 'gele' ? ' (gelé)' : ''}</span>
  </div>
  <p class="small muted intro">Chaque propriétaire donne une fourchette : 1 chance sur 10 d'être en dessous (P10), valeur centrale (P50), 1 chance sur 10 d'être au-dessus (P90). Cliquez pour modifier.</p>

  {#each GROUPS as g (g.titre)}
    <h3>{g.titre}</h3>
    {#each g.codes as code (code)}
      {@const h = hyp(code)}
      {@const law = chooseLaw(h)}
      <div class="row" class:open={open === code}>
        <button class="head" onclick={() => (open = open === code ? null : code)} aria-expanded={open === code} title={tip(h, `\nLoi : ${LAW_LABEL[law]}`)}>
          <span class="code">{code}</span>
          <span class="lib">{h.libelle}</span>
          {#if law === 'marche-aleatoire'}
            <span class="vals small">départ {num(h.depart!, 0)} · vol. {num(h.volatilite_mensuelle! * 100, 1)} %/mois</span>
          {:else}
            {@const b = bar(h)}
            <span class="vals small">{num(h.p10!, h.unite.startsWith('points') ? 1 : 3)} / {h.p50 == null ? '–' : num(h.p50, h.unite.startsWith('points') ? 1 : 3)} / {num(h.p90!, h.unite.startsWith('points') ? 1 : 3)}</span>
            <span class="ruler" aria-hidden="true">
              <i class="rng" style="left:{b.lo}%; width:{b.hi - b.lo}%"></i>
              <i class="mid" style="left:{b.mid}%"></i>
              <i class="bud" style="left:{b.budget}%"></i>
            </span>
          {/if}
        </button>
        {#if open === code}
          <div class="edit">
            <p class="small muted">{h.proprietaire} · loi {LAW_LABEL[law]}{(h.k ?? 1) !== 1 ? ` · élargie par k = ${num(h.k!, 2)}` : ''}</p>
            <p class="small just">{h.justification}</p>
            {#if law === 'marche-aleatoire'}
              <label>Cours de départ <b>{num(h.depart!, 0)}</b> MGA
                <input type="range" min="4500" max="6000" step="10" value={h.depart} oninput={(e) => setFx(h, 'depart', +e.currentTarget.value)} /></label>
              <label>Dérive annuelle <b>{num(h.derive_annuelle! * 100, 1)} %</b>
                <input type="range" min="-0.05" max="0.15" step="0.005" value={h.derive_annuelle} oninput={(e) => setFx(h, 'derive_annuelle', +e.currentTarget.value)} /></label>
              <label>Volatilité mensuelle <b>{num(h.volatilite_mensuelle! * 100, 1)} %</b>
                <input type="range" min="0.005" max="0.04" step="0.001" value={h.volatilite_mensuelle} oninput={(e) => setFx(h, 'volatilite_mensuelle', +e.currentTarget.value)} /></label>
              {@const l = app.result?.laws.find((x) => x.code === 'H06')}
              {#if l}<p class="small muted">Cours moyen simulé : {num(l.p10, 0)} / {num(l.p50, 0)} / {num(l.p90, 0)}, pour un cours budget de {num(app.budget.coursBudget, 0)}.</p>{/if}
            {:else}
              {@const r = range(h)}
              {@const d = h.unite.startsWith('points') ? 2 : 3}
              <label>P10, 1 chance sur 10 d'être en dessous <b>{num(h.p10!, d)}</b>
                <input type="range" min={r.min} max={r.max} step={r.step} value={h.p10} oninput={(e) => setP(h, 'p10', +e.currentTarget.value)} /></label>
              {#if h.p50 != null}
                <label>P50, valeur centrale <b>{num(h.p50, d)}</b>
                  <input type="range" min={r.min} max={r.max} step={r.step} value={h.p50} oninput={(e) => setP(h, 'p50', +e.currentTarget.value)} /></label>
              {:else}
                <p class="small muted">Prix positif saisi par P10 et P90 seulement : médiane √(P10 × P90) = {num(Math.sqrt(h.p10! * h.p90!), 4)}.</p>
              {/if}
              <label>P90, 1 chance sur 10 d'être au-dessus <b>{num(h.p90!, d)}</b>
                <input type="range" min={r.min} max={r.max} step={r.step} value={h.p90} oninput={(e) => setP(h, 'p90', +e.currentTarget.value)} /></label>
            {/if}
          </div>
        {/if}
      </div>
    {/each}
  {/each}

  <h3>Événements</h3>
  {#each reg.evenements as e (e.code)}
    <div class="row" class:open={open === e.code}>
      <button class="head" onclick={() => (open = open === e.code ? null : e.code)} aria-expanded={open === e.code} title={tip(e)}>
        <span class="code">{e.code}</span>
        <span class="lib">{e.libelle}</span>
        <span class="vals small">{pct(e.p)} · impact {num(e.amplitude[0] * 100, 0)} à {num(e.amplitude[1] * 100, 0)} %</span>
      </button>
      {#if open === e.code}
        <div class="edit">
          <p class="small muted">{e.proprietaire} · {e.cible} · {e.duree === 'fin' ? "jusqu'à fin d'exercice" : 'un mois'}</p>
          <p class="small just">{e.justification}</p>
          <label>Probabilité dans l'année <b>{pct(e.p)}</b>
            <input type="range" min="0" max="1" step="0.01" value={e.p} oninput={(ev) => setEv(e, 'p', +ev.currentTarget.value)} /></label>
          <label>Amplitude minimale <b>{num(e.amplitude[0] * 100, 1)} %</b>
            <input type="range" min="0" max="0.5" step="0.005" value={e.amplitude[0]} oninput={(ev) => setEv(e, 'a0', +ev.currentTarget.value)} /></label>
          <label>Amplitude maximale <b>{num(e.amplitude[1] * 100, 1)} %</b>
            <input type="range" min="0" max="0.5" step="0.005" value={e.amplitude[1]} oninput={(ev) => setEv(e, 'a1', +ev.currentTarget.value)} /></label>
        </div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .hyps { display: grid; gap: 2px; }
  .title { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .intro { margin: 2px 0 6px; }
  h3 { margin: 10px 0 3px; }
  .row { border-radius: 7px; }
  .row.open { background: var(--soft); }
  .head {
    width: 100%; display: grid; grid-template-columns: 30px max-content minmax(30px, 1fr); grid-template-rows: auto auto; column-gap: 6px; row-gap: 1px;
    text-align: left; border: none; background: none; padding: 5px 6px; border-radius: 7px; min-height: 0;
  }
  .head:hover { background: var(--soft); }
  .code { font-weight: 650; color: var(--muted); font-size: 12px; }
  .lib { grid-column: 2 / 4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .vals { grid-column: 2; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ruler { grid-column: 3; align-self: center; position: relative; height: 6px; background: var(--line); border-radius: 3px; }
  .ruler i { position: absolute; top: 0; height: 6px; }
  .ruler .rng { background: var(--bar); border-radius: 3px; }
  .ruler .mid { width: 2px; background: var(--accent); margin-left: -1px; }
  .ruler .bud { width: 2px; height: 10px; top: -2px; background: var(--budget); margin-left: -1px; }
  .edit { padding: 2px 8px 10px; display: grid; gap: 6px; }
  .edit label { display: grid; gap: 1px; font-size: 12px; }
  .edit label b { float: right; font-weight: 600; }
  .just { margin: 0; font-style: italic; }
</style>
