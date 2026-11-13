// JEU DES BILLES — les STATUTS : des effets durables tenus par la partie, définis
// par le contenu (marbles/content/statuses/, un fichier par statut, un registre)
// et portés par l'état (`statuses`, une liste d'INSTANCES). Simulation pure : aucun
// DOM, aucun son, aucun hasard ; chaque fonction rend de nouvelles valeurs.
//
// LA TABLE DES STATUTS est un registre de contenu, que le core n'importe JAMAIS
// (CLAUDE.md) : marbles/core/rules.js/createMarblesRules la reçoit avec la table
// des billes et la passe au déroulé (`options.statuses`, `run.statuses`) et aux
// lectures qui en dépendent (caractéristiques, refus, actions légales). Une
// fonction qui la reçoit sans qu'on la lui donne prend NO_STATUSES, une table vide :
// un état qui porte une instance d'un statut absent de la table échoue alors,
// clairement (definitionOf), jamais en silence.
//
// UNE DÉFINITION (sa validation : marbles/core/validation.js/validateMarbleStatuses) :
//   stacking   le CUMUL quand le statut est appliqué alors qu'il est déjà là
//              (STATUS_STACKINGS) : "intensity", l'intensité s'ajoute ; "duration",
//              la durée s'ajoute ; "unique", une seconde application est sans effet ;
//   duration   { kind, count? } (STATUS_DURATIONS) : "turn", ce tour ; "turns",
//              `count` tours, celui en cours compris ; "nextTurn", le prochain tour
//              (EN ATTENTE jusque-là) ; "game", toute la partie ; "charges", `count`
//              charges, une consommée par vrai changement d'une valeur ;
//   behaviors  ses COMPORTEMENTS, une liste non vide, trois sortes :
//              { type: "stat", stat, amount } une CARACTÉRISTIQUE (CHARACTERISTICS)
//                 augmentée de `amount` × l'intensité ;
//              { type: "modifier", point, operation, value, filters? } un
//                 MODIFICATEUR de valeur à un point d'interception (MODIFIER_POINTS) :
//                 "add", `value` × l'intensité ajouté ; "multiply", multiplié par
//                 `value` autant de fois que l'intensité (×2 à l'intensité 2 : ×4 ;
//                 ×0,5 : ÷2) ; `filters`, des FILTRES SUR LA SOURCE (ceux des cibles,
//                 marbles/core/effects.js/TARGET_FILTERS) : il ne modifie que les
//                 valeurs PRODUITES par une bille qui les passe (« les gains de Vitesse
//                 produits par un calot »), jamais une valeur sans bille source ;
//              { type: "reaction", on, effect } une RÉACTION : un effet de billes
//                 (une liste de clauses) joué à chaque incrément du compteur
//                 écoutable `on` (marbles/core/counters.js), comme une bille du pot ;
//                 l'intensité ne la module pas ;
//              { type: "lock", lock, ... } un VERROU (LOCKS) : une action du joueur
//                 ou une sorte d'effet rendue indisponible ; l'intensité ne le module
//                 pas.
// Ses textes découlent de son id : `marbles.status.<id>.name` (en minuscules) et
// `marbles.status.<id>.description`, obligatoires (domaine marbles-view).
//
// UNE INSTANCE (dans l'état, sérialisée avec lui) :
//   { status, holder, intensity, remaining, pending, origin, locked? }
//   status     l'id de sa définition ;
//   holder     qui la porte : "game", la partie (aujourd'hui le seul ; la forme
//              est prête pour une bille) ;
//   intensity  son intensité, au moins 1 ;
//   remaining  ce qui lui reste : des TOURS (durées "turn", "turns", "nextTurn" :
//              les fins de tour qu'elle verra encore, celle du tour en cours
//              comprise), des CHARGES ("charges"), ou null ("game") ;
//   pending    vrai tant qu'un statut « le prochain tour » attend son tour : il
//              n'agit pas, ne compte pas ses tours, et s'active au début du tour
//              suivant, en silence ;
//   origin     l'effet qui l'a donné, { trigger, slot, marble } (le `by` des
//              évènements), RULE_ORIGIN pour une règle, ou null ;
//   locked     (une RÈGLE seulement) vrai : aucun effet ne peut la retirer, la
//              réduire, la renforcer ni consommer ses charges.
// LES RÈGLES d'une partie (marbles/core/definitions.js, `rules`) sont des statuts de la
// table, de durée « toute la partie », posés à la création de la partie, en silence
// (ruleInstance), en tête de la liste, VERROUILLÉS et d'origine « règle ». Ils agissent
// comme tout statut (caractéristiques, modificateurs, réactions, verrous) ; la vue les
// tient à part (touche O, jamais A : ordinaryInstances).
// L'ORDRE DE LA LISTE est l'ordre d'acquisition : une nouvelle instance s'ajoute à la
// fin, un renforcement la laisse à sa place. Il ordonne les modificateurs, les
// réactions et les expirations. Une seule instance par statut et par porteur : une
// nouvelle application se FUSIONNE (applyStatus), jamais une seconde instance.

// Les cumuls d'un statut appliqué alors qu'il est déjà là (en-tête).
export const STATUS_STACKINGS = Object.freeze(["intensity", "duration", "unique"]);

// Les DURÉES : `counted`, la définition donne `count` (une clause peut le changer) ;
// `turns`, la durée se compte en fins de tour ; `pending`, le statut attend le tour
// suivant ; `charges`, elle se compte en charges ; `stackable`, le cumul en durée
// y a un sens (ajouter « ce tour » à « ce tour », ou « toute la partie », non).
export const STATUS_DURATIONS = Object.freeze({
  turn: { counted: false, turns: true, stackable: false },
  turns: { counted: true, turns: true, stackable: true },
  nextTurn: { counted: false, turns: true, pending: true, stackable: true },
  game: { counted: false, stackable: false },
  charges: { counted: true, charges: true, stackable: true },
});

// Les CARACTÉRISTIQUES de la partie, celles que lit l'accès unique (characteristic),
// leur valeur de départ sous la même clé dans la définition de la partie
// (`state.definition.start`, marbles/core/definitions.js) : `floor`, le plancher,
// appliqué après les statuts. Une main d'au moins une bille, des lancers et un pot
// jamais négatifs.
export const CHARACTERISTICS = Object.freeze({
  throws: { floor: 0 },
  handSize: { floor: 1 },
  potCapacity: { floor: 0 },
});

// Les POINTS D'INTERCEPTION des valeurs, déclarés ICI ET NULLE PART AILLEURS :
//   speedGain, speedLoss  la Vitesse qu'un effet applique quand il joue (bonus reçu
//                         compris), selon son signe, interceptée AVANT d'être
//                         modifiée : un gain passe par speedGain, une perte par
//                         speedLoss. Le modificateur agit sur la GRANDEUR (une perte
//                         de 3 est une grandeur 3), puis le signe revient : jamais
//                         inversé, une grandeur jamais sous 0 ;
//   massGain, massLoss    la même chose pour la Masse ;
//   impact                l'Impact du tour, après son calcul habituel (Vitesse ×
//                         Masse et leurs planchers), puis plancher 0 ;
//   turnDraw              le nombre de billes de la pioche du DÉBUT DE TOUR (celle
//                         du premier tour comme des suivants), avant de piocher ;
//   effectDraw            le N des Pioches d'un effet (leur total, une fois par
//                         effet), avant de piocher ;
//   polish, crack         le N d'une clause Polissage, d'une clause Fêlure, une fois
//                         par clause quand l'effet joue, avant le plancher et le
//                         plafond d'usure ; la quantité finale vaut pour chaque cible ;
//   phaseWear             le +1 d'usure qu'une bille prend à sa phase, plafonné
//                         ensuite à son usure maximale.
// LA SOURCE d'une valeur, que lisent les filtres d'un modificateur : la bille qui la
// PRODUIT, celle dont l'effet joue (une bille du pot comprise ; pour un bonus reçu,
// la bille qui le reçoit et le joue à sa phase), ou, pour l'usure de phase, la bille
// qui s'use. Sans bille (la réaction d'un statut), aucune source : aucun filtre ne
// correspond. `sourced` : le point a une source ; l'Impact et la pioche du début de
// tour n'en ont jamais, un filtre y est refusé au chargement.
// ARRONDI : une valeur non entière après modification (×0,5) est arrondie VERS ZÉRO, à
// la fin (3 × 0,5 donne 1 ; 1 × 0,5 donne 0) ; le calcul reste exact d'un pas à
// l'autre, et chaque pas se juge sur sa valeur arrondie (une charge ne se consomme que
// si la valeur arrondie change).
// Chacun déclare sa NATURE :
//   "signed"    une valeur signée (Vitesse, Masse) : `stat`, la valeur interceptée,
//               et `sign`, le signe des valeurs qu'il prend (modifyStat) ;
//   "quantity"  une quantité, jamais négative : modifiée telle quelle, plancher 0
//               (modifyQuantity) ; les limites habituelles (main pleine, sac vide,
//               usure entre 0 et son maximum) s'appliquent APRÈS. `action`
//               (facultatif) : l'action de clause dont elle intercepte le montant
//               (pointOfAction) ; une autre action (Empocher, Éjecter…) s'y ajoute
//               par une entrée ici, rien d'autre côté statuts.
// Une quantité ramenée à 0 ne fait rien : l'action ne se joue pas (l'usure de phase,
// elle, se dit inchangée).
export const MODIFIER_POINTS = Object.freeze({
  speedGain: { nature: "signed", stat: "speed", sign: 1, sourced: true },
  speedLoss: { nature: "signed", stat: "speed", sign: -1, sourced: true },
  massGain: { nature: "signed", stat: "mass", sign: 1, sourced: true },
  massLoss: { nature: "signed", stat: "mass", sign: -1, sourced: true },
  impact: { nature: "quantity", sourced: false },
  turnDraw: { nature: "quantity", sourced: false },
  effectDraw: { nature: "quantity", action: "draw", sourced: true },
  polish: { nature: "quantity", action: "polish", sourced: true },
  crack: { nature: "quantity", action: "crack", sourced: true },
  phaseWear: { nature: "quantity", sourced: true },
});

// LA SOURCE d'une valeur interceptée (en-tête), telle que la reçoivent les
// modifications : null (aucune bille), ou { marble, matches(filters) }, la bille et le
// test de ses filtres (fourni par le déroulé, marbles/core/run.js/sourceOf, qui
// connaît la table des billes).
export const NO_SOURCE = null;

// Le modificateur s'applique-t-il à une valeur de cette source ? Sans filtre, toujours ;
// avec, seulement une valeur produite par une bille qui les passe.
function appliesTo(behavior, source) {
  return behavior.filters === undefined || (source !== NO_SOURCE && source.matches(behavior.filters));
}

// L'arrondi vers zéro d'une valeur modifiée (en-tête) ; jamais −0.
function towardZero(value) {
  return Math.trunc(value) + 0;
}

// Le point d'interception du montant d'une action de clause (MODIFIER_POINTS,
// `action`), ou null : son montant n'est intercepté par rien.
function pointOfAction(action) {
  return Object.keys(MODIFIER_POINTS).find((id) => MODIFIER_POINTS[id].action === action) ?? null;
}

// Les opérations d'un modificateur : d'abord TOUTES les additions, puis toutes les
// multiplications, chacune dans l'ordre d'acquisition ; les planchers à la fin.
// `step(value, modifier, intensity)` : la valeur après lui.
export const MODIFIER_OPERATIONS = Object.freeze({
  add: { rank: 0, step: (value, modifier, intensity) => value + modifier.value * intensity },
  multiply: { rank: 1, step: (value, modifier, intensity) => value * modifier.value ** intensity },
});

// Les comportements d'une définition (en-tête).
export const STATUS_BEHAVIORS = Object.freeze(["stat", "modifier", "reaction", "lock"]);

// LES VERROUS, déclarés ICI ET NULLE PART AILLEURS : ce qu'un comportement `lock` rend
// indisponible tant que son statut agit. Chacun :
//   nature  "action", une ACTION DU JOUEUR, refusée par le réducteur (`refusal`, son
//           code d'erreur, qui nomme le statut en cause : marbles/core/marbles.js) et
//           jamais proposée aux joueurs automatiques ; "effect", une SORTE D'EFFET qui
//           ne joue plus, ses compteurs immobiles (marbles/core/run.js,
//           marbles/core/counters.js) ;
//   fields  ses champs.
// Les quatre :
//   swap         l'échange ;
//   replacement  la pose sur un emplacement occupé (le remplacement) ; la pose sur
//                un vide reste permise ;
//   trigger      { trigger } : ce mot-clé de déclenchement d'une bille
//                (marbles/config/values.js/MARBLE_TRIGGERS) ne se déclenche plus ;
//                l'évènement réel a lieu (une bille lancée l'est toujours), son effet
//                ne joue pas et son compteur de déclenchements ne bouge pas ;
//   pot          les billes du POT n'agissent plus : ni entrée, ni étape du pot, ni
//                réactions (aucun évènement, aucun compteur) ; elles y entrent
//                toujours, la capacité inchangée.
// Le porteur est la partie ; un verrou porté par une BILLE (« cette bille ne peut pas
// être éjectée ») est préparé par la forme des instances (`holder`), pas encore joué.
// AJOUTER un verrou : une entrée ici, et sa lecture (isLocked) là où il agit.
export const LOCKS = Object.freeze({
  swap: { nature: "action", fields: ["type", "lock"], refusal: "swapLocked" },
  replacement: { nature: "action", fields: ["type", "lock"], refusal: "replacementLocked" },
  trigger: { nature: "effect", fields: ["type", "lock", "trigger"] },
  pot: { nature: "effect", fields: ["type", "lock"] },
});

// La table vide : celle d'une partie sans statuts (en-tête).
export const NO_STATUSES = Object.freeze({});

// L'origine d'une règle (en-tête), de la forme d'un `by` sans bille.
export const RULE_ORIGIN = Object.freeze({ trigger: "rule", slot: null, marble: null });

// L'instance d'une RÈGLE, posée à la création de la partie (en-tête) : intensité 1,
// toute la partie, verrouillée. Sa définition est validée avec celle de la partie
// (marbles/core/validation.js : durée « toute la partie »).
export function ruleInstance(status) {
  return { status, holder: "game", intensity: 1, remaining: null, pending: false, origin: RULE_ORIGIN, locked: true };
}

// Les statuts ORDINAIRES (ceux des billes : touches A et Maj+A) et les RÈGLES (touche
// O), chacun dans l'ordre d'acquisition.
export function ordinaryInstances(instances) {
  return instances.filter((instance) => instance.locked !== true);
}

export function ruleInstances(instances) {
  return instances.filter((instance) => instance.locked === true);
}

// La définition d'un statut ; inconnu de la table : une erreur, jamais un silence.
export function definitionOf(statuses, id) {
  if (!Object.hasOwn(statuses, id)) throw new Error(`marbles : statut inconnu "${id}" (table des statuts absente ou incomplète).`);
  return statuses[id];
}

// Les instances qui AGISSENT : toutes sauf celles qui attendent le tour suivant.
function acting(instances) {
  return instances.filter((instance) => !instance.pending);
}

// Les comportements d'un type donné des instances qui agissent, dans l'ordre
// d'acquisition : [{ instance, behavior }].
function actingBehaviors(instances, statuses, type) {
  return acting(instances).flatMap((instance) =>
    definitionOf(statuses, instance.status)
      .behaviors.filter((behavior) => behavior.type === type)
      .map((behavior) => ({ instance, behavior }))
  );
}

// --- Les verrous ---

// L'instance qui VERROUILLE `lock` (LOCKS) maintenant, la première dans l'ordre
// d'acquisition (une règle d'abord), ou null. `trigger` : le mot-clé, pour un verrou
// de déclencheur.
export function lockingInstance(instances, statuses, lock, trigger = null) {
  const found = actingBehaviors(instances, statuses, "lock").find(({ behavior }) => behavior.lock === lock && (lock !== "trigger" || behavior.trigger === trigger));
  return found?.instance ?? null;
}

// `lock` est-il verrouillé maintenant ?
export function isLocked(instances, statuses, lock, trigger = null) {
  return lockingInstance(instances, statuses, lock, trigger) !== null;
}

// --- Les caractéristiques ---

// L'ACCÈS UNIQUE à une caractéristique de la partie (CHARACTERISTICS) : sa valeur de
// départ dans la définition de la partie, plus les comportements `stat` des statuts
// qui agissent (`amount` × l'intensité), puis le plancher. Lu partout où une règle en
// dépend : lancers restants, pioche, choix vers la main, arrivées au pot, zones
// pleines. Une zone au-delà de sa capacité (le pot, après la fin d'un statut qui
// l'agrandissait) garde ses billes : elle compte pleine, rien n'en sort.
export function characteristic(state, key, statuses = NO_STATUSES) {
  const { floor } = CHARACTERISTICS[key];
  const bonus = actingBehaviors(state.statuses, statuses, "stat")
    .filter(({ behavior }) => behavior.stat === key)
    .reduce((total, { instance, behavior }) => total + behavior.amount * instance.intensity, 0);
  return Math.max(floor, state.definition.start[key] + bonus);
}

// --- Les modificateurs de valeur ---

// Une valeur passée par les modificateurs d'un point d'interception (MODIFIER_POINTS),
// sans rien changer à l'état : ceux qui s'appliquent à sa source (appliesTo), additions
// puis multiplications, chacune dans l'ordre d'acquisition, puis le plancher 0 et
// l'arrondi vers zéro. -> { value, contributions, changed } :
//   contributions  chaque pas qui a changé la valeur, plancher compris,
//                  [{ status, before, after }] ;
//   changed        les statuts dont un pas a VRAIMENT changé la valeur, chacun une
//                  fois, dans l'ordre : leurs charges se consomment (useCharges).
function intercept(instances, statuses, point, value, source) {
  const modifiers = actingBehaviors(instances, statuses, "modifier")
    .filter(({ behavior }) => behavior.point === point && appliesTo(behavior, source))
    .map((entry, order) => ({ ...entry, order }))
    .sort((a, b) => MODIFIER_OPERATIONS[a.behavior.operation].rank - MODIFIER_OPERATIONS[b.behavior.operation].rank || a.order - b.order);
  let current = value;
  const contributions = [];
  const changed = [];
  for (const { instance, behavior } of modifiers) {
    const after = MODIFIER_OPERATIONS[behavior.operation].step(current, behavior, instance.intensity);
    // Le calcul garde la valeur brute (plancher et arrondi à la fin) ; un pas ne CHANGE
    // la valeur que si son résultat, plancher et arrondi compris, change : -4 puis ×2
    // reste 0, aucune charge consommée, rien à dire.
    const [floorBefore, floorAfter] = [towardZero(Math.max(0, current)), towardZero(Math.max(0, after))];
    current = after;
    if (floorAfter === floorBefore) continue;
    contributions.push({ status: instance.status, before: floorBefore, after: floorAfter });
    if (!changed.includes(instance.status)) changed.push(instance.status);
  }
  return { value: towardZero(Math.max(0, current)), contributions, changed };
}

// La Vitesse ou la Masse (`stat`) qu'un effet applique, passée par ses modificateurs :
// un gain par `<stat>Gain`, une perte par `<stat>Loss`, sur sa GRANDEUR, le signe
// remis ensuite (jamais inversé). Zéro n'est intercepté par rien.
// `source` : la bille qui la produit (NO_SOURCE par défaut).
// -> { point, before, value, contributions, changed } (point null pour zéro).
export function modifyStat(instances, statuses, stat, value, source = NO_SOURCE) {
  if (value === 0) return { point: null, before: 0, value: 0, contributions: [], changed: [] };
  const sign = Math.sign(value);
  const point = Object.keys(MODIFIER_POINTS).find((id) => MODIFIER_POINTS[id].nature === "signed" && MODIFIER_POINTS[id].stat === stat && MODIFIER_POINTS[id].sign === sign);
  const result = intercept(instances, statuses, point, Math.abs(value), source);
  // Une grandeur ramenée à 0 vaut 0, jamais −0 (qu'une comparaison ou un texte
  // distinguerait).
  const signed = result.value === 0 ? 0 : sign * result.value;
  return { point, before: value, value: signed, contributions: result.contributions, changed: result.changed };
}

// Une QUANTITÉ (un point de nature "quantity" : l'Impact, une pioche, un Polissage,
// une Fêlure, l'usure de phase) passée par ses modificateurs, plancher 0. `source` :
// la bille qui la produit (NO_SOURCE par défaut).
// -> { point, before, value, contributions, changed }.
export function modifyQuantity(instances, statuses, point, value, source = NO_SOURCE) {
  if (MODIFIER_POINTS[point]?.nature !== "quantity") throw new Error(`marbles : "${point}" n'est pas un point d'interception de quantité.`);
  const result = intercept(instances, statuses, point, value, source);
  return { point, before: value, ...result };
}

// Le montant d'une action de clause passé par son point d'interception
// (pointOfAction), ou tel quel si elle n'en a pas. Un montant nul (un effet sans
// Pioche) n'est intercepté par rien : il n'y a rien à modifier.
export function modifyActionAmount(instances, statuses, action, amount, source = NO_SOURCE) {
  const point = pointOfAction(action);
  if (point === null || amount === 0) return { point: null, before: amount, value: amount, contributions: [], changed: [] };
  return modifyQuantity(instances, statuses, point, amount, source);
}

// --- Les instances ---

// L'APPLICATION que décrit une clause Appliquer un statut, résolue d'après sa
// définition, telle que la portent les actions d'un effet (marbles/core/effects.js/
// evaluateEffect) et que la vue la dit : { status, amount, duration, stacking } ;
// `amount`, l'intensité ; `duration`, { kind } ou, comptée, { kind, count } (celui
// de la clause, sinon celui de la définition) ; `stacking`, son cumul (l'intensité ne
// se dit que pour un cumul en intensité).
export function statusApplication(clause, definition) {
  const { kind, count } = definition.duration;
  const duration = STATUS_DURATIONS[kind].counted ? { kind, count: clause.duration ?? count } : { kind };
  return { status: clause.status, amount: clause.amount, duration, stacking: definition.stacking };
}

// Une instance neuve d'après sa définition et l'application ({ intensity, count }) :
// `count` remplace celui de la définition (une durée comptée seulement).
function freshInstance(id, definition, { intensity, count }, origin) {
  const kind = STATUS_DURATIONS[definition.duration.kind];
  const remaining = kind.counted ? (count ?? definition.duration.count) : kind.turns ? 1 : null;
  return { status: id, holder: "game", intensity, remaining, pending: kind.pending === true, origin };
}

// Ce que devient une instance existante quand le même statut s'applique de nouveau
// (`fresh`, l'instance qu'il aurait créée), selon son cumul (en-tête) ; null :
// « unique », sans effet. Un statut « le prochain tour » appliqué pendant qu'il agit
// s'étend pour couvrir aussi le prochain tour ; en attente, il le couvre déjà.
function merged(existing, fresh, definition) {
  const { kind } = definition.duration;
  if (definition.stacking === "unique") return null;
  if (definition.stacking === "intensity") {
    const remaining =
      kind === "nextTurn" ? Math.max(existing.remaining, existing.pending ? 1 : 2) : existing.remaining === null ? null : Math.max(existing.remaining, fresh.remaining);
    return { ...existing, intensity: existing.intensity + fresh.intensity, remaining };
  }
  // En durée : l'intensité la plus forte, la durée qui s'ajoute (un tour de plus pour
  // « le prochain tour »).
  const added = kind === "nextTurn" ? 1 : fresh.remaining;
  return { ...existing, intensity: Math.max(existing.intensity, fresh.intensity), remaining: existing.remaining + added };
}

// Applique le statut `id` à la partie : { intensity, count } (`count`, la durée
// comptée que donne la clause, sinon celle de la définition), `origin`, l'effet qui
// le donne. Une instance neuve, ou la fusion avec celle qui est là (merged) ; une
// RÈGLE déjà là ne se renforce jamais (verrouillée).
// -> { instances, outcome, instance } : `outcome` "gained" (neuve), "strengthened"
// (fusionnée), "unchanged" (unique, déjà là) ou "locked" (une règle, sans effet) ;
// `instance`, celle d'après.
export function applyStatus(instances, statuses, id, application, origin = null) {
  const definition = definitionOf(statuses, id);
  const fresh = freshInstance(id, definition, application, origin);
  const index = instances.findIndex((instance) => instance.status === id && instance.holder === "game");
  if (index < 0) return { instances: [...instances, fresh], outcome: "gained", instance: fresh };
  if (instances[index].locked === true) return { instances, outcome: "locked", instance: instances[index] };
  const next = merged(instances[index], fresh, definition);
  if (next === null) return { instances, outcome: "unchanged", instance: instances[index] };
  return { instances: instances.map((instance, other) => (other === index ? next : instance)), outcome: "strengthened", instance: next };
}

// Au DÉBUT D'UN TOUR : les statuts en attente s'activent. -> { instances, activated }
// (les ids activés, dans l'ordre).
export function activatePending(instances) {
  const activated = instances.filter((instance) => instance.pending).map((instance) => instance.status);
  if (activated.length === 0) return { instances, activated };
  return { instances: instances.map((instance) => (instance.pending ? { ...instance, pending: false } : instance)), activated };
}

// À LA FIN D'UN TOUR : chaque statut qui agit et se compte en tours en voit un de
// moins ; à zéro, il prend fin. Ni ceux qui attendent, ni ceux en charges, ni ceux
// de toute la partie. -> { instances, expired } (les ids qui prennent fin, dans
// l'ordre d'acquisition).
export function endTurn(instances, statuses) {
  const expired = [];
  const kept = [];
  for (const instance of instances) {
    const counted = !instance.pending && instance.locked !== true && STATUS_DURATIONS[definitionOf(statuses, instance.status).duration.kind].turns === true;
    if (!counted) {
      kept.push(instance);
      continue;
    }
    const remaining = instance.remaining - 1;
    if (remaining <= 0) expired.push(instance.status);
    else kept.push({ ...instance, remaining });
  }
  return { instances: kept, expired };
}

// Les CHARGES des statuts `ids` (ceux qui ont vraiment changé une valeur), une de
// moins chacun s'il se compte en charges ; à zéro, il prend fin aussitôt.
// -> { instances, used: [{ status, remaining }], expired: [id] }.
export function useCharges(instances, statuses, ids) {
  let next = instances;
  const used = [];
  const expired = [];
  for (const id of ids) {
    const index = next.findIndex((instance) => instance.status === id);
    // Une règle ne consomme jamais ses charges (verrouillée).
    if (index < 0 || next[index].locked === true || STATUS_DURATIONS[definitionOf(statuses, id).duration.kind].charges !== true) continue;
    const remaining = next[index].remaining - 1;
    used.push({ status: id, remaining: Math.max(0, remaining) });
    if (remaining <= 0) {
      expired.push(id);
      next = next.filter((_, other) => other !== index);
    } else {
      next = next.map((instance, other) => (other === index ? { ...instance, remaining } : instance));
    }
  }
  return { instances: next, used, expired };
}

// --- Les réactions ---

// Les ÉVÈNEMENTS qui disent qu'un statut vient d'être reçu ou renforcé : un statut
// ne réagit jamais à sa propre acquisition.
const ACQUISITIONS = new Set(["statusGained", "statusStrengthened"]);

// Les RÉACTIONS des statuts à un évènement qui vient d'être compté : `heard`, les
// compteurs écoutables qu'il a augmentés, [[id, incrément]]. Chaque statut qui agit,
// dans l'ordre d'acquisition, une fois par incrément de chaque compteur qu'une de
// ses réactions écoute. -> [{ status, counter }].
export function statusReactionsOf(instances, statuses, heard, event) {
  const reactions = [];
  for (const instance of acting(instances)) {
    if (ACQUISITIONS.has(event.type) && event.status === instance.status) continue;
    const listened = definitionOf(statuses, instance.status).behaviors.filter((behavior) => behavior.type === "reaction");
    for (const [counter, count] of heard) {
      if (!listened.some((behavior) => behavior.on === counter)) continue;
      for (let time = 0; time < count; time++) reactions.push({ status: instance.status, counter });
    }
  }
  return reactions;
}

// Les clauses de la réaction d'un statut au compteur `counter`, bout à bout (un
// statut peut écouter le même compteur plusieurs fois), ou null.
export function statusReactionClauses(definition, counter) {
  const clauses = definition.behaviors.filter((behavior) => behavior.type === "reaction" && behavior.on === counter).flatMap((behavior) => behavior.effect);
  return clauses.length === 0 ? null : clauses;
}
