// AUDIT DU CONTENU au terminal, avec Node — le même que auditContent() dans
// la console du jeu (tools/content-audit.js), sans navigateur ni serveur :
// scènes, registre des types, clés i18n fr/en, sons du manifeste, scènes
// citées.
//
//   node tools/run-content-audit.js
//
// Code de sortie 1 s'il reste au moins un problème.

import { installFileFetch } from "./node-fetch.js";

installFileFetch();

const { auditContent } = await import("./content-audit.js");
const { problems } = await auditContent();
process.exitCode = problems.length === 0 ? 0 : 1;
