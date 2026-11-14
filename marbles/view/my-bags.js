// JEU DES BILLES — l'écran « MES SACS », ouvert depuis le menu principal : les
// emplacements du joueur, ce qu'on y fait, et les sacs préfaits. Des menus verticaux
// (lib/menu.js) ; l'édition d'un sac, son propre écran (marbles/view/bag-editor.js).
// Les opérations sont pures (marbles/core/bag-editing.js) : l'écran les applique aux
// emplacements lus dans le MAGASIN (marbles/host/bag-store.js), puis les y
// enregistre ; sans sacs du joueur (aucune partie sauvegardée), il le dit et ne
// s'ouvre pas.
//
//   « Mes sacs »   les 5 emplacements (« sac 1, 17 billes, valide », « emplacement 3,
//                  vide »), « Sacs préfaits », « Retour » ; Échap revient au menu
//                  principal ;
//   un sac         Modifier (l'éditeur), Dupliquer (vers un emplacement vide, refusé
//                  s'il n'y en a aucun), Supprimer (confirmation, Annuler d'abord),
//                  Retour ;
//   vide           Créer un sac vide, Partir d'un sac préfait (la liste ; le sac
//                  choisi est copié), Retour ; le sac créé est ENREGISTRÉ aussitôt,
//                  puis l'éditeur s'ouvre ;
//   sacs préfaits  la liste, en lecture seule (« sac du Trésor, 15 billes ») ; un sac :
//                  Consulter (ses billes, comme la zone Sac de l'éditeur, avec leurs
//                  fiches), Copier dans un emplacement (vers un emplacement vide ;
//                  l'éditeur ne s'ouvre pas), Retour.
// Le résultat d'un geste qui referme des menus (« Sac 1 enregistré… ») se dit avec
// l'annonce du menu révélé (lib/menu.js, `notice`).

import { announce } from "../../lib/announce.js";
import { popScreen, pushScreen } from "../../lib/screens.js";
import { makeMenuScreen } from "../../lib/menu.js";
import { t } from "../../data/i18n/index.js";
import { openConfirmation } from "../../view/menus/confirmation.js";
import { playMenuSound } from "../../view/menu-sounds.js";
import { BAG_BUILD_RULES } from "../config/values.js";
import { bagStatus, copyBagToSlot, createEmptyBag, deleteBag, duplicateBag, emptySlotIndexes, storeBag } from "../core/bag-editing.js";
import { playBagSound } from "./bag-sounds.js";
import { makeBagEditorScreen } from "./bag-editor.js";
import { makeCardMenuScreen, withPosition } from "./card-menu.js";
import { PILE_BINDINGS } from "./pile-screen.js";
import { marbleCard } from "./card.js";
import { playFocusBeacon } from "./sounds.js";
import { descriptionText, identityText } from "./marble-info.js";
import { keywordsText, openKeywordsMenu } from "./keywords.js";
import { bagEntryLine, bagLineParams, bagName, savedText, slotBagName, slotLineKey, slotLineParams, sortedMarbles } from "./narration/bags.js";

// Un menu dont les ENTRÉES se reconstruisent à chaque affichage (un sac changé dans un
// sous-écran s'y voit au retour), le curseur gardé : même patron que le menu
// principal (main.js).
function refreshingMenu(build) {
  const menu = { ...build(), cursor: 0 };
  const screen = makeMenuScreen(menu, t);
  const baseOnEnter = screen.onEnter;
  screen.onEnter = () => {
    const fresh = build();
    menu.entries.splice(0, menu.entries.length, ...fresh.entries);
    menu.cursor = Math.min(menu.cursor, menu.entries.length - 1);
    baseOnEnter();
  };
  return { menu, screen };
}

// Les écrans des sacs. `deps` :
//   store        le magasin des sacs du joueur (marbles/host/bag-store.js) ;
//   rules        les règles du jeu des billes, sacs préfaits compris (rules.bags) ;
//   collection   le fournisseur de collection (marbles/host/collection.js) ;
//   openKeyHelp(screen)  l'aide des touches, pour l'éditeur ;
//   io           (facultatif) le monde extérieur de l'éditeur et la balise de la
//                consultation, remplacés sous Node (marbles/view/bag-editor.js, `io`).
// -> { openMyBags }.
export function createMyBags({ store, rules, collection, openKeyHelp = () => {}, io = {} }) {
  const beacon = io.sounds?.beacon ?? ((marble, types) => playFocusBeacon(marble, undefined, types));
  const context = () => ({ types: rules.types, rules: BAG_BUILD_RULES, unlocked: collection.unlockedMarbles() });
  const statusOf = (bag) => bagStatus(bag, context());
  // Les menus ouverts qui reçoivent un résultat à dire (lib/menu.js, `notice`).
  let myBagsMenu = null;
  let presetsMenu = null;

  function refuse(text) {
    playBagSound("refused");
    announce(text, { assertive: true });
  }

  // L'éditeur du sac de l'emplacement `index` ; `notice`, ce qui se dit avant son
  // ouverture (« Sac 3 créé. »).
  function openEditor(index, notice = null) {
    const { unlocked } = context();
    const editor = makeBagEditorScreen({
      bag: store.slots()[index],
      rules,
      buildRules: BAG_BUILD_RULES,
      unlocked,
      notice,
      openKeyHelp,
      io,
      onSave: (bag) => {
        store.saveSlots(storeBag(store.slots(), index, bag).slots);
        if (myBagsMenu !== null) myBagsMenu.notice = savedText(bag, statusOf(bag), t);
      },
    });
    pushScreen(editor);
  }

  // Le choix d'un emplacement VIDE (dupliquer, copier) : refusé s'il n'y en a aucun.
  function chooseEmptySlot(titleKey, titleParams, onChoose) {
    const empties = emptySlotIndexes(store.slots());
    if (empties.length === 0) {
      refuse(t("marbles.myBags.no_empty_slot"));
      return;
    }
    playMenuSound("select");
    pushScreen(
      makeMenuScreen(
        {
          title: titleKey,
          titleParams,
          closable: true,
          entries: [
            ...empties.map((index) => ({ label: "marbles.myBags.target_slot", labelParams: { slot: index + 1 }, onActivate: () => onChoose(index) })),
            { label: "marbles.myBags.back", onActivate: () => popScreen() },
          ],
        },
        t
      )
    );
  }

  // Un sac : Modifier, Dupliquer, Supprimer, Retour.
  function openBagActions(index) {
    const bag = store.slots()[index];
    playMenuSound("select");
    pushScreen(
      makeMenuScreen(
        {
          title: "marbles.myBags.bag_title",
          titleParams: { name: slotBagName(index, t) },
          closable: true,
          entries: [
            { label: "marbles.myBags.edit", closesMenu: true, onActivate: () => openEditor(index) },
            {
              label: "marbles.myBags.duplicate",
              onActivate: () =>
                chooseEmptySlot("marbles.myBags.duplicate_title", { name: bagName(bag, t) }, (target) => {
                  const result = duplicateBag(store.slots(), index, target);
                  store.saveSlots(result.slots);
                  playBagSound("created");
                  myBagsMenu.notice = t("marbles.myBags.duplicated", { from: index + 1, to: target + 1 });
                  popScreen();
                  popScreen();
                }),
            },
            {
              label: "marbles.myBags.delete",
              onActivate: () =>
                openConfirmation(
                  "marbles.myBags.delete_confirm",
                  () => {
                    store.saveSlots(deleteBag(store.slots(), index).slots);
                    playBagSound("deleted");
                    myBagsMenu.notice = t("marbles.myBags.deleted", { slot: index + 1 });
                    popScreen();
                  },
                  { titleParams: { slot: index + 1 } }
                ),
            },
            { label: "marbles.myBags.back", onActivate: () => popScreen() },
          ],
        },
        t
      )
    );
  }

  // Un emplacement vide : Créer un sac vide, Partir d'un sac préfait, Retour.
  function openEmptySlotActions(index) {
    const created = (result, notice) => {
      store.saveSlots(result.slots);
      playBagSound("created");
      openEditor(index, notice);
    };
    playMenuSound("select");
    pushScreen(
      makeMenuScreen(
        {
          title: "marbles.myBags.empty_title",
          titleParams: { slot: index + 1 },
          closable: true,
          entries: [
            { label: "marbles.myBags.create_empty", closesMenu: true, onActivate: () => created(createEmptyBag(store.slots(), index), t("marbles.myBags.created", { slot: index + 1 })) },
            {
              label: "marbles.myBags.from_preset",
              onActivate: () => {
                playMenuSound("select");
                pushScreen(
                  makeMenuScreen(
                    {
                      title: "marbles.myBags.from_preset_title",
                      closable: true,
                      entries: [
                        ...Object.values(rules.bags).map((preset) => ({
                          label: "marbles.bagMenu.line",
                          labelParams: bagLineParams(preset, t),
                          onActivate: () => {
                            // La liste puis le menu d'actions se referment : l'éditeur
                            // s'ouvre par-dessus « Mes sacs ».
                            popScreen();
                            popScreen();
                            created(copyBagToSlot(store.slots(), index, preset), t("marbles.myBags.copied", { name: bagName(preset, t), slot: index + 1 }));
                          },
                        })),
                        { label: "marbles.myBags.back", onActivate: () => popScreen() },
                      ],
                    },
                    t
                  )
                );
              },
            },
            { label: "marbles.myBags.back", onActivate: () => popScreen() },
          ],
        },
        t
      )
    );
  }

  // La CONSULTATION d'un sac : ses billes comme dans la zone Sac de l'éditeur, en
  // lecture seule, avec leurs fiches (le menu horizontal des piles).
  function openBagView(bag) {
    const ctx = context();
    const marbles = sortedMarbles(bag.marbles.map((entry) => entry.marble), rules.types, t);
    const count = (marble) => bag.marbles.find((entry) => entry.marble === marble).count;
    playMenuSound("select");
    pushScreen(
      makeCardMenuScreen({
        bindings: PILE_BINDINGS,
        helpId: "marblesPile",
        titleKey: "marbles.bagView.title",
        titleParams: { name: bagName(bag, t) },
        count: marbles.length,
        emptyKey: "marbles.bagEditor.bag_empty",
        cardAt: (index, total) => marbleCard(marbles[index], withPosition(bagEntryLine({ marble: marbles[index], count: count(marbles[index]) }, ctx, t), index, total), rules, t, { timeless: true }),
        onCursor: (index) => beacon(marbles[index], rules.types),
        actions: {
          keywords: (index) => announce(keywordsText(marbles[index], rules, t), { assertive: true }),
          keywordsMenu: (index) => {
            playMenuSound("select");
            openKeywordsMenu(marbles[index], rules);
          },
          description: (index) => announce(descriptionText(marbles[index], t), { assertive: true }),
          identity: (index) => announce(identityText(marbles[index], rules, t), { assertive: true }),
        },
      })
    );
  }

  // Un sac préfait : Consulter, Copier dans un emplacement, Retour.
  function openPresetActions(preset) {
    playMenuSound("select");
    pushScreen(
      makeMenuScreen(
        {
          title: "marbles.myBags.preset_title",
          titleParams: bagLineParams(preset, t),
          closable: true,
          entries: [
            { label: "marbles.myBags.view", onActivate: () => openBagView(preset) },
            {
              label: "marbles.myBags.copy",
              onActivate: () =>
                chooseEmptySlot("marbles.myBags.copy_title", { name: bagName(preset, t) }, (target) => {
                  store.saveSlots(copyBagToSlot(store.slots(), target, preset).slots);
                  playBagSound("created");
                  presetsMenu.notice = t("marbles.myBags.copied", { name: bagName(preset, t), slot: target + 1 });
                  popScreen();
                  popScreen();
                }),
            },
            { label: "marbles.myBags.back", onActivate: () => popScreen() },
          ],
        },
        t
      )
    );
  }

  // La liste des sacs préfaits.
  function openPresets() {
    playMenuSound("select");
    const { menu, screen } = refreshingMenu(() => ({
      title: "marbles.myBags.presets_title",
      closable: true,
      entries: [
        ...Object.values(rules.bags).map((preset) => ({ label: "marbles.bagMenu.line", labelParams: bagLineParams(preset, t), onActivate: () => openPresetActions(preset) })),
        { label: "marbles.myBags.back", onActivate: () => popScreen() },
      ],
    }));
    presetsMenu = menu;
    pushScreen(screen);
  }

  // « Mes sacs » : refusé sans sacs du joueur (aucune partie sauvegardée).
  function openMyBags() {
    if (!store.available()) {
      playMenuSound("refusal");
      announce(t("marbles.myBags.no_save"), { assertive: true });
      return;
    }
    const { menu, screen } = refreshingMenu(() => ({
      title: "marbles.myBags.title",
      closable: true,
      entries: [
        ...store.slots().map((bag, index) => ({
          label: slotLineKey(bag, bag !== null && statusOf(bag).valid),
          labelParams: slotLineParams(bag, index, t),
          onActivate: () => (bag === null ? openEmptySlotActions(index) : openBagActions(index)),
        })),
        { label: "marbles.myBags.presets", onActivate: openPresets },
        { label: "marbles.myBags.back", onActivate: () => popScreen() },
      ],
    }));
    myBagsMenu = menu;
    pushScreen(screen);
  }

  return { openMyBags };
}
