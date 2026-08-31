// Données de traduction anglaises. Mêmes clés que fr.js — voir ce fichier
// pour l'organisation des espaces de noms.

export default {
  "menu.position": "{index} of {total}",
  "menu.toggle.yes": "Yes",
  "menu.toggle.no": "No",
  "menu.message.ok": "OK",

  "menu.main.title": "Templeton",
  "menu.main.continue": "Continue",
  "menu.main.new_game": "New game",
  "menu.main.new_game_confirm_title": "A save exists. Starting a new game will overwrite it. Confirm?",
  "menu.main.options": "Options",

  "menu.interaction.title": "Interact",
  "menu.interaction.observe.title": "Observe",
  "interaction.pickup": "Picked up: {amount} coins.",
  "interaction.pickupItem": "Picked up: {item}.",
  "interaction.loot": "Found: {amount} coins.",
  "interaction.lootSpawn": "{count} coins scattered around.",

  "inventory.title": "Bag",
  "inventory.empty": "Bag empty.",
  // No trailing period, reserved for the empty bag tab's list entry (see
  // view/menus/inventory-menu.js/buildBagEntries) — sentence-ending
  // punctuation already comes from the position suffix ("1 of 1").
  "inventory.empty.entry": "Bag empty",
  "inventory.entry.stack": "{item} × {quantity}: {description}",
  "inventory.entry.unique": "{item}: {description}",
  "inventory.actions.drop": "Drop",
  "inventory.actions.equip": "Equip",
  "inventory.actions.unequip": "Unequip",
  "inventory.actions.cancel": "Cancel",
  "inventory.quantity.announce": "Quantity to drop: {quantity} of {max}.",
  "inventory.dropped": "Dropped: {item}.",
  "inventory.dropped.stack": "Dropped: {item} × {quantity}.",
  "inventory.equipped": "Equipped: {item}.",
  "inventory.unequipped": "Unequipped: {item}.",

  "inventory.equipment.title": "Equipment",
  "inventory.equipment.slot.occupied": "{slot}: {item}: {description}",
  "inventory.equipment.slot.empty": "{slot}: empty",
  "inventory.equipment.slot.emptyAnnounce": "Empty slot.",
  "equipment.slot.feet": "Feet",

  // Item tags (core/tags.js/TAG_REGISTRY) — translated display only, checks
  // are done on the KEY ("military", never this text).
  "tag.military": "military",
  "tag.chic": "chic",
  "tag.metal": "metal",

  "menu.pause.title": "Pause",
  "menu.pause.city_map": "City map",
  "menu.pause.options": "Options",
  "menu.pause.main_menu": "Return to main menu",
  "menu.pause.resume": "Resume game",

  "menu.options.title": "Options",
  "menu.options.audio": "Audio",
  "menu.options.navigation": "Navigation",
  "menu.options.save": "Save",
  "menu.options.reset_all": "Reset all settings",
  "menu.options.reset_all_confirm_title": "Reset everything?",
  "menu.options.reset_all_confirm": "Confirm",
  "menu.options.reset_all_cancel": "Cancel",
  "menu.options.reset_all_done": "All settings have been reset",
  "menu.options.back": "Back",

  "menu.audio.title": "Audio",
  "audio.master_volume": "Main volume",
  "audio.master_volume.description": "The overall output volume, applied on top of every other volume setting. Deliberately low by default, so it never drowns out the screen reader.",
  "audio.beacon_volume": "Beacon volume",
  "audio.beacon_volume.description": "The volume of sounds that signal an entity's presence: locator beacons and vocalizations.",
  "audio.footstep_volume": "Footstep volume",
  "audio.footstep_volume.description": "The volume of footstep sounds, yours as well as any moving entity's.",
  "audio.music_volume": "Music volume",
  "audio.music_volume.description": "The volume of the current place's music.",
  "audio.ambience_volume": "Ambience volume",
  "audio.ambience_volume.description": "The volume of the place's background sounds, like traffic or wind.",
  "audio.interface_volume": "Interface volume",
  "audio.interface_volume.description": "The volume of interface sounds: menu navigation, picking up items, save confirmation.",
  "menu.audio.reset": "Reset to defaults",
  "menu.audio.reset_done": "Audio settings reset",

  "menu.navigation.title": "Navigation",
  "menu.navigation.cycling": "Menu cycling",
  "menu.navigation.cycling.description": "Makes the cursor wrap from one end of a list or grid to the other, instead of stopping at the edge.",
  "menu.navigation.star_prefix": "Prefix announcements with a star",
  "menu.navigation.star_prefix.description": "Adds a star at the start of the announcement when a limit is reached, so it can be noticed even without the matching sound.",
  "menu.navigation.index_suffix": "Announce position (\"1 of 2\")",
  "menu.navigation.index_suffix.description": "Adds the selected entry's position to the end of its announcement, e.g. \"1 of 5\".",
  "menu.navigation.city_map_alpha": "City map: alphanumeric coordinates",
  "menu.navigation.city_map_alpha.description": "On the city map, displays the column as a letter instead of a number.",
  "menu.navigation.city_map_invert_y": "City map: invert Y coordinates",
  "menu.navigation.city_map_invert_y.description": "On the city map, reverses how rows are counted: from the top instead of from the bottom.",

  "menu.save.title": "Save",
  "menu.save.export": "Export preferences",
  "menu.save.import": "Import preferences",
  "menu.save.import_success": "Preferences imported",
  "menu.save.import_failure": "Failed to import preferences",
  "save.now": "Save",
  "save.autosave": "Auto-save on transitions",
  "save.autosave.description": "Automatically saves the game on every successful place change, silently — without the confirmation sound, so it never overlaps a simple door crossing.",
  "save.autosave_interval": "Auto-save (minutes)",
  "save.autosave_interval.description": "Automatically saves the game at regular real-time intervals, even while a menu is open. Set to zero, this periodic save is disabled.",
  "save.autosave_interval_never": "Never",
  "save.sound_enabled": "Save sound",
  "save.sound_enabled.description": "Plays a confirmation sound on every successful manual or periodic save — never on the silent save triggered by a simple place change.",
  "save.no_active_game": "No active game.",
  "save.export_game": "Export game",
  "save.import_game": "Import game",
  "save.import_game_failure": "Failed to import the game",
  "save.import_confirm_title": "Importing this game will replace the current game. Confirm?",
  "save.imported": "Game imported.",

  // Form: hour, month day, season, year — month before day, US convention
  // (see i18n/fr.js for the "day month" form). The code only supplies
  // named, already-resolved components (see
  // view/city-screen.js/announceGameTime), never an order: reordering or
  // dropping a component only ever touches this string.
  "time.announce": "{hour}:{minute}, {month} {day}, {season}, year {year}.",
  "money.announce": "{amount} coins.",
  // {length}: total length of the active place (world.length), to place
  // {x} within its extent — see view/city-screen.js/announcePlayerX. {x}
  // varies in PRECISION with debug mode (2-decimal float in debug, rounded
  // integer otherwise), never in this template.
  "position.announce": "Position x: {x} out of {length}.",
  // Variant with the current side (RECTO/VERSO, see CLAUDE.md) — used ONLY
  // when the active place has two sides (see view/city-screen.js).
  "position.announceWithSide": "Position x: {x} out of {length}. Side: {side}.",
  "side.recto": "recto",
  "side.verso": "verso",
  "time.season.spring": "spring",
  "time.season.summer": "summer",
  "time.season.autumn": "autumn",
  "time.season.winter": "winter",
  // Gregorian month names (see core/time.js/MONTH_KEYS) — capitalized, as
  // English convention requires for month names (unlike season names above).
  "month.1": "January",
  "month.2": "February",
  "month.3": "March",
  "month.4": "April",
  "month.5": "May",
  "month.6": "June",
  "month.7": "July",
  "month.8": "August",
  "month.9": "September",
  "month.10": "October",
  "month.11": "November",
  "month.12": "December",
  // Weekday names (see core/time.js/WEEKDAY_KEYS,
  // config/time-values.js/weekdayOrigin) — capitalized, same convention.
  "weekday.0": "Monday",
  "weekday.1": "Tuesday",
  "weekday.2": "Wednesday",
  "weekday.3": "Thursday",
  "weekday.4": "Friday",
  "weekday.5": "Saturday",
  "weekday.6": "Sunday",

  "level.demo.title": "Demo level",
  "entity.door": "Door",
  "entity.door.description": "A door.",
  "entity.npc": "Character",
  "entity.npc.description": "A character.",
  "entity.object": "Object",
  "entity.object.description": "An object.",
  "entity.dog": "Dog",
  "entity.dog.description": "A dog wandering nearby.",
  "entity.rock": "Boulder",
  "entity.rock.description": "A large boulder.",
  "entity.bird": "Bird",
  "entity.bird.description": "A bird that chirps every so often.",
  "entity.fountain": "Fountain",
  "entity.fountain.description": "A fountain running without interruption.",
  "entity.hound": "Stray dog",
  "entity.hound.description": "A stray dog you can hear barking in the distance, every so often.",
  "entity.buddy.description": "Your loyal four-legged companion.",
  "entity.neon": "Neon sign",
  "entity.neon.description": "A neon sign, buzzing softly.",
  "entity.ghost": "Presence",
  "entity.ghost.description": "An indistinct presence, only revealed by supernatural perception.",
  "entity.money": "Money",
  "entity.money.description": "A bit of money, sitting on the ground.",
  "entity.crate": "Crate",
  "entity.crate.description": "A wooden crate, still closed.",
  "entity.crate.consumed_description": "A wooden crate, emptied of its contents.",
  "entity.item": "Object to pick up",
  "entity.item.description": "An object, sitting on the ground.",
  "item.apple": "Apple",
  "item.apple.description": "An apple, fresh and crunchy.",
  "item.key_bronze": "Bronze key",
  "item.key_bronze.description": "A small bronze key.",
  "item.sneakers": "Sneakers",
  "item.sneakers.description": "A pair of light, simple sneakers.",
  "item.leather_boots": "Leather boots",
  "item.leather_boots.description": "A sturdy pair of leather boots.",
  "item.combat_boots": "Combat boots",
  "item.combat_boots.description": "A rugged, practically indestructible pair of combat boots.",
  "item.high_heels": "High heels",
  "item.high_heels.description": "An elegant pair of high heels.",
  "object.toolbox": "Toolbox",
  "object.toolbox.description": "A metal toolbox. It looks like it can be searched.",
  "npc.passerby": "Passerby",
  "npc.passerby.description": "A passerby muttering to themselves, paying you no attention.",
  "npc.resident": "Resident",
  "npc.resident.description": "A local resident, going about their day.",
  "door.exit": "Exit door",
  "door.exit.description": "A wooden door left ajar, cool air drifting in from outside.",
  "door.club": "Club entrance",
  "door.club.description": "A tidy entrance, guarded by a strict dress code.",
  // Conditional action refusal (core/level.js, action.condition/refusalKey —
  // see view/interaction.js) — INFORMATIVE: states the RULE and lets the
  // player infer what to do, never a plain "you can't do that".
  "door.dresscode_refused": "This entrance is reserved for chic attire.",

  "level.demo2.title": "Back room",
  "door.back": "Way back",
  "door.back.description": "The same door, seen from inside: it leads outside.",
  "npc.guard": "Guard",
  "npc.guard.description": "A guard watching the room without a word.",
  "npc.merchant": "Merchant",
  "npc.merchant.description": "A merchant quietly stacking crates.",

  "entity.passage": "Passage",
  "entity.passage.description": "A narrow passage to the other side of the place.",
  "door.alley": "Alley door",
  "door.alley.description": "A service door opening onto an alley.",
  "door.alley_back": "Service door",
  "door.alley_back.description": "This same service door, seen from the alley: it leads to the back room.",
  "level.demo3.title": "The alley",

  // City map (see level/city-map.js, view/menus/city-map-menu.js) — three
  // distinct cell announcements, never conflated: real zone ("<name>:
  // <description>", the cell's nameKey/descriptionKey), "under
  // construction", "empty".
  "cityMap.underConstruction": "Under construction.",
  "cityMap.empty": "Empty.",
  "cityMap.demo.description": "The starting neighborhood, where it all begins.",

  // Supernatural perception ("p" key, see core/presence.js/
  // "perceptionActive", view/city-screen.js/togglePerceptionEffect) —
  // announced on every successful toggle (never during the cooldown, which
  // stays silent, see its comment).
  "perception.activated": "Supernatural perception activated.",
  "perception.deactivated": "Supernatural perception deactivated.",
};
