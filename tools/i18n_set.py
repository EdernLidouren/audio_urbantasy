#!/usr/bin/env python3
"""Ajoute, modifie ou supprime des textes i18n dans toutes les langues d'un coup,
puis trie les fichiers et vérifie la parité (tools/check_i18n_parity.py --sort).

Outil de DÉVELOPPEMENT, autonome comme l'outil de parité : il ne dépend d'aucun
module du jeu et n'écrit que dans data/i18n/<langue>/<domaine>.json.

    python tools/i18n_set.py changements.json
    python tools/i18n_set.py changements.json --dry-run

Le fichier de changements, en UTF-8, sous l'une de deux formes :

  1. par langue : le domaine (le fichier) de chaque clé est trouvé tout seul.
     { "fr": { "marbles.choice.verb.eject": "à éjecter", "marbles.old": null },
       "en": { "marbles.choice.verb.eject": "to eject", "marbles.old": null } }
     Une clé qui existe déjà reste dans son fichier. Une clé nouvelle va dans le
     fichier dont une clé partage le plus long préfixe pointé avec elle
     ("marbles.choice.verb.x" va avec "marbles.choice.verb.polish") ; si deux
     fichiers sont à égalité (les "menu.*" sont répartis), l'outil s'arrête et
     demande la forme 2.

  2. par domaine, explicite :
     { "help": { "fr": { "help.marbles.back": "…" }, "en": { … } } }

null supprime la clé. Chaque clé doit être donnée dans CHAQUE langue du jeu, avec
une valeur dans toutes ou null dans toutes : la parité se garde à l'écriture.
Supprimer une clé absente, ou donner une langue inconnue, est une erreur. Rien
n'est écrit tant que tout n'est pas valide.

Sortie : une ligne par clé (ajoutée, modifiée, supprimée, inchangée) et son
fichier, puis le résultat de l'outil de parité, qui trie les fichiers et pose les
espaces insécables du français (on tape des espaces ordinaires). Code de sortie :
celui de l'outil de parité, 2 si les changements sont refusés.
"""

import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
I18N = ROOT / "data" / "i18n"
LANGS = sorted(path.name for path in I18N.iterdir() if path.is_dir())


def fail(message):
    print(f"Refusé : {message}")
    sys.exit(2)


def load_domains(lang):
    return {path.stem: json.loads(path.read_text(encoding="utf-8")) for path in sorted((I18N / lang).glob("*.json"))}


def common_prefix_length(a, b):
    """Nombre de segments pointés communs en tête de deux clés."""
    count = 0
    for left, right in zip(a.split("."), b.split(".")):
        if left != right:
            break
        count += 1
    return count


def route(key, domains):
    """Le domaine d'une clé : le sien si elle existe, sinon le plus proche."""
    owners = [name for name, table in domains.items() if key in table]
    if len(owners) > 1:
        fail(f'la clé "{key}" existe dans plusieurs fichiers ({", ".join(owners)}) : forme par domaine requise.')
    if owners:
        return owners[0]
    scores = {name: max((common_prefix_length(key, other) for other in table), default=0) for name, table in domains.items()}
    best = max(scores.values())
    winners = [name for name, score in scores.items() if score == best]
    if best == 0 or len(winners) > 1:
        fail(f'clé nouvelle "{key}" : fichier ambigu ({", ".join(winners) if best else "aucun préfixe commun"}), forme par domaine requise.')
    return winners[0]


def normalize(changes, reference_domains):
    """-> { domaine: { langue: { clé: valeur | None } } }"""
    if not isinstance(changes, dict) or not changes:
        fail("le fichier doit être un objet JSON non vide.")
    if set(changes) <= set(LANGS):
        routed = {}
        keys = set().union(*(entries.keys() for entries in changes.values()))
        for key in sorted(keys):
            domain = route(key, reference_domains)
            for lang, entries in changes.items():
                if key in entries:
                    routed.setdefault(domain, {}).setdefault(lang, {})[key] = entries[key]
        return routed
    for domain, by_lang in changes.items():
        if domain not in reference_domains:
            fail(f'domaine inconnu "{domain}" (ni une langue : {", ".join(LANGS)}).')
        if not isinstance(by_lang, dict) or not set(by_lang) <= set(LANGS):
            fail(f'domaine "{domain}" : un objet par langue attendu ({", ".join(LANGS)}).')
    return changes


def validate(routed, tables):
    for domain, by_lang in routed.items():
        missing_langs = [lang for lang in LANGS if lang not in by_lang]
        if missing_langs:
            fail(f'domaine "{domain}" : langue(s) absente(s) {", ".join(missing_langs)} (chaque clé dans chaque langue).')
        keys = {lang: set(entries) for lang, entries in by_lang.items()}
        all_keys = set().union(*keys.values())
        for lang, own in keys.items():
            if own != all_keys:
                fail(f'domaine "{domain}", langue {lang} : il manque {", ".join(sorted(all_keys - own))}.')
        for key in sorted(all_keys):
            values = [by_lang[lang][key] for lang in LANGS]
            deleted = [value is None for value in values]
            if any(deleted) and not all(deleted):
                fail(f'"{key}" : supprimée dans une langue seulement.')
            for lang, value in zip(LANGS, values):
                if value is not None and (not isinstance(value, str) or value == ""):
                    fail(f'"{key}" ({lang}) : un texte non vide attendu.')
                if value is None and key not in tables[lang][domain]:
                    fail(f'"{key}" ({lang}) : suppression d\'une clé absente de {domain}.json.')


def main():
    # Accents lisibles aussi quand la sortie est capturée (Git Bash, un autre outil).
    sys.stdout.reconfigure(encoding="utf-8")
    args = sys.argv[1:]
    dry_run = "--dry-run" in args
    paths = [arg for arg in args if not arg.startswith("--")]
    if len(paths) != 1 or any(arg.startswith("--") and arg != "--dry-run" for arg in args):
        print(__doc__)
        sys.exit(2)
    changes = json.loads(Path(paths[0]).read_text(encoding="utf-8"))
    tables = {lang: load_domains(lang) for lang in LANGS}
    routed = normalize(changes, tables[LANGS[0]])
    validate(routed, tables)

    for domain, by_lang in sorted(routed.items()):
        for key in sorted(by_lang[LANGS[0]]):
            table = tables[LANGS[0]][domain]
            value = by_lang[LANGS[0]][key]
            if value is None:
                status = "supprimée"
            elif key not in table:
                status = "ajoutée"
            elif all(tables[lang][domain].get(key) == by_lang[lang][key] for lang in LANGS):
                status = "inchangée"
            else:
                status = "modifiée"
            print(f"{key} : {status} ({domain}.json)")
        for lang, entries in by_lang.items():
            table = tables[lang][domain]
            for key, value in entries.items():
                if value is None:
                    del table[key]
                else:
                    table[key] = value

    if dry_run:
        print("Essai : rien n'est écrit.")
        return
    for domain, by_lang in routed.items():
        for lang in by_lang:
            path = I18N / lang / f"{domain}.json"
            text = json.dumps(dict(sorted(tables[lang][domain].items())), ensure_ascii=False, indent=2) + "\n"
            path.write_text(text, encoding="utf-8", newline="\n")
    # Le tri, la typographie du français et la parité : l'outil de parité, en
    # écrivant son rapport là où il l'écrit d'habitude.
    env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
    result = subprocess.run([sys.executable, str(ROOT / "tools" / "check_i18n_parity.py"), "--sort"], cwd=ROOT, env=env, capture_output=True, text=True, encoding="utf-8")
    output = (result.stdout + result.stderr).strip()
    print(output if output else "Parité : rien à signaler.")
    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
