/**
 * Contrôle de la distribution SheetJS (SECURITY.md) : la dépendance xlsx doit venir du CDN officiel,
 * avec une empreinte SHA-512 dans le lockfile, et la version installée ne doit pas être vulnérable.
 * Lancer : npm run check:sheetjs (après npm ci).
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const MIN = [0, 20, 3]; // CVE-2023-30533 corrigée en 0.19.3, CVE-2024-22363 en 0.20.2
const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const entry = lock.packages?.['node_modules/xlsx'];
const errors = [];

const spec = pkg.dependencies?.xlsx ?? '';
if (!/^https:\/\/cdn\.sheetjs\.com\/xlsx-\d+\.\d+\.\d+\/xlsx-\d+\.\d+\.\d+\.tgz$/.test(spec)) errors.push(`package.json : xlsx doit pointer vers une archive du CDN officiel, trouvé « ${spec} »`);
if (!entry) errors.push('package-lock.json : entrée node_modules/xlsx absente');
else {
  if (entry.resolved !== spec) errors.push(`package-lock.json : xlsx résolu vers ${entry.resolved}, différent de package.json`);
  if (!/^sha512-[A-Za-z0-9+/]+=*$/.test(entry.integrity ?? '')) errors.push('package-lock.json : empreinte SHA-512 de xlsx absente');
}
const installed = createRequire(import.meta.url)('xlsx').version;
const v = installed.split('.').map(Number);
const lt = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
if (lt(v, MIN) < 0) errors.push(`xlsx ${installed} installé : version vulnérable, ${MIN.join('.')} au moins`);
if (entry && entry.version !== installed) errors.push(`xlsx ${installed} installé, ${entry.version} attendu par le lockfile`);

if (errors.length) {
  console.error(errors.map((e) => `✗ ${e}`).join('\n'));
  process.exit(1);
}
console.log(`SheetJS ${installed} depuis le CDN officiel, empreinte ${entry.integrity.slice(0, 19)}… vérifiée par npm ci`);
