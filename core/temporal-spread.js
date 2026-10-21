// Décalage de SEUIL TEMPOREL par entité — dérivation PURE et DÉTERMINISTE
// (voir core/rng.js), utilisée par core/presence.js/evaluateTimeRange pour
// désynchroniser des entités qui partagent la même règle temporelle (ex.
// trois PNJ "partent vers 6h" -> chacun à SA propre minute, pas tous pile à
// l'heure). Voir doc/scripting.md/"spread" pour la doc côté contenu — le
// pendant TEMPOREL de l'éparpillement spatial (core/state.js/
// spawnScatteredEphemerals) : même esprit ("désynchroniser sans introduire
// d'état"), mécanisme différent — ce module ne PARTAGE aucun flux avec le
// PRNG de simulation (rngState) et ne consomme aucun tirage au tick : il
// hache une CLÉ STABLE à la demande, sans jamais faire avancer d'état.
//
// STABLE par construction : recalculé À CHAQUE ÉVALUATION à partir de l'id
// d'entité + les bornes de la règle elle-même (from/to) — RIEN de nouveau à
// stocker ni à sérialiser. Même id + mêmes bornes -> TOUJOURS le même
// décalage, à travers ticks, rechargements et re-visites de scène.
//
// La clé inclut from/to (pas seulement l'id d'entité) : une entité qui
// porte PLUSIEURS règles temporelles à spread obtient un décalage
// INDÉPENDANT pour chacune, plutôt qu'un même tirage brut simplement remis
// à l'échelle par des spreads différents.
import { createSeed, nextRandom } from "./rng.js";
import { TIME_CONFIG } from "../config/time-values.js";

const NAMESPACE = "temporalSpread";

// Décalage en HEURES (fractionnaires), dans [-spread, +spread] — spread
// donné en MINUTES (voir doc/scripting.md) — prêt à s'ajouter directement
// à un seuil `from`/`to` de core/presence.js/evaluateTimeRange. spread
// absent, non fini ou <= 0 -> 0 (pas de spread déclaré, pas de décalage :
// seuil pile à l'heure déclarée).
export function temporalThresholdOffset(entityId, from, to, spreadMinutes) {
  if (!Number.isFinite(spreadMinutes) || spreadMinutes <= 0) return 0;
  const { value } = nextRandom(createSeed(`${NAMESPACE}:${entityId}:${from}:${to}`));
  const offsetMinutes = (value * 2 - 1) * spreadMinutes; // [-spread, +spread]
  return offsetMinutes / TIME_CONFIG.minutesPerHour;
}
