// GESTIONNAIRES INJECTÉS de l'interaction : enregistrés UNE FOIS par
// view/action-handlers.js/registerActionHandlers, à la construction de
// l'écran ville (au plus un écran ville vivant à la fois). Ils permettent à
// l'interaction (view/interaction.js, view/effect-runner.js,
// view/action-execution.js) de déclencher un effet qui touche la session ou
// la vue du monde SANS les connaître : elle délègue à qui les possède, et
// n'écrit jamais l'état elle-même. Exportés en liaisons vivantes (`export
// let`) : les lecteurs voient toujours le gestionnaire courant ; seul le
// setter l'écrit.

export let teleportHandler = null;
export let pickupHandler = null;
export let itemPickupHandler = null;
export let lootHandler = null;
export let lootUniqueHandler = null;
export let lootSpawnHandler = null;
export let sideSwitchHandler = null;
export let variableEffectsHandler = null;
export let searchHandler = null;
export let shopHandler = null;

// (effect) => void — exécute l'effet MIXTE "teleport" (voir core/effects.js,
// doc/scripting.md/"Effets d'action") : une PORTE n'est pas un cas
// spécial, juste une action dont `effects` contient CET effet (voir
// runEffects plus bas) — le gestionnaire (view/world-travel.js/
// executeTeleport) est le SEUL chemin de téléportation JOUEUR, qu'il soit
// déclenché par une porte ou par n'importe quel autre effet. Asynchrone
// (sas + fondu, voir view/world-travel.js/runTeleportSas), mais JAMAIS
// attendu ici : le gestionnaire gère seul son propre séquençage.
export function setTeleportHandler(handler) {
  teleportHandler = handler;
}

// (arrivalX, entity) => Promise<void> — bascule la face courante via un SAS
// animé (croisement des filtres d'occlusion, pas de TRAJET/ARRIVÉE PUIS
// reconstruction de la scène audio, voir view/world-travel.js/
// sideSwitch ; core/state.js/switchSide ; entities/types/passage.js),
// même patron que setTeleportHandler — PAS un travelToWorld, on
// reste dans le même monde. Asynchrone comme teleportHandler, mais
// handleSwitchSide ne l'attend pas : le gestionnaire gère seul son propre
// sas. `entity` : LE PASSAGE lui-même — transmis tel quel (jamais relu ici,
// ce fichier ignore tout du son) pour que le gestionnaire puisse résoudre
// SES flags (transitionSteps/transitionSurface, cascade instance ->
// archétype -> défaut, voir config/tuning-values.js), exactement comme un
// effet playSound diégétique reçoit l'entité porteuse (voir
// view/effect-runner.js/runPlaySoundEffect).
export function setSideSwitchHandler(handler) {
  sideSwitchHandler = handler;
}

// (entity, amount) => void — applique l'effet d'ÉTAT du ramassage (argent +
// retrait de l'entité, voir core/money.js/pickupEntity), fourni par
// view/action-handlers.js qui seul détient getSession/setSession. Ce fichier ne fait
// qu'appeler ce qu'on lui a donné, puis gère le retour sensoriel (son,
// annonce) — jamais l'inverse. `amount` : DÉJÀ EXTRAIT de l'action RÉSOLUE
// par view/action-execution.js/handlePickup — jamais entity.action.amount relu ici
// ou par l'appelant, qui ne doit rien savoir de la forme (objet unique ou
// candidate choisie dans un tableau, voir doc/scripting.md/"Actions
// multiples filtrées par condition").
export function setPickupHandler(handler) {
  pickupHandler = handler;
}

// (entity, item, count) => void — applique l'effet d'ÉTAT du ramassage vers
// le SAC (objet + retrait de l'entité, voir core/bag.js/pickupItemEntity ;
// doc/entity-model.md/"Sac d'objets"), même patron que setPickupHandler
// ci-dessus mais DISTINCT : pickupHandler écrit dans session.money,
// itemPickupHandler dans session.bag — même verbe ("pickup"), effet choisi
// selon la FORME de l'action (voir view/action-execution.js/handlePickup).
export function setItemPickupHandler(handler) {
  itemPickupHandler = handler;
}

// (entity, amount) => void — applique l'effet d'ÉTAT du "loot" (argent +
// entity.consumed, voir core/money.js/lootEntity ; doc/entity-model.md/
// "Collectible persistant"), même patron que setPickupHandler ci-dessus
// (`amount` déjà extrait, même raison). Distinct de pickupHandler : l'entité
// looté N'EST JAMAIS retirée, seul son état change.
export function setLootHandler(handler) {
  lootHandler = handler;
}

// (entity) => void — applique l'effet d'ÉTAT du "loot" OBJET UNIQUE (ni
// montant ni éparpillement : entity.consumed seul, voir
// core/money.js/lootUniqueEntity). La substance de cet objet est dans les
// effets de l'action (ex. giveImprovement), exécutés avant, comme pour
// tout kind.
export function setLootUniqueHandler(handler) {
  lootUniqueHandler = handler;
}

// (entity, spawn) => void — applique l'effet d'ÉTAT du "loot à spawn"
// (entity.consumed + N entités éphémères éparpillées, voir
// core/money.js/lootEntitySpawn ; doc/entity-model.md/"Entités éphémères"),
// même patron que setLootHandler ci-dessus — variante déclarée via
// action.spawn plutôt qu'action.amount (voir view/action-execution.js/handleLoot).
export function setLootSpawnHandler(handler) {
  lootSpawnHandler = handler;
}

// (entity, effects) => void — applique une LISTE d'effets D'ÉCRITURE de
// variable (setVariable/toggleVariable/addVariable, voir core/script-parse.js/
// parseActionEffect, core/variables.js/applyActionEffects), fournie par
// view/action-handlers.js qui seul détient getSession/setSession — même
// patron que setPickupHandler ci-dessus. Appelé par view/effect-runner.js/runEffects pour TOUT
// kind, avant son handler ; c'est la SEULE substance du kind GÉNÉRIQUE
// "applyEffects" (voir view/action-execution.js/handleApplyEffects), qui n'a aucun état
// "métier" propre, contrairement à pickup/loot/switchSide/search/shop.
export function setVariableEffectsHandler(handler) {
  variableEffectsHandler = handler;
}

// (entity) => { status, count } — applique l'effet d'ÉTAT de la FOUILLE d'un conteneur
// de collecte (voir core/spawn.js/searchContainer, doc/entity-model.md/
// "Collecte"), même patron que setLootSpawnHandler : le stock TOMBE au sol
// en éphémères éparpillés. Renvoie { status, count } (état du conteneur
// avant la fouille, nombre d'objets tombés) — le retour sensoriel (annonce)
// reste dans view/action-execution.js/handleSearch.
export function setSearchHandler(handler) {
  searchHandler = handler;
}

// (entity) => void — ouvre le menu du POINT DE VENTE (voir view/menus/
// shop-menu.js/openShopMenu), fourni par view/action-handlers.js qui seul
// détient la vue du monde et getSession — même patron que les gestionnaires ci-dessus. Aucun
// effet d'état ici : la transaction, elle, passe par le gestionnaire de
// vente injecté dans shop-menu.js.
export function setShopHandler(handler) {
  shopHandler = handler;
}

// (entity) => void — ouvre l'achat à un PRÉSENTOIR (voir view/menus/
// display-purchase.js/openDisplayPurchase), même patron que setShopHandler :
// fourni par view/action-handlers.js, qui détient la vue du monde.
export let displayHandler = null;

export function setDisplayHandler(handler) {
  displayHandler = handler;
}

// () => session — fournit LA SESSION pour l'évaluation d'une condition
// d'action (voir view/interaction.js/actionContext), même principe d'injection que les
// gestionnaires ci-dessus. L'évaluateur reste un PUR consommateur de
// données (core/presence.js/evaluateCondition) : la vue lit `session`
// pour construire un contexte, elle ne l'écrit jamais (toute écriture reste
// déléguée aux gestionnaires enregistrés, qui seuls détiennent setSession).
export let sessionProvider = null;

export function setSessionProvider(provider) {
  sessionProvider = provider;
}

// (entityId, descriptor) => joue un one-shot POSITIONNÉ + FILTRÉ sur
// l'entité `entityId`, exactement comme un beacon/vocal à cet instant (voir
// view/audio/oneshots.js/playEntityOneShot, câblé par view/action-handlers.js)
// — fournit le rendu DIÉGÉTIQUE de l'effet "playSound" (voir
// view/effect-runner.js pour le rendu MÉTA, non positionné). Même principe
// d'injection que sessionProvider : la vue de l'interaction ne connaît ni
// la scène ni sa chaîne de filtrage, seulement CE point d'entrée. Sans
// provider (hors ville, scène pas encore montée) -> repli défensif sur le
// rendu MÉTA, voir view/effect-runner.js/runPlaySoundEffect.
export let positionedSoundPlayer = null;

export function setPositionedSoundPlayer(provider) {
  positionedSoundPlayer = provider;
}

// (entity) => note son type comme observé (core/observations.js), après
// une description réussie (touche Espace, voir view/interaction.js) : le
// bestiaire s'en déduit. Câblé par view/action-handlers.js.
export let observationHandler = null;

export function setObservationHandler(provider) {
  observationHandler = provider;
}

// (entityId, role?) => coupe les sons en cours de l'entité (effet
// "stopSounds", voir view/audio/oneshots.js/stopEntityOneShots), câblé par
// view/action-handlers.js comme positionedSoundPlayer. Sans provider (hors
// ville) : rien à couper.
export let entitySoundStopper = null;

export function setEntitySoundStopper(provider) {
  entitySoundStopper = provider;
}
