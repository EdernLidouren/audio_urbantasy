// Interaction avec une entité de la scène ville. Déclenchée par des touches
// DISCRÈTES (Espace/Entrée, voir city-screen.js) — pas de maintien, donc
// aucun souci d'auto-interruption NVDA ici (contrairement au mouvement en
// touche tenue, voir CLAUDE.md). Vue + contenu uniquement : aucune règle de
// jeu, aucun import du core.

import { announce } from "../lib/announce.js";
import { t } from "../i18n/index.js";
import { pushScreen, popScreen } from "../lib/screens.js";
import { makeMenuScreen } from "../lib/menu.js";

// Principe général : un écran qui en enveloppe un autre (ex. ajoute un
// effet de bord à l'ouverture/fermeture d'un menu) ne doit JAMAIS écraser
// silencieusement un hook de cycle de vie existant (onEnter, onExit, ...) —
// il compose : l'ancien comportement d'abord, puis le sien. Écraser ferait
// perdre en silence ce que l'écran de base fait déjà (ici, l'annonce
// d'ouverture du menu), et casserait sans avertissement si l'écran de base
// évoluait plus tard pour ajouter un hook aujourd'hui absent (ex. onExit).
function composeHook(baseHook, extra) {
  return () => {
    if (typeof baseHook === "function") baseHook();
    extra();
  };
}

// kind ∈ { "describe", "activate" }.
export function interact(entity, kind) {
  if (kind === "describe") {
    // descriptionKey peut être absent (type sans description, ex. decor) :
    // rien à annoncer plutôt qu'une clé i18n non résolue.
    if (!entity.descriptionKey) return;
    announce(t(entity.descriptionKey), { assertive: true });
    return;
  }

  if (kind === "activate") {
    // STUB volontaire : emplacement réservé pour une future action de
    // gameplay (ex. ouvrir la porte, fouiller la boîte). Cette action-là
    // passera par le core (reduce), pas par la vue — no-op pour l'instant,
    // le câblage clavier existe déjà (voir city-screen.js).
    return;
  }
}

// Menu de désambiguïsation : un candidat par entrée, dans l'ordre déjà trié
// reçu (donc pas de tri ici). Construit sur makeMenuScreen — aucun système
// de menu réinventé. kind est celui de la touche pressée à l'ouverture
// (Espace/Entrée) : il voyage jusqu'à l'activation d'une entrée, pour que
// interact(entité, kind) reçoive le BON kind quel que soit le candidat
// choisi.
//
// scene fournit pauseBeacons()/resumeBeacons() (voir
// view/audio/city-scene.js) : seules les balises positionnées de la scène
// sont mises en pause pendant le menu, jamais le contexte audio global —
// une future musique/ambiance continuerait derrière ce menu.
function openDisambiguationMenu(candidates, kind, scene) {
  const menu = {
    title: "menu.interaction.title",
    closable: true, // Échap ferme sans rien faire
    entries: candidates.map((entity) => ({
      label: entity.labelKey,
      onActivate: () => {
        popScreen();
        interact(entity, kind);
      },
    })),
  };

  const screen = makeMenuScreen(menu, t);

  // makeMenuScreen ne connaît rien de l'audio : on enveloppe onEnter/onExit
  // ici plutôt que d'y toucher, pour garder ce module générique inchangé.
  // Composition (voir composeHook) : onEnter de base (annonce d'ouverture)
  // PUIS pause des balises ; onExit de base (actuellement aucun, mais
  // composé quand même par principe) PUIS reprise des balises.
  screen.onEnter = composeHook(screen.onEnter, () => scene.pauseBeacons());
  screen.onExit = composeHook(screen.onExit, () => scene.resumeBeacons());

  pushScreen(screen);
}

// candidates = entités dont la zone d'interaction englobe le joueur, DÉJÀ
// triées par x croissant — même ensemble, même tri que l'annonce
// d'occupation (voir view/audio/city-scene.js, occupiedEntities). scene :
// voir openDisambiguationMenu ci-dessus.
export function chooseInteractionTarget(candidates, kind, scene) {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // 2+ candidats : le choix ne peut plus être immédiat, il devient
  // asynchrone (menu). null signale à l'appelant qu'il n'y a rien à faire
  // MAINTENANT — le futur choix appellera interact() lui-même (onActivate
  // ci-dessus), avec le kind mémorisé ici.
  openDisambiguationMenu(candidates, kind, scene);
  return null;
}
