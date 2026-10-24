// FETCH SUR DISQUE, pour les outils lancés avec Node (jamais chargé par le
// jeu). Le jeu charge ses données par fetch avec des chemins RELATIFS au
// dossier du projet ("data/i18n/fr", "scenes/demo.json",
// "assets/manifest.json"), servis par le serveur de dev. Sous Node, il n'y
// a pas de serveur : installFileFetch() remplace fetch par une lecture du
// fichier correspondant, sous la racine du projet. Même contrat que le
// serveur : fichier absent -> réponse 404, jamais une exception.
//
// À installer AVANT d'importer un module qui charge des données à son
// import (data/i18n/index.js charge ses textes par un `await` de premier
// niveau) : d'où les imports dynamiques dans les lanceurs.

import { readFile } from "node:fs/promises";

const PROJECT_ROOT = new URL("../", import.meta.url);

export function installFileFetch() {
  globalThis.fetch = async (input) => {
    // "./x", "/x" et "x" désignent tous un fichier sous la racine du projet,
    // comme pour le serveur de dev lancé depuis cette racine.
    const path = String(input).replace(/^\.?\//, "");
    try {
      return new Response(await readFile(new URL(path, PROJECT_ROOT)), { status: 200 });
    } catch (error) {
      if (error.code === "ENOENT") return new Response("", { status: 404 });
      throw error;
    }
  };
}
