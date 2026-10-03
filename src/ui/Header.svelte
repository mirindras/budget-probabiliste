<script lang="ts">
  import { TOOL_VERSION } from '../engine/alfa.ts';
  import { budgetTemplate, registryWorkbook, scenarioWorkbook, workbookBytes } from '../io/excel.ts';
  import { shareUrl } from '../io/share.ts';
  import { download } from './download.ts';
  import { importFiles, type ImportOutcome } from './importer.svelte.ts';
  import { app } from './state.svelte.ts';

  let { onImport, onNote }: { onImport: (o: ImportOutcome) => void; onNote: () => void } = $props();
  /** Page publiée dans un cadre qui interdit l'impression, les téléchargements et les ancres clé=valeur. */
  const EMBEDDED = import.meta.env.VITE_HOST === 'artifact';
  let menu = $state(false);
  let exporting = $state(false);
  let fileInput: HTMLInputElement;

  const canPrint = $derived(!!app.result && !app.result.partial && !app.result.blocking);

  async function share() {
    if (!app.isAlfa) {
      // R-RE-07 : un budget importé voyage dans un fichier, jamais dans un lien.
      download(workbookBytes(scenarioWorkbook($state.snapshot(app.scenario), $state.snapshot(app.budget))), 'scenario.xlsx');
      app.showToast('Budget importé : le scénario part dans un fichier Excel, jamais dans un lien (R-RE-07).');
      return;
    }
    const url = shareUrl($state.snapshot(app.scenario), location.href);
    try {
      await navigator.clipboard.writeText(url);
      app.showToast('Lien copié : il contient les hypothèses, les leviers, la graine et la version de l\'outil. Le destinataire retrouve les mêmes chiffres.');
    } catch {
      prompt('Copiez ce lien :', url);
    }
  }

  async function exportResults() {
    if (!app.result || app.result.partial) return;
    menu = false;
    exporting = true;
    try {
      const bytes = await app.engine.request<ArrayBuffer>({
        type: 'export',
        scenario: $state.snapshot(app.scenario),
        budget: $state.snapshot(app.budget),
        actuals: app.scenario.moisClos ? ($state.snapshot(app.actuals) ?? undefined) : undefined,
        run: $state.snapshot(app.result) as never,
        journal: $state.snapshot(app.journal),
      });
      download(bytes, `resultats_${app.scenario.graine}_${app.scenario.n}.xlsx`);
    } finally {
      exporting = false;
    }
  }

  function exportRegistry() {
    menu = false;
    download(workbookBytes(registryWorkbook($state.snapshot(app.scenario))), 'REGISTRE_HYPOTHESES.xlsx');
  }
  function templates() {
    menu = false;
    download(workbookBytes(budgetTemplate()), 'BUDGET_BASE.xlsx');
    setTimeout(() => download(workbookBytes(registryWorkbook($state.snapshot(app.scenario))), 'REGISTRE_HYPOTHESES.xlsx'), 300);
  }
  async function picked(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    onImport(await importFiles(Array.from(input.files ?? [])));
    input.value = '';
  }
</script>

<header class="banner screen-only">
  <div class="id">
    <h1>Budget probabiliste <span class="muted">· {app.scenario.nom}</span></h1>
    <span class="small muted">{app.isAlfa ? 'Société fictive ALFA Distribution, données synthétiques' : 'Budget importé, calculé sur ce poste'} · outil v{TOOL_VERSION}</span>
  </div>
  <div class="views" role="group" aria-label="Vue">
    <button class:active={app.vue === 'codir'} aria-pressed={app.vue === 'codir'} onclick={() => app.setVue('codir')} data-testid="vue-codir">Synthèse CODIR</button>
    <button class:active={app.vue === 'analyse'} aria-pressed={app.vue === 'analyse'} onclick={() => app.setVue('analyse')} data-testid="vue-analyse">Analyse détaillée</button>
  </div>
  <div class="actions">
    <input bind:this={fileInput} type="file" accept=".xlsx,.xls,.csv" multiple hidden onchange={picked} data-testid="file-input" />
    <div class="menu-wrap">
      <button onclick={() => (menu = !menu)} aria-expanded={menu} disabled={exporting} data-testid="fichiers">{exporting ? 'Export…' : 'Fichiers ▾'}</button>
      {#if menu}
        <div class="menu" role="menu">
          <button role="menuitem" onclick={() => { menu = false; fileInput.click(); }} data-testid="importer">Importer un budget ou un registre (Excel, CSV)</button>
          {#if !EMBEDDED}
            <button role="menuitem" onclick={exportResults} disabled={!app.result || app.result.partial}>Exporter les résultats (Excel, schéma en étoile)</button>
            <button role="menuitem" onclick={exportRegistry}>Exporter le registre (Excel, réimportable)</button>
            <button role="menuitem" onclick={templates}>Télécharger les modèles Excel à remplir</button>
            {#if !app.isAlfa}<button role="menuitem" onclick={share}>Exporter le scénario complet (Excel)</button>{/if}
          {/if}
          <button role="menuitem" onclick={() => { menu = false; void app.resetToAlfa(); }}>Revenir au jeu de démonstration ALFA</button>
        </div>
      {/if}
    </div>
    {#if !EMBEDDED}<button onclick={share} data-testid="partager" title="Copier un lien qui rejoue exactement ce scénario">Partager</button>{/if}
    <button onclick={onNote} disabled={!canPrint} title={app.result?.blocking ? 'Un contrôle bloquant est en échec (R-RE-06)' : 'Aperçu de la note CODIR d\'une page'} data-testid="apercu-note">Note CODIR</button>
    {#if !EMBEDDED}<button class="primary" onclick={() => window.print()} disabled={!canPrint} title={app.result?.blocking ? 'Un contrôle bloquant est en échec (R-RE-06)' : 'PDF d\'une page A4 via Imprimer'} data-testid="imprimer">Imprimer la note</button>{/if}
  </div>
</header>

<style>
  .banner { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding: 10px 16px; background: var(--panel); border-bottom: 1px solid var(--line); position: sticky; top: env(safe-area-inset-top, 0px); z-index: 10; }
  h1 { font-size: 17px; font-weight: 700; }
  h1 .muted { font-weight: 500; }
  .id { display: grid; }
  .actions { display: flex; gap: 6px; flex-wrap: wrap; }
  .views { display: inline-flex; padding: 3px; background: var(--soft); border-radius: 9px; gap: 2px; }
  .views button { border: none; background: transparent; border-radius: 7px; padding: 5px 12px; color: var(--muted); font-weight: 600; }
  .views button.active { background: var(--panel); color: var(--ink); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12); }
  .menu-wrap { position: relative; }
  .menu { position: absolute; left: 0; top: calc(100% + 4px); background: var(--panel); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 6px 24px rgba(0, 0, 0, 0.12); display: grid; min-width: 260px; z-index: 20; padding: 4px; }
  .menu button { border: none; text-align: left; border-radius: 6px; }
  .menu button:hover:not(:disabled) { background: var(--soft); }
  @media (max-width: 700px) { .banner { position: static; } }
</style>
