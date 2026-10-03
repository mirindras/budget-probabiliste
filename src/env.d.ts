/// <reference types="svelte" />
/// <reference types="vite/client" />
declare const __TOOL_VERSION__: string;
interface ImportMetaEnv {
  /** « artifact » pour la page publiée dans un cadre restreint (ni impression, ni téléchargement). */
  readonly VITE_HOST?: string;
}
