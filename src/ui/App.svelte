<script lang="ts">
  import { onMount } from 'svelte';
  import CodirView from './CodirView.svelte';
  import Header from './Header.svelte';
  import NoteCodir from './NoteCodir.svelte';
  import HypothesesPanel from './panels/HypothesesPanel.svelte';
  import LeversPanel from './panels/LeversPanel.svelte';
  import ResultPanel from './panels/ResultPanel.svelte';
  import BacktestTab from './tabs/BacktestTab.svelte';
  import ControlsTab from './tabs/ControlsTab.svelte';
  import RegistryTab from './tabs/RegistryTab.svelte';
  import RiskTab from './tabs/RiskTab.svelte';
  import TrajectoryTab from './tabs/TrajectoryTab.svelte';
  import { importFiles, type ImportOutcome } from './importer.svelte.ts';
  import { app } from './state.svelte.ts';

  const TABS = [
    { id: 'risque', label: 'Origine du risque' },
    { id: 'trajectoire', label: 'Trajectoire mensuelle' },
    { id: 'backtest', label: 'Backtest' },
    { id: 'registre', label: 'Registre' },
    { id: 'controles', label: 'Contrôles' },
  ] as const;
  type TabId = (typeof TABS)[number]['id'];
  let tab = $state<TabId>('risque');
  let importResult = $state<ImportOutcome | null>(null);
  let dragging = $state(false);
  let showHyps = $state(true);
  let showNote = $state(false);
  const EMBEDDED = import.meta.env.VITE_HOST === 'artifact';

  onMount(() => {
    try {
      const t = localStorage.getItem('onglet') as TabId | null;
      if (t && TABS.some((x) => x.id === t)) tab = t;
    } catch {
      /* stockage indisponible */
    }
    void app.init();
  });

  $effect(() => {
    try {
      localStorage.setItem('onglet', tab);
    } catch {
      /* rien */
    }
  });

  // Recalcul automatique à chaque modification du scénario ou du budget (UC03).
  $effect(() => {
    if (!app.ready) return;
    JSON.stringify(app.scenario);
    JSON.stringify(app.budget);
    app.schedule();
  });

  function onImport(o: ImportOutcome) {
    importResult = o;
    if (o.ok) app.showToast(o.titre);
  }
  async function onDrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    onImport(await importFiles(Array.from(e.dataTransfer?.files ?? [])));
  }
</script>

<svelte:window
  ondragover={(e) => {
    e.preventDefault();
    dragging = true;
  }}
  ondragleave={(e) => {
    if (!e.relatedTarget) dragging = false;
  }}
  ondrop={onDrop}
/>

<Header {onImport} onNote={() => (showNote = true)} />

<div class="screen-only page">
  {#if app.notice}
    <div class="notice" role="status">{app.notice} <button class="link" onclick={() => (app.notice = null)}>fermer</button>
      {#if app.notice.startsWith('Brouillon')}<button class="link" onclick={() => app.resetToAlfa()}>Revenir à ALFA</button>{/if}
    </div>
  {/if}
  {#if app.errors.length}
    <div class="errors" role="alert">
      <b>Le calcul ne part pas tant que ces points ne sont pas corrigés :</b>
      <ul>{#each app.errors as e (e)}<li>{e}</li>{/each}</ul>
    </div>
  {/if}
  {#if importResult && !importResult.ok}
    <div class="errors" role="alert" data-testid="import-errors">
      <b>{importResult.titre}</b>
      <ul>{#each importResult.errors as e, i (i)}<li>{e.feuille}{e.ligne ? `, ligne ${e.ligne}` : ''} : {e.message}</li>{/each}</ul>
      <button class="link" onclick={() => (importResult = null)}>fermer</button>
    </div>
  {/if}
  {#if app.result?.blocking && !app.result.partial}
    <div class="errors" role="alert">Un contrôle bloquant est en échec : l'impression de la note CODIR est désactivée. Détail dans l'onglet Contrôles.</div>
  {/if}

  {#if app.vue === 'codir'}
    <CodirView />
  {:else}
  <main class="grid">
    <aside class="panel left" aria-label="Hypothèses">
      <button class="toggle" class:shown={!showHyps} onclick={() => (showHyps = !showHyps)} aria-expanded={showHyps}>{showHyps ? 'Masquer' : 'Afficher'} les hypothèses</button>
      {#if showHyps}<HypothesesPanel />{/if}
    </aside>
    <section class="panel center" aria-label="Résultat"><ResultPanel /></section>
    <aside class="panel right" aria-label="Leviers"><LeversPanel /></aside>
  </main>

  <section class="panel tabs">
    <div class="tablist" role="tablist">
      {#each TABS as t (t.id)}
        <button role="tab" aria-selected={tab === t.id} class:active={tab === t.id} onclick={() => (tab = t.id)}>
          {t.label}
          {#if t.id === 'controles' && app.result && !app.result.partial}
            <span class="light" class:ok={!app.result.blocking}></span>
          {/if}
        </button>
      {/each}
    </div>
    <div class="tabpanel" role="tabpanel">
      {#if tab === 'risque'}<RiskTab />
      {:else if tab === 'trajectoire'}<TrajectoryTab />
      {:else if tab === 'backtest'}<BacktestTab />
      {:else if tab === 'registre'}<RegistryTab />
      {:else}<ControlsTab />{/if}
    </div>
  </section>
  {/if}

  <footer class="small muted">
    {#if app.isAlfa}Données synthétiques : société fictive ALFA Distribution, aucune donnée d'entreprise réelle. {/if}
    Calcul dans votre navigateur : aucune donnée ne quitte ce poste. Montants en GAr (milliards d'ariarys).
    P10 = 1 chance sur 10 de faire moins ; P90 = 1 chance sur 10 de faire mieux.
    {#if EMBEDDED}<br />Version de démonstration en ligne : l'impression de la note en PDF, les exports Excel et le lien de partage sont dans la version complète, publiée depuis le dépôt.{/if}
  </footer>
</div>

{#if dragging}
  <div class="drop screen-only">Déposez un modèle Excel (budget, registre ou scénario) : il est lu sur ce poste, rien n'est envoyé.</div>
{/if}
{#if app.toast}<div class="toast screen-only" role="status">{app.toast}</div>{/if}

<NoteCodir />
{#if showNote && app.result && !app.result.partial}
  <div class="overlay screen-only" role="dialog" aria-modal="true" aria-label="Note CODIR">
    <div class="overlay-bar">
      <span>Note CODIR d'une page{EMBEDDED ? '' : ' : « Imprimer la note » en fait un PDF A4'}</span>
      <button onclick={() => (showNote = false)} data-testid="fermer-note">Fermer</button>
    </div>
    <NoteCodir screen />
  </div>
{/if}

<style>
  .page { padding: 12px 16px 24px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; max-width: 1680px; margin: 0 auto; }
  .tabpanel { min-width: 0; overflow-x: auto; }
  .panel { min-width: 0; }
  .grid { display: grid; grid-template-columns: minmax(280px, 330px) minmax(0, 1fr) minmax(280px, 340px); gap: 12px; align-items: start; }
  .panel { padding: 12px 14px; }
  .left, .right { max-height: calc(100vh - 90px); overflow-y: auto; position: sticky; top: 72px; }
  .toggle { display: none; width: 100%; margin-bottom: 6px; }
  .toggle.shown { display: block; }
  .notice { background: var(--soft); border: 1px solid var(--line); border-radius: 8px; padding: 8px 12px; display: flex; gap: 10px; flex-wrap: wrap; align-items: baseline; }
  .errors { background: color-mix(in srgb, var(--ko) 10%, var(--panel)); border: 1px solid var(--ko); border-radius: 8px; padding: 8px 12px; }
  .errors ul { margin: 4px 0; padding-left: 18px; }
  .tablist { display: flex; gap: 2px; border-bottom: 1px solid var(--line); margin: -4px -4px 12px; overflow-x: auto; }
  .tablist button { border: none; background: none; border-bottom: 2px solid transparent; border-radius: 0; padding: 8px 12px; white-space: nowrap; color: var(--muted); }
  .tablist button.active { color: var(--ink); border-bottom-color: var(--accent); font-weight: 600; }
  .light { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--ko); margin-left: 4px; vertical-align: 1px; }
  .light.ok { background: var(--ok); }
  footer { text-align: center; }
  .drop { position: fixed; inset: 12px; border: 3px dashed var(--accent); background: color-mix(in srgb, var(--panel) 92%, transparent); display: grid; place-items: center; font-size: 18px; z-index: 50; border-radius: 16px; padding: 24px; text-align: center; pointer-events: none; }
  .overlay { position: fixed; inset: 0; z-index: 70; background: color-mix(in srgb, var(--bg) 70%, #000 30%); overflow-y: auto; padding: calc(12px + env(safe-area-inset-top, 0px)) 16px 24px; display: grid; gap: 10px; align-content: start; }
  .overlay-bar { display: flex; justify-content: space-between; align-items: center; max-width: 760px; width: 100%; margin: 0 auto; color: var(--ink); background: var(--panel); padding: 6px 10px; border-radius: 8px; }
  .toast { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); background: var(--ink); color: var(--panel); padding: 10px 16px; border-radius: 8px; max-width: min(640px, calc(100vw - 32px)); z-index: 60; box-shadow: 0 6px 24px rgba(0, 0, 0, 0.2); }
  @media (max-width: 1100px) {
    .grid { grid-template-columns: minmax(0, 1fr) minmax(260px, 320px); }
    .left { min-width: 0; }
    .left { grid-column: 1 / -1; grid-row: 2; position: static; max-height: none; }
  }
  @media (max-width: 900px) {
    .page { padding: 8px 16px 20px; }
    .grid { grid-template-columns: minmax(0, 1fr); }
    .center { grid-row: 1; }
    .right { grid-row: 2; position: static; max-height: none; }
    .left { grid-row: 3; }
    .toggle { display: block; }
  }
</style>
