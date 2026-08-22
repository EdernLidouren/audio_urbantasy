// Pile d'écrans : unifie le routage clavier et le tick entre menus et jeu.
// Un écran est un objet plat, tous ses champs optionnels :
//   { onEnter, onExit, onTick, onKeyDown }
// Seul le sommet de la pile est actif : lui seul reçoit tick() et keydown.
// Générique à dessein — aucune notion de menu, de jeu, ni de "closable" ici ;
// ça reste la responsabilité de chaque écran concret (voir menu.js).

const stack = [];

function topScreen() {
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
  const screen = topScreen();
  if (!screen) return;

  stack.pop();
  if (typeof screen.onExit === "function") screen.onExit();

  const revealed = topScreen();
  if (revealed && typeof revealed.onEnter === "function") {
    revealed.onEnter();
  }
}

export function tickActive() {
  const screen = topScreen();
  if (screen && typeof screen.onTick === "function") {
    screen.onTick();
  }
}

export function handleKeyDown(event) {
  const screen = topScreen();
  if (screen && typeof screen.onKeyDown === "function") {
    screen.onKeyDown(event);
  }
}
