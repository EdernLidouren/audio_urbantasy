// STOCKAGE de variables en jeu (flags booléens + entiers) — mécanisme
// GÉNÉRIQUE, réutilisé À L'IDENTIQUE par les trois PORTÉES (voir
// CLAUDE.md/core/scripting.md) :
//   - ENTITÉ  : core/scene.js/parseEntity attache le sac résolu à l'entité.
//   - SCÈNE   : core/scene.js/parseScene attache le sac résolu au monde
//     (racine PARTAGÉE entre recto/verso, jamais par face — voir header de
//     parseScene).
//   - PARTIE  : core/state.js/createInitialState attache le sac résolu à la
//     session (cercle partie, comme money/bag/equipment).
// Un seul mécanisme paramétré par OÙ l'appelant range le résultat — jamais
// trois systèmes séparés. Ce fichier ne connaît AUCUN des trois porteurs par
// leur nom, seulement la FORME générique { name -> { type, initial,
// persistent, value } }.
//
// BRANCHÉ sur les conditions (LECTURE, condition "variable" — voir
// core/presence.js/evaluateVariable) et les actions (ÉCRITURE, effets
// setVariable/toggleVariable/addVariable — voir core/scene.js/
// parseActionEffect, applyActionEffects ci-dessous). getVariable/setVariable
// restent le SEUL point d'accès bas niveau ; applyActionEffects les enchaîne
// pour une LISTE d'effets déjà validée, sans connaître elle-même le SENS
// d'un effet au-delà de son `type`.
//
// applyActionEffects (plus bas) est en réalité le point d'entrée PARTAGÉ de
// TOUT effet d'ÉTAT d'une action, pas seulement les variables — voir
// core/effects.js/STATE_EFFECT_TYPES : giveImprovement/removeImprovement
// (core/improvements.js) y sont appliqués dans le MÊME passage, faute
// d'un second point d'entrée générique côté vue (view/interaction.js/
// runEffects délègue TOUS les effets d'état ICI, en un seul appel).

import { giveImprovement, removeImprovement } from "./improvements.js";

export const VARIABLE_TYPES = ["flag", "int"];

// Portées reconnues par getVariable/setVariable ci-dessous — noms COURTS et
// stables (vocabulaire de l'API), distincts des mots français "entité/
// scène/partie" utilisés en documentation/commentaires.
export const VARIABLE_SCOPES = ["entity", "scene", "party"];

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

// Une VALEUR est cohérente avec un TYPE si : "flag" -> booléen strict ;
// "int" -> nombre ENTIER strict (jamais un flottant, jamais une chaîne
// numérique) — les deux seuls types du système (voir header, "flottants/
// chaînes viendront si un cas concret les réclame"). EXPORTÉE : réutilisée
// TELLE QUELLE par core/scene.js pour valider la cohérence type/valeur des
// effets d'écriture (setVariable.value, addVariable.amount) et le
// comparateur d'une condition "variable" — jamais une seconde définition.
export function isValidValueForType(type, value) {
  if (type === "flag") return typeof value === "boolean";
  if (type === "int") return typeof value === "number" && Number.isInteger(value);
  return false;
}

// Valide et construit le sac de variables d'UN porteur — RÉUTILISÉE À
// L'IDENTIQUE par core/scene.js (entité, scène) et core/state.js (partie),
// `fail` fourni par l'appelant (même patron que core/scene.js/parseBehavior)
// pour que le message porte le préfixe du bon appelant, jamais dupliqué ici.
//
// ABSENCE / MALFORMATION (voir CLAUDE.md, "rendre les états illégaux
// non-représentables") : `raw` ABSENT -> sac vide `{}`, jamais une erreur —
// un porteur sans variable déclarée est un cas normal, pas un défaut de
// contenu. `raw` PRÉSENT mais malformé (pas un tableau, élément mal formé,
// nom dupliqué/vide, type inconnu, valeur initiale incohérente avec le
// type, persistent d'un mauvais type) -> erreur claire, comme tout autre
// champ de contenu validé au chargement.
//
// PERSISTANCE : `persistent` absent -> `true` (défaut SÛR, voir header —
// en cas d'oubli, on garde un peu de bruit plutôt que de perdre de la
// progression). `value` initialisée à `initial` : une variable fraîchement
// déclarée (partie neuve, monde jamais visité, entité jamais rencontrée)
// part toujours de son point de départ déclaré.
export function parseVariables(raw, describe, fail) {
  if (raw === undefined) return {};
  if (!Array.isArray(raw)) fail(`${describe} doit être un tableau si présent.`);

  const variables = {};
  raw.forEach((rawVariable, index) => {
    const itemDescribe = `${describe}[${index}]`;
    if (typeof rawVariable !== "object" || rawVariable === null) {
      fail(`${itemDescribe} n'est pas un objet.`);
    }
    const { name, type, initial, persistent } = rawVariable;
    if (!isNonEmptyString(name)) {
      fail(`${itemDescribe}.name manquant ou invalide.`);
    }
    if (variables[name] !== undefined) {
      fail(`${itemDescribe}.name "${name}" est dupliqué.`);
    }
    if (!VARIABLE_TYPES.includes(type)) {
      fail(`${itemDescribe}.type "${type}" inconnu (attendu : ${VARIABLE_TYPES.join(" | ")}).`);
    }
    if (!isValidValueForType(type, initial)) {
      fail(`${itemDescribe}.initial incohérent avec le type "${type}" (reçu : ${JSON.stringify(initial)}).`);
    }
    if (persistent !== undefined && typeof persistent !== "boolean") {
      fail(`${itemDescribe}.persistent doit être un booléen si présent.`);
    }
    variables[name] = {
      type,
      initial,
      persistent: persistent !== undefined ? persistent : true,
      value: initial,
    };
  });
  return variables;
}

// Clé de `context` portant le PORTEUR d'une portée — SEULE table à
// connaître que "scene" lit `world` et "party" lit `session` (vocabulaire
// interne de core/state.js — "session" reste le nom du champ JS, "party"
// est le mot de la PORTÉE, exactement comme "scene"/`world`). EXPORTÉE :
// réutilisée par applyActionEffects ci-dessous pour recomposer `context`
// après chaque effet, sans dupliquer cette correspondance.
export const SCOPE_CONTEXT_KEYS = { entity: "entity", scene: "world", party: "session" };

// Résout le PORTEUR concerné par une portée, depuis un `context` générique
// { entity?, world?, session? } — le consommateur (condition/action)
// construit ce contexte comme il l'entend. Portée inconnue -> undefined,
// jamais une exception (même repli défensif que evaluateCondition sur un
// type de condition inconnu, core/presence.js).
function carrierForScope(context, scope) {
  return context?.[SCOPE_CONTEXT_KEYS[scope]];
}

// Lecture PURE d'une variable, par portée + nom — POINT D'ENTRÉE UNIQUE que
// le futur type de condition "variable" réutilisera. Nom inconnu (jamais
// déclaré, ou porteur qui ne porte aucun sac) -> undefined, jamais une
// exception : un contenu qui référence un nom disparu/mal orthographié se
// dégrade proprement, comme le reste de l'aiguillage par registre de ce
// projet.
export function getVariable(context, scope, name) {
  const carrier = carrierForScope(context, scope);
  const variable = carrier?.variables?.[name];
  return variable ? variable.value : undefined;
}

// Écriture PURE : renvoie le PORTEUR (pas le contexte entier — recomposer
// l'état complet reste à la charge de l'appelant, voir applyActionEffects
// ci-dessous pour un ENCHAÎNEMENT d'effets, ou le splice manuel qu'un
// consommateur unique doit faire lui-même) avec la variable mise à jour, ou
// LE PORTEUR INCHANGÉ (même référence) si le nom est inconnu ou si la
// valeur ne correspond pas au type déclaré — jamais une exception À
// L'ÉCRITURE (contrairement à parseVariables, strict au CHARGEMENT) : une
// future action mal formée doit se dégrader silencieusement, pas
// interrompre la partie en cours, même politique que core/state.js/
// removeEntity sur un id absent.
export function setVariable(context, scope, name, value) {
  const carrier = carrierForScope(context, scope);
  const variable = carrier?.variables?.[name];
  if (!variable || !isValidValueForType(variable.type, value)) return carrier;
  return { ...carrier, variables: { ...carrier.variables, [name]: { ...variable, value } } };
}

// Applique une LISTE d'effets D'ÉCRITURE déjà validée (voir
// core/scene.js/parseActionEffect — setVariable/toggleVariable/addVariable,
// core/scripting.md/"Effets d'action") à un `context` de variables — POINT
// D'ENTRÉE que view/interaction.js (activation d'une action) réutilise pour
// appliquer TOUS les effets d'une action choisie EN UNE FOIS. Enchaîne les
// effets SÉQUENTIELLEMENT (le `context` progresse d'un effet au suivant,
// jamais recalculé depuis l'original) : deux effets qui touchent la MÊME
// variable dans la MÊME liste s'appliquent donc dans l'ordre déclaré, sans
// s'écraser l'un l'autre. `toggleVariable`/`addVariable` LISENT la valeur
// COURANTE (déjà mise à jour par un effet précédent de CETTE liste, le cas
// échéant) via getVariable, puis délèguent à setVariable — aucune logique
// d'écriture dupliquée. Renvoie le `context` final (mêmes clés que
// l'entrée : entity/world/session, ceux non touchés restent inchangés),
// à SPLICER dans l'état par l'appelant, exactement comme setVariable seul.
export function applyActionEffects(effects, context) {
  return effects.reduce((ctx, effect) => {
    const key = SCOPE_CONTEXT_KEYS[effect.scope];
    if (effect.type === "setVariable") {
      return { ...ctx, [key]: setVariable(ctx, effect.scope, effect.name, effect.value) };
    }
    if (effect.type === "toggleVariable") {
      const current = getVariable(ctx, effect.scope, effect.name);
      return { ...ctx, [key]: setVariable(ctx, effect.scope, effect.name, !current) };
    }
    if (effect.type === "addVariable") {
      const current = getVariable(ctx, effect.scope, effect.name);
      return { ...ctx, [key]: setVariable(ctx, effect.scope, effect.name, (current ?? 0) + effect.amount) };
    }
    // giveImprovement/removeImprovement (core/improvements.js) : TOUJOURS
    // portée PARTIE — même clé de contexte ("session") qu'une variable
    // scope "party" (SCOPE_CONTEXT_KEYS.party), jamais un champ `scope` à
    // lire sur l'effet (une improvement n'a qu'UN porteur possible, le
    // joueur, contrairement à une variable). `ctx.session` absent -> `ctx`
    // INCHANGÉ (même repli défensif que carrierForScope/setVariable
    // ci-dessus sur un contexte incomplet), jamais une exception : latent
    // aujourd'hui (le seul appelant, core/state.js/applyEntityActionEffects,
    // fournit toujours `session`), mais aligné sur la même discipline
    // défensive que le reste de ce fichier plutôt que de faire exception.
    if (effect.type === "giveImprovement") {
      if (!ctx.session) return ctx;
      return { ...ctx, session: { ...ctx.session, improvements: giveImprovement(ctx.session.improvements, effect.id) } };
    }
    if (effect.type === "removeImprovement") {
      if (!ctx.session) return ctx;
      return { ...ctx, session: { ...ctx.session, improvements: removeImprovement(ctx.session.improvements, effect.id) } };
    }
    return ctx;
  }, context);
}
