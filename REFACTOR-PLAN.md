# Plan de refonte — portabilité (Phase 1, aucun code touché)

Ce document est un plan à valider. Aucune ligne de code n'a été modifiée pour le
produire. Il couvre : le principe de séparation, la structure de dossiers cible
fichier par fichier, l'interface publique de chaque brique générique, le sens
des dépendances, l'encapsulation de la chaîne audio (avec emplacement réservé
pour un futur bus de réverb), la séparation mécanisme/contenu pour tuning et
i18n, et une section séparée de propositions d'amélioration hors refacto.

Contrainte de conception respectée partout : aucun framework, bundler, ECS,
hiérarchie de classes, conteneur d'injection, ou "moteur de plugins". Modules
ES natifs, objets plats + fonctions, exactement comme aujourd'hui. La
portabilité vient de frontières nettes et de paramètres explicites — jamais
d'une couche d'abstraction en plus.

---

## 1. Principe de séparation

Deux natures de fichiers coexistent aujourd'hui, mélangées dans `view/` et
`config/`/`i18n/` :

- **Mécanisme générique** : ne connaît rien du contenu de Templeton (pas de
  "porte", pas de "ville", pas de "marche", pas de `menu.main.title`). Se
  dépose tel quel dans un autre jeu tant que ce jeu respecte le même contrat
  d'appel. Exemples déjà 100% génériques aujourd'hui : la boucle à pas fixe, la
  pile d'écrans, le double live-region, les primitives Howler bas niveau.
- **Contenu spécifique au jeu** : la forme de l'état, les actions, le
  réducteur, le format de niveau, les types d'entités, la scène audio "ville",
  les menus, les VALEURS de tuning, les DONNÉES de locale (fr/en).

Deux fichiers cassent aujourd'hui cette frontière en important un fichier
**spécifique** depuis ce qui devrait être un **mécanisme** :

- `i18n/index.js` fait `import fr from "./fr.js"` / `import en from "./en.js"`
  en dur. Un moteur i18n véritablement générique ne doit pas connaître le nom
  des fichiers de locale d'un projet particulier.
- `config/tuning.js` fait `import registry from "../entities/types.js"` en
  dur. Le mécanisme de cascade (`resolveTuning`) ne doit pas connaître le nom
  du fichier de registre d'un projet particulier.

Le principe appliqué dans ce plan : **extraire le mécanisme dans une petite
fonction fabrique (`createI18n(locales)`, `createTuningResolver(defaults,
registry)`) qui reçoit sa donnée en paramètre**, exactement le même style que
`createCityAudioScene(getSession)` ou `makeMenuScreen(menu)` déjà présents dans
le code. Ce n'est pas une abstraction nouvelle, c'est le même patron déjà en
usage, appliqué où il manquait.

---

## 2. Structure de dossiers cible

Nouveau dossier `engine/` à la racine : tout ce qui peut être copié-collé tel
quel dans un autre jeu. Tout le reste (`core/`, `entities/`, `level/`,
`config/`, `i18n/`, `view/`, `main.js`, `index.html`) reste spécifique à
Templeton — `core/` gardant en plus sa contrainte propre d'être pur/headless.

```
Templeton/
  index.html                     spécifique (respecte le contrat HTML du moteur)
  main.js                        spécifique (câblage, toujours propre à chaque projet)
  vendor/
    howler.min.js                tiers, vendu (prérequis externe d'engine/audio.js)
  engine/                        NOUVEAU — générique, déposable tel quel
    screens.js                   <- view/screens.js
    loop.js                      <- view/loop.js
    announce.js                  <- view/announce.js
    audio.js                     <- view/audio.js
    menu.js                      <- view/menu.js (interface changée, voir §3)
    input.js                     <- view/input.js, partie générique seulement
    i18n.js                      NOUVEAU — extrait du moteur de i18n/index.js
    tuning.js                    NOUVEAU — extrait du moteur de config/tuning.js
    rng.js                       RÉSERVÉ — n'existe pas encore, voir note
  core/                          spécifique, pur/headless (inchangé dans sa forme)
    state.js
    actions.js
    reduce.js
    level.js
    movement.check.js
  entities/
    types.js                     spécifique (registre de contenu)
  level/
    schema.md
    demo.json
    load.js
  config/
    tuning.js                    spécifique : VALEURS + instanciation d'engine/tuning.js
  i18n/
    index.js                     spécifique : DONNÉES fr/en + instanciation d'engine/i18n.js
    fr.js
    en.js
  view/                          spécifique : compose le moteur + le contenu du jeu
    input.js                     partie spécifique : touches -> intention, construit sur engine/input.js
    city-screen.js
    audio/
      city-scene.js
    menus/
      main-menu.js
      options-menu.js
```

`dev-server.py`, `serve.bat`, `.gitignore` : aucun changement — ce sont des
outils de dev qui opèrent sur l'arborescence entière, indépendants de
l'organisation du code source.

### Fichier par fichier

| Fichier actuel | Destination | Générique / Spécifique | Pourquoi |
|---|---|---|---|
| `view/screens.js` | `engine/screens.js` | Générique | Zéro connaissance du jeu ; pile d'écrans `{onEnter,onExit,onTick,onKeyDown}` pure. |
| `view/loop.js` | `engine/loop.js` | Générique | Boucle à pas fixe, ignore ce que fait `onTick`. |
| `view/announce.js` | `engine/announce.js` | Générique | Double live-region, contrat = deux ids HTML documentés, aucune connaissance du jeu. |
| `view/audio.js` | `engine/audio.js` | Générique | Ne connaît que Howler/Web Audio et des nombres — voir §4. |
| `view/menu.js` | `engine/menu.js` | Générique (après un petit changement d'interface) | Opère sur un "menu littéral" générique ; **couplage à retirer** : importe aujourd'hui `t` depuis `../i18n/index.js` (le fichier spécifique-jeu). Devient un paramètre — voir §3. |
| `view/input.js` | **Scindé** : `engine/input.js` (générique) + `view/input.js` (spécifique) | Mixte | Voir détail ci-dessous. |
| `i18n/index.js` | **Scindé** : `engine/i18n.js` (moteur) + `i18n/index.js` (instance) | Mixte | Voir §5. |
| `config/tuning.js` | **Scindé** : `engine/tuning.js` (cascade) + `config/tuning.js` (valeurs) | Mixte | Voir §5. |
| `core/state.js` | inchangé | Spécifique | Forme de l'état `{level, player:{x}}`. |
| `core/actions.js` | inchangé | Spécifique | `tick(dir)` est le vocabulaire d'action de CE jeu. |
| `core/reduce.js` | inchangé | Spécifique | Logique de clamp/déplacement propre à Templeton. |
| `core/level.js` | inchangé | Spécifique | Le schéma de niveau (`length`, `playerStart`, `entities[]`) est un modèle de monde 1D propre à ce jeu. |
| `core/movement.check.js` | inchangé | Spécifique | Teste ce réducteur précis. Le *patron* ("script console-exécutable, sans Node") est une convention à documenter, pas du code à extraire. |
| `entities/types.js` | inchangé | Spécifique | Contenu (porte/PNJ/objet). Le *patron* registre neutre est une convention. |
| `level/schema.md`, `level/demo.json` | inchangés | Spécifique | Données/doc de ce jeu. |
| `level/load.js` | inchangé | Spécifique | `fetch + parseLevel` : dépend directement du schéma spécifique de `core/level.js`. |
| `view/city-screen.js` | inchangé | Spécifique | Assemble mouvement + scène audio ville — le point de composition du jeu. |
| `view/audio/city-scene.js` | inchangé | Spécifique | `volumeForDistance`, `cutoffForDistance`, itération des entités : le monde sonore de CE jeu. |
| `view/menus/*.js` | inchangés | Spécifique | Contenu des menus (copie, callbacks). |
| `i18n/fr.js`, `i18n/en.js` | inchangés | Spécifique (données) | Chaînes du jeu. |
| `main.js` | inchangé (imports mis à jour) | Spécifique | Toujours propre à chaque projet. |
| `index.html` | inchangé (mais documenté) | Spécifique | Respecte le contrat HTML du moteur (voir §3). |

Test appliqué à chacun : *"pourrais-je le déposer tel quel dans un jeu
différent ?"* — colonne "Pourquoi" = la réponse.

#### Détail du découpage de `view/input.js`

Aujourd'hui ce fichier mélange deux responsabilités dans un seul module :

- **Générique** : suivi d'un ensemble de touches tenues, transmission de
  chaque keydown non répété à `screens.handleKeyDown`, garde anti-répétition
  OS, appel `onFirstKeydown` une fois (aujourd'hui câblé en dur sur
  `ensureAudioUnlocked`), nettoyage au `blur` fenêtre.
- **Spécifique** : `LEFT_KEYS`/`RIGHT_KEYS` (ArrowLeft/q/a, ArrowRight/d) et
  `getMoveIntent()` (sémantique "un axe, -1/0/+1") — un jeu différent aurait
  un tout autre mapping, voire pas de déplacement continu du tout.

Proposition : `engine/input.js` expose `initInput(target)` (branche tout,
appelle `ensureAudioUnlocked` en interne — c'est un import engine -> engine,
donc pas un couplage au jeu) et `isHeld(key)` (lecture générique de l'état
courant, sans savoir ce que "gauche/droite" veut dire). Le `view/input.js`
spécifique-jeu ne garde que `LEFT_KEYS`/`RIGHT_KEYS`/`getMoveIntent()`, en
lisant `isHeld()` depuis `engine/input.js`.

Point à trancher en phase 2 : le `preventDefault()` sur les touches de
déplacement (pour bloquer le défilement de page) est aujourd'hui fait par le
module générique parce qu'il connaît `LEFT_KEYS`/`RIGHT_KEYS`. Une fois ces
listes retirées du générique, ce `preventDefault` doit migrer quelque part de
spécifique — proposition : un petit `onKeyDown` sur l'écran ville
(`view/city-screen.js`), qui connaît déjà les touches de son propre jeu.

#### Note : `engine/rng.js` n'existe pas encore

`CLAUDE.md` mentionne un PRNG seedé dans sa structure cible ; il n'a jamais été
écrit dans ce projet. Le classer ici (générique, aucune connaissance du jeu)
réserve juste sa place — rien à migrer.

---

## 3. Interface publique de chaque brique générique

Un seul fichier = un seul point d'entrée par brique ; les consommateurs
importent ce fichier et rien d'interne.

| Brique | Fichier | Exporte | Dépend de |
|---|---|---|---|
| Pile d'écrans | `engine/screens.js` | `pushScreen(screen)`, `popScreen()`, `tickActive()`, `handleKeyDown(event)` | rien |
| Boucle | `engine/loop.js` | `TICK_MS`, `MAX_FRAME_MS`, `startLoop(onTick)`, `stopLoop()` | rien |
| Annonces | `engine/announce.js` | `announce(text, {assertive})`, `clearAnnouncements()` | rien (DOM + contrat HTML, voir ci-dessous) |
| Audio bas niveau | `engine/audio.js` | `ensureAudioUnlocked()`, `playOneShot(path)`, `createPositionedSound(path)` | rien (globals `Howl`/`Howler`, voir §4) |
| Entrée clavier | `engine/input.js` | `initInput(target)`, `isHeld(key)` | `engine/screens.js`, `engine/audio.js` |
| Menu -> écran | `engine/menu.js` | `makeMenuScreen(menu, t)` *(changement : `t` en paramètre, ne l'importe plus)* | `engine/announce.js`, `engine/screens.js` |
| i18n | `engine/i18n.js` | `createI18n(locales, options?)` -> `{t, setLocale, getLocale, availableLocales}` | rien |
| Cascade de tuning | `engine/tuning.js` | `createTuningResolver(defaults, registry)` -> `resolveTuning(key, entity?)` | rien |

**Contrat HTML** qu'un projet consommateur doit fournir pour `engine/announce.js`
et `engine/screens.js`/`engine/input.js` : un conteneur focusable
(`role="application"`, `tabindex="-1"`) et deux éléments `aria-live` (id
`announce-polite`, `announce-assertive`), avec la classe `.sr-only` pour les
masquer visuellement sans les retirer de l'arbre d'accessibilité. C'est un
contrat documenté (comme aujourd'hui dans `index.html`), pas un paramètre — au
même titre que "Howler doit exposer `Howl`/`Howler` en global avant le script
module".

### Sens des dépendances

```
                         entities/types.js  level/*  i18n/{fr,en}.js
                                 \              |         /
core/{state,actions,reduce,level}.js       config/tuning.js  i18n/index.js
        (headless, pur)                        |    \          /   |
              |                                |     \        /    |
              |                        engine/tuning.js   engine/i18n.js
              |                          (générique)        (générique)
              v
view/{city-screen,audio/city-scene,menus/*,input}.js
              |
              v
     engine/{screens,loop,announce,audio,menu,input}.js
              |
              v
            main.js  (câble tout, point de composition unique)
```

Lecture : les flèches vont du consommateur vers ce qu'il importe. `core/`
n'apparaît en amont de rien d'autre que lui-même et `config/tuning.js` (une
valeur numérique, pas de la logique). `engine/` n'importe jamais `view/`,
`core/`, `entities/`, `level/`, `i18n/` ou `config/` — aucune brique générique
ne remonte vers le spécifique. `main.js` est le seul fichier à tout connaître.

### Vérification des invariants

- **Le core reste pur/headless** : `core/state.js` importe `config/tuning.js`
  (une valeur numérique, `TUNING_DEFAULTS.moveStep`, documenté comme
  l'exception sanctionnée) ; aucun autre fichier `core/*` n'importe quoi que
  ce soit hors de `core/`. Aucun accès DOM, `Howl`, `Howler`, ni import
  `view/`/`engine/` — inchangé par ce refacto, et je le revérifierai en phase
  2 (`grep` des imports de chaque fichier `core/*`).
- **La vue dépend du core à sens unique** : `view/city-screen.js` importe
  `core/actions.js` et `core/reduce.js` ; rien dans `core/` n'importe `view/`
  ou `engine/`. Ce sens ne change pas avec ce refacto — seuls les chemins
  d'import internes à `view/` et `engine/` bougent.
- **`announce` reste la seule couture de parole** : seul `engine/announce.js`
  touche `#announce-polite`/`#announce-assertive`. Tout le reste (menu,
  écran ville) appelle `announce()`, jamais le DOM directement — vérifié par
  lecture, à reconfirmer par grep en phase 2.
- **La logique reste dans le réducteur, pas dans un bus** : il n'existe
  aujourd'hui **aucun module "bus d'évènements"** dans le code, malgré la
  mention dans `CLAUDE.md` ("à porter depuis l'autre projet"). C'est une
  intention documentée, jamais implémentée — rien à vérifier contre du code
  existant. Toute la logique de résolution vit bien dans `core/reduce.js`, la
  vue ne fait que lire l'état et déclencher des effets de bord (son,
  annonce). Je propose de corriger la formulation de `CLAUDE.md` pour ne plus
  laisser croire qu'un bus existe déjà (voir §6).

---

## 4. Encapsulation de la chaîne audio — la "voix spatialisée"

### Chaîne actuelle, telle que câblée par `createPositionedSound`

```
source (buffer Howler, en boucle)
   -> panner (StereoPannerNode, posé par Howler au premier .stereo())
   -> gain par-instance (GainNode, sound._node — géré par Howler)
   -> filtre passe-bas (BiquadFilterNode, posé par nous)
   -> Howler.masterGain
   -> destination (haut-parleurs)
```

L'ordre pan -> gain est imposé par le câblage interne de Howler (vérifié dans
`vendor/howler.min.js` : le plugin stereo connecte toujours son panner *vers*
`sound._node`, jamais l'inverse) — on ne le réordonne pas sans réécrire une
bonne partie du plugin stereo de Howler, ce qui n'apporte rien ici. Le filtre,
lui, est entièrement sous notre contrôle : il s'insère entre `_node` et
`Howler.masterGain`, la seule liaison que le plugin stereo ne retouche jamais.

### Ce que devient l'unité "voix"

`createPositionedSound(path)` reste le point d'entrée unique et son interface
publique ne change pas : `{ update(pan, volume), setCutoff(freqHz), stop() }`.
Le changement est de **documentation/nommage interne**, pas de comportement :
présenter explicitement cette poignée comme *"une voix spatialisée"*, avec sa
chaîne d'effets commentée dans l'ordre ci-dessus en tête de fonction, pour que
la prochaine brique (réverb) ait un endroit évident où s'accrocher.

### Emplacement réservé pour un futur bus de réverb partagé — non implémenté

La ligne actuelle `filter.connect(Howler.masterGain);` est le point d'insertion
d'un futur **send de réverb** : le signal "sec" (dry) continue vers
`Howler.masterGain` comme aujourd'hui ; un futur bus partagé recevrait un
*envoi* (send) de chaque voix, proportionnel à sa distance ou à son type
d'entité, résolu — comme `audibleRange`/`panSaturation` aujourd'hui — via la
cascade de tuning (`resolveTuning("reverbSend", entity)`).

Schéma réservé (non câblé maintenant) :

```
filter (sortie de chaque voix)
   -> Howler.masterGain                 (chemin sec, existant, inchangé)
   -> [réservé] reverbSendGain(voix)    (futur : gain d'envoi par voix)
         -> [réservé] bus de réverb partagé (ConvolverNode ou équivalent)
              -> Howler.masterGain      (le bus mixe son retour dans la même sortie)
```

Rien n'est créé maintenant : ni `reverbSendGain`, ni `ConvolverNode`, ni bus
partagé, ni nouveau paramètre sur `createPositionedSound`/`setCutoff`. Ajouter
un paramètre inutilisé aujourd'hui serait du code mort prématuré. La seule
action de phase 2 sur ce point : un commentaire, à l'endroit exact de
`filter.connect(Howler.masterGain)` dans `engine/audio.js`, documentant ce
schéma pour qui l'implémentera plus tard.

---

## 5. Séparation mécanisme/contenu — tuning et i18n

Les deux suivent exactement le même patron : extraire la fonction fabrique
dans `engine/`, et transformer le fichier spécifique-jeu existant en simple
point d'instanciation (données + un appel). **Aucun site d'appel consommateur
ne change** — `resolveTuning("audibleRange", entity)` et
`t("menu.main.title")` s'utilisent exactement pareil après le refacto ; seule
change l'implémentation *interne* de `config/tuning.js` et `i18n/index.js`.

### Tuning

```js
// engine/tuning.js — générique, ne connaît aucun projet
export function createTuningResolver(defaults, registry) {
  return function resolveTuning(key, entity = null) {
    if (entity && entity[key] !== undefined) return entity[key];
    const typeDefaults = entity && registry[entity.type];
    if (typeDefaults && typeDefaults[key] !== undefined) return typeDefaults[key];
    return defaults[key];
  };
}
```

```js
// config/tuning.js — spécifique : les VALEURS + l'instanciation
import { createTuningResolver } from "../engine/tuning.js";
import registry from "../entities/types.js";

export const TUNING_DEFAULTS = { moveStep: 0.04, stepDistance: 0.6, /* ... */ };
export const resolveTuning = createTuningResolver(TUNING_DEFAULTS, registry);
```

### i18n

```js
// engine/i18n.js — générique, ne connaît aucune locale
export function createI18n(locales, { defaultLocale = "en" } = {}) {
  let currentLocale = /* détection navigator.language parmi Object.keys(locales) */;
  function t(key, params) { /* interpolation + repli, inchangé */ }
  function setLocale(locale) { /* inchangé */ }
  return { t, setLocale, getLocale: () => currentLocale, availableLocales: () => Object.keys(locales) };
}
```

```js
// i18n/index.js — spécifique : les DONNÉES fr/en + l'instanciation
import { createI18n } from "../engine/i18n.js";
import fr from "./fr.js";
import en from "./en.js";

export const { t, setLocale, getLocale, availableLocales } = createI18n({ fr, en });
```

Portage vers un autre jeu : copier `engine/tuning.js` et `engine/i18n.js` tels
quels ; le nouveau projet écrit ses propres `config/tuning.js` (ses valeurs)
et `i18n/index.js` (ses locales), chacun de la taille d'une dizaine de lignes.

---

## 6. Améliorations proposées (hors refacto — à part, non fondues dedans)

Le refacto lui-même est à **comportement strictement identique** :
`runMovementChecks()` doit rester 4/4, le rendu audio doit sonner pareil à
l'oreille, aucune valeur de tuning ne change. Les points suivants sont de
vrais constats faits pendant la relecture, mais n'ont rien à voir avec la
portabilité — je ne les corrige pas au passage.

1. **`sounds/footstep_concrete_land_01.wav` est un fichier mort.** Aucun code
   ne le référence (le pas utilise `footstep_concrete_walk_1.mp3`), et c'est
   la seule ressource en `.wav` au milieu de fichiers `.mp3` — probablement un
   reliquat. Proposition : le supprimer, ou documenter pourquoi il est gardé.

2. **`level/schema.md` et le commentaire de `entities/types.js` décrivent
   `blocksMovement`/`enterable` comme "lus par le core" au présent, alors que
   rien dans `core/reduce.js` ne les lit encore** (pas de détection de
   collision, pas de logique d'entrée en porte — le déplacement ignore
   totalement les entités aujourd'hui). De même, le champ `target` d'une porte
   (`level/demo.json`) ne mène nulle part : aucun mécanisme ne charge un
   niveau par id de cible. Proposition : soit implémenter cette lecture (une
   vraie fonctionnalité, pas un refacto), soit reformuler la doc au
   conditionnel ("sera lu", "prévu pour") pour ne pas décrire du code qui
   n'existe pas.

3. **`CLAUDE.md` mentionne un "bus d'évènements" comme s'il existait déjà**
   ("Bus d'évènements : effets de bord uniquement... Jamais la logique de
   résolution.") alors qu'aucun module de ce nom n'a jamais été écrit dans ce
   projet — les effets de bord (son, annonce) sont aujourd'hui déclenchés
   directement depuis `view/city-screen.js`/`engine/menu.js`, sans bus
   intermédiaire. Proposition : soit clarifier que c'est une intention non
   réalisée, soit l'implémenter explicitement le jour où un deuxième
   consommateur d'effets de bord apparaît (pas avant — cf. "pas d'abstraction
   prématurée" déjà dans vos propres conventions).

---

## Ce qui NE bouge PAS

Pour être explicite sur l'ampleur réelle du changement : `core/*`,
`entities/types.js`, `level/*`, `view/city-screen.js`,
`view/audio/city-scene.js`, `view/menus/*.js`, `i18n/fr.js`, `i18n/en.js`,
`index.html` (contenu), `vendor/`, `dev-server.py`, `serve.bat` — aucun de ces
fichiers ne change de dossier, et leur logique interne reste identique.
Seuls bougent ou gagnent un paramètre : `view/screens.js`, `view/loop.js`,
`view/announce.js`, `view/audio.js`, `view/menu.js` (déplacés vers `engine/`),
`view/input.js` (scindé), `i18n/index.js` et `config/tuning.js` (leur
implémentation interne déléguée à `engine/`), et les imports de tous les
fichiers qui référencent l'un de ces derniers.
