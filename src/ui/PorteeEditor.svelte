<script lang="ts">
  /**
   * Choix de la portée d'une hypothèse ou d'un événement : les BU visées (aucune case décochée = toutes),
   * une rubrique entière ou des postes choisis, et la rubrique d'arrivée des points de marge.
   */
  import type { Budget, Portee } from '../engine/types.ts';

  let { portee, kind, budget, onchange }: {
    portee: Portee;
    /** bu : volumes, prix ; postes : montants ; marge : BU et rubrique d'arrivée. */
    kind: 'bu' | 'postes' | 'marge';
    budget: Budget;
    onchange: (p: Portee) => void;
  } = $props();

  const all = $derived(!portee.bu?.length);
  const checked = (b: string) => all || portee.bu!.includes(b);
  function toggleBu(b: string, on: boolean) {
    const next = budget.bu.filter((x) => (x === b ? on : checked(x)));
    if (!next.length) return;
    onchange({ ...portee, bu: next.length === budget.bu.length ? undefined : next });
  }

  const withPostes = $derived(budget.rubriques.filter((r) => budget.postes.some((p) => p.rubrique === r.code)));
  const mode = $derived(portee.postes?.length ? 'postes' : 'rubrique');
  function setMode(m: 'postes' | 'rubrique') {
    if (m === mode) return;
    if (m === 'rubrique') onchange({ rubrique: portee.rubrique ?? budget.postes.find((p) => p.code === portee.postes?.[0])?.rubrique ?? withPostes[0]?.code });
    else onchange({ postes: [budget.postes.find((p) => p.rubrique === portee.rubrique)?.code ?? budget.postes[0].code] });
  }
  function togglePoste(code: string, on: boolean) {
    const cur = new Set(portee.postes ?? []);
    if (on) cur.add(code);
    else cur.delete(code);
    if (!cur.size) return;
    onchange({ postes: budget.postes.map((p) => p.code).filter((c) => cur.has(c)) });
  }
  const arrivee = $derived(budget.rubriques.filter((r) => r.nature !== 'ca'));
</script>

<div class="portee small">
  {#if kind === 'bu' || kind === 'marge'}
    {#if budget.bu.length > 1}
      <fieldset>
        <legend>BU concernées</legend>
        {#each budget.bu as b (b)}
          <label class="check"><input type="checkbox" checked={checked(b)} onchange={(e) => toggleBu(b, e.currentTarget.checked)} /> {b}</label>
        {/each}
      </fieldset>
    {:else}
      <p class="muted">Une seule BU : {budget.bu[0]}.</p>
    {/if}
    {#if kind === 'marge'}
      <label>Rubrique où les points de marge sont comptés
        <select value={portee.rubrique ?? ''} onchange={(e) => onchange({ ...portee, rubrique: e.currentTarget.value || undefined })}>
          <option value="">À choisir</option>
          {#each arrivee as r (r.code)}<option value={r.code}>{r.libelle}</option>{/each}
        </select>
      </label>
    {/if}
  {:else}
    <fieldset>
      <legend>Ce qui est touché</legend>
      <label class="check"><input type="radio" checked={mode === 'rubrique'} onchange={() => setMode('rubrique')} /> une rubrique entière</label>
      <label class="check"><input type="radio" checked={mode === 'postes'} onchange={() => setMode('postes')} /> des postes choisis</label>
    </fieldset>
    {#if mode === 'rubrique'}
      <select value={portee.rubrique ?? ''} onchange={(e) => onchange({ rubrique: e.currentTarget.value })} aria-label="Rubrique">
        {#each withPostes as r (r.code)}<option value={r.code}>{r.libelle} ({budget.postes.filter((p) => p.rubrique === r.code).length} postes)</option>{/each}
      </select>
    {:else}
      <div class="postes">
        {#each withPostes as r (r.code)}
          <details open={budget.postes.some((p) => p.rubrique === r.code && portee.postes?.includes(p.code))}>
            <summary>{r.libelle}</summary>
            {#each budget.postes.filter((p) => p.rubrique === r.code) as p (p.code)}
              <label class="check"><input type="checkbox" checked={portee.postes?.includes(p.code)} onchange={(e) => togglePoste(p.code, e.currentTarget.checked)} /> {p.libelle}{p.bu ? ` · ${p.bu}` : ''}</label>
            {/each}
          </details>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .portee { display: grid; gap: 6px; }
  fieldset { border: 1px solid var(--line); border-radius: 6px; padding: 4px 8px 6px; display: flex; flex-wrap: wrap; gap: 4px 12px; margin: 0; }
  legend { color: var(--muted); padding: 0 4px; }
  label { display: grid; gap: 2px; color: var(--muted); }
  .check { display: flex; gap: 5px; align-items: center; color: var(--ink); }
  select { font: inherit; color: var(--ink); background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 4px 6px; max-width: 100%; }
  .postes { display: grid; gap: 2px; max-height: 220px; overflow-y: auto; border: 1px solid var(--line); border-radius: 6px; padding: 4px 8px; }
  summary { cursor: pointer; font-weight: 600; }
  details .check { padding-left: 14px; }
</style>
