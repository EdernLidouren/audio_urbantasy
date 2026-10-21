// ENREGISTREMENT d'un fichier texte généré par la page. Deux voies :
//   - la fenêtre "Enregistrer sous" NATIVE (File System Access API,
//     `showSaveFilePicker` : Chrome, Edge) — l'utilisateur choisit le dossier
//     et le nom, le fichier est écrit directement, sans téléchargement ;
//   - sinon (Firefox...), un TÉLÉCHARGEMENT vers le dossier de
//     téléchargements du navigateur.
// `canChooseSaveLocation` dit laquelle s'appliquera, pour l'annoncer à
// l'avance (ex. dans la description d'une entrée de menu).

export const canChooseSaveLocation = typeof window !== "undefined" && typeof window.showSaveFilePicker === "function";

// Téléchargement : un Blob et un lien <a download> temporaire, ATTACHÉ au
// document le temps du clic puis retiré — certains navigateurs ignorent sans
// aucune erreur le clic sur un lien détaché. Caché, jamais dans l'arbre
// d'accessibilité.
function downloadTextFile(filename, text, type = "application/json") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Révoqué après coup : laisse au navigateur le temps d'amorcer le
  // téléchargement avant de libérer l'URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Enregistre `text` sous `filename` (nom proposé) et rend une promesse du
// résultat, pour que l'appelant l'annonce :
//   - "saved"      : écrit à l'emplacement choisi dans la fenêtre native ;
//   - "cancelled"  : fenêtre native fermée sans enregistrer ;
//   - "downloaded" : téléchargement lancé (pas de fenêtre native, ou elle a
//                    été refusée par le navigateur).
// À appeler DIRECTEMENT depuis le geste de l'utilisateur (une touche) : la
// fenêtre native exige une activation récente. `description` : le libellé du
// type de fichier dans la fenêtre native.
export async function saveTextFile(filename, text, { type = "application/json", extension = ".json", description = "JSON" } = {}) {
  if (canChooseSaveLocation) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description, accept: { [type]: [extension] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      return "saved";
    } catch (error) {
      if (error && error.name === "AbortError") return "cancelled";
      // Fenêtre refusée (activation trop ancienne, contexte non sûr...) :
      // repli sur le téléchargement plutôt qu'un échec silencieux.
      console.warn(`saveTextFile: fenêtre d'enregistrement indisponible (${error && error.message}), repli sur un téléchargement.`);
    }
  }
  downloadTextFile(filename, text, type);
  return "downloaded";
}
