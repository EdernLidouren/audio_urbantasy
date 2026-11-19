// Jeu des billes, sons de l'écran : la CHRONOLOGIE, pure. Le journal d'un geste
// devient une ligne de temps de repères (eventCues, un point d'accroche par type
// d'évènement, MARBLE_EVENT_CUES) : balises, chutes, roulements, collisions, à leur
// échéance. Rien ne s'y joue : la lecture est l'affaire de ./playback.js. Point
// d'entrée et vue d'ensemble : marbles/view/sounds.js.

import { MARBLE_POCKET, MARBLE_TRIGGERS, MARBLES_COLLISION, MARBLES_ROLLS, MARBLES_SETTINGS, MARBLES_SOUND_PLACES } from "../../config/values.js";
import { SLOTS, nextSlot } from "../../core/marbles.js";
import { rollDurationMs } from "../rolls.js";
import { discardPlace, handPlace, positionOf, potPlace, slotPlace } from "./space.js";

// La FORCE d'une collision : le rapport des poids des CALIBRES de la frappeuse (la
// posée) et de la frappée (l'éjectée), élevé à `weightExponent`. 1 entre deux
// billes de même calibre ; plus quand une grosse frappe une petite, moins dans
// l'autre sens. `types` : la table des billes, toujours injectée (les règles de
// l'écran, rules.types), jamais la vraie importée ici.
export function collisionStrength(striker, struck, { types, collision = MARBLES_COLLISION }) {
  const ratio = collision.weights[types[striker].size] / collision.weights[types[struck].size];
  return ratio ** collision.weightExponent;
}


// La ligne de temps d'un geste : les repères déjà posés, l'échéance de la
// prochaine balise de pioche (la suivante attend la précédente), celle du
// prochain départ d'une bille usée et celle du prochain son d'usure. Un repère : { atMs, sound, marble?, place?,
// gain? } (`gain` multiplie le volume de sa catégorie) ; un roulement : { atMs,
// sound: "roll", marble, path, style, durationMs }, `path` étant la suite des places
// par où passe la bille ; une collision : { atMs, sound: "collision", marble (la
// frappeuse), struck (la frappée), place, gain }.
function createTimeline(settings, { rolls, places }) {
  const cues = [];
  let nextDrawAt = 0;
  let nextWornAt = 0;
  let nextWearAt = 0;
  let nextTriggerAt = 0;
  // La dernière balise de pioche : son échéance et sa place (l'Éveil la suit).
  let lastDraw = null;
  const cue = (atMs, sound, marble, place, gain) => ({
    atMs,
    sound,
    ...(marble === undefined ? {} : { marble }),
    ...(place === undefined ? {} : { place }),
    ...(gain === undefined ? {} : { gain }),
  });
  return {
    cues,
    now(sound, marble, place) {
      cues.push(cue(0, sound, marble, place));
    },
    at(atMs, sound, marble, place, gain) {
      cues.push(cue(atMs, sound, marble, place, gain));
    },
    shuffle() {
      cues.push(cue(0, "shuffle"));
      nextDrawAt = Math.max(nextDrawAt, settings.shuffleToDrawMs);
    },
    draw(marble, place) {
      cues.push(cue(nextDrawAt, "beacon", marble, place));
      lastDraw = { atMs: nextDrawAt, place };
      nextDrawAt += settings.drawSoundIntervalMs;
    },
    // L'Éveil de la bille qui vient d'être piochée : à sa place dans la main,
    // awakenAfterDrawMs après sa balise ; la balise suivante l'attend.
    awaken(marble) {
      const atMs = (lastDraw?.atMs ?? 0) + settings.awakenAfterDrawMs;
      cues.push(cue(atMs, "awaken", marble, lastDraw?.place));
      nextDrawAt = Math.max(nextDrawAt, atMs + settings.drawSoundIntervalMs);
    },
    // Un son de déclencheur (Final, Trouvaille) à `place` ; plusieurs, l'un après
    // l'autre.
    trigger(sound, marble, place) {
      cues.push(cue(nextTriggerAt, sound, marble, place));
      nextTriggerAt += settings.triggerSoundIntervalMs;
    },
    // Le début du tour du joueur, au centre : après les balises de pioche du geste.
    playerTurn() {
      cues.push(cue(nextDrawAt, "playerTurn"));
    },
    // Une bille roule le long de `path` (des places) à partir de `atMs` :
    // l'échéance de son arrivée. `speedFactor` multiplie la vitesse du style (la
    // bille délogée, lancée par la force du choc).
    roll(atMs, marble, path, style, speedFactor = 1) {
      const durationMs =
        rollDurationMs(
          path.map((place) => positionOf(place, places)),
          rolls[style]
        ) / speedFactor;
      cues.push({ atMs, sound: "roll", marble, path, style, durationMs });
      return atMs + durationMs;
    },
    // La collision de `marble` contre `struck`, à `place`, à la force `gain`.
    collision(atMs, marble, struck, place, gain) {
      cues.push({ ...cue(atMs, "collision", marble, place, gain), struck });
    },
    // Une bille quitte `slot` pour la défausse à partir de `atMs`, et y tombe. Usée
    // par défaut (`out`) ; délogée, `knocked`, à la force du choc.
    out(atMs, marble, slot, style = "out", speedFactor = 1) {
      const arrival = this.roll(atMs, marble, [slotPlace(slot), discardPlace()], style, speedFactor);
      cues.push(cue(arrival, "drop", marble, discardPlace()));
    },
    // Le triangle tourne de `notches` crans : chaque bille roule d'emplacement en
    // emplacement jusqu'au sien, toutes ensemble, puis s'y cale. `triangleAfter` :
    // le triangle après la rotation, d'où l'on remonte qui venait d'où.
    rotation(triangleAfter, notches) {
      for (const origin of SLOTS) {
        const slots = rotationPath(origin, notches);
        const destination = slots[slots.length - 1];
        const placed = triangleAfter[destination];
        if (placed === null) continue;
        const arrival = this.roll(0, placed.marble, slots.map(slotPlace), "rotation");
        cues.push(cue(arrival, "drop", placed.marble, slotPlace(destination), rolls.rotation.dropGain));
      }
    },
    // Un son d'usure (`polish`, `crack`) à l'emplacement de la bille touchée ;
    // plusieurs, l'un après l'autre. -> son échéance.
    wear(sound, marble, slot) {
      const atMs = nextWearAt;
      cues.push(cue(atMs, sound, marble, slotPlace(slot)));
      nextWearAt += settings.wearSoundIntervalMs;
      return atMs;
    },
    // Les départs vers la défausse attendent `atMs` au moins : une bille retirée
    // par une Fêlure part après le son de sa fêlure.
    holdDepartures(atMs) {
      nextWornAt = Math.max(nextWornAt, atMs);
    },
    // Une bille usée part à la défausse ; plusieurs, l'une après l'autre.
    worn(marble, slot) {
      this.out(nextWornAt, marble, slot);
      nextWornAt += rolls.outStaggerMs;
    },
    // Une bille déplacée par un effet roule de `from` (une place) à `to` (le pot, la
    // défausse), et y tombe : le même roulement qu'une bille usée, à la suite des
    // autres départs.
    depart(marble, from, to) {
      const arrival = this.roll(nextWornAt, marble, [from, to], "out");
      cues.push(cue(arrival, "drop", marble, to));
      nextWornAt += rolls.outStaggerMs;
    },
  };
}

// D'où part une bille déplacée par un effet : son emplacement, sa place dans la main
// (la main d'après le geste, plus elle), ou la défausse.
function originPlace(event, context) {
  if (event.from === "triangle") return slotPlace(event.slot);
  if (event.from === "hand") return handPlace(event.index, (context.handSize ?? 0) + 1);
  return discardPlace();
}

// Les emplacements par où passe la bille de `origin` quand le triangle tourne de
// `notches` crans, départ et arrivée compris : 1 cran, deux emplacements ; 3 crans,
// le tour complet, elle revient à sa place. L'ordre est celui du cœur, chaque
// cran vers l'emplacement suivant (marbles/core/effects.js/nextSlot).
export function rotationPath(origin, notches) {
  const slots = [origin];
  for (let notch = 0; notch < notches; notch++) slots.push(nextSlot(slots[slots.length - 1]));
  return slots;
}

// Un point d'accroche par type d'évènement du journal : ce qu'il ajoute à la ligne
// de temps, ou null s'il est muet aujourd'hui. Un nouvel évènement a sa ligne ici
// (vérifié par le domaine marbles-view). `context` : `triangleAfter`, le triangle
// juste après l'action, pour l'échange, dont l'évènement ne nomme que les
// emplacements ; `nextDrawPlace()`, la place dans la main de la bille piochée
// suivante ; `placeFrom`, la place dans la main de la bille posée ; `struck`, la
// bille délogée par la pose en cours, dont le journal dit le départ AVANT la pose.
export const MARBLE_EVENT_CUES = {
  turnStarted: null,
  draw: (event, timeline, context) => timeline.draw(event.marble, context.nextDrawPlace()),
  drawSkipped: null,
  bagRegenerated: (event, timeline) => timeline.shuffle(),
  // La bille choisie roule la première (elle était en `a`, elle est maintenant en
  // `b`), puis l'autre, s'il y en avait une ; chacune tombe à son arrivée.
  swapped: (event, timeline, context, settings) => {
    const chosen = context.triangleAfter[event.b];
    const other = context.triangleAfter[event.a];
    if (chosen !== null) {
      const arrival = timeline.roll(0, chosen.marble, [slotPlace(event.a), slotPlace(event.b)], "swap");
      timeline.at(arrival, "drop", chosen.marble, slotPlace(event.b));
    }
    if (other !== null) {
      const arrival = timeline.roll(chosen === null ? 0 : settings.swapSoundDelayMs, other.marble, [slotPlace(event.b), slotPlace(event.a)], "swap");
      timeline.at(arrival, "drop", other.marble, slotPlace(event.a));
    }
  },
  // Le choc se joue avec la pose qui suit, à l'arrivée de la bille posée.
  // L'Éveil, la Chiquenaude et la Trouvaille : leur son, quand la bille a l'effet
  // de ce mot-clé (hasTriggerEffect). L'Éveil suit la balise de sa pioche, à la
  // même place ; la Chiquenaude part de la place de la bille dans la main ; la
  // Trouvaille, de son emplacement.
  awaken: (event, timeline, context, settings, table) => {
    if (hasTriggerEffect(table, event.marble, "awaken")) timeline.awaken(event.marble);
  },
  flick: (event, timeline, context, settings, table) => {
    if (hasTriggerEffect(table, event.marble, "flick")) timeline.at(0, "flick", event.marble, context.placeFrom);
  },
  windfall: (event, timeline, context, settings, table) => {
    if (hasTriggerEffect(table, event.marble, "windfall")) timeline.trigger("windfall", event.marble, slotPlace(event.slot));
  },
  // Le départ d'une bille délogée par un REMPLACEMENT (une pose sur un emplacement
  // occupé), dit avant l'arrivée de la bille posée : elle part avec le choc de la
  // pose qui suit. Chassée par l'action Éjecter, elle n'a pas de pose : elle roule à
  // la défausse à son arrivée. Son Éjection, qui joue après le Tic, n'a pas de son à
  // elle.
  knockout: null,
  removed: (event, timeline, context) => {
    if (event.cause === "replacement") context.struck = event.marble;
  },
  // Une redirection : un point d'accroche muet, l'arrivée a son son.
  redirected: null,
  // Une bille arrivée en main (Rebond, Ramasser) roule de là où elle était (son
  // emplacement, la défausse) à sa place dans la main, et y tombe.
  returned: (event, timeline, context) =>
    timeline.depart(event.marble, originPlace(event, context), handPlace(event.handIndex, Math.max(context.handSize ?? 0, event.handIndex + 1))),
  // La mise en poche : la bille roule de là où elle était au pot (de l'emplacement, de
  // la main, de la défausse). La perte et l'étape du pot : des points d'accroche,
  // muets aujourd'hui, la perte sans place imposée.
  pocketed: (event, timeline, context) => timeline.depart(event.marble, originPlace(event, context), potPlace()),
  lost: null,
  potResolution: null,
  // Une réaction du pot : un point d'accroche, sans son à elle aujourd'hui ; l'arrêt
  // d'un enchaînement, muet aussi (son annonce suffit).
  pocketReaction: null,
  // Les statuts : des points d'accroche, sans son à eux aujourd'hui.
  statusGained: null,
  statusStrengthened: null,
  statusUnchanged: null,
  statusActivated: null,
  statusCharge: null,
  statusExpired: null,
  statusReaction: null,
  valueModified: null,
  chainInterrupted: null,
  // Un choix : son ouverture (`choice`) et chaque validation (`chosen`) sont des
  // points d'accroche, sans son à eux aujourd'hui ; sa fin et un choix indécis (la
  // prévision) aussi.
  choice: null,
  chosen: null,
  choiceEnded: null,
  choiceUndecided: null,
  // L'usée roule à la défausse ; la délogée part avec le choc (placed).
  // Chassée par Éjecter, défaussée du triangle : le même roulement vers la défausse
  // qu'une bille usée. Défaussée de la main : de sa place dans la main. Du sac : un
  // point d'accroche muet.
  discarded: (event, timeline, context) => {
    if (event.from === "triangle" && event.cause !== "replacement") timeline.worn(event.marble, event.slot);
    else if (event.from === "hand") timeline.depart(event.marble, originPlace(event, context), discardPlace());
  },
  // Éjecter : un point d'accroche, sans son à lui aujourd'hui.
  eject: null,
  // La bille roule de la main à l'emplacement. Vide : elle s'y pose et y tombe.
  // Occupé : elle est tirée (strike), puis la collision, à la force du choc ; la
  // délogée part à la défausse, lancée d'autant.
  placed: (event, timeline, context, settings, table) => {
    const to = slotPlace(event.slot);
    const struck = context.struck;
    const arrival = timeline.roll(0, event.marble, [context.placeFrom, to], struck === null ? "place" : "strike");
    if (struck === null) {
      timeline.at(arrival, "drop", event.marble, to);
      return;
    }
    const strength = collisionStrength(event.marble, struck, table);
    timeline.collision(arrival, event.marble, struck, to, strength);
    timeline.out(arrival + table.rolls.impactToOutMs, struck, event.slot, "knocked", strength);
    context.struck = null;
  },
  hit: null,
  // Le Polissage et la Fêlure : leur son à l'emplacement de la bille touchée,
  // seulement quand l'usure change (un Polissage d'une bille à 0 est muet), ou
  // quand la Fêlure retire la bille, qui part alors à la défausse comme une bille
  // usée (`discarded`), crackToOutMs après sa fêlure.
  // Le Final : son son à l'emplacement que la bille vient de quitter.
  final: (event, timeline, context, settings, table) => {
    if (hasTriggerEffect(table, event.marble, "final")) timeline.trigger("final", event.marble, slotPlace(event.slot));
  },
  polished: (event, timeline) => {
    if (event.applied > 0) timeline.wear("polish", event.marble, event.slot);
  },
  cracked: (event, timeline, context, settings) => {
    // Le retrait se lit dans l'évènement (le core l'a décidé), jamais recalculé ici.
    const { retires } = event;
    if (event.applied === 0 && !retires) return;
    const atMs = timeline.wear("crack", event.marble, event.slot);
    if (retires) timeline.holdDepartures(atMs + settings.crackToOutMs);
  },
  // Une cible vide : un point d'accroche, muet pour l'instant.
  targetEmpty: null,
  // La bille active fait entendre sa voix quand vient la phase de son emplacement,
  // avec l'étape de la séquence qui dit ce qu'elle produit.
  phase: (event, timeline) => timeline.now("beacon", event.marble, slotPlace(event.slot)),
  phaseSkipped: null,
  // Un effet joué : son repère selon son déclencheur (EFFECT_CUES) ; les autres
  // effets restent muets, leur évènement a déjà son repère (la phase, la pose…).
  effect: (event, timeline, context, settings) => EFFECT_CUES[event.trigger]?.(event, timeline, context, settings),
  wear: null,
  impact: null,
  // Les points d'accroche de l'objectif (MARBLES_AUDIO), au centre.
  tierReached: (event, timeline) => timeline.now("tier", null, null),
  // Autant de crans que l'évènement en porte.
  rotation: (event, timeline) => timeline.rotation(event.triangle, event.notches),
  turnEnded: null,
  gameOver: (event, timeline) => {
    const sound = RESULT_SOUNDS[event.result.goal](event.result);
    if (sound !== null) timeline.now(sound, null, null);
  },
};

// Le point d'accroche d'un résultat (MARBLES_AUDIO) : la victoire ou l'échec d'une
// cible, la fin d'une endurance, le palier d'une partie libre (aucun sans palier).
const RESULT_SOUNDS = {
  free: (result) => (result.tier === "none" ? null : "tier"),
  target: (result) => result.outcome,
  endurance: () => "enduranceEnd",
};

// La bille a-t-elle un effet pour ce déclencheur (MARBLE_TRIGGERS, son champ) ? Une
// bille inconnue n'en a pas.
const TRIGGER_FIELDS = Object.fromEntries(MARBLE_TRIGGERS.map((trigger) => [trigger.id, trigger.field]));
function hasTriggerEffect(table, marble, trigger) {
  return marble !== null && marble !== undefined && (table.types[marble]?.[TRIGGER_FIELDS[trigger]]?.length ?? 0) > 0;
}

// Les déclencheurs d'une bille du POT qui AGIT : son effet à chaque résolution et ses
// réactions (MARBLE_POCKET), pas son entrée, que son roulement et sa chute disent
// déjà (pocketed).
const POT_ACTING_TRIGGERS = MARBLE_POCKET.moments.filter((moment) => moment.event !== "pocketed").map((moment) => moment.trigger);

// Le repère d'un effet joué, par déclencheur (l'évènement `effect`) : seulement
// quand la bille a un effet pour ce moment, puisque l'évènement n'existe qu'alors.
//   une bille du pot qui agit : sa balise, au pot, au moment de son étape.
const EFFECT_CUES = {
  ...Object.fromEntries(POT_ACTING_TRIGGERS.map((trigger) => [trigger, (event, timeline) => timeline.now("beacon", event.marble, potPlace())])),
};

// Les repères des évènements d'un geste, dans l'ordre du journal. `shuffleFirst` :
// le sac vient d'être constitué (ouverture de la partie), ce que le journal ne dit
// pas, la simulation mélangeant le sac à sa création. `handAfter` : la main après le
// geste ; une pioche ajoute sa bille au bout de la main, les billes piochées sont
// donc les dernières, dans l'ordre. Sans elle, les balises de pioche s'entendent au
// centre. `placeFrom` : d'où part la bille posée, sa place dans la main AVANT la
// pose (le journal ne la dit pas) ; sans elle, du milieu de la main. `table` : ce
// qui règle les trajets et les chocs, par défaut ceux du jeu (les roulements, les
// places, la collision), sauf `types`, la table des billes et de leurs tailles,
// OBLIGATOIRE : les règles de l'écran (rules.types), jamais la vraie importée ici.
// `handSize` : la taille de la main juste après ces évènements, quand `handAfter`
// est déjà plus loin (une étape d'une séquence, l'état étant celui de sa fin) ; par
// défaut, celle de `handAfter`. `playerTurn` : la main revient au joueur au début de
// son tour avec ces évènements (l'ouverture de la partie, l'étape qui dit le début
// du tour) : son son, après les balises de pioche.
export function eventCues(
  events,
  { triangleAfter = null, handAfter = null, handSize = handAfter?.length, shuffleFirst = false, placeFrom = handPlace(0, 1), playerTurn = false } = {},
  settings = MARBLES_SETTINGS,
  { rolls = MARBLES_ROLLS, places = MARBLES_SOUND_PLACES, collision = MARBLES_COLLISION, types } = {}
) {
  if (types === null || typeof types !== "object") throw new Error("sons des billes : eventCues demande la table des billes (`types`).");
  const table = { rolls, places, collision, types };
  const timeline = createTimeline(settings, table);
  const drawCount = events.filter((event) => event.type === "draw").length;
  let drawn = 0;
  const context = {
    triangleAfter,
    handSize,
    placeFrom,
    struck: null,
    nextDrawPlace: () => (handSize === undefined ? undefined : handPlace(handSize - drawCount + drawn++, handSize)),
  };
  if (shuffleFirst) timeline.shuffle();
  for (const event of events) {
    const cue = MARBLE_EVENT_CUES[event.type];
    if (cue) cue(event, timeline, context, settings, table);
  }
  if (playerTurn) timeline.playerTurn();
  return timeline.cues;
}

// De combien des évènements changent la taille de la main : une bille piochée y
// entre ; une bille posée, empochée ou perdue depuis la main en sort. Pour retrouver
// la main au moment d'une étape, en remontant depuis la main finale.
export function handSizeChange(events) {
  let change = 0;
  for (const event of events) {
    if (event.type === "draw" || event.type === "returned") change += 1;
    else if (event.type === "placed") change -= 1;
    else if (["pocketed", "lost", "discarded"].includes(event.type) && event.from === "hand") change -= 1;
  }
  return change;
}

// DÉMONSTRATION des places (mode debug, Maj+B) : la même balise à chaque place,
// de la plus proche à la plus lointaine, pour régler l'espace à l'oreille
// (MARBLES_SOUND_PLACES, MARBLES_SOUND_DEPTH). Une main pleine (`size`, la taille en
// vigueur) : à gauche, au centre, à droite ; puis les deux bases et la pointe.
export function placesDemoCues(marble, size, settings = MARBLES_SETTINGS) {
  const hand = [0, Math.floor((size - 1) / 2), size - 1].map((index) => handPlace(index, size));
  const places = [...hand, slotPlace("leftBase"), slotPlace("rightBase"), slotPlace("apex")];
  return places.map((place, index) => ({ atMs: index * settings.placesDemoIntervalMs, sound: "beacon", marble, place }));
}
