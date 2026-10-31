// Vérifications de lib/ — domaine « audio-retention ». Rétention des sons
// décodés d'une portée à l'autre (lib/audio/retention.js) : portées gardées,
// remise en tête, purge des seuls sons périmés. Lancées par
// core/checks/index.js/runChecks (`node tools/run-checks.js audio-retention`).
// Aucune dépendance à Howler : une instance neuve par cas, et un faux cache
// (Map nom -> portée) dont la purge note ce qu'elle décharge.

import { createAudioRetention } from "../audio/retention.js";

// Une rétention neuve et un faux cache inscrit auprès d'elle. `use(name)`
// marque un son de la portée courante, comme un vrai cache à la création,
// au préchargement ou à la lecture ; `kept()` liste ce qui reste en cache.
function fixture() {
  const retention = createAudioRetention();
  const cache = new Map();
  const released = [];
  retention.registerReleaser((isStaleScope) => {
    for (const [name, scope] of cache) {
      if (!isStaleScope(scope)) continue;
      cache.delete(name);
      released.push(name);
    }
  });
  return {
    retention,
    released,
    use: (name) => cache.set(name, retention.currentScope()),
    kept: () => [...cache.keys()].sort(),
    // Entrée dans un monde, comme le montage d'une scène : portée, sons
    // du monde, puis purge.
    visit(world, sounds, retainedCount = 2) {
      retention.enterScope(world, retainedCount);
      for (const name of sounds) cache.set(name, retention.currentScope());
      retention.releaseStale();
    },
  };
}

export default function checkAudioRetention(run) {
  // --- Portée courante.
  {
    const { retention } = fixture();
    run("aucune portée ouverte : portée courante null", null, retention.currentScope());
    retention.enterScope("a", 2);
    run("portée ouverte : c'est la courante", "a", retention.currentScope());
  }

  // --- Deux mondes gardés : le courant et le précédent.
  {
    const f = fixture();
    f.visit("street", ["street_beacon", "shared_step"]);
    f.visit("shop", ["shop_beacon", "shared_step"]);
    run.same("deux mondes : rien n'est déchargé", ["shared_step", "shop_beacon", "street_beacon"], f.kept());
    f.visit("square", ["square_beacon"]);
    run.same("troisième monde : seuls les sons du plus ancien partent", ["street_beacon"], f.released);
    run.same("troisième monde : son commun au monde précédent gardé", ["shared_step", "shop_beacon", "square_beacon"], f.kept());
  }

  // --- Un son commun à un monde oublié et au nouveau reste en cache :
  // le nouveau monde le remarque avant la purge.
  {
    const f = fixture();
    f.visit("a", ["common", "only_a"]);
    f.visit("b", ["only_b"]);
    f.visit("c", ["common"]);
    run.same("son commun réutilisé : jamais déchargé", ["only_a"], f.released);
  }

  // --- Aller-retour : revenir dans un monde récent le remet en tête,
  // c'est l'autre qui part ensuite.
  {
    const f = fixture();
    f.visit("street", ["street_beacon"]);
    f.visit("shop", ["shop_beacon"]);
    f.visit("street", ["street_beacon"]);
    run.same("aller-retour : rien n'est déchargé", [], f.released);
    f.visit("square", ["square_beacon"]);
    run.same("après un aller-retour : le monde le moins récent part", ["shop_beacon"], f.released);
  }

  // --- Rouvrir la même portée (bascule recto/verso) ne fait rien oublier.
  {
    const f = fixture();
    f.visit("a", ["only_a"]);
    f.visit("b", ["only_b"]);
    f.visit("b", ["only_b"]);
    run.same("même portée rouverte : rien n'est déchargé", ["only_a", "only_b"], f.kept());
  }

  // --- Un son marqué hors de toute portée n'est jamais purgé.
  {
    const f = fixture();
    f.use("before_any_scope");
    f.visit("a", []);
    f.visit("b", []);
    f.visit("c", []);
    run.same("son sans portée : jamais déchargé", ["before_any_scope"], f.kept());
  }

  // --- Une seule portée gardée : chaque changement purge le précédent.
  {
    const f = fixture();
    f.visit("a", ["only_a"], 1);
    f.visit("b", ["only_b"], 1);
    run.same("une portée gardée : le monde quitté part aussitôt", ["only_a"], f.released);
  }
}
