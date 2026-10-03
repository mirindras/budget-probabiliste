/** Téléchargement local d'un fichier généré dans le navigateur (aucun envoi réseau). */
export function download(data: ArrayBuffer | Blob | string, filename: string, type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
