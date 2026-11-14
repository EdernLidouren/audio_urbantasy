// Vérifications des SACS DE BILLES dans la partie (core/marble-bags.js) : leur place
// dans une partie neuve, leur passage par la sauvegarde (aller-retour, rebouchage d'une
// ancienne sauvegarde, sac abîmé ou devenu invalide qui se charge quand même, signalé),
// et leurs renommages. Les opérations du joueur et la validité : domaine
// marbles-bags. Lancées par core/checks/index.js/runChecks
// (`node tools/run-checks.js marble-bags`).

import { serializeGame, deserializeGame } from "../save.js";
import { createMarbleBags, marbleBagsOf, repairMarbleBags, withMarbleBags } from "../marble-bags.js";
import { BAG_SLOTS } from "../../marbles/config/values.js";
import { createAuditFixture } from "./helpers.js";

export default function checkMarbleBags(run) {
  const { auditSession } = createAuditFixture();

  // Une partie neuve : tous les emplacements vides, aucun dernier sac.
  run.same("partie neuve : emplacements vides, aucun dernier sac", { slots: Array(BAG_SLOTS).fill(null), lastUsed: null }, marbleBagsOf(auditSession));
  run.same("création : la même forme", createMarbleBags(), marbleBagsOf(auditSession));

  // Aller-retour par la sauvegarde : les sacs et le dernier sac utilisé survivent.
  const bags = {
    slots: [{ id: "slot-1", marbles: [{ marble: "ruby", count: 2 }] }, null, { id: "slot-3", marbles: [] }, null, null],
    lastUsed: "slot-1",
  };
  const withBags = withMarbleBags(auditSession, bags);
  run("écrire : la session reçue intacte", null, marbleBagsOf(auditSession).lastUsed);
  const reloaded = deserializeGame(JSON.parse(JSON.stringify(serializeGame(withBags))));
  run("sauvegarde : relue", true, reloaded.success);
  run.same("sauvegarde : les sacs et le dernier sac utilisé survivent", bags, marbleBagsOf(reloaded.session));
  run.same("sauvegarde : rien à signaler", [], reloaded.marbleBags);

  // Une sauvegarde antérieure aux sacs : rebouchée, vide, sans rien signaler.
  const { marbleBags: _dropped, ...older } = serializeGame(auditSession).data;
  const migrated = deserializeGame({ version: serializeGame(auditSession).version, data: older });
  run.same("ancienne sauvegarde : emplacements vides", createMarbleBags(), marbleBagsOf(migrated.session));
  run.same("ancienne sauvegarde : rien à signaler", [], migrated.marbleBags);

  // Un sac abîmé, ou devenu invalide : il se charge, remis en forme et signalé ;
  // une bille inconnue reste (le sac sera invalide), jamais d'échec de lecture.
  const damaged = withMarbleBags(auditSession, {
    slots: [{ id: "slot-1", marbles: [{ marble: "ruby", count: 0 }, { marble: "removed_marble", count: 2 }, 7] }, "x", null, null, null, { id: "slot-6", marbles: [] }],
    lastUsed: 12,
  });
  const repaired = deserializeGame(JSON.parse(JSON.stringify(serializeGame(damaged))));
  run("sac abîmé : la sauvegarde se lit", true, repaired.success);
  run.same(
    "sac abîmé : remis en forme, la bille inconnue gardée",
    { id: "slot-1", marbles: [{ marble: "ruby", count: 1 }, { marble: "removed_marble", count: 2 }] },
    marbleBagsOf(repaired.session).slots[0]
  );
  run("sac illisible : emplacement vidé", null, marbleBagsOf(repaired.session).slots[1]);
  run("emplacements : toujours BAG_SLOTS", BAG_SLOTS, marbleBagsOf(repaired.session).slots.length);
  run("dernier sac illisible : oublié", null, marbleBagsOf(repaired.session).lastUsed);
  run.same(
    "sac abîmé : chaque réparation signalée, avec son emplacement",
    [6, 1, 1, 2, null],
    repaired.marbleBags.map((repair) => repair.slot)
  );
  const unreadable = deserializeGame(JSON.parse(JSON.stringify(serializeGame(withMarbleBags(auditSession, "x")))));
  run.same("sacs illisibles : vidés et signalés", { bags: createMarbleBags(), repairs: 1 }, { bags: marbleBagsOf(unreadable.session), repairs: unreadable.marbleBags.length });

  // Les ids de billes renommés (config/save-renames.js) : appliqués aux sacs.
  const renamed = repairMarbleBags(withMarbleBags(auditSession, { slots: [{ id: "slot-1", marbles: [{ marble: "old", count: 1 }] }, null, null, null, null], lastUsed: null }), { old: "new" });
  run.same("renommage : la bille renommée", [{ marble: "new", count: 1 }], marbleBagsOf(renamed.data).slots[0].marbles);
  run.same("renommage : rien à signaler", [], renamed.repairs);
  const untouched = repairMarbleBags(withBags);
  run("rien à réparer : la même session", true, untouched.data === withBags);
}
