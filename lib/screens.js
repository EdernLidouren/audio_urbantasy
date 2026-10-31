// Pile d'écrans : unifie le routage clavier et le tick entre menus et jeu.
// Un écran est un objet plat, tous ses champs optionnels :
//   { onEnter, onExit, onTick, onFrame, onKeyDown }
// Seul le sommet de la pile est actif : lui seul reçoit tick()/frame() et
// keydown. Générique à dessein — aucune notion de menu, de jeu, ni de
// "closable" ici ; ça reste la responsabilité de chaque écran concret (voir
// menu.js). onFrame(deltaMs) : même routage qu'onTick, mais au rythme RÉEL
// de la boucle plutôt qu'au pas fixe (voir lib/loop.js) — un écran menu au
// sommet arrête donc AUSSI tout consommateur temps-réel d'un écran dessous
// (ex. une horloge de partie) par la même
// construction "seul le sommet reçoit", sans condition à dupliquer.

const stack = [];

// Exportée : seule source de vérité sur "l'écran actif", pour tout module
// qui a besoin de le consulter sans dupliquer d'état parallèle (ex. l'aide
// des touches, lib/help.js).
export function activeScreen() {
  return stack[stack.length - 1];
}

export function pushScreen(screen) {
  stack.push(screen);
  if (typeof screen.onEnter === "function") screen.onEnter();
}

// Retire l'écran actif. Si un écran est révélé en dessous, on rappelle son
// onEnter (ex. un menu qui redevient actif se réannonce), à l'identique de
// ce qu'il se passerait si on le poussait à nouveau.
export function popScreen() {
  const screen = activeScreen();
  if (!screen) return;

  stack.pop();
  if (typeof screen.onExit === "function") screen.onExit();

  const revealed = activeScreen();
  if (revealed && typeof revealed.onEnter === "function") {
    revealed.onEnter();
  }
}

export function tickActive() {
  const screen = activeScreen();
  if (screen && typeof screen.onTick === "function") {
    screen.onTick();
  }
}

export function tickFrame(deltaMs) {
  const screen = activeScreen();
  if (screen && typeof screen.onFrame === "function") {
    screen.onFrame(deltaMs);
  }
}

export function handleKeyDown(event) {
  const screen = activeScreen();
  if (screen && typeof screen.onKeyDown === "function") {
    screen.onKeyDown(event);
  }
}

// Compose un hook de cycle de vie (onEnter, onExit, ...) : appelle D'ABORD
// le comportement de base (s'il existe), PUIS le comportement additionnel —
// jamais un remplacement silencieux qui perdrait la base. Principe général
// à respecter pour tout écran qui en enveloppe un autre (ex. un menu qui
// ajoute un effet de bord audio à l'ouverture/fermeture) : composer, jamais
// écraser — sinon on perd en silence ce que l'écran de base fait déjà (ex.
// son annonce d'ouverture), et ça casse sans avertissement si l'écran de
// base évolue plus tard pour ajouter un hook aujourd'hui absent.
export function composeHook(baseHook, extra) {
  return () => {
    if (typeof baseHook === "function") baseHook();
    extra();
  };
}
