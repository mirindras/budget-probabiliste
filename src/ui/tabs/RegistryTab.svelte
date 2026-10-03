<script lang="ts">
  import { asymmetry, chooseLaw } from '../../engine/laws.ts';
  import { DRIVER_CODES, type DriverCode, type Hypothesis, type Status } from '../../engine/types.ts';
  import { num } from '../format.ts';
  import { app } from '../state.svelte.ts';

  const reg = $derived(app.scenario.registre);
  const laws = $derived(app.result?.laws ?? []);
  const hist = $derived(app.synthetic?.intervalleHistorique ?? {});
  const obs = $derived(app.synthetic?.correlationsObservees ?? {});
  const STATUTS: Status[] = ['brouillon', 'valide', 'gele'];
  const LAW: Record<string, string> = { normale: 'Normale', 'split-normale': 'Split-normale', lognormale: 'Lognormale', pert: 'PERT', 'marche-aleatoire': 'Marche aléatoire' };

  function edit<K extends keyof Hypothesis>(h: Hypothesis, key: K, v: Hypothesis[K]) {
    app.markRegistryEdited();
    h[key] = v;
  }
  const numOrNull = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

  /** R-HY-02 : fourchette plus étroite que la moitié de l'intervalle historique équivalent. */
  function narrow(h: Hypothesis): boolean {
    const w = hist[h.code];
    if (!w || app.budget.source !== 'alfa') return false;
    if (h.code === 'H06') {
      const l = laws.find((x) => x.code === 'H06');
      return l ? (l.p90 - l.p10) / l.p50 < 0.5 * w : false;
    }
    const k = h.k ?? 1;
    return k * (h.p90! - h.p10!) < 0.5 * w;
  }

  let newA = $state<DriverCode>('H01');
  let newB = $state<DriverCode>('H12');
  function addCorr() {
    if (newA === newB) return;
    if (reg.correlations_rang.some(([a, b]) => (a === newA && b === newB) || (a === newB && b === newA))) return;
    app.markRegistryEdited();
    reg.correlations_rang = [...reg.correlations_rang, [newA, newB, 0, 'à justifier']];
  }

  let seedOpen = $state(false);
  let seedValue = $state<number | string>('');
  let seedMotif = $state('');
  let seedError = $state<string | null>(null);
  function openSeed() {
    seedValue = String(app.scenario.graine);
    seedMotif = '';
    seedError = null;
    seedOpen = true;
  }
  function applySeed(e: SubmitEvent) {
    e.preventDefault();
    const raw = String(seedValue ?? '').trim();
    const seed = Math.trunc(Number(raw));
    if (raw === '' || !Number.isFinite(seed) || seed < 0) {
      seedError = 'La graine est un entier positif.';
      return;
    }
    if (!seedMotif.trim()) {
      seedError = 'Le motif est obligatoire : il est journalisé (R-SI-02).';
      return;
    }
    app.setSeed(seed, seedMotif.trim());
    seedOpen = false;
  }
</script>

<div class="reg">
  <section class="params">
    <div>
      <h2>Registre {reg.version} · {reg.statut === 'gele' ? 'gelé' : reg.statut === 'valide' ? 'validé' : 'brouillon'}</h2>
      <p class="small muted">Une hypothèse, un propriétaire, une source. Toute modification après gel crée une nouvelle version (R-HY-04). Les métiers donnent les fourchettes ; la loi découle des règles de la section 5.3.</p>
    </div>
    <div class="ctrls">
      <label class="small">Itérations
        <select bind:value={app.scenario.n} data-testid="n">
          {#each [1000, 5000, 10000, 20000, 50000, 100000] as n (n)}<option value={n}>{n.toLocaleString('fr-FR')}</option>{/each}
        </select>
      </label>
      <span class="small">Graine <b>{app.scenario.graine}</b> <button class="link" onclick={openSeed} aria-expanded={seedOpen}>changer</button></span>
      <label class="small">Persistance φ <input type="number" step="0.05" min="0" max="0.99" bind:value={reg.bruit_volumes.phi} oninput={() => app.markRegistryEdited()} /></label>
      <label class="small">Bruit mensuel σ <input type="number" step="0.005" min="0" max="0.2" bind:value={reg.bruit_volumes.sigma_mensuel} oninput={() => app.markRegistryEdited()} /></label>
      <button onclick={() => app.freezeRegistry()} disabled={reg.statut === 'gele'}>Geler le registre</button>
    </div>
  </section>

  {#if seedOpen}
    <form class="seed small" onsubmit={applySeed}>
      <label for="seed-value">Nouvelle graine</label>
      <input id="seed-value" type="number" min="0" step="1" bind:value={seedValue} />
      <label for="seed-motif">Motif du changement</label>
      <input id="seed-motif" class="motif" bind:value={seedMotif} placeholder="ex. vérification de la reproductibilité sur une autre graine" />
      <button class="primary" type="submit">Changer la graine</button>
      <button type="button" onclick={() => (seedOpen = false)}>Annuler</button>
      <p class="muted">On ne change jamais de graine pour obtenir un meilleur chiffre : le changement et son motif sont journalisés.</p>
      {#if seedError}<p class="neg">{seedError}</p>{/if}
    </form>
  {/if}

  <div class="table-wrap">
    <table class="small hyp">
      <thead>
        <tr><th>Code</th><th>Hypothèse</th><th>Propriétaire</th><th>Unité</th><th class="num">P10</th><th class="num">P50</th><th class="num">P90</th><th class="num">k</th><th>Loi (A)</th><th class="num">Tirés P10 / P90</th><th>Justification</th><th>Statut</th></tr>
      </thead>
      <tbody>
        {#each reg.hypotheses as h (h.code)}
          {@const law = chooseLaw(h)}
          {@const l = laws.find((x) => x.code === h.code)}
          <tr class:alert={narrow(h)}>
            <td><b>{h.code}</b></td>
            <td>{h.libelle}<br /><span class="muted">{h.grain}</span></td>
            <td><input value={h.proprietaire} oninput={(e) => edit(h, 'proprietaire', e.currentTarget.value)} /></td>
            <td class="muted">{h.unite}</td>
            {#if law === 'marche-aleatoire'}
              <td colspan="3" class="small">départ <input class="n" type="number" step="10" value={h.depart} oninput={(e) => edit(h, 'depart', +e.currentTarget.value)} />
                dérive <input class="n" type="number" step="0.005" value={h.derive_annuelle} oninput={(e) => edit(h, 'derive_annuelle', +e.currentTarget.value)} />
                vol. <input class="n" type="number" step="0.001" value={h.volatilite_mensuelle} oninput={(e) => edit(h, 'volatilite_mensuelle', +e.currentTarget.value)} /></td>
            {:else}
              <td class="num"><input class="n" type="number" step="0.001" value={h.p10} oninput={(e) => edit(h, 'p10', +e.currentTarget.value)} /></td>
              <td class="num"><input class="n" type="number" step="0.001" value={h.p50 ?? ''} placeholder="–" oninput={(e) => edit(h, 'p50', numOrNull(e.currentTarget.value))} /></td>
              <td class="num"><input class="n" type="number" step="0.001" value={h.p90} oninput={(e) => edit(h, 'p90', +e.currentTarget.value)} /></td>
            {/if}
            <td class="num"><input class="n k" type="number" step="0.01" min="1" max="2" value={h.k ?? 1} oninput={(e) => edit(h, 'k', +e.currentTarget.value)} /></td>
            <td>{LAW[law]}{#if h.p50 != null && law !== 'marche-aleatoire' && law !== 'pert'} <span class="muted">({num(asymmetry(h.p10!, h.p50, h.p90!), 2)})</span>{/if}</td>
            <td class="num muted">{#if l}{num(l.emp[0], h.code === 'H06' ? 0 : 3)} / {num(l.emp[2], h.code === 'H06' ? 0 : 3)}{/if}</td>
            <td><textarea rows="2" value={h.justification} oninput={(e) => edit(h, 'justification', e.currentTarget.value)}></textarea>
              {#if narrow(h)}<span class="warn small">Plus étroite que la moitié de l'intervalle historique équivalent : justification à faire valider par le CFO (R-HY-02).</span>{/if}</td>
            <td><select value={h.statut} onchange={(e) => edit(h, 'statut', e.currentTarget.value as Status)}>{#each STATUTS as s (s)}<option value={s}>{s}</option>{/each}</select></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <div class="table-wrap">
    <table class="small">
      <thead><tr><th>Code</th><th>Événement</th><th>Propriétaire</th><th class="num">Probabilité</th><th class="num">Amplitude</th><th>Surcoût</th><th>Durée</th><th>Justification</th><th>Statut</th></tr></thead>
      <tbody>
        {#each reg.evenements as e (e.code)}
          <tr>
            <td><b>{e.code}</b></td><td>{e.libelle}<br /><span class="muted">{e.cible}</span></td><td>{e.proprietaire}</td>
            <td class="num">{num(e.p * 100, 0)} %</td><td class="num">{num(e.amplitude[0] * 100, 0)} à {num(e.amplitude[1] * 100, 0)} %</td>
            <td>{e.surcout ? `${num(e.surcout[0] * 1000, 0)} à ${num(e.surcout[1] * 1000, 0)} MAr` : '–'}</td>
            <td>{e.duree === 'fin' ? "jusqu'à fin d'exercice" : 'un mois'}</td><td>{e.justification}</td><td>{e.statut}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <section>
    <h2>Dépendances : corrélations de rang</h2>
    <p class="small muted">« Quand A est dans son décile haut, B l'est souvent aussi. » Toutes les paires absentes sont indépendantes, une hypothèse documentée. Les corrélations d'au moins 0,3 en valeur absolue s'affichent à côté de la corrélation observée sur 60 mois ; un écart de plus de 0,3 exige un argument écrit (R-DE-03).</p>
    <div class="table-wrap">
      <table class="small corr">
        <thead><tr><th>Paire</th><th class="num">Cible</th><th class="num">Observée 60 mois</th><th>Justification</th><th></th></tr></thead>
        <tbody>
          {#each reg.correlations_rang as c, i (c[0] + c[1])}
            {@const o = obs[`${c[0]}/${c[1]}`]}
            <tr class:alert={o !== undefined && Math.abs(c[2]) >= 0.3 && Math.abs(o - c[2]) > 0.3}>
              <td>{c[0]} / {c[1]}</td>
              <td class="num"><input class="n" type="number" step="0.05" min="-0.9" max="0.9" value={c[2]} oninput={(e) => { app.markRegistryEdited(); c[2] = +e.currentTarget.value; }} /></td>
              <td class="num muted">{o !== undefined && app.isAlfa ? num(o, 2) : '–'}</td>
              <td><input class="wide" value={c[3] ?? ''} oninput={(e) => { app.markRegistryEdited(); c[3] = e.currentTarget.value; }} /></td>
              <td><button class="link" onclick={() => { app.markRegistryEdited(); reg.correlations_rang = reg.correlations_rang.filter((_, j) => j !== i); }}>retirer</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <div class="add small">
      Ajouter une paire
      <select bind:value={newA}>{#each DRIVER_CODES as c (c)}<option>{c}</option>{/each}</select>
      <select bind:value={newB}>{#each DRIVER_CODES as c (c)}<option>{c}</option>{/each}</select>
      <button onclick={addCorr}>Ajouter</button>
    </div>
  </section>

  <section>
    <h2>Leviers : fiches</h2>
    <div class="table-wrap">
      <table class="small">
        <thead><tr><th>Code</th><th>Levier</th><th>Règle de calcul</th><th class="num">Coût direct (GAr)</th><th class="num">Mois d'effet</th><th>Propriétaire</th><th>Faisabilité</th></tr></thead>
        <tbody>
          {#each app.scenario.leviers as l (l.code)}
            <tr>
              <td><b>{l.code}</b></td><td>{l.libelle}</td><td>{l.regle}</td>
              <td class="num"><input class="n" type="number" step="0.01" value={l.cout ?? ''} oninput={(e) => (l.cout = e.currentTarget.value === '' ? null : +e.currentTarget.value)} /></td>
              <td class="num"><input class="n" type="number" min="1" max="12" value={l.mois ?? ''} oninput={(e) => (l.mois = e.currentTarget.value === '' ? null : +e.currentTarget.value)} /></td>
              <td>{l.proprietaire}</td><td class="muted">{l.faisabilite}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="small muted">Un levier sans coût direct ou sans date d'effet est refusé par l'outil, qui indique le champ manquant (R-LE-02).</p>
  </section>

  {#if app.seedLog.length}
    <section>
      <h3>Journal des changements de graine</h3>
      <ul class="small">{#each app.seedLog as s (s.date)}<li>{new Date(s.date).toLocaleString('fr-FR')} : {s.de} → {s.vers}, motif : {s.motif}</li>{/each}</ul>
    </section>
  {/if}
</div>

<style>
  .reg { display: grid; gap: 18px; }
  .params { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .ctrls { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  .ctrls input { width: 70px; }
  input.n { width: 72px; text-align: right; }
  input.k { width: 56px; }
  input.wide { width: 100%; min-width: 200px; }
  textarea { width: 100%; min-width: 220px; resize: vertical; }
  td input:not(.n) { width: 100%; min-width: 120px; }
  tr.alert td { background: color-mix(in srgb, var(--warn) 10%, transparent); }
  .warn { color: var(--warn); display: block; }
  .add { display: flex; gap: 6px; align-items: center; margin-top: 6px; }
  .seed { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; padding: 10px 12px; background: var(--soft); border-radius: 8px; }
  .seed p { flex-basis: 100%; margin: 0; }
  .seed input { width: 110px; }
  .seed input.motif { width: min(420px, 100%); }
  ul { margin: 0; padding-left: 18px; }
</style>
