// Vérifications du core — domaine « marbles-pocket ». Le POT du jeu des billes
// (core/marbles.js, doc/marbles.md) : capacité, Empocher depuis chaque origine,
// cibles vides, validation, la règle « une seule fois d'une zone à l'autre », le
// mot-clé En poche (entrée, résolution) et ses réactions « à chaque (occurrence) ».
// Sur la table de billes des vérifications (core/checks/fixtures/marbles.js).
// Lancées par core/checks/index.js/runChecks (`node tools/run-checks.js marbles-pocket`).

import { throws } from "../../lib/check.js";
import { createMarblesGame, impactOf, validatePocketMoments } from "../marbles.js";
import { MARBLE_POCKET, MARBLES_SETTINGS } from "../../config/marbles-values.js";
import { CHOICELESS_TYPES, FIXTURE_BAG, FIXTURE_TYPES, fixtureRules } from "./fixtures/marbles.js";
import { caughtMessage, eventTypes, fabricatedRules, handIds, inHand, marbleCount, marblesPlayState, mustReduce, placed, triangleOf, validateTable } from "./helpers.js";

// Les règles de la table des vérifications (core/checks/fixtures/marbles.js).
const rules = fixtureRules();
// La même table sans cible au choix ni Éjecter.
const fixedRules = fixtureRules(CHOICELESS_TYPES);

// Partie en cours de tour : le tour 2 par défaut, sac vide. `over` remplace ce que
// le test veut fixer.
function playState(over = {}) {
  return marblesPlayState(rules, over);
}

// Applique une action qui doit passer (helpers.js/mustReduce). `marbles` : les
// règles à appliquer, celles de la table des vérifications par défaut ; ou une table
// fabriquée, dont on fait les règles.
function apply(state, action, marbles = rules) {
  return mustReduce(typeof marbles.reduce === "function" ? marbles : fabricatedRules(marbles), state, action);
}

export default function checkMarblesPocket(run) {
  run.section("pot", checkPocket);
  run.section("réactions du pot", checkPocketReactions);
}

// Le POT : capacité, Empocher depuis chaque origine, cibles vides, validation, la
// règle « une seule fois d'une zone à l'autre », et le mot-clé En poche (entrée,
// résolution).
function checkPocket(run) {
  // Les mécanismes du pot, sur hit_pocket d'avant les choix (la première de la main).
  const apply = (state, action, marbles = fixedRules) => mustReduce(typeof marbles.reduce === "function" ? marbles : fabricatedRules(marbles), state, action);
  const journal = (events) =>
    events.map((event) => {
      if (event.type === "effect") return `effect:${event.trigger}:${event.marble}`;
      if (event.type === "removed") return `removed:${event.marble}:${event.cause}`;
      if (event.type === "pocketed" || event.type === "lost") return `${event.type}:${event.marble}:${event.from}`;
      if (event.type === "targetEmpty") return `targetEmpty:${event.action}:${event.target ?? event.slot}`;
      return event.marble === undefined ? event.type : `${event.type}:${event.marble}`;
    });
  // Toutes les billes de la partie, pot et billes perdues comprises.
  const everywhere = (state) => marbleCount(state);

  // Sans réglage donné, la capacité est celle des réglages du jeu.
  run("pot : capacité par défaut, celle des réglages", MARBLES_SETTINGS.potCapacity, createMarblesGame(1, { bag: FIXTURE_BAG }, FIXTURE_TYPES).potCapacity);
  run.same("pot : vide en début de partie, aucune bille perdue", { pot: [], lost: [] }, (({ pot, lost }) => ({ pot, lost }))(rules.createGame(1)));
  run("pot : capacité négative refusée", true, throws(() => rules.createGame(1, { potCapacity: -1 })));
  run("pot : capacité nulle permise", 0, rules.createGame(1, { potCapacity: 0 }).potCapacity);

  // Depuis la main : le Tic de hit_pocket empoche la première bille de la main ; la
  // fragile entre, puis son effet d'entrée.
  const hitPocket = apply(playState({ hand: inHand(["hit_pocket", "fragile", "aging_flick"]), triangle: triangleOf(null, null, placed("aging_flick")) }), { type: "place", handIndex: 0, slot: "apex" });
  run.same(
    "Empocher, depuis la main : la mise en poche, puis l'entrée",
    ["effect:hit:hit_pocket", "pocketed:fragile:hand", "effect:pocketEntry:fragile"],
    journal(hitPocket.events).slice(-3)
  );
  run.same("Empocher, depuis la main : le pot, la main", { pot: ["fragile"], hand: ["aging_flick"] }, { pot: hitPocket.state.pot, hand: handIds(hitPocket.state) });
  run("Empocher, depuis la main : l'entrée aux compteurs du tour (4 + 10)", 14, hitPocket.state.speed);
  // Main vide : sans effet, noté.
  const emptyHand = apply(playState({ hand: inHand(["hit_pocket"]), triangle: triangleOf(null, null, placed("aging_flick")) }), { type: "place", handIndex: 0, slot: "apex" });
  run("Empocher, main vide : noté", "targetEmpty:pocket:firstInHand", journal(emptyHand.events).at(-1));

  // Pot plein : la bille est perdue, sans effet d'entrée.
  const full = apply(
    playState({ hand: inHand(["hit_pocket", "fragile"]), triangle: triangleOf(null, null, placed("aging_flick")), pot: ["aging_flick", "hit_polish", "awaken_draw"] }),
    { type: "place", handIndex: 0, slot: "apex" }
  );
  run.same("pot plein : la bille perdue, sans effet d'entrée", ["effect:hit:hit_pocket", "lost:fragile:hand"], journal(full.events).slice(-2));
  run.same("pot plein : pot inchangé, la bille chez les perdues", { pot: ["aging_flick", "hit_polish", "awaken_draw"], lost: ["fragile"] }, { pot: full.state.pot, lost: full.state.lost });
  run("pot plein : ni entrée ni Vitesse +10", 4, full.state.speed);
  const zero = apply(
    { ...playState({ hand: inHand(["hit_pocket", "fragile"]), triangle: triangleOf(null, null, placed("aging_flick")) }), potCapacity: 0 },
    { type: "place", handIndex: 0, slot: "apex" }
  );
  run.same("pot de capacité nulle : toute bille empochée est perdue", [], zero.state.pot);

  // Depuis un emplacement, pendant la résolution : base_pocket en base empoche la
  // pointe ; ni usure ni éjection (pas de Final) ; la phase de pointe est sautée.
  const basePocket = apply(playState({ bag: ["aging_flick"], triangle: triangleOf(placed("base_pocket"), null, placed("fragile", 1)) }), { type: "resolve" });
  run.same(
    "Empocher, depuis un emplacement : retrait, mise en poche, entrée, puis la suite",
    ["phase:base_pocket", "effect:phase:base_pocket", "removed:fragile:pocket", "pocketed:fragile:triangle", "effect:pocketEntry:fragile", "wear:base_pocket", "phaseSkipped", "phaseSkipped"],
    journal(basePocket.events).slice(0, 8)
  );
  run("Empocher, depuis un emplacement : pas de Final", false, basePocket.events.some((event) => event.type === "final"));
  run("Empocher, depuis un emplacement : dans l'Impact, l'entrée et pas la phase de fragile", 10, basePocket.events.find((event) => event.type === "impact").impact);
  run("Empocher, depuis un emplacement : rien à la défausse", 0, basePocket.state.discard.length);
  const emptyApex = apply(playState({ triangle: triangleOf(placed("base_pocket"), null, null) }), { type: "resolve" });
  run("Empocher, emplacement vide : noté", true, journal(emptyApex.events).includes("targetEmpty:pocket:apex"));

  // Depuis la défausse : le Final de final_pocket (usure 2 sur 3) l'empoche, déjà
  // défaussée ; elle n'est qu'à un endroit, le pot.
  const finalPocket = apply(playState({ triangle: triangleOf(null, null, placed("final_pocket", 2)) }), { type: "resolve" });
  run.same(
    "Empocher, Final : retrait, défausse, Final, puis la mise en poche depuis la défausse",
    ["removed:final_pocket:wear", "discarded:final_pocket", "final:final_pocket", "effect:final:final_pocket", "targetEmpty:polish:apex", "pocketed:final_pocket:discard"],
    journal(finalPocket.events).filter((entry) => !["impact", "rotation", "turnEnded"].includes(entry)).slice(-6)
  );
  run.same("Empocher, Final : au pot, pas à la défausse", { pot: ["final_pocket"], discard: [] }, { pot: finalPocket.state.pot, discard: finalPocket.state.discard });
  run("Empocher, Final : aucune bille perdue ni dupliquée", 1, everywhere(finalPocket.state));

  // Pendant sa propre Éjection : elle ne passe qu'une fois, au pot.
  const shy = { shy: { knockout: [{ action: "pocket" }] }, plain: {} };
  const ejected = apply(playState({ hand: inHand(["plain"]), triangle: triangleOf(null, null, placed("shy")) }), { type: "place", handIndex: 0, slot: "apex" }, shy);
  run.same(
    "Empocher, sa propre Éjection : au pot, jamais à la défausse",
    ["flick:plain", "knockout:shy", "effect:knockout:shy", "removed:shy:pocket", "pocketed:shy:triangle", "placed:plain", "hit:plain"],
    journal(ejected.events)
  );
  run.same("Empocher, sa propre Éjection : le pot, une défausse vide", { pot: ["shy"], discard: [] }, { pot: ejected.state.pot, discard: ejected.state.discard });
  run("Empocher, sa propre Éjection : aucune bille dupliquée", 2, everywhere(ejected.state));

  // Pendant son Éveil : depuis la main ; une seconde fois, elle n'est plus là.
  const waking = { waker: { awaken: [{ action: "pocket" }, { action: "pocket" }] }, plain: {} };
  const awoken = apply({ ...playState({ hand: inHand([]), bag: ["waker"] }), stage: "draw" }, { type: "draw" }, waking);
  run.same(
    "Empocher, Éveil : depuis la main, puis la bille n'est plus là",
    ["draw:waker", "awaken:waker", "effect:awaken:waker", "pocketed:waker:hand", "targetEmpty:pocket:self"],
    journal(awoken.events).slice(1)
  );
  run.same("Empocher, Éveil : la main vide, la bille au pot", { pot: ["waker"], hand: [] }, { pot: awoken.state.pot, hand: handIds(awoken.state) });

  // Jamais remélangées : pot et billes perdues restent où elles sont à la régénération.
  const regenerated = apply({ ...playState({ hand: inHand([]), bag: [], discard: ["hit_polish"], pot: ["final_pocket"], lost: ["aging_flick"] }), stage: "draw" }, { type: "draw" });
  run.same("pot et billes perdues : jamais remélangées", { pot: ["final_pocket"], lost: ["aging_flick"], hand: ["hit_polish"] }, { pot: regenerated.state.pot, lost: regenerated.state.lost, hand: handIds(regenerated.state) });

  // L'étape du pot : après les trois phases, avant les retraits, dans l'ordre
  // d'arrivée ; une bille sans effet de résolution passe sans effet.
  const pot = apply(
    playState({ triangle: triangleOf(placed("tally_flick"), null, placed("fragile", 1)), pot: ["final_pocket", "hit_polish", "base_pocket"] }),
    { type: "resolve" }
  );
  const steps = journal(pot.events);
  run.same(
    "pot, résolution : chaque bille dans l'ordre d'arrivée, après les phases, avant les retraits",
    ["potResolution:final_pocket", "effect:pocketResolution:final_pocket", "potResolution:hit_polish", "potResolution:base_pocket", "effect:pocketResolution:base_pocket", "removed:fragile:wear"],
    steps.slice(steps.indexOf("potResolution:final_pocket"), steps.indexOf("removed:fragile:wear") + 1)
  );
  run("pot, résolution : après la phase de pointe", true, steps.indexOf("wear:fragile") < steps.indexOf("potResolution:final_pocket"));
  run.same(
    "pot, résolution : final_pocket Masse +1, base_pocket Vitesse +2 par minibille active (tally_flick, fragile)",
    [{ marble: "final_pocket", massDelta: 1 }, { marble: "base_pocket", speedDelta: 4 }],
    pot.events.filter((event) => event.trigger === "pocketResolution").map(({ marble, speedDelta, massDelta }) => (marble === "final_pocket" ? { marble, massDelta } : { marble, speedDelta }))
  );
  const impact = pot.events.find((event) => event.type === "impact");
  run("pot, résolution : compté dans l'Impact", impactOf(impact.speed, impact.mass), impact.impact);
  run("pot, résolution : la Masse de final_pocket dans l'Impact", 2, impact.mass);
  // Une bille empochée pendant la résolution, avant l'étape du pot, y passe ce tour.
  const late = apply(playState({ triangle: triangleOf(placed("base_pocket"), null, placed("final_pocket")) }), { type: "resolve" });
  run("pot, résolution : la bille empochée pendant les phases y passe", true, journal(late.events).includes("effect:pocketResolution:final_pocket"));

  // Validation : jamais sur soi dans une Chiquenaude ni dans le pot ; une Vitesse
  // ciblée à chaque résolution n'a plus de phase ; les autres actions ciblées passent.
  const refused = (table) => throws(() => validateTable(table));
  run("validation : Empocher soi-même dans sa Chiquenaude refusé", true, refused({ a: { flick: [{ action: "pocket" }] } }));
  run("validation : Empocher une cible dans sa Chiquenaude permis", false, refused({ a: { flick: [{ action: "pocket", target: "apex" }] } }));
  run("validation : Empocher soi-même au Final permis", false, refused({ a: { final: [{ action: "pocket" }] } }));
  run("validation : Empocher soi-même à l'Éveil permis", false, refused({ a: { awaken: [{ action: "pocket" }] } }));
  run("validation : Empocher avec un montant refusé", true, refused({ a: { base: [{ action: "pocket", amount: 1 }] } }));
  run("validation : Empocher la première de la main permis", false, refused({ a: { hit: [{ action: "pocket", target: "firstInHand" }] } }));
  run("validation : Polissage de la première de la main refusé", true, refused({ a: { hit: [{ action: "polish", amount: 1, target: "firstInHand" }] } }));
  run("validation : En poche, un moment inconnu refusé", true, refused({ a: { pocketed: { exit: [{ action: "speed", amount: 1 }] } } }));
  run("validation : En poche, Empocher soi-même refusé", true, refused({ a: { pocketed: { entry: [{ action: "pocket" }] } } }));
  run("validation : En poche, Polissage sur soi refusé", true, refused({ a: { pocketed: { resolution: [{ action: "polish", amount: 1 }] } } }));
  run("validation : En poche à chaque résolution, Vitesse ciblée refusée", true, refused({ a: { pocketed: { resolution: [{ action: "speed", amount: 1, target: "apex" }] } } }));
  run(
    "validation : En poche à chaque résolution, Polissage, Fêlure, Empocher et Pioche ciblés permis",
    false,
    refused({
      a: {
        pocketed: {
          resolution: [
            { action: "polish", amount: 1, target: "apex" },
            { action: "crack", amount: 1, target: "apex" },
            { action: "pocket", target: "firstInHand" },
            { action: "draw", amount: 1 },
          ],
        },
      },
    })
  );
  run("validation : En poche n'est pas une liste", true, refused({ a: { pocketed: [{ action: "speed", amount: 1 }] } }));
  run("validation : les moments déclarés sont valides", false, throws(() => validatePocketMoments(MARBLE_POCKET)));
  run("validation : un moment sans texte de fiche refusé", true, throws(() => validatePocketMoments({ ...MARBLE_POCKET, moments: [{ ...MARBLE_POCKET.moments[0], texts: { effect: "x" } }] })));
}

// EN POCHE, À CHAQUE (OCCURRENCE) : les réactions du pot aux valeurs de partie
// écoutables. Tables fabriquées, pour isoler chaque règle.
function checkPocketReactions(run) {
  const reactions = (events) =>
    events.filter((event) => event.type === "effect" && event.trigger === "pocketReaction").map((event) => `${event.potIndex}:${event.marble}`);
  const effects = (events) => events.filter((event) => event.type === "effect").map((event) => `${event.trigger}:${event.marble}`);
  const table = {
    plain: { apex: [{ action: "speed", amount: 1 }] },
    flicker: { flick: [{ action: "speed", amount: 1 }] },
    polisher: { flick: [{ action: "polish", amount: 1, target: "apex" }] },
    drawer: { flick: [{ action: "draw", amount: 3 }] },
    pocketer: { flick: [{ action: "pocket", target: "firstInHand" }] },
    onThrown: { pocketed: { thrownMarbles: [{ action: "speed", amount: 1 }] } },
    onFlick: { pocketed: { flick: [{ action: "speed", amount: 2 }] } },
    onFlickToo: { pocketed: { flick: [{ action: "mass", amount: 1 }] } },
    onPolish: { pocketed: { polish: [{ action: "mass", amount: 1 }] } },
    onDrawn: { pocketed: { drawnMarbles: [{ action: "speed", amount: 1 }] } },
    onExit: { pocketed: { ejectedMarbles: [{ action: "speed", amount: 1 }], triangleExits: [{ action: "mass", amount: 1 }] } },
    onPocketed: { pocketed: { pocketedMarbles: [{ action: "speed", amount: 5 }] } },
    onApex: { pocketed: { apex: [{ action: "speed", amount: 2, target: "leftBase" }] } },
  };
  const made = fabricatedRules(table);
  const place = (state, slot = "apex") => apply(state, { type: "place", handIndex: 0, slot }, made);

  // Les trois catégories : un évènement réel (toute bille lancée), un mot-clé (une
  // Chiquenaude, chez une bille qui en a une), une action (un Polissage).
  run.same("réaction, évènement réel : toute bille lancée", ["0:onThrown"], reactions(place(playState({ hand: inHand(["plain"]), pot: ["onThrown"] })).events));
  run.same("réaction, mot-clé : une Chiquenaude", ["0:onFlick"], reactions(place(playState({ hand: inHand(["flicker"]), pot: ["onFlick"] })).events));
  run.same("réaction, mot-clé : une bille sans Chiquenaude n'en déclenche pas", [], reactions(place(playState({ hand: inHand(["plain"]), pot: ["onFlick"] })).events));
  run.same(
    "réaction, action : un Polissage",
    ["0:onPolish"],
    reactions(place(playState({ hand: inHand(["polisher"]), pot: ["onPolish"], triangle: triangleOf(placed("plain"), null, placed("plain", 1)) }), "leftBase").events)
  );
  const flicked = place(playState({ hand: inHand(["flicker"]), pot: ["onFlick"] }));
  run("réaction : Vitesse aux compteurs du tour (1 + 2)", 3, flicked.state.speed);
  run("réaction : le pot inchangé", "onFlick", flicked.state.pot.join());

  // Une réaction par incrément : trois billes piochées, trois réactions ; un
  // évènement qui augmente deux compteurs écoutés (une éjection est aussi une
  // sortie du triangle) : deux.
  const drawing = place(playState({ hand: inHand(["drawer"]), bag: ["plain", "plain", "plain"], pot: ["onDrawn"] }));
  run.same("réaction : une par incrément (trois billes piochées)", ["0:onDrawn", "0:onDrawn", "0:onDrawn"], reactions(drawing.events));
  const ejecting = place(playState({ hand: inHand(["plain"]), pot: ["onExit"], triangle: triangleOf(null, null, placed("plain")) }));
  run.same("réaction : un évènement, deux compteurs écoutés, deux réactions", ["0:onExit", "0:onExit"], reactions(ejecting.events));
  run("réaction : Vitesse +1 et Masse +1", "1/2", `${ejecting.state.speed}/${ejecting.state.mass}`);

  // L'ordre : l'effet de la bille concernée, puis les billes du pot dans l'ordre
  // d'arrivée ; par la file, avant la suite de l'action (la pose).
  const ordered = place(playState({ hand: inHand(["flicker"]), pot: ["onFlickToo", "onThrown", "onFlick"] }));
  run.same(
    "réaction, ordre : l'effet de la bille, puis le pot dans l'ordre d'arrivée",
    ["flick:flicker", "pocketReaction:onFlickToo", "pocketReaction:onThrown", "pocketReaction:onFlick"],
    effects(ordered.events)
  );
  // Les trois réactions entrent dans la file d'un bloc, après l'effet de la bille ;
  // leurs effets suivent, dans le même ordre, tous avant la pose.
  run.same(
    "réaction, ordre : la réaction suit son évènement, avant la pose",
    ["flick", "effect", "pocketReaction", "pocketReaction", "pocketReaction", "effect", "effect", "effect", "placed"],
    eventTypes(ordered.events)
  );
  run.same(
    "réaction : l'évènement nomme la bille, sa place et le compteur",
    { type: "pocketReaction", index: 2, marble: "onFlick", counter: "flick" },
    ordered.events.find((event) => event.type === "pocketReaction" && event.marble === "onFlick")
  );

  // Un mélange en pleine pioche : les Trouvailles, puis la réaction du pot, juste
  // après lui, avant que la pioche ne reprenne.
  const shuffleTable = fabricatedRules({ ...table, finder: { windfall: [{ action: "speed", amount: 1 }] }, onShuffle: { pocketed: { shuffles: [{ action: "mass", amount: 1 }] } } });
  const shuffled = apply(
    { ...playState({ bag: [], discard: ["plain"], pot: ["onShuffle"], triangle: triangleOf(placed("finder"), null, null) }), stage: "draw" },
    { type: "draw" },
    shuffleTable
  );
  run.same(
    "réaction au mélange : après les Trouvailles, avant la reprise de la pioche",
    ["bagRegenerated", "windfall", "effect:windfall", "pocketReaction", "effect:pocketReaction", "draw"],
    shuffled.events
      .filter((event) => ["bagRegenerated", "windfall", "effect", "pocketReaction", "draw"].includes(event.type))
      .map((event) => (event.type === "effect" ? `effect:${event.trigger}` : event.type))
  );

  // La bille qui entre ne réagit pas à sa propre mise en poche ; elle réagit aux
  // suivantes.
  const entering = place(playState({ hand: inHand(["pocketer", "onPocketed"]), pot: ["onPocketed"] }));
  run.same("réaction : la bille entrante ne réagit pas à sa propre mise en poche", ["0:onPocketed"], reactions(entering.events));
  const next = place({ ...entering.state, hand: inHand(["pocketer", "plain"]), throwsUsed: 0 });
  run.same("réaction : elle réagit à la suivante", ["0:onPocketed", "1:onPocketed"], reactions(next.events));

  // Règle des cibles : un bonus ciblé sur une phase passée est perdu, noté.
  const late = apply(playState({ pot: ["onApex"], triangle: triangleOf(placed("plain"), null, placed("plain")) }), { type: "resolve" }, made);
  const lateEffect = late.events.find((event) => event.type === "effect" && event.trigger === "pocketReaction");
  run.same("réaction, cible : le bonus d'une phase passée, perdu et noté", [{ slot: "leftBase", reason: "phasePassed", speed: 2, mass: 0 }], lateEffect.lost);

  // Les réactions comptent aux valeurs de partie, sans être écoutables.
  run("réaction : comptée (pocketReaction)", 3, drawing.state.tally.pocketReaction.turn);

  // Validation : une clé écoutable passe ; une quantité réelle, Vitesse et Masse,
  // les réactions elles-mêmes et l'inconnu sont refusés.
  const valid = (pocketed) => !throws(() => validateTable({ x: { pocketed } }));
  const speed1 = [{ action: "speed", amount: 1 }];
  run("validation, réaction : évènement réel accepté", true, valid({ shuffles: speed1 }));
  run("validation, réaction : mot-clé accepté", true, valid({ final: speed1 }));
  run("validation, réaction : moment fixe d'En poche accepté", true, valid({ pocketEntry: speed1 }));
  run("validation, réaction : action acceptée", true, valid({ crack: speed1 }));
  run("validation, réaction : quantité réelle refusée", false, valid({ polishQuantity: speed1 }));
  run("validation, réaction : gains de Vitesse refusés", false, valid({ speedGains: speed1 }));
  run("validation, réaction : total de Masse refusé", false, valid({ massGained: speed1 }));
  run("validation, réaction : réagir aux réactions refusé", false, valid({ pocketReaction: speed1 }));
  run("validation, réaction : clé inconnue refusée", false, valid({ nope: speed1 }));
  run("validation, réaction : sur elle-même refusé", false, valid({ flick: [{ action: "polish", amount: 1 }] }));
  run("validation, réaction : une action ciblée acceptée", true, valid({ flick: [{ action: "polish", amount: 1, target: "apex" }] }));
  run("validation, réaction : le message dit pourquoi", true, /ne s'écoute pas/.test(caughtMessage(() => validateTable({ x: { pocketed: { drawQuantity: speed1 } } }))));

  // Boucle directe : réagir au déclenchement d'une action qu'on produit, refusé.
  run("validation, boucle directe : à chaque polissage, Polissage 1, refusé", false, valid({ polish: [{ action: "polish", amount: 1, target: "apex" }] }));
  run("validation, boucle directe : à chaque pioche, Pioche 1, refusé", false, valid({ draw: [{ action: "draw", amount: 1 }] }));
  run("validation, boucle directe : le message dit la boucle", true, /boucle/.test(caughtMessage(() => validateTable({ x: { pocketed: { crack: [{ action: "crack", amount: 1, target: "apex" }] } } }))));
  run("validation : réagir à une autre action que la sienne, accepté", true, valid({ polish: [{ action: "crack", amount: 1, target: "apex" }] }));

  // Boucle indirecte : deux billes du pot qui se répondent (Fêlure, Polissage), sur
  // une bille qui ne s'use jamais assez. La limite du bus coupe cette chaîne seule,
  // l'action reprend ensuite normalement, le journal le note : une anomalie, que la
  // fumée guette.
  const looping = fabricatedRules({
    ...table,
    sturdy: { maxWear: 100 },
    cracker: { pocketed: { polish: [{ action: "crack", amount: 1, target: "apex" }] } },
    healer: { pocketed: { crack: [{ action: "polish", amount: 1, target: "apex" }] } },
    basePolisher: { base: [{ action: "polish", amount: 1, target: "apex" }] },
    baseOne: { base: [{ action: "speed", amount: 1 }] },
  });
  const loop = looping.reduce(playState({ hand: inHand(["polisher", "plain"]), pot: ["cracker", "healer"], triangle: triangleOf(null, null, placed("sturdy", 50)) }), {
    type: "place",
    handIndex: 0,
    slot: "leftBase",
  });
  run("boucle indirecte : l'action aboutit", true, loop.ok);
  run("boucle indirecte : la chaîne interrompue, notée une fois", 1, loop.events.filter((event) => event.type === "chainInterrupted").length);
  run("boucle indirecte : la pose va à son terme", "polisher", loop.state.triangle.leftBase?.marble);
  run("boucle indirecte : la pose reprend après la chaîne coupée", true, loop.events.findIndex((event) => event.type === "placed") > loop.events.findIndex((event) => event.type === "chainInterrupted"));
  const resolved = looping.reduce(loop.state, { type: "resolve" });
  run("boucle indirecte : la partie continue", true, resolved.ok);
  // Pendant la résolution : la boucle de la base gauche coupée, la base droite et la
  // pointe jouent, les retraits et l'Impact suivent.
  const midResolution = looping.reduce(
    playState({ bag: ["plain"], pot: ["cracker", "healer"], triangle: triangleOf(placed("basePolisher"), placed("baseOne"), placed("sturdy", 50)) }),
    { type: "resolve" }
  );
  const cutAt = midResolution.events.findIndex((event) => event.type === "chainInterrupted");
  run("chaîne coupée en résolution : une seule fois", 1, midResolution.events.filter((event) => event.type === "chainInterrupted").length);
  run(
    "chaîne coupée en résolution : la base droite joue ensuite son effet",
    true,
    midResolution.events.slice(cutAt).some((event) => event.type === "effect" && event.trigger === "phase" && event.slot === "rightBase" && event.speedDelta === 1)
  );
  run("chaîne coupée en résolution : la pointe joue ensuite sa phase", true, midResolution.events.slice(cutAt).some((event) => event.type === "phase" && event.slot === "apex"));
  run("chaîne coupée en résolution : l'Impact compte la base droite", 1, midResolution.events.find((event) => event.type === "impact").speed);
}
