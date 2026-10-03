<script lang="ts">
  import { journalWorkbook, workbookBytes } from '../../io/excel.ts';
  import { download } from '../download.ts';
  import { num, pct } from '../format.ts';
  import { app } from '../state.svelte.ts';

  const r = $derived(app.result);
  let truth = $state<number | null>(null);
  let truthRunning = $state(false);
  async function runTruth() {
    truthRunning = true;
    truth = await app.engine.request<number>({ type: 'truth' });
    truthRunning = false;
  }
  function exportJournal() {
    download(workbookBytes(journalWorkbook($state.snapshot(app.journal))), 'journal_des_runs.xlsx');
  }
</script>

{#if !r || r.partial}
  <p class="muted">Contrôles en cours…</p>
{:else}
  <div class="ctl">
    <section>
      <h2>{r.blocking ? 'Un contrôle bloquant est en échec : la note CODIR est désactivée' : `Les ${r.controls.length} contrôles sont au vert : le run est présentable`}</h2>
      <p class="small muted">Exécutés à chaque run (M9). Un contrôle bloquant en échec interdit la restitution (R-RE-06).</p>
      <div class="table-wrap">
        <table class="small">
          <thead><tr><th></th><th>Code</th><th>Contrôle</th><th>Seuil</th><th>Nature</th><th>Résultat</th></tr></thead>
          <tbody>
            {#each r.controls as c (c.code)}
              <tr data-testid="ctrl-{c.code}">
                <td><span class="light" class:ok={c.ok} class:alerte={!c.ok && c.nature === 'Alerte'} aria-label={c.ok ? 'vert' : 'rouge'}></span></td>
                <td><b>{c.code}</b></td>
                <td>{c.libelle}{#if c.detail}<br /><span class="muted">{c.detail}</span>{/if}</td>
                <td class="muted">{c.seuil}</td><td>{c.nature}</td><td>{c.valeur}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="small muted">Lignes non modélisées, restées au budget (R-PL-02) : aucune, toutes les lignes du P&L de gestion jusqu'à l'EBITDA sont pilotées par une hypothèse. Durée du run : {num(r.timings.total, 0)} ms dont simulation {num(r.timings.simulation, 0)} ms.</p>
      <div class="truth">
        <button onclick={runTruth} disabled={truthRunning}>Calibration sur vérité connue (TC14)</button>
        {#if truth !== null}<span class="small">1 000 réalisés tirés du processus générateur : <b>{pct(truth, 1)}</b> tombent entre le P10 et le P90 du moteur nourri des vrais paramètres (attendu 77 % à 83 %).</span>{/if}
      </div>
    </section>
    <section>
      <div class="jh"><h2>Journal des runs de la session</h2>{#if import.meta.env.VITE_HOST !== 'artifact'}<button onclick={exportJournal} disabled={!app.journal.length}>Exporter en Excel</button>{/if}</div>
      <div class="table-wrap">
        <table class="small">
          <thead><tr><th>Heure</th><th>Référence</th><th class="num">P10 / P50 / P90</th><th class="num">Probabilité</th><th>Contrôles</th><th class="num">Durée</th></tr></thead>
          <tbody>
            {#each app.journal.slice(0, 30) as j (j.date + j.ref)}
              <tr><td>{new Date(j.date).toLocaleTimeString('fr-FR')}</td><td class="ref">{j.ref}</td><td class="num">{num(j.p10)} / {num(j.p50)} / {num(j.p90)}</td><td class="num">{pct(j.prob, 1)}</td><td>{j.controles}</td><td class="num">{num(j.duree, 0)} ms</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  </div>
{/if}

<style>
  .ctl { display: grid; gap: 22px; }
  section { display: grid; gap: 8px; }
  .light { display: inline-block; width: 14px; height: 14px; border-radius: 50%; background: var(--ko); }
  .light.ok { background: var(--ok); }
  .light.alerte { background: var(--warn); }
  .truth { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .jh { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .ref { max-width: 520px; overflow-wrap: anywhere; }
</style>
