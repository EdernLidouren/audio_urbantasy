#!/usr/bin/env python3
"""Génère un manifeste JSON des assets audio, regroupés par "pool".

Outil de BUILD, hors runtime : ne fait pas partie du jeu, ne dépend que de
la bibliothèque standard.

Usage :
    python tools/build_audio_manifest.py [racine] [sortie]

    racine  dossier à scanner récursivement (défaut : "assets")
    sortie  chemin du manifeste JSON à écrire (défaut : "assets/manifest.json")

Convention de regroupement :
    Chaque fichier audio est rattaché à un "pool" identifié par son chemin
    SANS suffixe numérique final ni extension :
        assets/sounds/dog_medium_1.mp3  -> pool "assets/sounds/dog_medium"
        assets/sounds/dog_medium_2.mp3  -> même pool
        assets/ambiances/wind_medium.mp3 -> pool "assets/ambiances/wind_medium"
                                             (aucun suffixe -> pool à 1 élément,
                                             pas de cas particulier côté jeu)
    Le manifeste produit est { pool: [chemins...], ... }, chemins utilisables
    tels quels par le jeu (relatifs à la racine du projet, pas à `racine`).
"""

import argparse
import json
import re
import sys
from pathlib import Path

# Extensions retenues (comparaison insensible à la casse). À adapter ici si
# de nouveaux formats sont un jour utilisés — seul point de configuration.
AUDIO_EXTENSIONS = {".mp3", ".ogg", ".wav"}

# Nom de fichier "propre" attendu : lettres/chiffres/_/- uniquement, sans le
# suffixe numérique (traité séparément ci-dessous).
SAFE_NAME_RE = re.compile(r"^[A-Za-z0-9_-]+$")

# Suffixe numérique final "propre" : _<un ou plusieurs chiffres> en fin de nom.
NUMERIC_SUFFIX_RE = re.compile(r"^(.*)_(\d+)$")

# Dernier segment après "_", utilisé pour détecter un suffixe qui RESSEMBLE à
# un numéro mais ne l'est pas franchement (ex. "_1a", "_02x") — un mélange de
# chiffres et de lettres dans ce dernier segment est le signe typique d'un
# numéro mal formé, contrairement à un segment tout lettres (ex. "medium",
# nom légitime sans numérotation) ou tout chiffres (déjà capté ci-dessus).
TRAILING_SEGMENT_RE = re.compile(r"^.*_([^_]+)$")


def pool_key_and_warnings(stem):
    """Calcule (clé de pool sans dossier ni extension, avertissements) pour
    le nom de fichier `stem` (sans extension)."""
    warnings = []
    if not SAFE_NAME_RE.match(stem):
        warnings.append("caractères inhabituels dans le nom (attendu lettres/chiffres/_/-)")

    match = NUMERIC_SUFFIX_RE.match(stem)
    if match:
        return match.group(1), warnings

    # Pas de suffixe numérique propre : cas normal (pool à 1 élément) SAUF si
    # le dernier segment ressemble à une tentative de numérotation ratée.
    segment_match = TRAILING_SEGMENT_RE.match(stem)
    if segment_match:
        segment = segment_match.group(1)
        has_digit = any(c.isdigit() for c in segment)
        has_alpha = any(c.isalpha() for c in segment)
        if has_digit and has_alpha:
            warnings.append(f"suffixe \"_{segment}\" ressemble à un numéro mal formé (attendu \"_<nombre>\")")

    return stem, warnings


def natural_sort_key(rel_path):
    """Clé de tri pour les chemins d'un même pool : par numéro croissant
    (2 avant 10), fichiers sans suffixe numérique en tête ; à égalité,
    ordre lexicographique documenté sur le chemin complet."""
    stem = Path(rel_path).stem
    match = NUMERIC_SUFFIX_RE.match(stem)
    number = int(match.group(2)) if match else -1
    return (number, rel_path)


def build_manifest(root):
    """Scanne `root` (Path) récursivement, retourne (manifest dict, liste
    d'avertissements (chemin, message))."""
    # Chemins relatifs calculés depuis le PARENT de `root`, pas `root`
    # lui-même : le nom du dossier scanné (ex. "assets") reste en tête de
    # chaque chemin produit, pour qu'il soit utilisable tel quel par le jeu
    # (voir exemple dans le docstring), peu importe comment `root` a été
    # fourni sur la ligne de commande (relatif ou absolu).
    base_dir = root.parent

    pools = {}
    warnings = []

    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        if path.suffix.lower() not in AUDIO_EXTENSIONS:
            continue  # extension non audio : ignoré, silencieusement (normal)

        rel = path.relative_to(base_dir)
        stem = rel.stem
        key_stem, file_warnings = pool_key_and_warnings(stem)
        pool_key = (rel.parent / key_stem).as_posix()
        rel_str = rel.as_posix()

        pools.setdefault(pool_key, []).append(rel_str)

        for message in file_warnings:
            warnings.append((rel_str, message))

    for key in pools:
        pools[key].sort(key=natural_sort_key)

    return pools, warnings


def main():
    # Console Windows pas toujours en UTF-8 par défaut : sans ça, les
    # avertissements accentués s'affichent mal (le FICHIER manifeste, lui,
    # est toujours écrit en UTF-8 correct — voir plus bas). reconfigure()
    # existe depuis Python 3.7, stdlib pure.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description="Génère un manifeste JSON des assets audio, regroupés par pool.")
    parser.add_argument("root", nargs="?", default="assets", help='dossier à scanner (défaut: "assets")')
    parser.add_argument("output", nargs="?", default="assets/manifest.json", help='manifeste à écrire (défaut: "assets/manifest.json")')
    args = parser.parse_args()

    root = Path(args.root)
    if not root.is_dir():
        print(f"Erreur : dossier racine introuvable : {root}", file=sys.stderr)
        sys.exit(1)

    pools, warnings = build_manifest(root)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    # indent=2 + sort_keys : sortie déterministe, régénération = même octet
    # pour mêmes fichiers. newline="\n" force une fin de ligne stable quel
    # que soit l'OS d'exécution (pas de \r\n sous Windows).
    payload = json.dumps(pools, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    with open(output_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(payload)

    for rel_path, message in warnings:
        print(f"AVERTISSEMENT: {rel_path}: {message}", file=sys.stderr)

    total_files = sum(len(files) for files in pools.values())
    print(f"{len(pools)} pool(s), {total_files} fichier(s) -> {output_path}")
    if warnings:
        print(f"{len(warnings)} avertissement(s) :")
        for rel_path, message in warnings:
            print(f"  - {rel_path}: {message}")
    else:
        print("Aucun avertissement.")


if __name__ == "__main__":
    main()
