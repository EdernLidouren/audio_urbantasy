// Vérifications des ÉCRANS DES SACS joués au clavier sous Node, sur la vraie pile
// d'écrans (lib/screens.js) : l'éditeur (marbles/view/bag-editor.js), son monde
// extérieur remplacé (annonces relevées, textes par leurs clés, sons relevés), puis
// « Mes sacs » (marbles/view/my-bags.js), ses menus parlant dans le faux document du
// banc (marbles/checks/fixtures/screen-bench.js), en français et en anglais.
// `nodeOnly` : sauté dans la console du jeu (core/checks/index.js). Lancées par
// `node tools/run-checks.js marbles-bag-editor`.

import { activeScreen, handleKeyDown, popScreen, pushScreen } from "../../lib/screens.js";
import { getLocale, setLocale, t } from "../../data/i18n/index.js";
import { BAG_BUILD_RULES } from "../config/values.js";
import { bagSize } from "../core/bags.js";
import { makeBagEditorScreen } from "../view/bag-editor.js";
import { createMyBags } from "../view/my-bags.js";
import { createBagStore, createMemoryBagStore } from "../host/bag-store.js";
import { catalogCollection } from "../host/collection.js";
import { GAME_RULES } from "../tools/game-rules.js";
import { FIXTURE_TYPES, deepFreeze, fixtureRules } from "./fixtures/marbles.js";
import { installFakeDocument, menuAnnouncementTexts } from "./fixtures/screen-bench.js";
import { keyText } from "./helpers.js";

const rules = fixtureRules();
const UNLOCKED = Object.keys(FIXTURE_TYPES);

// Un texte annoncé, ses espaces insécables (posées par l'outil de parité) rendues
// ordinaires, pour comparer.
const plain = (text) => text?.replace(/[\u00a0\u202f]/g, " ");

const key = (name, mods = []) => handleKeyDown({ key: name, mods, preventDefault() {} });
const closeAll = () => {
  while (activeScreen() !== undefined) popScreen();
};

// Un éditeur ouvert sur `bag` : ce qu'il dit, ses sons, ce qu'il enregistre.
function openEditor(bag) {
  installFakeDocument();
  if (activeScreen() !== undefined) throw new Error("banc de l'éditeur : la pile d'écrans n'est pas vide");
  const said = [];
  const sounds = [];
  const saves = [];
  const io = {
    announce: (text) => said.push(text),
    announceMenuLine: (text, starred = false) => said.push(starred ? `* ${text}` : text),
    t: keyText,
    sounds: {
      menu: (name) => sounds.push(`menu:${name}`),
      bag: (name) => sounds.push(`bag:${name}`),
      beacon: (marble) => sounds.push(`beacon:${marble}`),
      stopBeacon: () => sounds.push("stopBeacon"),
    },
  };
  const screen = makeBagEditorScreen({ bag, rules, buildRules: BAG_BUILD_RULES, unlocked: UNLOCKED, onSave: (saved) => saves.push(saved), io });
  pushScreen(screen);
  return { screen, said, sounds, saves, last: () => said.at(-1), state: () => screen.inspect() };
}

export default function checkMarblesBagEditor(run) {
  try {
    run.section("éditeur : navigation et zones", checkNavigation);
    run.section("éditeur : ajouter et retirer", checkAddRemove);
    run.section("éditeur : filtres, résumé, problèmes, fiches", checkInfo);
    run.section("éditeur : quitter et enregistrer", checkLeave);
    run.section("Mes sacs", checkMyBags);
  } finally {
    closeAll();
  }
}

function checkNavigation(run) {
  const editor = openEditor({ id: "slot-1", marbles: [{ marble: "hit_polish", count: 1 }, { marble: "aging_flick", count: 3 }] });
  run(
    "ouverture : le titre, l'en-tête, la zone Sac et sa première bille (ordre stable)",
    "bagEditor.title{name: bagSlot.name{slot: 1}} bagEditor.head{size: 4, min: 12, max: 20, valid: no} bagEditor.zone.bag bagEditor.bag_line{marble: <aging_flick>, count: 3, max: 3}. 1 sur 2",
    editor.said[0]
  );
  run("ouverture : la balise de la bille", "beacon:aging_flick", editor.sounds.at(-1));
  key("ArrowRight");
  run("droite : la bille suivante", "bagEditor.bag_line{marble: <hit_polish>, count: 1, max: 3}. 2 sur 2", editor.last());
  key("ArrowRight");
  run("droite en butée : étoilée", true, editor.last().startsWith("* "));
  key("ArrowUp");
  run("haut depuis le Sac : butée, étoilée", true, editor.last().startsWith("* "));
  key("ArrowDown");
  run("bas : la zone Collection s'annonce, avec son point", true, editor.last().startsWith("bagEditor.zone.collection bagEditor.collection_line{marble: <aging_flick>"));
  key("End");
  run("Fin : la dernière bille de la collection", `${UNLOCKED.length} sur ${UNLOCKED.length}`, editor.last().split(". ").at(-1));
  key("Home");
  run("Origine : la première", true, editor.last().endsWith(`. 1 sur ${UNLOCKED.length}`));
  key("ArrowUp");
  run("haut : retour au Sac, le curseur gardé", true, editor.last().startsWith("bagEditor.zone.bag bagEditor.bag_line{marble: <hit_polish>"));
  closeAll();
  const empty = openEditor({ id: "slot-2", marbles: [] });
  run("sac vide : l'éditeur s'ouvre sur la Collection", "collection", empty.state().zone);
  key("ArrowUp");
  run("zone Sac vide : « Sac vide »", "bagEditor.zone.bag bagEditor.bag_empty", empty.last());
  key("ArrowRight");
  run("zone vide : gauche et droite en butée", "* bagEditor.bag_empty", empty.last());
  closeAll();
}

function checkAddRemove(run) {
  const original = deepFreeze({ id: "slot-1", marbles: [{ marble: "aging_flick", count: 3 }] });
  const editor = openEditor(original);
  key("ArrowDown");
  key("Enter");
  run("ajouter au maximum de sa rareté : refusé", "bagEdit.maxCopies{marble: <aging_flick>, max: 3}", editor.last());
  run("refus : son son", "bag:refused", editor.sounds.at(-1));
  key("ArrowRight");
  key("Enter");
  run("ajouter : l'annonce", "bagEditor.added{marble: <all_rounder>, count: 1, max: 3, size: 4}", editor.last());
  run("ajouter : son son", "bag:add", editor.sounds.at(-1));
  key("Enter");
  run("ajouter encore : 2 sur 3", "bagEditor.added{marble: <all_rounder>, count: 2, max: 3, size: 5}", editor.last());
  key("Delete");
  run("retirer depuis la Collection", "bagEditor.removed{marble: <all_rounder>, count: 1, max: 3, size: 4}", editor.last());
  run("retirer : son son", "bag:remove", editor.sounds.at(-1));
  key("ArrowRight");
  key("Delete");
  run("retirer une bille absente : refusé", "bagEdit.notInBag{marble: <awaken_draw>}", editor.last());
  // Dans le Sac : le dernier exemplaire retiré, l'entrée disparaît, le curseur passe à
  // sa voisine.
  key("ArrowUp");
  key("ArrowRight");
  run("Sac : sur la seconde bille", 1, editor.state().index);
  key("Delete");
  run(
    "Sac : dernier exemplaire retiré, la voisine se dit",
    "bagEditor.removed{marble: <all_rounder>, count: 0, max: 3, size: 3} bagEditor.bag_line{marble: <aging_flick>, count: 3, max: 3}. 1 sur 1",
    editor.last()
  );
  run("Sac : le curseur sur la voisine", 0, editor.state().index);
  key("Enter");
  run("Entrée dans le Sac : ajoute aussi (refusée au maximum)", "bagEdit.maxCopies{marble: <aging_flick>, max: 3}", editor.last());
  run("copie de travail : le sac reçu intact", 3, original.marbles[0].count);
  closeAll();

  // Le blocage à la taille maximale, dès l'ajout.
  const full = openEditor({
    id: "slot-1",
    marbles: ["aging_flick", "hit_polish", "final_pocket", "hit_pocket", "split_base", "fragile", "flick_strike"].map((marble, index) => ({ marble, count: index === 6 ? 2 : 3 })),
  });
  key("ArrowDown");
  key("End");
  key("Enter");
  run("sac plein : refusé", "bagEdit.bagFull{size: 20, max: 20}", full.last());
  run("sac plein : rien d'ajouté", 20, bagSize(full.state().working));
  closeAll();

  // Une bille inconnue d'un sac relu : se dit, se retire.
  const unknown = openEditor({ id: "slot-1", marbles: [{ marble: "gone", count: 2 }] });
  run("bille inconnue : sa ligne", true, unknown.said[0].includes("bagEditor.bag_line_unknown{marble: gone, count: 2}"));
  key("Delete");
  run("bille inconnue : retirée", "bagEditor.removed_unknown{marble: gone, count: 1, size: 1}", unknown.last());
  key("v");
  run("bille inconnue : aucune description", "no_marble", unknown.last());
  closeAll();
}

function checkInfo(run) {
  const editor = openEditor({ id: "slot-1", marbles: [{ marble: "aging_flick", count: 3 }] });
  key("g");
  run("filtre de famille : la première de la roue, et le nombre de billes", "bagEditor.filter{filter: <family.treasure.name>, count: 0}", editor.last());
  for (let index = 1; index < 6; index++) key("g");
  run("filtre de famille : la dernière, les Classiques", `bagEditor.filter{filter: <family.classics.name>, count: ${UNLOCKED.length}}`, editor.last());
  key("g");
  run("filtre de famille : après la dernière, aucun", `bagEditor.filter{filter: bagEditor.filter_none, count: ${UNLOCKED.length}}`, editor.last());
  key("g", ["shift"]);
  run("filtre de rareté : commune", `bagEditor.filter{filter: <rarity.common.name>, count: ${UNLOCKED.length}}`, editor.last());
  key("g", ["shift"]);
  run("filtre de rareté : peu commune, aucune bille", "bagEditor.filter{filter: <rarity.uncommon.name>, count: 0}", editor.last());
  key("ArrowDown");
  run("collection filtrée vide : le dit", "bagEditor.zone.collection bagEditor.collection_empty", editor.last());
  key("Enter");
  run("collection vide : Entrée sans effet, redit", "bagEditor.collection_empty", editor.last());
  key("r");
  run(
    "résumé : en-tête, puis familles, calibres, raretés",
    "bagEditor.head{size: 3, min: 12, max: 20, valid: no} bagEditor.summary_families{items: [bagEditor.summary_item{name: <family.classics.name>, count: 3}]} bagEditor.summary_sizes{items: [bagEditor.summary_item{name: <size.medium.name>, count: 3}]} bagEditor.summary_rarities{items: [bagEditor.summary_item{name: <rarity.common.name>, count: 3}]}",
    editor.last()
  );
  key("r", ["shift"]);
  run("problèmes : un menu par-dessus l'éditeur", true, activeScreen() !== editor.screen);
  key("Escape");
  run("problèmes : Échap le ferme", true, activeScreen() === editor.screen);
  key("ArrowUp");
  key("v");
  run("V : la description (la table de test n'en a pas)", "description.none", editor.last());
  key("f");
  run("F : l'identité", true, editor.last().startsWith("identity.line{"));
  key("e");
  run("E : les mots-clés", true, editor.last().startsWith("keyword.line{"));
  key("ArrowDown", ["ctrl"]);
  run("Ctrl+bas : la fiche de la bille", true, editor.last() !== "" && !editor.last().startsWith("bagEditor."));
  closeAll();
}

function checkLeave(run) {
  const original = { id: "slot-1", marbles: [{ marble: "aging_flick", count: 1 }] };
  // Rien changé (même après un ajout et un retrait) : Échap quitte aussitôt.
  let editor = openEditor(original);
  key("Enter");
  key("Delete");
  key("Escape");
  run("inchangé : Échap quitte directement", undefined, activeScreen());
  run("inchangé : rien d'enregistré", 0, editor.saves.length);
  run("en quittant : la balise coupée", "stopBeacon", editor.sounds.at(-1));
  // Changé : le menu d'enregistrement, « Continuer » ramène à l'éditeur.
  editor = openEditor(original);
  key("ArrowDown");
  key("ArrowRight");
  key("Enter");
  key("Escape");
  run("changé : le menu « Enregistrer les modifications ? »", "BagEditor.save_prompt. BagEditor.save. Menu.position{index: 1, total: 3}", menuAnnouncementTexts().at(-1));
  key("ArrowDown");
  key("ArrowDown");
  key("Enter");
  run("Continuer : retour à l'éditeur", true, activeScreen() === editor.screen);
  // Quitter sans enregistrer.
  key("Escape");
  key("ArrowDown");
  key("Enter");
  run("Quitter sans enregistrer : tout se referme", undefined, activeScreen());
  run("Quitter sans enregistrer : rien d'enregistré", 0, editor.saves.length);
  // Enregistrer.
  editor = openEditor(original);
  key("ArrowDown");
  key("ArrowRight");
  key("Enter");
  key("Escape");
  key("Enter");
  run("Enregistrer : tout se referme", undefined, activeScreen());
  run.same("Enregistrer : la copie de travail enregistrée", [{ id: "slot-1", marbles: [{ marble: "aging_flick", count: 1 }, { marble: "all_rounder", count: 1 }] }], editor.saves);
  run("Enregistrer : son son", true, editor.sounds.includes("bag:saved"));
  run("Enregistrer : le sac reçu intact", 1, original.marbles.length);
}

// « Mes sacs », avec les vrais sacs préfaits et les vrais textes.
function checkMyBags(run) {
  installFakeDocument();
  const previous = getLocale();
  const quiet = { sounds: { menu: () => {}, bag: () => {}, beacon: () => {}, stopBeacon: () => {} } };
  try {
    setLocale("fr");
    const said = () => plain(menuAnnouncementTexts().at(-1));
    // Aucune sauvegarde : refusé, rien d'ouvert.
    createMyBags({ store: createBagStore({ read: () => null, write: () => {} }), rules: GAME_RULES, collection: catalogCollection(GAME_RULES.types), io: quiet }).openMyBags();
    run("sans sauvegarde : dit, rien d'ouvert", true, activeScreen() === undefined);

    const store = createMemoryBagStore();
    const { openMyBags } = createMyBags({ store, rules: GAME_RULES, collection: catalogCollection(GAME_RULES.types), io: quiet });
    openMyBags();
    run("ouverture : le titre, puis l'emplacement 1 vide", "Mes sacs. Emplacement 1, vide. 1 sur 7", said());
    // Créer un sac vide : enregistré, puis l'éditeur.
    key("Enter");
    run("emplacement vide : ses actions", "Emplacement 1. Créer un sac vide. 1 sur 3", said());
    key("Enter");
    run("créer : le sac enregistré aussitôt", "slot-1", store.slots()[0]?.id);
    run("créer : l'éditeur ouvert", true, typeof activeScreen().inspect === "function");
    key("Escape");
    run("retour : la ligne du sac, invalide", "Mes sacs. Sac 1, 0 bille, invalide. 1 sur 7", said());
    // Partir d'un sac préfait, dans l'emplacement 2.
    key("ArrowDown");
    key("Enter");
    key("ArrowDown");
    key("Enter");
    run("partir d'un préfait : la liste", "Partir d'un sac préfait. Sac de départ, 20 billes. 1 sur 8", said());
    key("Enter");
    run("partir d'un préfait : copié, l'éditeur ouvert", "20:slot-2", `${bagSize(store.slots()[1])}:${store.slots()[1].id}`);
    run("partir d'un préfait : l'éditeur", true, typeof activeScreen().inspect === "function");
    key("Escape");
    run("retour : le sac copié, valide", "Mes sacs. Sac 2, 20 billes, valide. 2 sur 7", said());
    // Dupliquer, puis supprimer, Annuler d'abord.
    key("Enter");
    run("un sac : ses actions", "Sac 2. Modifier. 1 sur 4", said());
    key("ArrowDown");
    key("Enter");
    run("dupliquer : les emplacements vides", "Dupliquer sac 2 vers. Emplacement 3. 1 sur 4", said());
    key("Enter");
    run("dupliquer : la copie", 20, bagSize(store.slots()[2]));
    run("dupliquer : dit au retour", "Sac 2 dupliqué dans le sac 3. Mes sacs. Sac 2, 20 billes, valide. 2 sur 7", said());
    key("Enter");
    key("ArrowDown");
    key("ArrowDown");
    key("Enter");
    run("supprimer : confirmation, Annuler d'abord", "Supprimer le sac 2 ? Annuler. 1 sur 2", said());
    key("ArrowDown");
    key("Enter");
    run("supprimer : vidé", null, store.slots()[1]);
    run("supprimer : dit au retour", "Sac 2 supprimé. Mes sacs. Emplacement 2, vide. 2 sur 7", said());
    // Dupliquer sans emplacement vide : refusé.
    for (const index of [1, 3, 4]) store.saveSlots(store.slots().map((bag, at) => (at === index ? { ...GAME_RULES.bags.mist, id: `slot-${at + 1}` } : bag)));
    key("ArrowUp");
    key("Enter");
    key("ArrowDown");
    key("Enter");
    run("dupliquer sans emplacement vide : refusé, dit", "Aucun emplacement vide : supprimez d'abord un sac.", said());
    run("dupliquer sans emplacement vide : le menu d'actions reste", true, activeScreen() !== undefined);
    key("Escape");
    // Les sacs préfaits : la liste, consulter.
    for (let index = 0; index < 5; index++) key("ArrowDown");
    key("Enter");
    run("sacs préfaits : la liste", "Sacs préfaits. Sac de départ, 20 billes. 1 sur 8", said());
    key("Enter");
    run("sac préfait : ses actions", "Sac de départ, 20 billes. Consulter. 1 sur 3", said());
    key("Enter");
    run("consulter : ses billes, comme dans l'éditeur", true, said().startsWith("Sac de départ. Cuivre, 1 sur 3 maximum") || menuAnnouncementTexts().some((text) => plain(text).startsWith("Sac de départ. Cuivre, 1 sur 3 maximum")));
    closeAll();
    // En anglais.
    setLocale("en");
    openMyBags();
    run("en anglais : la ligne d'un sac", "My bags. Bag 1, 0 marbles, invalid. 1 of 7", said());
    closeAll();
  } finally {
    setLocale(previous);
    closeAll();
  }
}
