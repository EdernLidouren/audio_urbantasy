// Données de traduction françaises. Clés plates pointées, valeurs = chaînes
// avec interpolation {placeholder} le cas échéant. Voir i18n/index.js pour
// le moteur, i18n/en.js pour les mêmes clés en anglais.

export default {
  "menu.position": "{index} sur {total}",
  "menu.toggle.yes": "Oui",
  "menu.toggle.no": "Non",
  "menu.message.ok": "OK",

  "menu.main.title": "Templeton",
  "menu.main.continue": "Continuer",
  "menu.main.new_game": "Nouvelle partie",
  "menu.main.new_game_confirm_title": "Une sauvegarde existe. Démarrer une nouvelle partie l'écrasera. Confirmer ?",
  "menu.main.options": "Options",

  "menu.interaction.title": "Interagir",
  "menu.interaction.observe.title": "Observer",
  "interaction.pickup": "Ramassé : {amount} pièces.",
  "interaction.pickupItem": "Ramassé : {item}.",
  "interaction.loot": "Trouvé : {amount} pièces.",
  "interaction.lootSpawn": "{count} pièces éparpillées tout autour.",

  "inventory.title": "Sac",
  "inventory.empty": "Sac vide.",
  // SANS point final, réservée à la ligne d'entrée de l'onglet Sac vide
  // (voir view/menus/inventory-menu.js/buildBagEntries) — la ponctuation de
  // fin de phrase y vient déjà du suffixe de position ("1 sur 1").
  "inventory.empty.entry": "Sac vide",
  "inventory.entry.stack": "{item} × {quantity} : {description}",
  "inventory.entry.unique": "{item} : {description}",
  "inventory.actions.drop": "Poser",
  "inventory.actions.equip": "Équiper",
  "inventory.actions.unequip": "Déséquiper",
  "inventory.actions.cancel": "Annuler",
  "inventory.quantity.announce": "Quantité à poser : {quantity} sur {max}.",
  "inventory.dropped": "Posé : {item}.",
  "inventory.dropped.stack": "Posé : {item} × {quantity}.",
  "inventory.equipped": "Équipé : {item}.",
  "inventory.unequipped": "Déséquipé : {item}.",

  "inventory.equipment.title": "Équipement",
  "inventory.equipment.slot.occupied": "{slot} : {item} : {description}",
  "inventory.equipment.slot.empty": "{slot} : vide",
  "inventory.equipment.slot.emptyAnnounce": "Emplacement vide.",
  "equipment.slot.feet": "Pieds",

  // Tags d'objets (core/tags.js/TAG_REGISTRY) — affichage traduit seulement,
  // les vérifications portent sur la CLÉ ("military", jamais ce texte).
  "tag.military": "militaire",
  "tag.chic": "chic",
  "tag.metal": "métal",

  "menu.pause.title": "Pause",
  "menu.pause.city_map": "Carte de la ville",
  "menu.pause.options": "Options",
  "menu.pause.main_menu": "Retour au menu principal",
  "menu.pause.resume": "Retour au jeu",

  "menu.options.title": "Options",
  "menu.options.audio": "Audio",
  "menu.options.navigation": "Navigation",
  "menu.options.save": "Sauvegarde",
  "menu.options.reset_all": "Réinitialiser tous les réglages",
  "menu.options.reset_all_confirm_title": "Tout réinitialiser ?",
  "menu.options.reset_all_confirm": "Confirmer",
  "menu.options.reset_all_cancel": "Annuler",
  "menu.options.reset_all_done": "Tous les réglages ont été réinitialisés",
  "menu.options.back": "Retour",

  "menu.audio.title": "Audio",
  "audio.master_volume": "Volume principal",
  "audio.master_volume.description": "Le volume de sortie général, appliqué par-dessus tous les autres réglages de volume. Volontairement bas par défaut, pour ne jamais couvrir le lecteur d'écran.",
  "audio.beacon_volume": "Volume des balises",
  "audio.beacon_volume.description": "Le volume des sons qui signalent la présence des entités : balises de repérage et vocalises.",
  "audio.footstep_volume": "Volume des pas",
  "audio.footstep_volume.description": "Le volume des bruits de pas, les vôtres comme ceux des entités qui se déplacent.",
  "audio.music_volume": "Volume de la musique",
  "audio.music_volume.description": "Le volume de la musique du lieu actuel.",
  "audio.ambience_volume": "Volume de l'ambiance",
  "audio.ambience_volume.description": "Le volume des sons de fond du lieu, comme la circulation ou le vent.",
  "audio.interface_volume": "Volume de l'interface",
  "audio.interface_volume.description": "Le volume des sons de l'interface : navigation dans les menus, ramassage d'objets, confirmation de sauvegarde.",
  "menu.audio.reset": "Réinitialiser aux valeurs par défaut",
  "menu.audio.reset_done": "Réglages audio réinitialisés",

  "menu.navigation.title": "Navigation",
  "menu.navigation.cycling": "Cyclage des menus",
  "menu.navigation.cycling.description": "Fait boucler le curseur d'une extrémité à l'autre d'une liste ou d'une grille, au lieu de s'arrêter au bord.",
  "menu.navigation.star_prefix": "Préfixage des annonces par une étoile",
  "menu.navigation.star_prefix.description": "Ajoute une étoile au début de l'annonce quand une limite est atteinte, pour la repérer même sans le son associé.",
  "menu.navigation.index_suffix": "Annoncer la position (« 1 sur 2 »)",
  "menu.navigation.index_suffix.description": "Ajoute la position de l'entrée sélectionnée à la fin de son annonce, par exemple « 1 sur 5 ».",
  "menu.navigation.city_map_alpha": "Carte de la ville : affichage alphanumérique des coordonnées",
  "menu.navigation.city_map_alpha.description": "Sur la carte de la ville, affiche la colonne sous forme de lettre plutôt que de chiffre.",
  "menu.navigation.city_map_invert_y": "Carte de la ville : inversion des ordonnées",
  "menu.navigation.city_map_invert_y.description": "Sur la carte de la ville, inverse le sens de comptage des lignes : depuis le haut plutôt que depuis le bas.",

  "menu.save.title": "Sauvegarde",
  "menu.save.export": "Exporter les préférences",
  "menu.save.import": "Importer les préférences",
  "menu.save.import_success": "Préférences importées",
  "menu.save.import_failure": "Échec de l'import des préférences",
  "save.now": "Sauvegarder",
  "save.autosave": "Sauvegarde auto aux transitions",
  "save.autosave.description": "Sauvegarde automatiquement la partie à chaque changement de lieu réussi, silencieusement — sans le son de confirmation, pour ne jamais se superposer à une simple traversée de porte.",
  "save.autosave_interval": "Sauvegarde auto (minutes)",
  "save.autosave_interval.description": "Sauvegarde automatiquement la partie à intervalles réguliers de temps réel, même pendant qu'un menu est ouvert. Réglé sur zéro, cette sauvegarde périodique est désactivée.",
  "save.autosave_interval_never": "Jamais",
  "save.sound_enabled": "Son de sauvegarde",
  "save.sound_enabled.description": "Joue un son de confirmation à chaque sauvegarde manuelle ou automatique périodique — jamais à une sauvegarde silencieuse déclenchée par un simple changement de lieu.",
  "save.no_active_game": "Aucune partie en cours.",
  "save.export_game": "Exporter la partie",
  "save.import_game": "Importer la partie",
  "save.import_game_failure": "Échec de l'import de la partie",
  "save.import_confirm_title": "Importer cette partie remplacera la partie en cours. Confirmer ?",
  "save.imported": "Partie importée.",

  // Forme : heure, jour mois, saison, année — jour avant mois, à la
  // française (voir i18n/en.js pour la forme "mois jour"). Le code ne
  // fournit que des composants nommés déjà résolus (voir
  // view/city-screen.js/announceGameTime), jamais un ordre : réordonner ou
  // retirer un composant ne touche QUE cette chaîne.
  "time.announce": "{hour} h {minute}, {day} {month}, {season}, année {year}.",
  // Nom de monnaie BATEAU et PROVISOIRE — voir core/money.js, changeable
  // sans toucher au mécanisme (juste ces deux chaînes).
  "money.announce": "{amount} pièces.",
  // {length} : longueur totale du lieu actif (world.length), pour situer
  // {x} dans son étendue — voir view/city-screen.js/announcePlayerX. {x}
  // varie en PRÉCISION selon le mode debug (flottant à 2 décimales en
  // debug, entier arrondi sinon), jamais dans ce gabarit.
  "position.announce": "Position x : {x} sur {length}.",
  // Variante avec la face courante (RECTO/VERSO, voir CLAUDE.md) — utilisée
  // UNIQUEMENT si le lieu actif a deux faces (voir view/city-screen.js).
  "position.announceWithSide": "Position x : {x} sur {length}. Face : {side}.",
  "side.recto": "recto",
  "side.verso": "verso",
  "time.season.spring": "printemps",
  "time.season.summer": "été",
  "time.season.autumn": "automne",
  "time.season.winter": "hiver",
  // Noms grégoriens des mois (voir core/time.js/MONTH_KEYS) — minuscules,
  // comme les saisons ci-dessus (usage français courant en milieu de
  // phrase).
  "month.1": "janvier",
  "month.2": "février",
  "month.3": "mars",
  "month.4": "avril",
  "month.5": "mai",
  "month.6": "juin",
  "month.7": "juillet",
  "month.8": "août",
  "month.9": "septembre",
  "month.10": "octobre",
  "month.11": "novembre",
  "month.12": "décembre",
  // Jours de semaine (voir core/time.js/WEEKDAY_KEYS,
  // config/time-values.js/weekdayOrigin) — même convention minuscule.
  "weekday.0": "lundi",
  "weekday.1": "mardi",
  "weekday.2": "mercredi",
  "weekday.3": "jeudi",
  "weekday.4": "vendredi",
  "weekday.5": "samedi",
  "weekday.6": "dimanche",

  "level.demo.title": "Niveau de démo",
  "entity.door": "Porte",
  "entity.door.description": "Une porte.",
  "entity.npc": "Personnage",
  "entity.npc.description": "Un personnage.",
  "entity.object": "Objet",
  "entity.object.description": "Un objet.",
  "entity.dog": "Chien",
  "entity.dog.description": "Un chien qui erre dans les environs.",
  "entity.rock": "Rocher",
  "entity.rock.description": "Un gros rocher.",
  "entity.bird": "Oiseau",
  "entity.bird.description": "Un oiseau qui pépie de temps en temps.",
  "entity.fountain": "Fontaine",
  "entity.fountain.description": "Une fontaine qui coule sans interruption.",
  "entity.hound": "Chien errant",
  "entity.hound.description": "Un chien errant qu'on entend aboyer au loin, de temps en temps.",
  "entity.buddy.description": "Votre fidèle compagnon à quatre pattes.",
  "entity.neon": "Enseigne au néon",
  "entity.neon.description": "Une enseigne au néon qui bourdonne doucement.",
  "entity.ghost": "Présence",
  "entity.ghost.description": "Une présence indistincte, qui ne se révèle qu'à la perception surnaturelle.",
  "entity.money": "Argent",
  "entity.money.description": "Un peu d'argent, posé au sol.",
  "entity.crate": "Caisse",
  "entity.crate.description": "Une caisse en bois, encore fermée.",
  "entity.crate.consumed_description": "Une caisse en bois, vidée de son contenu.",
  "entity.item": "Objet à ramasser",
  "entity.item.description": "Un objet posé au sol.",
  "item.apple": "Pomme",
  "item.apple.description": "Une pomme, fraîche et croquante.",
  "item.key_bronze": "Clé de bronze",
  "item.key_bronze.description": "Une petite clé en bronze.",
  "item.sneakers": "Baskets",
  "item.sneakers.description": "Une paire de baskets, légères et simples.",
  "item.leather_boots": "Bottes en cuir",
  "item.leather_boots.description": "Des bottes en cuir robustes.",
  "item.combat_boots": "Rangers",
  "item.combat_boots.description": "Une paire de rangers, solides et increvables.",
  "item.high_heels": "Escarpins",
  "item.high_heels.description": "Une paire d'escarpins élégants, à talons.",
  "object.toolbox": "Boîte à outils",
  "object.toolbox.description": "Une boîte à outils métallique. Elle semble fouillable.",
  "npc.passerby": "Passant",
  "npc.passerby.description": "Un passant qui marmonne en attendant, sans vous prêter attention.",
  "npc.resident": "Habitant",
  "npc.resident.description": "Un habitant du quartier, occupé à sa journée.",
  "door.exit": "Porte de sortie",
  "door.exit.description": "Une porte en bois entrouverte, l'air frais du dehors s'y engouffre.",
  "door.club": "Entrée du club",
  "door.club.description": "Une entrée soignée, gardée par un dresscode strict.",
  // Refus d'action conditionnelle (core/level.js, action.condition/
  // refusalKey ; voir view/interaction.js) — INFORMATIF : dit la RÈGLE et
  // laisse deviner l'action à mener, jamais un simple "vous ne pouvez pas".
  "door.dresscode_refused": "L'entrée est réservée aux tenues chic.",

  "level.demo2.title": "Arrière-boutique",
  "door.back": "Porte de retour",
  "door.back.description": "La même porte, vue de l'intérieur : elle mène dehors.",
  "npc.guard": "Garde",
  "npc.guard.description": "Un garde qui surveille la pièce sans un mot.",
  "npc.merchant": "Marchand",
  "npc.merchant.description": "Un marchand qui range des caisses en silence.",

  "entity.passage": "Passage",
  "entity.passage.description": "Un passage étroit vers l'autre côté du lieu.",
  "door.alley": "Porte de la ruelle",
  "door.alley.description": "Une porte de service qui donne sur une ruelle.",
  "door.alley_back": "Porte de service",
  "door.alley_back.description": "Cette même porte de service, vue de la ruelle : elle mène à l'arrière-boutique.",
  "level.demo3.title": "La ruelle",

  // Carte de la ville (voir level/city-map.js, view/menus/city-map-menu.js)
  // — trois annonces de case, jamais confondues : zone réelle ("<nom> :
  // <description>", nameKey/descriptionKey de la case), "en chantier",
  // "vide".
  "cityMap.underConstruction": "En chantier.",
  "cityMap.empty": "Vide.",
  "cityMap.demo.description": "Le quartier de départ, où tout commence.",

  // Perception surnaturelle (touche "p", voir core/presence.js/
  // "perceptionActive", view/city-screen.js/togglePerceptionEffect) —
  // annoncée à CHAQUE bascule réussie (jamais pendant le cooldown, qui
  // reste silencieux, voir son commentaire).
  "perception.activated": "Perception surnaturelle activée.",
  "perception.deactivated": "Perception surnaturelle désactivée.",
};
