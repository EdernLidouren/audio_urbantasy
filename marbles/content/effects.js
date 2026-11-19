// Formes courtes des clauses d'effet des billes (marbles/content/types/) : une table qui se
// lit mieux, et qui reste de la donnée une fois évaluée. Aucun import, aucune
// logique : la forme d'une clause est décrite dans marbles/content/types/index.js, sa
// validation et son sens dans marbles/core/effects.js.

// Ajoute `amount` à la Vitesse.
export const speed = (amount) => ({ action: "speed", amount });

// Ajoute `amount` à la Masse.
export const mass = (amount) => ({ action: "mass", amount });

// Pioche `amount` billes.
export const draw = (amount) => ({ action: "draw", amount });

// Polissage : retire `amount` d'usure, à la bille elle-même ou à celle de `target`.
export const polish = (amount, target) => ({ action: "polish", amount, ...(target === undefined ? {} : { target }) });

// Fêlure : ajoute `amount` d'usure, à la bille elle-même ou à celle de `target`.
export const crack = (amount, target) => ({ action: "crack", amount, ...(target === undefined ? {} : { target }) });

// Source d'un montant calculé : les tours passés en main par la bille elle-même.
// Un montant calculé s'écrit { base, step, source, max? } (marbles/core/effects.js) :
// speed({ base: 0, step: 1, source: turnsInHand(), max: 5 }).
export const turnsInHand = () => ({ type: "turnsInHand" });

// Source d'un montant calculé : une VALEUR DE PARTIE, par son identifiant
// (marbles/core/counters.js), dans une portée, "turn" (ce tour) ou "game" (cette
// partie). « Vitesse +2 par chiquenaude ce tour » :
// speed({ base: 0, step: 2, source: tally("flick", "turn"), max: 6 }).
export const tally = (id, scope) => ({ type: "tally", tally: id, scope });

// Le nombre de billes d'une zone de la partie, source d'un montant calculé
// (marbles/core/zones.js/GAME_ZONES : "triangle", "hand", "bag", "discard", "pot",
// "lost"), filtré ou non (un filtre : sizeIs, familyIs, rarityIs, marbleIs) :
// zoneCount("hand"), « par bille en main » ; zoneCount("triangle", sizeIs(SMALL)),
// « par minibille active » ; zoneCount("discard", familyIs("mist")), « par Brume à la
// défausse ». Plusieurs zones ensemble, en liste : zoneCount(["hand", "triangle"],
// sizeIs(MEDIUM)), « par bille normale en main et sur le triangle ».
export const zoneCount = (zone, ...filters) => ({ type: "zoneCount", ...(Array.isArray(zone) ? { zones: zone } : { zone }), ...(filters.length === 0 ? {} : { filters }) });

// Le nombre de familles différentes parmi les billes actives, source d'un montant
// calculé : « Vitesse +2 par famille différente sur le triangle » :
// speed({ base: 0, step: 2, source: familyCount(), max: 6 }). Parmi plusieurs zones
// ensemble : familyCount(["triangle", "hand"]), « par famille différente sur le
// triangle et en main ».
export const familyCount = (zones) => ({ type: "familyCount", ...(zones === undefined ? {} : { zones }) });

// Un compteur du tour ("speed", "mass") au déclenchement, source d'un montant calculé ;
// négatif, il compte pour 0 : speed({ base: 0, step: 1, source: turnStat("speed"), max:
// 8 }), « Vitesse égale à la Vitesse du tour, maximum +8 ».
export const turnStat = (stat) => ({ type: "stat", stat });

// Ce que donne la bille de l'autre base ("speed", "mass"), source d'un montant
// calculé, dans un effet de base seulement, prise telle quelle : speed({ base: 0, step:
// 1, source: otherBase("speed") }), « Vitesse égale à la Vitesse que donne la bille de
// l'autre base ». Un malus se copie aussi.
export const otherBase = (stat) => ({ type: "otherBase", stat });

// L'usure d'une bille, source d'un montant calculé : la sienne, ou celle de la bille
// éjectée (`marble: "ejected"`, pendant un remplacement) ; `remaining: true`, ce qui
// lui reste avant son maximum. Partie du triangle, celle qu'elle avait en partant :
// speed({ base: 5, step: -1, source: wear() }), « Vitesse +5, −1 par point d'usure de
// cette bille ».
export const wear = ({ marble, remaining } = {}) => ({ type: "wear", ...(marble === undefined ? {} : { marble }), ...(remaining === undefined ? {} : { remaining }) });

// Les tours passés sur le triangle par la bille elle-même (les phases qu'elle y a
// jouées), source d'un montant calculé : speed({ base: 0, step: 2, source:
// turnsOnTriangle(), max: 10 }).
export const turnsOnTriangle = () => ({ type: "turnsOnTriangle" });

// L'état d'une zone de la partie, une condition (`when`) : zoneIs("triangle",
// "full"), « si le triangle est plein » ; états "empty", "full", "single".
export const zoneIs = (zone, state) => ({ type: "zone", zone, state });

// Le calibre, la famille ou la rareté de la bille d'un emplacement (fixe, ou relatif :
// NEXT_SLOT, PREVIOUS_SLOT), une condition (`when`) : sizeAt(NEXT_SLOT, SMALL), « si la
// bille de l'emplacement suivant est une minibille » ; familyAt("apex", "mist") ;
// rarityAt("leftBase", "rare").
export const sizeAt = (slot, size) => ({ type: "sizeAt", slot, size });
export const familyAt = (slot, family) => ({ type: "familyAt", slot, family });
export const rarityAt = (slot, rarity) => ({ type: "rarityAt", slot, rarity });

// La bille d'un emplacement est la bille `marble` (un id), une condition (`when`) :
// marbleAt(PREVIOUS_SLOT, "bee"), « si la bille de l'emplacement précédent est une
// abeille ».
export const marbleAt = (slot, marble) => ({ type: "marbleAt", slot, marble });

// TOUTES ces conditions, une condition (`when`) : allOf(count(…), count(…)), « si … et
// … ».
export const allOf = (...conditions) => ({ type: "all", conditions });

// LA NÉGATION d'une condition qui l'accepte (sizeAt, familyAt, rarityAt, marbleAt,
// replacementSize) : not(familyAt(NEXT_SLOT, "bestiary")), « si la bille de
// l'emplacement suivant n'est pas de la famille Bestiaire ».
export const not = (condition) => ({ ...condition, not: true });

// L'état d'un emplacement, "empty" ou "occupied", une condition (`when`) :
// slotIs(NEXT_SLOT, "empty"), « si l'emplacement suivant est vide ».
export const slotIs = (slot, state) => ({ type: "slotIs", slot, state });

// Pendant un remplacement (Tic, Éjection), le calibre de la bille éjectée ("ejected")
// ou de celle qui l'éjecte ("placed"), une condition (`when`) :
// replacementSize("ejected", SMALL), « si la bille éjectée est une minibille ».
export const replacementSize = (marble, size) => ({ type: "replacementSize", marble, size });

// Un NOMBRE comparé à une borne, une condition (`when`) : la valeur d'une source de
// montant (zoneCount, familyCount, tally, turnsInHand) au moins (`atLeast`) ou au plus
// (`atMost`) : count(zoneCount("hand"), { atMost: 3 }), « si vous avez au plus 3
// billes en main ».
export const count = (source, bound) => ({ type: "count", source, ...bound });

// Un COMPTEUR DU TOUR ("speed", "mass") comparé à une borne, une condition (`when`) :
// statIs("speed", { atLeast: 10 }), « si la Vitesse est d'au moins 10 ».
export const statIs = (stat, bound) => ({ type: "stat", stat, ...bound });

// La première bille de la main, cible d'Empocher et de Défausser
// (marbles/core/effects.js/FIRST_IN_HAND).
export const FIRST_IN_HAND = "firstInHand";

// La dernière bille arrivée à la défausse, cible de Ramasser
// (marbles/core/effects.js/LAST_DISCARDED).
export const LAST_DISCARDED = "lastDiscarded";

// La bille éjectée, en partance pendant le Tic de celle qui la déloge, cible
// d'Empocher et de Rebond dans un Tic seulement (marbles/core/effects.js/
// KNOCKED_OUT) : « Tic : Empocher la bille éjectée » la redirige vers le pot.
export const KNOCKED_OUT = "knockedOut";

// Les CIBLES RELATIVES (marbles/core/effects.js) : l'emplacement suivant, ou
// précédent, de celui d'où la bille agit. Partout où une action accepte un
// emplacement, et dans le `slot` des conditions qui lisent un emplacement :
// speed(2, NEXT_SLOT)… { ...speed(2), target: NEXT_SLOT }.
export const NEXT_SLOT = "nextSlot";
export const PREVIOUS_SLOT = "previousSlot";

// Les `count` prochaines billes du sac, cible de Défausser (marbles/core/effects.js/
// isBag) : nextInBag(1), « la prochaine bille du sac ».
export const nextInBag = (count) => ({ type: "bag", count });

// Une CIBLE AU CHOIX du joueur (marbles/core/effects.js, en-tête) : `zones`, où il
// choisit ("hand", "triangle", "discard") ; `count`, combien (1 par défaut) ; `mode`,
// TOUJOURS donné, "optional" (facultatif : N au plus, aucun permis) ou "required"
// (obligatoire : exactement N) ; `pick`, ce qui se vise sur le triangle ("marble", une
// bille active, par défaut). « Vous pouvez polir une bille active » :
// polish(1, choice({ zones: ["triangle"], mode: "optional" })).
export const choice = ({ zones, count = 1, mode, pick = "marble" }) => ({ type: "choice", zones, pick, count, mode });

// Une cible « TOUTES LES BILLES ACTIVES » (marbles/core/effects.js, en-tête), qui
// passent tous les filtres donnés : allActive(), allActive(sizeIs(SMALL)).
export const allActive = (...filters) => ({ type: "all", ...(filters.length === 0 ? {} : { filters }) });

// Les FILTRES de bille (marbles/core/effects.js/TARGET_FILTERS), pour une cible
// « toutes », un nombre de billes ou la source d'un modificateur de statut : le
// calibre (SMALL, MEDIUM, LARGE), la famille (une de MARBLE_FAMILIES), la rareté (une de
// MARBLE_RARITIES, exactement), marbles/config/values.js.
export const sizeIs = (size) => ({ type: "size", size });
export const familyIs = (family) => ({ type: "family", family });
export const rarityIs = (rarity) => ({ type: "rarity", rarity });
// Une bille précise, par son id : zoneCount("pot", marbleIs("bee")), « par abeille
// dans le pot ».
export const marbleIs = (marble) => ({ type: "marble", marble });

// SINON : `clause` si `condition`, sinon `fallback` (une clause, qui peut avoir son
// propre sinon) : orElse(speed(3), count(...), speed(1)), « Vitesse +3 si …, sinon
// Vitesse +1 » (marbles/core/effects.js, en-tête « Sinon »).
export const orElse = (clause, condition, fallback) => ({ ...clause, when: condition, otherwise: fallback });

// Éjecter : chasse du triangle la bille elle-même (sans cible, sur le triangle
// seulement), celle d'un emplacement, des billes au choix (choice) ou toutes les
// billes actives filtrées (allActive). Sans montant.
export const eject = (target) => ({ action: "eject", ...(target === undefined ? {} : { target }) });

// Empocher : envoie au pot la bille elle-même (sans cible), celle d'un emplacement,
// la première de la main (FIRST_IN_HAND), ou une bille au choix (choice). Sans
// montant.
export const pocket = (target) => ({ action: "pocket", ...(target === undefined ? {} : { target }) });

// Défausser : envoie à la défausse la bille elle-même (sans cible), celle d'un
// emplacement, la première de la main (FIRST_IN_HAND), des billes au choix
// (choice), toutes les billes actives filtrées (allActive) ou les prochaines billes
// du sac (nextInBag). Sans montant.
export const discard = (target) => ({ action: "discard", ...(target === undefined ? {} : { target }) });

// Rebond : renvoie en main la bille elle-même (sans cible : sur le triangle, ou en
// partance pendant son Final ou son Éjection), celle d'un emplacement, des billes
// actives au choix (choice) ou toutes les billes actives filtrées (allActive). Sans
// montant.
export const bounce = (target) => ({ action: "bounce", ...(target === undefined ? {} : { target }) });

// Ramasser : reprend en main la dernière bille arrivée à la défausse
// (LAST_DISCARDED) ou des billes de la défausse au choix (choice). Toujours une
// cible. Sans montant.
export const retrieve = (target) => ({ action: "retrieve", target });

// APPLIQUER UN STATUT (marbles/content/statuses/) à la partie : `id`, le statut ;
// `intensity`, son intensité (1 par défaut) ; `duration` (facultatif), le nombre de
// tours ou de charges, pour un statut dont la durée se compte seulement (la sorte de
// durée est celle du statut). applyStatus("whiplash"), applyStatus("cushion",
// { intensity: 2 }), applyStatus("cushion", { duration: 1 }).
export const applyStatus = (id, { intensity = 1, duration } = {}) => ({ action: "applyStatus", status: id, amount: intensity, ...(duration === undefined ? {} : { duration }) });
