<script lang="ts">
  /** Jauge demi-cercle d'une probabilité, avec le repère de la base quand une sélection est active. */
  interface Props {
    value: number;
    base?: number | null;
    label: string;
  }
  let { value, base = null, label }: Props = $props();
  const R = 80;
  const CX = 100;
  const CY = 96;
  const point = (p: number) => {
    const a = Math.PI * (1 - Math.min(1, Math.max(0, p)));
    return [CX + R * Math.cos(a), CY - R * Math.sin(a)];
  };
  const arc = (p: number) => {
    const [x, y] = point(p);
    return `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${x} ${y}`;
  };
  const marker = $derived(base === null ? null : point(base));
</script>

<svg viewBox="0 0 200 112" role="img" aria-label={label}>
  <path d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`} class="track" />
  {#if value > 0.001}<path d={arc(value)} class="fill" />{/if}
  {#if marker}
    <line x1={marker[0]} y1={marker[1]} x2={CX + (marker[0] - CX) * 0.78} y2={CY + (marker[1] - CY) * 0.78} class="base" />
  {/if}
  <text x={CX - R} y={CY + 14} class="end" text-anchor="middle">0 %</text>
  <text x={CX + R} y={CY + 14} class="end" text-anchor="middle">100 %</text>
</svg>

<style>
  svg { width: 100%; max-width: 260px; height: auto; display: block; }
  .track { fill: none; stroke: var(--soft); stroke-width: 18; stroke-linecap: round; }
  .fill { fill: none; stroke: var(--accent); stroke-width: 18; stroke-linecap: round; }
  .base { stroke: var(--ink); stroke-width: 3; stroke-linecap: round; }
  .end { font-size: 10px; fill: var(--muted); }
</style>
