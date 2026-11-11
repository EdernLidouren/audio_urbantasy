// Jeu des billes, sons de l'écran : la CHRONOLOGIE, pure. Le journal d'un geste
// devient une ligne de temps de repères (eventCues, un point d'accroche par type
// d'évènement, MARBLE_EVENT_CUES) : balises, chutes, roulements, collisions, à leur
// échéance. Rien ne s'y joue : la lecture est l'affaire de ./playback.js. Point
// d'entrée et vue d'ensemble : view/marbles/sounds.js.

import { MARBLES_COLLISION, MARBLES_ROLLS, MARBLES_SETTINGS, MARBLES_SOUND_PLACES } from "../../../config/marbles-values.js";
import { ROTATION_NEXT, SLOTS } from "../../../core/marbles.js";
import { rollDurationMs } from "../rolls.js";
import { discardPlace, handPlace, positionOf, potPlace, slotPlace } from "./space.js";
import MARBLE_TYPES from "../../../marbles/types/index.js";

// La FORCE d'une collision : le rapport des poids des CALIBRES de la frappeuse (la
// posée) et de la frappée (l'éjectée), élevé à `weightExponent`. 1 entre deux
// billes de même calibre ; plus quand une grosse frappe une petite, moins dans
// l'autre sens.
export function collisionStrength(striker, struck, { types = MARBLE_TYPES, collision = MARBLES_COLLISION } = {}) {
  const ratio = collision.weights[types[striker].size] / collision.weights[types[struck].size];
  return ratio ** collision.weightExponent;
}


// La ligne de temps d'un geste : les repères déjà posés, l'échéance de la
// prochaine balise de pioche (la suivante attend la précédente) et celle du
// prochain départ d'une bille usée. Un repère : { atMs, sound, marble?, place?,
// gain? } (`gain` multiplie le volume de sa catégorie) ; un roulement : { atMs,
// sound: "roll", marble, path, style, durationMs }, `path` étant la suite des places
// par où passe la bille ; une collision : { atMs, sound: "collision", marble (la
// frappeuse), struck (la frappée), place, gain }.
function createTimeline(settings, { rolls, places }) {
  const cues = [];
  let nextDrawAt = 0;
  let nextWornAt = 0;
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
      nextDrawAt += settings.drawSoundIntervalMs;
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
    // Une bille usée part à la défausse ; plusieurs, l'une après l'autre.
    worn(marble, slot) {
      this.out(nextWornAt, marble, slot);
      nextWornAt += rolls.outStaggerMs;
    },
    // Une bille mise en poche roule de `from` (une place) au pot, et y tombe : le
    // même roulement qu'une bille usée, à la suite des autres départs.
    pocket(marble, from) {
      const arrival = this.roll(nextWornAt, marble, [from, potPlace()], "out");
      cues.push(cue(arrival, "drop", marble, potPlace()));
      nextWornAt += rolls.outStaggerMs;
    },
  };
}

// D'où part une bille mise en poche : son emplacement, sa place dans la main (la main
// d'après le geste, plus elle), ou la défausse.
function pocketOrigin(event, context) {
  if (event.from === "triangle") return slotPlace(event.slot);
  if (event.from === "hand") return handPlace(event.index, (context.handSize ?? 0) + 1);
  return discardPlace();
}

// Les emplacements par où passe la bille de `origin` quand le triangle tourne de
// `notches` crans, départ et arrivée compris : 1 cran, deux emplacements ; 3 crans,
// le tour complet, elle revient à sa place. L'ordre est celui du cœur
// (core/marbles.js/ROTATION_NEXT).
export function rotationPath(origin, notches) {
  const slots = [origin];
  for (let notch = 0; notch < notches; notch++) slots.push(ROTATION_NEXT[slots[slots.length - 1]]);
  return slots;
}

// Un point d'accroche par type d'évènement du journal : ce qu'il ajoute à la ligne
// de temps, ou null s'il est muet aujourd'hui. Un nouvel évènement a sa ligne ici
// (vérifié par le domaine marbles-view). `context` : `triangleAfter`, le triangle
// juste après l'action, pour l'échange, dont l'évènement ne nomme que les
// emplacements ; `nextDrawPlace()`, la place dans la main de la bille piochée
// suivante ; `placeFrom`, la place dans la main de la bille posée ; `struck`, la
// bille délogée par la pose en cours, que le journal dit AVANT la pose.
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
  // L'Éveil, la Chiquenaude et la Trouvaille : des points d'accroche, muets
  // aujourd'hui (aucun son dédié).
  awaken: null,
  flick: null,
  windfall: null,
  knockout: (event, timeline, context) => {
    context.struck = event.marble;
  },
  removed: null,
  // La mise en poche : la bille roule de là où elle était au pot (de l'emplacement, de
  // la main, de la défausse). La perte et l'étape du pot : des points d'accroche,
  // muets aujourd'hui, la perte sans place imposée.
  pocketed: (event, timeline, context) => timeline.pocket(event.marble, pocketOrigin(event, context)),
  lost: null,
  potResolution: null,
  // Une réaction du pot : un point d'accroche, sans son à elle aujourd'hui ; l'arrêt
  // d'un enchaînement, muet aussi (son annonce suffit).
  pocketReaction: null,
  chainInterrupted: null,
  // Un choix : son ouverture (`choice`) et chaque validation (`chosen`) sont des
  // points d'accroche, sans son à eux aujourd'hui ; sa fin et un choix indécis (la
  // prévision) aussi.
  choice: null,
  chosen: null,
  choiceEnded: null,
  choiceUndecided: null,
  // L'usée roule à la défausse ; la délogée part avec le choc (placed).
  // Chassée par Éjecter : le même roulement vers la défausse qu'une bille usée.
  discarded: (event, timeline) => {
    if (event.cause === "wear" || event.cause === "eject") timeline.worn(event.marble, event.slot);
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
  // Le Final d'une bille usée, le Polissage, la Fêlure, une cible vide : des points
  // d'accroche, muets pour l'instant. Une bille retirée par une Fêlure part comme
  // une bille usée (`discarded`).
  final: null,
  polished: null,
  cracked: null,
  targetEmpty: null,
  // La bille active fait entendre sa voix quand vient la phase de son emplacement,
  // avec l'étape de la séquence qui dit ce qu'elle produit.
  phase: (event, timeline) => timeline.now("beacon", event.marble, slotPlace(event.slot)),
  phaseSkipped: null,
  effect: null,
  wear: null,
  impact: null,
  // Un cran par tour aujourd'hui ; le jour où un effet en ajoutera (jusqu'à 3, un
  // tour complet), l'évènement dira combien, et rotation() suivra.
  rotation: (event, timeline) => timeline.rotation(event.triangle, 1),
  turnEnded: null,
  gameOver: null,
};

// Les repères des évènements d'un geste, dans l'ordre du journal. `shuffleFirst` :
// le sac vient d'être constitué (ouverture de la partie), ce que le journal ne dit
// pas, la simulation mélangeant le sac à sa création. `handAfter` : la main après le
// geste ; une pioche ajoute sa bille au bout de la main, les billes piochées sont
// donc les dernières, dans l'ordre. Sans elle, les balises de pioche s'entendent au
// centre. `placeFrom` : d'où part la bille posée, sa place dans la main AVANT la
// pose (le journal ne la dit pas) ; sans elle, du milieu de la main. `table` : ce
// qui règle les trajets et les chocs, par défaut ceux du jeu : les roulements, les
// places, la collision, les billes et leurs tailles.
export function eventCues(
  events,
  { triangleAfter = null, handAfter = null, shuffleFirst = false, placeFrom = handPlace(0, 1) } = {},
  settings = MARBLES_SETTINGS,
  {
    rolls = MARBLES_ROLLS,
    places = MARBLES_SOUND_PLACES,
    collision = MARBLES_COLLISION,
    types = MARBLE_TYPES,
  } = {}
) {
  const table = { rolls, places, collision, types };
  const timeline = createTimeline(settings, table);
  const drawCount = events.filter((event) => event.type === "draw").length;
  let drawn = 0;
  const context = {
    triangleAfter,
    handSize: handAfter?.length,
    placeFrom,
    struck: null,
    nextDrawPlace: () => (handAfter === null ? undefined : handPlace(handAfter.length - drawCount + drawn++, handAfter.length)),
  };
  if (shuffleFirst) timeline.shuffle();
  for (const event of events) {
    const cue = MARBLE_EVENT_CUES[event.type];
    if (cue) cue(event, timeline, context, settings, table);
  }
  return timeline.cues;
}

// DÉMONSTRATION des places (mode debug, Maj+B) : la même balise à chaque place,
// de la plus proche à la plus lointaine, pour régler l'espace à l'oreille
// (MARBLES_SOUND_PLACES, MARBLES_SOUND_DEPTH). Une main de 5 : à gauche, au
// centre, à droite ; puis les deux bases et la pointe.
const DEMO_INTERVAL_MS = 700;

export function placesDemoCues(marble) {
  const places = [handPlace(0, 5), handPlace(2, 5), handPlace(4, 5), slotPlace("leftBase"), slotPlace("rightBase"), slotPlace("apex")];
  return places.map((place, index) => ({ atMs: index * DEMO_INTERVAL_MS, sound: "beacon", marble, place }));
}
