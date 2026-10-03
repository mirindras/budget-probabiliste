import { mount } from 'svelte';
import App from './ui/App.svelte';
import './ui/app.css';

const supported = typeof Worker !== 'undefined' && typeof indexedDB !== 'undefined' && 'structuredClone' in globalThis;
const target = document.getElementById('app')!;
if (!supported) {
  target.innerHTML = '<p style="padding:2rem;font-family:system-ui">Navigateur trop ancien : utilisez une version récente de Chrome, Edge, Firefox ou Safari.</p>';
} else {
  mount(App, { target });
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}
