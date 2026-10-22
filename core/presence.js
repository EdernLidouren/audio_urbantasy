// Système de RÈGLES déclaratives génériques : condition -> EFFET(S). Pur,
// headless — aucune connaissance de Howler/DOM. Couvre la présence
// conditionnelle ET tout ce qu'une condition peut déclencher d'autre
// ("triggers de comportement") — MÊME registre de conditions, MÊME
// évaluateur, PAS un second système séparé.
//
// Une entité porte OPTIONNELLEMENT `presence` : une liste de règles
// `{ when: <condition>, effects: [<effet>...] }`, évaluées DANS L'ORDRE.
// Entité SANS champ `presence` du tout -> TOUJOURS présente, sans aucun
// calcul de règle. RACCOURCI pour le cas le plus courant, la présence
// seule : `{ when, present: boolean }` SANS `effects`, sucre pour `{ when,
// effects: [{ type: "presence", present }] }` — voir ruleEffect.
// core/script-parse.js/parsePresenceRule normalise déjà ce raccourci en
// forme canonique au chargement ; ruleEffect le comprend
// aussi directement, pour tout appelant qui construit une règle à la main
// (ex. core/checks/conditions.check.js) sans passer par parseScene.
//
// DEUX aiguillages EXTENSIBLES, de nature différente :
//   - CONDITION_EVALUATORS (registre) : chaque entrée est juste "condition +
//     context -> booléen", uniforme -> un registre suffit,
//     core/script-parse.js/validateCondition valide `when.type` contre ses
//     clés (CONDITION_TYPES). "timeRange"
//     (dérivée de l'horloge) et "arrived" (dérivée d'un FAIT de simulation,
//     `entity.gotoArrived` — événementielle, pas temporelle) cohabitent
//     sans qu'isPresent/resolveEntityRules n'aient à savoir laquelle c'est.
//   - Types d'EFFET ("presence", "behavior") : PAS un registre pareil,
//     aiguillage explicite (voir core/script-parse.js/parseEffect) — un effet a une
//     validation et une APPLICATION propres à son type (une chaîne booléenne
//     idempotente pour "presence" ; une bascule anti-boucle + une
//     sous-validation complète de comportement pour "behavior", voir
//     resolveEntityRules et core/parse-common.js/parseBehavior réutilisé tel quel).
//     Ajouter un effet demain = ajouter un cas à ces DEUX endroits, jamais
//     toucher au reste — même esprit d'extensibilité, mécanique adaptée à
//     l'hétérogénéité des effets plutôt qu'un registre forcé pour deux cas.
//
// PRIORITÉ entre règles (plusieurs peuvent matcher le même tick) : l'ordre
// du tableau `presence` fait foi pour la présence (la PREMIÈRE règle dont
// `when` est vrai ET qui porte un effet "presence" décide — voir
// resolveEntityRules, IGNORE les règles qui matchent mais n'ont pas cet
// effet, continue d'en chercher une qui en a). Les effets "behavior", eux,
// ne se disputent PAS un rang : ils s'appliquent chacun indépendamment,
// SEULEMENT sur la bascule de LEUR PROPRE condition (voir plus bas) — un
// contenu bien conçu n'a qu'une seule condition de comportement vraie à la
// fois (ex. l'habitant, doc/entity-model.md), mais rien n'empêche techniquement
// d'en déclarer deux qui se chevauchent : la dernière de la liste gagnerait
// alors simplement (dernière affectation), sans crash.
//
// `context` : les morceaux d'état qu'un évaluateur peut avoir besoin de
// lire — `time` (minutes de jeu, voir core/time.js), perceptionActive,
// weather, world, session (voir presenceContextOf plus bas), partagés par
// toutes les entités d'un même tick, PLUS `entity` (l'entité évaluée
// elle-même, ajouté ICI par resolveEntityRules/isPresent avant tout appel à
// evaluateCondition) pour les conditions qui portent sur un FAIT propre à
// l'entité (ex. "arrived"). Étendre le contexte ne change jamais la
// signature de evaluateCondition, seulement ce que context transporte.

import { equippedTags } from "./equipment.js";
import { temporalThresholdOffset } from "./temporal-spread.js";
import { TIME_CONFIG } from "../config/time-values.js";
import { MINUTES_PER_DAY } from "./time.js";
import { getVariable } from "./variables.js";
import { hasImprovement } from "./improvements.js";
import { isDebugEnabled } from "../config/debug.js";

// Valeur numérique importée directement (le core peut lire une valeur de
// config, jamais un registre de contenu) — pas via core/time.js, dont les dérivations (hourOfDay) tronquent
// à l'heure ENTIÈRE, insuffisant ici : un spread de quelques minutes doit
// rester observable (voir hourOfDayFraction ci-dessous).
const { minutesPerHour, hoursPerDay } = TIME_CONFIG;

// Heure du jour EN CONTINU (fractionnaire), contrairement à
// core/time.js/hourOfDay (entier) — nécessaire UNIQUEMENT ici : comparer un
// seuil décalé de quelques minutes à une heure arrondie à l'entier rendrait
// ce décalage invisible (hour >= 20.1 se comporte comme hour >= 21).
function hourOfDayFraction(time) {
  return (Math.floor(time) % MINUTES_PER_DAY) / minutesPerHour;
}

// Ramène une heure décalée dans [0, hoursPerDay[ — un décalage peut pousser
// from/to de l'autre côté de minuit, en plus du passage par minuit "de
// contenu" déjà géré par la comparaison from/to plus bas (deux passages par
// minuit distincts, jamais confondus : celui du DÉCALAGE ici, celui de la
// FENÊTRE elle-même dans evaluateTimeRange).
function wrapHour(hour) {
  return ((hour % hoursPerDay) + hoursPerDay) % hoursPerDay;
}

// "timeRange" : présente si l'heure courante (dérivée de context.time) tombe
// dans [from, to[, EN GÉRANT le passage par minuit (from > to, ex. 20..6) —
// même convention demi-ouverte que core/time.js/phaseAt. from === to, ou
// l'un des deux non fini -> jamais vraie (intervalle vide/malformé), plutôt
// qu'une ambiguïté "toujours" ou "jamais" non documentée ou un throw pour
// une donnée de contenu déjà validée en forme au chargement
// (core/script-parse.js/validateCondition).
//
// VARIATION DE SEUIL PAR INSTANCE (cond.spread, en MINUTES, optionnel) —
// voir doc/scripting.md/"spread" : désynchronise des entités qui partagent
// la MÊME règle temporelle (ex. plusieurs PNJ "vers 6h", chacun décalé de
// quelques minutes, jamais tous pile à l'heure). Décalage dérivé de façon
// DÉTERMINISTE de l'id d'entité + les bornes de la règle (voir
// core/temporal-spread.js) — jamais stocké, recalculé à CHAQUE évaluation,
// donc STABLE à travers ticks, rechargements et re-visites de scène.
// Appliqué IDENTIQUEMENT à from ET to : la fenêtre entière glisse, sa
// largeur ne change jamais. context.entity absent (ex. une condition
// évaluée sans entité, comme dans core/checks/conditions.check.js) ou
// spread absent/nul -> décalage nul, seuil pile à l'heure déclarée.
function evaluateTimeRange(cond, context) {
  const { from, to, spread } = cond;
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return false;
  const offset = context.entity ? temporalThresholdOffset(context.entity.id, from, to, spread) : 0;
  const effectiveFrom = wrapHour(from + offset);
  const effectiveTo = wrapHour(to + offset);
  const hour = hourOfDayFraction(context.time);
  return effectiveFrom < effectiveTo ? hour >= effectiveFrom && hour < effectiveTo : hour >= effectiveFrom || hour < effectiveTo;
}

// "arrived" : vraie si le comportement ACTIF de l'entité est ENCORE "goto"
// ET que ce goto a atteint sa cible (entity.gotoArrived, voir
// core/behaviors/goto.js). Liée au comportement ACTIF plutôt qu'au seul
// drapeau `gotoArrived` (jamais remis à false par goto.js une fois posé,
// voir son header) : sans cette garde, une entité qui a déjà atteint une
// cible par le passé, puis dont le comportement a depuis été remplacé (ex.
// par un effet "behavior" qui la fait repartir en "wander"), redeviendrait
// FAUSSEMENT "arrivée" pour toujours — c'est PRÉCISÉMENT ce que ce garde-fou
// évite, sans jamais avoir à réinitialiser `gotoArrived` ailleurs (aucun
// module n'a besoin de connaître ce détail de goto.js).
function evaluateArrived(cond, context) {
  const entity = context.entity;
  return Boolean(entity && entity.behavior && entity.behavior.kind === "goto" && entity.gotoArrived === true);
}

// LIMITE CONNUE (transition manquée sur un grand saut de temps sans tick
// intermédiaire) : la garde ci-dessus se corrige seule au tick SUIVANT une
// vraie observation de la bascule (voir resolveEntityRules), mais si
// AUCUN tick n'a lieu pendant tout le créneau où une règle de comportement
// serait repassée à faux (ex. onglet mis en arrière-plan assez longtemps
// pour que l'horloge de partie — non plafonnée, voir lib/loop.js/onFrame —
// franchisse la fenêtre "8h..24h" ENTIÈREMENT avant le tick suivant ; ou,
// dans un monde à monde actif unique — voir core/reduce.js —, un monde
// resté INACTIF pendant qu'une telle fenêtre se referme puis se rouvre
// ailleurs), la bascule manquée reste "collée" jusqu'à la PROCHAINE
// bascule réelle de cette même règle — potentiellement bien plus tard.
// Non corrigé ici : corriger nécessiterait soit de plafonner l'horloge de
// partie (hors de portée de ce module), soit un mécanisme de rattrapage
// hors du principe "un seul monde actif avance" (voir header de
// core/reduce.js) — délibérément pas construit sans une demande explicite.

// "consumed" : vraie si l'entité porte entity.consumed === true (voir
// core/state.js/markConsumed) — permet à un COLLECTIBLE PERSISTANT (voir
// doc/entity-model.md/"Collectible persistant") de composer l'effet POST-
// ACTIVATION "devient dormant" avec ce même système de présence
// conditionnelle, jamais un mécanisme séparé (ajouter "consumed" ici suffit,
// exactement comme "timeRange"/"arrived" — aucune retouche à isPresent/
// resolveEntityRules/core/reduce.js). PERMANENTE par construction : consumed
// ne repasse jamais à false (voir markConsumed), donc une règle { when:
// { type: "consumed" }, present: false } bascule une fois pour toutes,
// sans aucune condition de réveil à écrire.
function evaluateConsumed(cond, context) {
  return Boolean(context.entity && context.entity.consumed);
}

// "hasEquipmentTag" : vraie si le JOUEUR (context.playerEquipment — PAS
// context.entity, voir plus bas) porte, dans son PROPRE équipement, un
// objet marqué de ce tag — voir core/equipment.js/equippedTags, qui fait
// déjà tout le travail d'union et ignore le type de porteur. Contexte sans
// équipement joueur (ex. hors d'une interaction) -> false, jamais une
// exception — même repli défensif que evaluateArrived/evaluateConsumed
// ci-dessus. cond.tag est validé contre TAG_REGISTRY au chargement (voir
// core/script-parse.js/validateCondition), jamais ici (cet évaluateur ne fait que LIRE une clé déjà
// garantie valide).
//
// CLÉ DE CONTEXTE DÉDIÉE, PAS context.entity : contrairement à TOUT autre
// évaluateur de ce fichier, "hasEquipmentTag" porte sur le JOUEUR qui
// DÉCLENCHE une action conditionnelle, jamais sur l'entité qui PORTE la
// condition (une porte n'a pas d'équipement) — voir
// view/interaction.js/actionConditionMet. context.entity, LUI, désigne
// TOUJOURS l'entité qui porte la condition évaluée (l'entité elle-même pour
// presence[].when ; l'entité qui déclare l'action pour action.condition,
// voir evaluateVariable plus bas) — les deux rôles ne peuvent PAS partager
// la même clé sans se marcher dessus dès qu'une condition "variable" (scope
// "entity") et une condition "hasEquipmentTag" coexistent (ex. dans un
// allOf) sur la MÊME action.
function evaluateHasEquipmentTag(cond, context) {
  const equipment = context.playerEquipment;
  return Boolean(equipment && equippedTags(equipment).has(cond.tag));
}

// "hasImprovement" : vraie si le joueur possède l'AMÉLIORATION `cond.id`
// (voir core/improvements.js/IMPROVEMENT_REGISTRY, session.improvements).
// Lit `context.session.improvements` — MÊME clé que la portée "party" d'une
// condition "variable" (voir SCOPE_CONTEXT_KEYS, core/variables.js) : une
// improvement est cercle PARTIE comme une variable de partie, jamais un
// second mécanisme de contexte. Contexte sans `session` (ex. une condition
// d'action avant que la vue ait câblé son fournisseur de session, voir
// view/interaction.js/actionContext) -> `context.session` vaut `undefined` ->
// `hasImprovement` replie sur `false`, même politique défensive que le
// reste de ce fichier.
//
// COURT-CIRCUIT DEBUG (config/debug.js/isDebugEnabled) : en mode debug,
// cette RÉSOLUTION répond TOUJOURS vrai, SANS même consulter
// `context.session` — l'état RÉEL (session.improvements) n'est ni lu ni
// modifié, le joueur ne possède réellement RIEN de plus. Couper le debug
// fait retomber INSTANTANÉMENT sur l'état réel au prochain appel (aucune
// trace laissée, aucune écriture jamais eu lieu) : un court-circuit sur la
// LECTURE seule, jamais sur l'ÉCRITURE — giveImprovement/removeImprovement
// (core/variables.js/applyActionEffects) ignorent totalement ce drapeau,
// l'effet réel d'un giveImprovement n'est jamais court-circuité.
// `context.debugShortCircuit === false` : l'appelant veut l'état RÉEL même
// en debug (la carte de la ville, qui montre le plan tel que le joueur le
// voit — même choix que l'onglet Améliorations).
function evaluateHasImprovement(cond, context) {
  if (isDebugEnabled() && context.debugShortCircuit !== false) return true;
  return hasImprovement(context.session && context.session.improvements, cond.id);
}

// "perceptionActive" : vraie si la PERCEPTION SURNATURELLE (voir
// core/state.js/togglePerception, session.perceptionActive) est actuellement
// active. Sans champ propre — comme "arrived"/"consumed" — elle lit
// context.perceptionActive (posé par presenceContextOf pour le tick,
// PARTAGÉ par tout le tick comme context.time, et par
// view/interaction.js/actionContext pour une condition d'action), jamais
// context.entity : une entité SURNATURELLE n'est rien de plus qu'une entité
// normale dont la présence est conditionnée par CETTE condition (voir
// entities/types/ghost.js) — aucun mécanisme séparé, aucun champ d'entité
// dédié. Absent (contexte construit sans session) -> false, même repli
// défensif que les autres évaluateurs.
function evaluatePerceptionActive(cond, context) {
  return Boolean(context.perceptionActive);
}

// "weather" : vraie si l'état météo courant (context.weather, dérivé de
// session.weather.state — core/weather.js — par presenceContextOf ou
// view/interaction.js/actionContext) est EXACTEMENT cond.state. Sans état
// dans le contexte (contexte construit sans session) -> false, même repli
// défensif que perceptionActive. cond.state validé au chargement contre
// config/weather-values.js/WEATHER_STATES (core/script-parse.js/validateCondition),
// comme hasEquipmentTag.tag contre TAG_REGISTRY.
function evaluateWeather(cond, context) {
  return context.weather !== undefined && context.weather === cond.state;
}

// "allOf" : condition COMPOSITE — vraie si TOUTES les sous-conditions de
// cond.conditions le sont (ET logique). Délègue à evaluateCondition pour
// CHAQUE sous-condition (aucune connaissance de leur type précis ici, une
// sous-condition peut être n'importe quel type du registre, y compris un
// autre "allOf" imbriqué) — MÊME registre, MÊME évaluateur, jamais un
// mécanisme de composition séparé (voir doc/scripting.md). cond.conditions
// validé au chargement (core/script-parse.js/validateCondition, tableau non vide,
// chaque élément validé récursivement) : jamais lu ici sans garantie de
// forme. Court-circuite via Array.prototype.every (s'arrête à la première
// fausse), sans effet observable puisque tous les évaluateurs sont purs.
function evaluateAllOf(cond, context) {
  return cond.conditions.every((sub) => evaluateCondition(sub, context));
}

// "not" : condition COMPOSITE — vraie si SA sous-condition (cond.condition)
// est fausse (négation logique). Même patron qu'allOf : délègue à
// evaluateCondition, n'importe quel type du registre (y compris allOf ou un
// autre not). cond.condition validée au chargement (core/script-parse.js/
// validateCondition, obligatoire, revalidée récursivement).
function evaluateNot(cond, context) {
  return !evaluateCondition(cond.condition, context);
}

// "variable" : LECTURE d'une variable (voir core/variables.js/getVariable)
// avec COMPARAISON — { type:"variable", scope, name, <comparateur>:
// valeur }. Un SEUL comparateur par condition (voir core/script-parse.js/
// validateCondition, qui l'exige) : "equals" (flag ET int) ou, pour un int
// seulement, "greaterThan"/"lessThan"/"greaterOrEqual"/"lessOrEqual" — déjà
// validés au chargement contre le TYPE réel de la variable quand il est
// connu (portées "entity"/"scene" ; "party" échappe à cette vérification,
// voir validateVariableReference). getVariable résout le PORTEUR selon
// `scope` depuis context.entity/world/session — context.entity porte ICI
// l'entité qui PORTE la condition (l'entité elle-même pour presence[].when,
// celle qui déclare l'action pour action.condition, voir
// evaluateHasEquipmentTag plus haut pour la distinction avec le JOUEUR).
// Variable introuvable (nom jamais déclaré, ou porteur absent du contexte,
// ex. "scene"/"party" dans un contexte construit sans session) ->
// undefined -> AUCUN comparateur ne peut être vrai, repli défensif comme le
// reste de ce fichier.
function evaluateVariable(cond, context) {
  const value = getVariable(context, cond.scope, cond.name);
  if (value === undefined) return false;
  if (cond.equals !== undefined) return value === cond.equals;
  if (cond.greaterThan !== undefined) return value > cond.greaterThan;
  if (cond.lessThan !== undefined) return value < cond.lessThan;
  if (cond.greaterOrEqual !== undefined) return value >= cond.greaterOrEqual;
  if (cond.lessOrEqual !== undefined) return value <= cond.lessOrEqual;
  return false;
}

// Registre des évaluateurs par type — SEUL endroit qui connaît les types de
// condition. core/script-parse.js/validateCondition valide `when.type` au
// chargement contre les clés de CE MÊME registre (CONDITION_TYPES
// ci-dessous) : ajouter un type ici le rend automatiquement acceptable en
// contenu, sans dupliquer la liste. "hasEquipmentTag" cohabite avec
// "timeRange"/"arrived"/"consumed" comme un cas de plus, pas un système de
// vérification séparé — la seule différence est que validateCondition
// valide EN PLUS son champ `tag` contre TAG_REGISTRY, une garantie dont
// timeRange/arrived/consumed n'ont pas besoin (aucune clé de contenu
// externe à valider). Même esprit pour "variable" : validateCondition
// valide EN PLUS scope/name/comparateur (voir
// core/script-parse.js/validateVariableReference).
//
// `fields` : les champs que lit l'évaluateur, en plus de `type` — tout autre
// champ est rejeté au chargement (voir core/script-parse.js/
// validateCondition), à côté de l'évaluateur qui les lit pour ne jamais
// diverger.
const CONDITION_EVALUATORS = {
  timeRange: { evaluate: evaluateTimeRange, fields: ["from", "to", "spread"] },
  arrived: { evaluate: evaluateArrived, fields: [] },
  consumed: { evaluate: evaluateConsumed, fields: [] },
  hasEquipmentTag: { evaluate: evaluateHasEquipmentTag, fields: ["tag"] },
  hasImprovement: { evaluate: evaluateHasImprovement, fields: ["id"] },
  perceptionActive: { evaluate: evaluatePerceptionActive, fields: [] },
  weather: { evaluate: evaluateWeather, fields: ["state"] },
  allOf: { evaluate: evaluateAllOf, fields: ["conditions"] },
  not: { evaluate: evaluateNot, fields: ["condition"] },
  variable: {
    evaluate: evaluateVariable,
    fields: ["scope", "name", "equals", "greaterThan", "lessThan", "greaterOrEqual", "lessOrEqual"],
  },
};

export const CONDITION_TYPES = Object.keys(CONDITION_EVALUATORS);

// Champs propres à un type de condition (voir `fields` ci-dessus).
export function conditionFields(type) {
  return CONDITION_EVALUATORS[type].fields;
}

// Type inconnu -> false, jamais un throw : l'aiguillage runtime dégrade la
// présence concernée plutôt que de faire planter toute la simulation
// (core/script-parse.js/validateCondition a de toute façon déjà rejeté un
// type inconnu au chargement — ce repli ne couvre qu'un appel direct hors du chemin validé,
// ex. depuis core/checks/conditions.check.js).
export function evaluateCondition(cond, context) {
  const evaluator = CONDITION_EVALUATORS[cond.type];
  return evaluator ? evaluator.evaluate(cond, context) : false;
}

// Un effet d'un TYPE donné porté par une règle — accepte la forme CANONIQUE
// (`effects: [...]`) et, en repli, le raccourci `{ when, present }` sans
// `effects` (voir header). `undefined` si la règle ne porte aucun effet de
// ce type (l'appelant continue de chercher ailleurs, voir
// resolveEntityRules).
function ruleEffect(rule, type) {
  if (Array.isArray(rule.effects)) {
    return rule.effects.find((effect) => effect.type === type);
  }
  if (type === "presence" && typeof rule.present === "boolean") {
    return { type: "presence", present: rule.present };
  }
  return undefined;
}

// Résout, EN UNE PASSE, tout ce qu'une entité tire de ses règles pour ce
// tick :
//   - present : la présence résolue (voir header, priorité de règle) ;
//   - presenceChanged : la bascule de présence OBSERVÉE (voir
//     core/reduce.js/stepEntities) ;
//   - ruleActive : tableau parallèle à `entity.presence`, l'état ACTIF
//     (condition vraie ou non) de CHAQUE règle ce tick — à reporter par
//     l'appelant sur l'entité (`entity.ruleActive`) pour la comparaison du
//     tick suivant, seule mémoire nécessaire à la garde anti-boucle des
//     effets "behavior" (index de tableau utilisé comme identifiant stable
//     de règle : `entity.presence` est figé au chargement, jamais réordonné
//     en cours de partie) ;
//   - behaviorEffect : le comportement à POSER ce tick si un effet
//     "behavior" vient de basculer (voir plus bas), `null` si cet effet est
//     un RETRAIT explicite (voir core/script-parse.js/parseEffect), `undefined`
//     si aucun effet "behavior" n'a basculé — trois valeurs distinctes,
//     jamais confondues par l'appelant (core/reduce.js compare à
//     `undefined`, jamais un test de vérité).
// Sans `entity.presence` : present toujours vrai, rien d'autre à calculer —
// une entité sans règle n'est jamais touchée par ce mécanisme.
export function resolveEntityRules(entity, context) {
  if (!entity.presence) {
    return { present: true, presenceChanged: null, ruleActive: undefined, behaviorEffect: undefined };
  }

  const ruleContext = { ...context, entity };
  const previousActive = entity.ruleActive;
  const ruleActive = [];
  let present = false;
  let presentDecided = false;
  let behaviorEffect;

  entity.presence.forEach((rule, index) => {
    const active = evaluateCondition(rule.when, ruleContext);
    ruleActive.push(active);

    // Présence : la PREMIÈRE règle (dans l'ordre) dont la condition est
    // vraie ET qui porte un effet "presence" décide — réévaluée à CHAQUE
    // tick sans mémoire (un booléen est trivialement idempotent à
    // recalculer, contrairement à "behavior" ci-dessous).
    if (active && !presentDecided) {
      const effect = ruleEffect(rule, "presence");
      if (effect) {
        present = effect.present;
        presentDecided = true;
      }
    }

    // Comportement : effet appliqué SEULEMENT sur la bascule de SA PROPRE
    // condition (faux -> vrai), jamais réappliqué en continu tant qu'elle
    // reste vraie (sinon un goto déjà arrivé, ou un wander déjà en cours,
    // serait sans cesse réarmé — voir header). Le TOUT PREMIER calcul pour
    // cette entité (previousActive encore absent) compte comme une
    // transition depuis "faux" : CONTRAIREMENT à presenceChanged plus bas
    // (qui protège un signal AUDIBLE d'un faux déclenchement au montage),
    // rien ici ne doit être protégé d'un son fantôme — et NE PAS le faire
    // laisserait une entité chargée en cours de fenêtre (ex. la scène
    // ouverte à 22h, en pleine période "goto") bloquée sur son comportement
    // DÉCLARÉ jusqu'à la bascule suivante, potentiellement un jour entier
    // plus tard.
    const wasActive = previousActive ? previousActive[index] === true : false;
    if (active && !wasActive) {
      const effect = ruleEffect(rule, "behavior");
      if (effect) behaviorEffect = effect.behavior;
    }
  });

  const previousPresent = entity.present;
  const presenceChanged =
    typeof previousPresent === "boolean" && previousPresent !== present ? (present ? "entered" : "exited") : null;

  return { present, presenceChanged, ruleActive, behaviorEffect };
}

// Contexte d'évaluation des règles de présence pour le monde ACTIF — SOURCE
// UNIQUE, partagée par le TICK (core/reduce.js) et par la vue quand elle
// doit connaître une présence hors tick (view/audio/entity-sound-entry.js
// au montage d'une scène, view/menus/city-map-menu.js pour la carte). `world` est le MONDE RACINE (variables de scène partagées
// entre recto et verso, jamais une face) et `session` la partie elle-même :
// les porteurs des portées "scene"/"party" de la condition "variable".
// Construire ce contexte à la main ailleurs risquerait d'en oublier un
// champ, et une condition évaluée sans son porteur vaut toujours faux.
export function presenceContextOf(session) {
  return {
    time: session.time,
    perceptionActive: session.perceptionActive,
    weather: session.weather.state,
    world: session.worlds[session.activeWorldId],
    session,
  };
}

// Contexte d'une condition d'ACTION ou de BEACON (évaluée par la vue, hors
// tick) : celui de la présence, plus l'entité qui PORTE la condition
// (`entity`, ses variables de portée "entity") et l'équipement du JOUEUR
// (`playerEquipment`, lu par "hasEquipmentTag" — deux clés distinctes, voir
// evaluateHasEquipmentTag). Même source unique que presenceContextOf.
export function actionContextOf(session, entity) {
  return { ...presenceContextOf(session), entity, playerEquipment: session.equipment };
}

// Présence résolue d'UNE entité pour ce tick — voir resolveEntityRules,
// dont c'est un simple accesseur (gardé pour tout appelant qui n'a besoin
// QUE de la présence, ex. isBlocking ci-dessous, ou du contenu existant).
export function isPresent(entity, context) {
  return resolveEntityRules(entity, context).present;
}

// Une entité DORMANTE ne bloque JAMAIS le mouvement (voir
// core/physics/collision.js, core/physics/overlap.js) — "comme si absente",
// un des trois plans coupés par la présence (voir core/reduce.js et
// doc/time.md pour les deux autres, côté vue : rendu audio et occupation/
// interaction). blocksMovement reste la configuration DÉCLARÉE de
// l'entité, jamais modifiée : seule la RÉSOLUTION physique du tick en tient
// compte, recalculée ici plutôt que relue sur un éventuel `entity.present`
// déjà posé (qui peut être absent ou porter la valeur du tick PRÉCÉDENT sur
// les entités pré-tick lues en phase 2, voir core/reduce.js) — dérivée des
// mêmes règles + du même context.time (constant pour tout le tick), donc
// identique par construction à ce que la phase 1 calcule pour ce même tick.
export function isBlocking(entity, context) {
  return Boolean(entity.blocksMovement) && isPresent(entity, context);
}

// Sélectionne, parmi PLUSIEURS actions CANDIDATES (voir core/entity-parse.js/
// parseEntityAction — entity.action peut être un objet UNIQUE ou un
// TABLEAU de candidates), celle dont la condition est VRAIE — voir
// doc/scripting.md/"Actions multiples filtrées par condition". Très proche
// de la désambiguïsation d'entités (view/interaction.js/
// chooseInteractionTarget, qui choisit parmi PLUSIEURS ENTITÉS via un menu
// JOUEUR) mais un mécanisme DIFFÉRENT : ici, PAS de choix utilisateur — la
// sélection est SILENCIEUSE et DÉTERMINISTE, entièrement dictée par l'état
// du jeu (les conditions), comme resolveEntityRules choisit la première
// règle de présence vraie.
//
// PRIORITÉ documentée : la PREMIÈRE candidate (ordre de déclaration) dont
// la condition est vraie l'emporte — si plusieurs matchent (contenu mal
// conçu, ex. deux conditions non mutuellement exclusives), UNE SEULE
// s'applique, jamais les deux. Une candidate SANS condition matche
// TOUJOURS (comme une action simple sans condition) — utile comme
// "défaut"/dernier recours si placée en fin de liste. Aucune candidate ne
// matche -> undefined, exactement comme une action à condition non remplie
// aujourd'hui (rien ne se passe, voir view/interaction.js/interact).
export function selectMatchingAction(actions, context) {
  return actions.find((action) => !action.condition || evaluateCondition(action.condition, context));
}
