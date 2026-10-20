<script lang="ts">
  import { chooseLaw } from '../../engine/laws.ts';
  import { describePortee } from '../../engine/portee.ts';
  import type { Hypothesis, RiskEvent } from '../../engine/types.ts';
  import { num, pct, rate } from '../format.ts';
  import { app } from '../state.svelte.ts';

  const LAW_LABEL: Record<string, string> = {
    normale: 'normale', 'split-normale': 'split-normale (asymétrique)', lognormale: 'lognormale', pert: 'PERT', 'marche-aleatoire': 'marche aléatoire',
  };

  let open = $state<string | null>(null);
  const reg = $derived(app.scenario.registre);
  /** Hypothèses regroupées par famille de risque, dans l'ordre du registre. */
  const groups = $derived.by(() => {
    const out: { titre: string; hyps: Hypothesis[] }[] = [];
    for (const h of reg.hypotheses) {
      const g = out.find((x) => x.titre === h.famille);
      if (g) g.hyps.push(h);
      else out.push({ titre: h.famille, hyps: [h] });
    }
    return out;
  });
  const isPoints = (h: Hypothesis) => h.effet === 'marge';

  /** Échelle des curseurs : ±15 % autour du budget, élargie si la fourchette en sort. */
  function range(h: Hypothesis): { min: number; max: number; step: number } {
    const k = h.k ?? 1;
    const p50 = h.p50 ?? Math.sqrt(h.p10! * h.p90!);
    const lo = p50 - k * (p50 - h.p10!);
    const hi = p50 + k * (h.p90! - p50);
    if (isPoints(h)) return { min: Math.min(-2, Math.floor(lo)), max: Math.max(2, Math.ceil(hi)), step: 0.05 };
    return { min: Math.min(0.85, Math.floor(lo * 20) / 20), max: Math.max(1.15, Math.ceil(hi * 20) / 20), step: 0.001 };
  }
  /** Curseur du cours de départ : de −10 % à +20 % du cours budget. */
  function fxRange(h: Hypothesis) {
    const cb = app.budget.change?.coursBudget ?? h.depart!;
    const step = 10 ** (Math.floor(Math.log10(cb)) - 3);
    return { min: Math.min(h.depart!, cb * 0.9), max: Math.max(h.depart!, cb * 1.2), step };
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
    return { lo: f(lo), hi: f(hi), mid: f(p50), budget: f(isPoints(h) ? 0 : 1) };
  }
  const tip = (h: { proprietaire: string; justification: string }, extra = '') => `Propriétaire : ${h.proprietaire}\n${h.justification}${extra}`;
</script>

<div class="hyps">
  <div class="title">
    <h2>Ce qu'on suppose</h2>
    <span class="small muted">registre {reg.version}{reg.statut === 'brouillon' ? ' (brouillon)' : reg.statut === 'gele' ? ' (gelé)' : ''}</span>
  </div>
  <p class="small muted intro">Chaque propriétaire donne une fourchette : 1 chance sur 10 d'être en dessous (P10), valeur centrale (P50), 1 chance sur 10 d'être au-dessus (P90). Cliquez pour modifier, ou <button class="link" onclick={() => (app.guide = true)}>ouvrez la saisie guidée</button> pour tout passer en revue, ajouter ou retirer une hypothèse.</p>

  {#each groups as g (g.titre)}
    <h3>{g.titre}</h3>
    {#each g.hyps as h (h.code)}
      {@const code = h.code}
      {@const law = chooseLaw(h)}
      <div class="row" class:open={open === code}>
        <button class="head" onclick={() => (open = open === code ? null : code)} aria-expanded={open === code} title={tip(h, `\nLoi : ${LAW_LABEL[law]}`)}>
          <span class="code">{code}</span>
          <span class="lib">{h.libelle}</span>
          {#if law === 'marche-aleatoire'}
            <span class="vals small">départ {rate(h.depart!)} · vol. {num(h.volatilite_mensuelle! * 100, 1)} %/mois</span>
          {:else}
            {@const b = bar(h)}
            <span class="vals small">{num(h.p10!, isPoints(h) ? 1 : 3)} / {h.p50 == null ? '–' : num(h.p50, isPoints(h) ? 1 : 3)} / {num(h.p90!, isPoints(h) ? 1 : 3)}</span>
            <span class="ruler" aria-hidden="true">
              <i class="rng" style="left:{b.lo}%; width:{b.hi - b.lo}%"></i>
              <i class="mid" style="left:{b.mid}%"></i>
              <i class="bud" style="left:{b.budget}%"></i>
            </span>
          {/if}
        </button>
        {#if open === code}
          <div class="edit">
            <p class="small muted">{h.proprietaire} · loi {LAW_LABEL[law]}{(h.k ?? 1) !== 1 ? ` · élargie par k = ${num(h.k!, 2)}` : ''} · {h.effet === 'change' ? 'postes en devises' : describePortee(h.portee, app.budget)}</p>
            <p class="small just">{h.justification}</p>
            {#if law === 'marche-aleatoire'}
              {@const fr = fxRange(h)}
              <label>Cours de départ <b>{rate(h.depart!)}</b> {app.budget.change ? `${app.budget.change.locale} pour 1 ${app.budget.change.devise}` : ''}
                <input type="range" min={fr.min} max={fr.max} step={fr.step} value={h.depart} oninput={(e) => setFx(h, 'depart', +e.currentTarget.value)} /></label>
              <label>Dérive annuelle <b>{num(h.derive_annuelle! * 100, 1)} %</b>
                <input type="range" min="-0.05" max="0.15" step="0.005" value={h.derive_annuelle} oninput={(e) => setFx(h, 'derive_annuelle', +e.currentTarget.value)} /></label>
              <label>Volatilité mensuelle <b>{num(h.volatilite_mensuelle! * 100, 1)} %</b>
                <input type="range" min="0.005" max="0.04" step="0.001" value={h.volatilite_mensuelle} oninput={(e) => setFx(h, 'volatilite_mensuelle', +e.currentTarget.value)} /></label>
              {@const l = app.result?.laws.find((x) => x.code === h.code)}
              {#if l && app.budget.change}<p class="small muted">Cours moyen simulé : {rate(l.p10)} / {rate(l.p50)} / {rate(l.p90)}, pour un cours budget de {rate(app.budget.change.coursBudget)}.</p>{/if}
            {:else}
              {@const r = range(h)}
              {@const d = isPoints(h) ? 2 : 3}
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

  {#if reg.evenements.length}<h3>Événements</h3>{/if}
  {#each reg.evenements as e (e.code)}
    <div class="row" class:open={open === e.code}>
      <button class="head" onclick={() => (open = open === e.code ? null : e.code)} aria-expanded={open === e.code} title={tip(e)}>
        <span class="code">{e.code}</span>
        <span class="lib">{e.libelle}</span>
        <span class="vals small">{pct(e.p)} · {e.sens} de {num(e.amplitude[0] * 100, 0)} à {num(e.amplitude[1] * 100, 0)} %</span>
      </button>
      {#if open === e.code}
        <div class="edit">
          <p class="small muted">{e.proprietaire} · {e.effet === 'volume' ? 'volumes' : 'montant'} : {describePortee(e.portee, app.budget)} · {e.duree === 'fin' ? "jusqu'à fin d'exercice" : 'un mois'}</p>
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
