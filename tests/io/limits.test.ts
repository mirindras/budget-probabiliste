import * as XLSX from 'xlsx';
import { compressToEncodedURIComponent } from 'lz-string';
import { describe, expect, test } from 'vitest';
import { alfaScenario } from '../../src/engine/alfa.ts';
import { budgetTemplate, ImportFailure, readCsv, readWorkbook, workbookBytes } from '../../src/io/excel.ts';
import { checkCsvText, checkFiles, checkXlsxBytes, LIMITS, unzippedSize } from '../../src/io/limits.ts';
import { encodeScenario, LINK_LIMITS, readScenario } from '../../src/io/share.ts';

const bytesOf = (wb: XLSX.WorkBook) => new Uint8Array(workbookBytes(wb));
function messages(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof ImportFailure) return e.errors.map((x) => x.message).join('\n');
    throw e;
  }
  return '';
}

describe('limites des fichiers importés, contrôlées avant lecture', () => {
  test('nombre, format et taille des fichiers', () => {
    expect(checkFiles([{ name: 'BUDGET_BASE.xlsx', size: 62_727 }])).toEqual([]);
    expect(checkFiles([{ name: 'VENTES.csv', size: 10 }, { name: 'CHARGES.CSV', size: 10 }])).toEqual([]);
    const many = Array.from({ length: LIMITS.files + 1 }, (_, i) => ({ name: `F${i}.csv`, size: 10 }));
    expect(checkFiles(many)[0].message).toMatch(/au plus/);
    expect(checkFiles([{ name: 'ancien.xls', size: 10 }])[0].message).toMatch(/format non accepté/);
    expect(checkFiles([{ name: 'budget.xlsm', size: 10 }])[0].message).toMatch(/format non accepté/);
    expect(checkFiles([{ name: 'vide.csv', size: 0 }])[0].message).toMatch(/vide/);
    expect(checkFiles([{ name: 'gros.xlsx', size: LIMITS.fileBytes + 1 }])[0].message).toMatch(/au-delà de la limite de 5 Mo/);
  });
  test('taille décompressée lue dans le répertoire central du zip', () => {
    const b = bytesOf(budgetTemplate());
    const size = unzippedSize(b)!;
    expect(size).toBeGreaterThan(b.length);
    expect(size).toBeLessThan(LIMITS.unzippedBytes);
    expect(checkXlsxBytes(b)).toEqual([]);
  });
  test('fichier qui n\'est pas un zip, zip tronqué, archive qui gonfle : refusés sans lecture', () => {
    expect(messages(() => readWorkbook(new TextEncoder().encode('<html>pas un classeur</html>')))).toMatch(/pas un classeur \.xlsx valide/);
    const b = bytesOf(budgetTemplate());
    expect(messages(() => readWorkbook(b.slice(0, 2000)))).toMatch(/corrompu ou illisible/);
    // Répertoire central falsifié : une entrée annonce 60 Mo décompressés.
    const forged = b.slice();
    const v = new DataView(forged.buffer);
    let eocd = forged.length - 22;
    while (v.getUint32(eocd, true) !== 0x06054b50) eocd--;
    const cd = v.getUint32(eocd + 16, true);
    v.setUint32(cd + 24, 60 * 1024 * 1024, true);
    expect(messages(() => readWorkbook(forged))).toMatch(/contenu décompressé de 60,1 Mo/);
  });
  test('feuilles, lignes et colonnes bornées', () => {
    const tall = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(tall, XLSX.utils.aoa_to_sheet(Array.from({ length: LIMITS.rows + 5 }, (_, i) => [i])), 'VENTES');
    expect(messages(() => readWorkbook(bytesOf(tall)))).toMatch(/plus de 50\s000 lignes/);
    const wide = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wide, XLSX.utils.aoa_to_sheet([Array.from({ length: LIMITS.columns + 1 }, (_, i) => i)]), 'VENTES');
    expect(messages(() => readWorkbook(bytesOf(wide)))).toMatch(/plus de 50 colonnes/);
    const sheets = XLSX.utils.book_new();
    for (let i = 0; i <= LIMITS.sheets; i++) XLSX.utils.book_append_sheet(sheets, XLSX.utils.aoa_to_sheet([[1]]), `F${i}`);
    expect(messages(() => readWorkbook(bytesOf(sheets)))).toMatch(/21 feuilles, 20 au plus/);
  });
  test('CSV : taille et nombre de lignes contrôlés avant lecture', () => {
    expect(checkCsvText('mois;bu\n1;Boissons\n')).toEqual([]);
    expect(checkCsvText('x\n'.repeat(LIMITS.rows + 1))[0].message).toMatch(/plus de 50\s000 lignes/);
    expect(messages(() => readCsv('x'.repeat(LIMITS.fileBytes + 1), 'VENTES'))).toMatch(/au-delà de la limite/);
    expect(readCsv('mois;bu\n1;Boissons', 'ventes').Sheets.VENTES).toBeDefined();
  });
});

describe('limites des liens de partage, contrôlées avant décompression et avant JSON', () => {
  test('lien ALFA bien sous la limite', () => {
    const code = encodeScenario(alfaScenario());
    expect(code.length).toBeLessThan(LINK_LIMITS.encoded / 2);
    expect(readScenario(code).ok).toBe(true);
  });
  test('lien trop long, caractères inattendus, contenu qui gonfle : refusés', () => {
    const long = readScenario('A'.repeat(LINK_LIMITS.encoded + 1));
    expect(long.ok || long.errors[0]).toMatch(/Lien trop long/);
    const odd = readScenario('abc<script>');
    expect(odd.ok || odd.errors[0]).toMatch(/caractères inattendus/);
    // Très compressible : 200 000 caractères de JSON tiennent dans un lien court.
    const bomb = compressToEncodedURIComponent(JSON.stringify({ x: 'a'.repeat(200_000) }));
    expect(bomb.length).toBeLessThan(LINK_LIMITS.encoded);
    const r = readScenario(bomb);
    expect(r.ok || r.errors[0]).toMatch(/trop volumineux/);
  });
});
