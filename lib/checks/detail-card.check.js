// Vérifications de lib/ — domaine « detail-card ». Les fiches de détail
// (lib/detail-card.js), sur un élément et un modèle quelconques : assemblage,
// champ de repli, butées, retour à l'annonce principale, réinitialisation. Lancées
// par core/checks/index.js/runChecks (`node tools/run-checks.js detail-card`).

import { throws } from "../check.js";
import { assembleCard, detailAfterMainMove, detailLine, mainWithDetail, stepDetail, validateCardModel } from "../detail-card.js";

// Traduction de test : la clé elle-même.
const t = (key) => key;

const MODEL = {
  above: [{ id: "a1", required: true }, { id: "a2", required: true }],
  below: [{ id: "b1" }, { id: "b2" }],
  emptyBelowKey: "repli",
};

// Un élément est ici une simple table de textes.
function cardOf(fields, model = MODEL) {
  return assembleCard(model, { main: "principal", readField: (entry) => fields[entry.id] ?? null, t });
}

export default function checkDetailCard(run) {
  const full = cardOf({ a1: "A1", a2: "A2", b1: "B1", b2: "B2" });
  run.same("assemblage : dans l'ordre du modèle", { main: "principal", above: ["A1", "A2"], below: ["B1", "B2"] }, full);

  const onlySecond = cardOf({ a1: "A1", a2: "A2", b2: "B2" });
  run.same("facultatif absent : le champ n'existe pas", ["B2"], onlySecond.below);
  const none = cardOf({ a1: "A1", a2: "A2" });
  run.same("aucun facultatif : le champ de repli", ["repli"], none.below);
  run("obligatoire absent : refusé", true, throws(() => cardOf({ a1: "A1" })));
  const noFallback = cardOf({ a1: "A1" }, { above: [{ id: "a1" }], below: [{ id: "b1" }] });
  run.same("sans repli déclaré : rien au-dessous", [], noFallback.below);

  // Un champ de plus se déclare, sans toucher à la navigation.
  const extended = { ...MODEL, above: [{ id: "a0" }, ...MODEL.above] };
  run("modèle étendu : le nouveau champ est le premier atteint", "A0", detailLine(cardOf({ a0: "A0", a1: "A1", a2: "A2" }, extended), stepDetail(0, cardOf({ a0: "A0", a1: "A1", a2: "A2" }, extended), 1)));

  // Parcours : vers le haut, butée, retour.
  const walk = (start, ...directions) => {
    let position = start;
    const lines = [];
    for (const direction of directions) {
      position = stepDetail(position, full, direction);
      lines.push(detailLine(full, position));
    }
    return lines;
  };
  run.same("haut : A1, A2, puis réannonce en butée", ["A1", "A2", "A2", "A2"], walk(0, 1, 1, 1, 1));
  run.same("bas : B1, B2, puis réannonce en butée", ["B1", "B2", "B2"], walk(0, -1, -1, -1));
  run.same("retour : champ par champ jusqu'à l'annonce principale", ["A1", "A2", "A1", "principal", "B1"], walk(0, 1, 1, -1, -1, -1));
  run.same("sortir d'une butée demande un seul geste", ["A2", "A1"], walk(0, 1, 1, 1, -1).slice(2));

  run("position par défaut : l'annonce principale", "principal", detailLine(full, 0));

  // Réinitialisation au déplacement du curseur principal.
  run("déplacement : réinitialisé", 0, detailAfterMainMove(2, true));
  run("déplacement : gardé si désactivé", 2, detailAfterMainMove(2, false));

  // Position gardée sur un élément qui a moins de champs : ramenée à sa butée.
  run("position trop haute pour ce nouvel élément : son dernier champ", "repli", detailLine(none, -2));
  run("position trop haute : un geste part de la butée", 0, stepDetail(-2, none, 1));

  // L'annonce principale et son champ, pour un curseur gardé.
  run("principal + champ : à la position par défaut, seul", "principal", mainWithDetail(full, 0));
  run("principal + champ : les deux, séparés d'un point", "principal. A1", mainWithDetail(full, 1));
  const ending = assembleCard(MODEL, { main: "principal.", readField: (entry) => (entry.required ? "A" : null), t });
  run("principal + champ : jamais deux points", "principal. A", mainWithDetail(ending, 1));

  run("modèle refusé : sans listes", true, throws(() => validateCardModel({ above: [] })));
  run("modèle refusé : aucun champ", true, throws(() => validateCardModel({ above: [], below: [] })));
  run("modèle refusé : repli qui n'est pas une clé", true, throws(() => validateCardModel({ ...MODEL, emptyBelowKey: 3 })));
  run("modèle accepté", false, throws(() => validateCardModel(MODEL)));
}
