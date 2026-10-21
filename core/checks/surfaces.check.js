// Vérifications du core — domaine « surfaces ». Surfaces de sol
// (core/surfaces.js). Lancées par core/checks/index.js/runChecks (voir ce
// fichier). Pur : aucun DOM, aucun fetch ; chaque scène est construite en dur
// via un objet littéral passé à parseScene.

import { parseScene } from "../scene.js";
import { SURFACE_REGISTRY, DEFAULT_SURFACE, surfaceAt, surfaceProps, surfacePropsAt } from "../surfaces.js";
import { throws } from "../../lib/check.js";
import { EMPTY_REGISTRY } from "./helpers.js";

export default function checkSurfaces(run) {
  // --- Surfaces de sol (core/surfaces.js + scene.js) ---
  // registre + carte + surfaceAt/surfaceProps = CORE pur, testable ici sans
  // navigateur (la dérivation du SON reste à la vue, voir
  // view/audio/footsteps.js — hors de portée d'un test terminal).

  run("surfaces : registre — concrete est neutre", true, surfaceProps("concrete").neutral);
  run("surfaces : registre — sand est spécial", false, surfaceProps("sand").neutral);
  run("surfaces : registre — nom inconnu -> undefined", undefined, surfaceProps("does-not-exist"));

  const surfaceScene = parseScene(
    {
      id: "movement-check-surfaces",
      titleKey: "scene.demo.name",
      length: 20,
      playerStart: 0,
      defaultSurface: "concrete",
      segments: [{ from: 5, to: 10, surface: "sand" }],
      entities: [],
    },
    EMPTY_REGISTRY
  );
  run("surfaces : surfaceAt — defaultSurface hors segment", "concrete", surfaceAt(surfaceScene, 2));
  run("surfaces : surfaceAt — segment couvrant (borne from incluse)", "sand", surfaceAt(surfaceScene, 5));
  run("surfaces : surfaceAt — segment couvrant (milieu)", "sand", surfaceAt(surfaceScene, 7));
  run("surfaces : surfaceAt — segment couvrant (borne to incluse)", "sand", surfaceAt(surfaceScene, 10));
  run("surfaces : surfaceAt — juste après le segment, retombe sur defaultSurface", "concrete", surfaceAt(surfaceScene, 10.5));
  run("surfaces : surfacePropsAt — délègue à surfaceProps(surfaceAt(...))", SURFACE_REGISTRY.sand, surfacePropsAt(surfaceScene, 7));

  // defaultSurface : FILET silencieux si absent — toute scène existante qui
  // n'en déclare pas continue de charger, résolue au défaut du registre.
  const noSurfaceScene = parseScene(
    { id: "movement-check-surfaces-default", titleKey: "scene.demo.name", length: 10, playerStart: 0, entities: [] },
    EMPTY_REGISTRY
  );
  run("surfaces : defaultSurface absent -> repli sur DEFAULT_SURFACE", DEFAULT_SURFACE, noSurfaceScene.defaultSurface);
  run("surfaces : segments absent -> tableau vide (jamais undefined)", 0, noSurfaceScene.segments.length);

  // indoor (core/scene.js/parseFace, "nature de scène") : même filet que
  // defaultSurface — absent -> false (extérieur), TOUJOURS résolu en
  // booléen sur une face parsée, jamais undefined.
  run("indoor : absent -> false (extérieur) par défaut", false, noSurfaceScene.indoor);
  const indoorScene = parseScene(
    { id: "movement-check-indoor-true", titleKey: "scene.demo.name", length: 10, playerStart: 0, indoor: true, entities: [] },
    EMPTY_REGISTRY
  );
  run("indoor : true déclaré -> transporté tel quel", true, indoorScene.indoor);
  const outdoorScene = parseScene(
    { id: "movement-check-indoor-false", titleKey: "scene.demo.name", length: 10, playerStart: 0, indoor: false, entities: [] },
    EMPTY_REGISTRY
  );
  run("indoor : false déclaré explicitement -> transporté tel quel", false, outdoorScene.indoor);
  const invalidIndoorThrew = throws(() => {
    parseScene(
      { id: "movement-check-indoor-bad", titleKey: "scene.demo.name", length: 10, playerStart: 0, indoor: "yes", entities: [] },
      EMPTY_REGISTRY
    );
  });
  run("indoor : type invalide (non booléen) -> échec clair au chargement", true, invalidIndoorThrew);

  // indoor est un champ de FACE (voir core/scene.js/FACE_FIELDS) : une scène
  // à deux faces le déclare INDÉPENDAMMENT par face — ex. une ruelle
  // extérieure (recto) menant à une arrière-boutique intérieure (verso).
  const indoorTwoFacedScene = parseScene(
    {
      id: "movement-check-indoor-two-faced",
      titleKey: "scene.demo.name",
      length: 10,
      playerStart: 0,
      recto: { entities: [] },
      verso: { entities: [], indoor: true },
    },
    EMPTY_REGISTRY
  );
  run("indoor : scène à deux faces — recto sans déclaration -> false", false, indoorTwoFacedScene.recto.indoor);
  run("indoor : scène à deux faces — verso déclaré true -> transporté sur SA face uniquement", true, indoorTwoFacedScene.verso.indoor);

  // defaultSurface/segment FOURNI mais invalide -> échec clair (jamais un
  // filet, contrairement à l'omission ci-dessus) : une référence de contenu
  // erronée ne doit jamais se dégrader en silence.
  const unknownDefaultSurfaceThrew = throws(() => {
    parseScene(
      { id: "x", titleKey: "scene.demo.name", length: 10, playerStart: 0, defaultSurface: "lava", entities: [] },
      EMPTY_REGISTRY
    );
  });
  run("surfaces : defaultSurface inconnue du registre -> échec clair", true, unknownDefaultSurfaceThrew);

  const unknownSegmentSurfaceThrew = throws(() => {
    parseScene(
      {
        id: "x",
        titleKey: "scene.demo.name",
        length: 10,
        playerStart: 0,
        segments: [{ from: 0, to: 5, surface: "lava" }],
        entities: [],
      },
      EMPTY_REGISTRY
    );
  });
  run("surfaces : segment de surface inconnue -> échec clair", true, unknownSegmentSurfaceThrew);

  const malformedSegmentThrew = throws(() => {
    parseScene(
      {
        id: "x",
        titleKey: "scene.demo.name",
        length: 10,
        playerStart: 0,
        segments: [{ from: 6, to: 3, surface: "sand" }], // from >= to
        entities: [],
      },
      EMPTY_REGISTRY
    );
  });
  run("surfaces : segment mal formé (from >= to) -> échec clair", true, malformedSegmentThrew);

  // Sérialisabilité : aller-retour JSON fidèle, aucune clé undefined injectée.
  const surfaceRoundTrip = JSON.parse(JSON.stringify(surfaceScene));
  run.same(
    "surfaces : structure identique après aller-retour JSON",
    surfaceScene,
    surfaceRoundTrip
  );
  run(
    "surfaces : surfaceAt fonctionne sur la carte reparse",
    "sand",
    surfaceAt(surfaceRoundTrip, 7)
  );
}
