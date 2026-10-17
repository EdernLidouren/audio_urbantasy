#!/usr/bin/env python3
"""Vérifie la parité des traductions i18n (data/i18n/<langue>/<domaine>.json)
contre une langue de référence, écrit un rapport dans un fichier.

Outil de DÉVELOPPEMENT, autonome : ne dépend d'aucun module du jeu (le
moteur i18n vit dans lib/i18n.js, jamais importé ici), lecture seule des
fichiers i18n, écriture du seul fichier de rapport. Lancé à la demande :

    python tools/check_i18n_parity.py [--verbose] [--sort] [--output CHEMIN]

Données PURES en JSON (voir data/i18n/README.md) : json.load() suffit,
aucun parsing complexe. Code de sortie : 0 si toutes les langues sont
synchrones avec REFERENCE_LANG (aucun domaine manquant, aucune clé
divergente, aucune valeur vide), non nul sinon — utilisable en vérification
automatique. --verbose ajoute une section indicative (valeurs identiques à
la référence) qui n'influence JAMAIS le code de sortie.

ORDRE DES CLÉS : chaque fichier doit garder ses clés triées par ordre
alphabétique (tri Python, par point de code), pour que chaque famille de
clés (door.*, entity.*, passage.*...) reste d'un seul bloc. Un fichier non
trié est une divergence. --sort réécrit les fichiers non triés dans l'ordre
attendu (même format : indentation de 2, UTF-8, saut de ligne final), avant
l'analyse : ajouter une clé n'importe où puis lancer --sort suffit.
"""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

# Langue de RÉFÉRENCE : toutes les autres langues sont vérifiées CONTRE
# elle (domaines attendus, clés attendues). Change cette seule ligne pour
# vérifier contre une autre langue.
REFERENCE_LANG = "fr"

I18N_ROOT = Path(__file__).resolve().parent.parent / "data" / "i18n"
DEFAULT_REPORT_PATH = Path(__file__).resolve().parent / "i18n_parity_report.txt"


def discover_languages(root):
    """Sous-dossiers de data/i18n/ = les langues présentes — AGNOSTIQUE au
    nombre et à leur nom, aucune langue codée en dur ici (seule
    REFERENCE_LANG l'est, ci-dessus)."""
    return sorted(p.name for p in root.iterdir() if p.is_dir())


def load_domain_files(lang_dir):
    """Charge tous les .json d'UN dossier de langue (jamais récursif : un
    futur sous-dossier, ex. dialogues/, a sa propre structure — voir
    data/i18n/README.md, "Convention future") -> { domaine: {path, data,
    error} }. Ne lève JAMAIS : un JSON malformé est capturé ici, signalé
    plus tard dans le rapport (voir "Robustesse", jamais un crash silencieux
    ni un plantage du script entier pour UN fichier fautif)."""
    files = {}
    for path in sorted(lang_dir.glob("*.json")):
        try:
            with path.open(encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError) as error:
            files[path.stem] = {"path": path, "data": None, "error": str(error)}
            continue
        files[path.stem] = {"path": path, "data": data, "error": None}
    return files


def dump_sorted(path, data):
    """Écrit un fichier de domaine trié, au format commun de data/i18n/."""
    text = json.dumps(dict(sorted(data.items())), ensure_ascii=False, indent=2) + "\n"
    with path.open("w", encoding="utf-8", newline="\n") as f:
        f.write(text)


def sort_files(per_lang_files):
    """--sort : réécrit les fichiers lisibles dont les clés ne sont pas
    triées, met à jour les données chargées. Renvoie les étiquettes des
    fichiers réécrits."""
    rewritten = []
    for lang, files in per_lang_files.items():
        for domain, info in files.items():
            data = info["data"]
            if data is None or list(data) == sorted(data):
                continue
            dump_sorted(info["path"], data)
            info["data"] = dict(sorted(data.items()))
            rewritten.append(rel_label(lang, domain))
    return rewritten


def rel_label(lang, domain):
    """Étiquette lisible "lang/domaine.json" — TOUJOURS le fichier concerné,
    jamais juste la clé seule (voir consigne : savoir où corriger)."""
    return f"{lang}/{domain}.json"


def analyze(languages, per_lang_files):
    """Calcule TOUT ce que le rapport affichera — aucune I/O ici, juste des
    données, pour que le formatage (render_report) reste séparé du calcul.
    Renvoie (counts, parse_errors, file_parity, per_file, problems) —
    `problems` est la liste à PLAT de toutes les lignes qui comptent pour
    le VERDICT/code de sortie (jamais les valeurs identiques, indicatives
    seulement)."""
    ref_files = per_lang_files[REFERENCE_LANG]
    problems = []

    # a. Comptage par langue (total, tous domaines confondus).
    counts = {
        lang: sum(len(f["data"]) for f in files.values() if f["data"] is not None)
        for lang, files in per_lang_files.items()
    }

    # Erreurs de lecture JSON — la plus BLOQUANTE des divergences (rien
    # d'autre n'est comparable pour ce fichier), signalée à part.
    parse_errors = []
    for lang, files in per_lang_files.items():
        for domain, info in files.items():
            if info["error"] is not None:
                parse_errors.append((rel_label(lang, domain), info["error"]))
    problems.extend(f"{label} : JSON invalide" for label, _ in parse_errors)

    # b. Parité de fichiers : un domaine ENTIER manquant (ou en trop) est
    # un trou d'un autre ordre qu'une clé manquante — signalé séparément.
    ref_domains = set(ref_files.keys())
    file_parity = []  # (lang, domain, "manquant"|"en trop")
    for lang in languages:
        if lang == REFERENCE_LANG:
            continue
        lang_domains = set(per_lang_files[lang].keys())
        for domain in sorted(ref_domains - lang_domains):
            file_parity.append((lang, domain, "manquant"))
        for domain in sorted(lang_domains - ref_domains):
            file_parity.append((lang, domain, "en trop"))
    problems.extend(
        f"{rel_label(lang, domain)} : domaine {status} (référence à comparer : {REFERENCE_LANG}/)"
        for lang, domain, status in file_parity
    )

    # c./d./e. Par fichier-domaine, TOUTES langues (y compris la référence,
    # pour ses propres valeurs vides — un trou dans la référence reste un
    # trou) : clés divergentes DANS LES DEUX SENS + valeurs vides + (info)
    # valeurs identiques. Un domaine absent de la référence (déjà signalé
    # en b, "en trop") n'a rien à comparer clé à clé : sauté ici.
    per_file = []  # dicts : lang, domain, missing, extra, empty, identical
    for lang in languages:
        for domain, info in per_lang_files[lang].items():
            if info["data"] is None:
                continue  # JSON invalide, déjà signalé plus haut

            empty = sorted(k for k, v in info["data"].items() if v == "")
            unsorted = list(info["data"]) != sorted(info["data"])

            missing, extra, identical = [], [], []
            if lang != REFERENCE_LANG:
                ref_info = ref_files.get(domain)
                if ref_info is not None and ref_info["data"] is not None:
                    ref_data, lang_data = ref_info["data"], info["data"]
                    ref_keys, lang_keys = set(ref_data.keys()), set(lang_data.keys())
                    missing = sorted(ref_keys - lang_keys)
                    extra = sorted(lang_keys - ref_keys)
                    identical = sorted(
                        k for k in (ref_keys & lang_keys)
                        if ref_data[k] == lang_data[k] and ref_data[k] != ""
                    )

            if missing or extra or empty or identical or unsorted:
                per_file.append({
                    "lang": lang, "domain": domain,
                    "missing": missing, "extra": extra,
                    "empty": empty, "identical": identical,
                    "unsorted": unsorted,
                })

            label = rel_label(lang, domain)
            problems.extend(f'{label} : traduction manquante pour "{k}" (présente dans {REFERENCE_LANG})' for k in missing)
            problems.extend(f'{label} : clé orpheline "{k}" (absente de {REFERENCE_LANG})' for k in extra)
            problems.extend(f'{label} : valeur vide pour "{k}"' for k in empty)
            if unsorted:
                problems.append(f"{label} : clés non triées (lancer avec --sort)")

    return counts, parse_errors, file_parity, per_file, problems


def render_report(languages, counts, parse_errors, file_parity, per_file, problems, verbose):
    """Construit le TEXTE du rapport, GÉNÉRAL -> PARTICULIER (lecture
    linéaire, voir consigne) : verdict d'abord (on sait immédiatement s'il
    faut creuser), détail ensuite. Retourne une liste de lignes."""
    timestamp = datetime.now().astimezone().isoformat(timespec="seconds")
    ok = len(problems) == 0

    lines = [
        f"Rapport de parité i18n — {timestamp}",
        f"Langue de référence : {REFERENCE_LANG}",
        "Tout est synchrone." if ok else f"{len(problems)} divergence(s) trouvée(s).",
        "",
    ]

    if parse_errors:
        lines.append("--- Fichiers JSON invalides (bloquant) ---")
        for label, error in parse_errors:
            lines.append(f"  {label} : {error}")
        lines.append("")

    lines.append("--- Comptage par langue ---")
    for lang in languages:
        domain_count = len([d for d in Path(I18N_ROOT / lang).glob("*.json")])
        lines.append(f"  {lang} : {counts[lang]} clé(s) au total, {domain_count} fichier(s) de domaine")
    lines.append("")

    lines.append("--- Parité de fichiers (domaines) ---")
    if file_parity:
        for lang, domain, status in file_parity:
            lines.append(f"  {rel_label(lang, domain)} : {status}")
    else:
        lines.append(f"  Tous les domaines de {REFERENCE_LANG}/ sont présents dans chaque langue.")
    lines.append("")

    lines.append("--- Divergences par fichier (clés manquantes/orphelines, valeurs vides, ordre) ---")
    # per_file peut contenir des sections qui n'ont QUE des valeurs
    # identiques (voir "identical" ci-dessous, ex. "Templeton" légitimement
    # pareil dans les deux langues) — jamais une divergence en soi, donc
    # jamais suffisant pour éviter le repli "Aucune." ici.
    divergent_sections = [s for s in per_file if s["missing"] or s["extra"] or s["empty"] or s["unsorted"]]
    if divergent_sections:
        for section in divergent_sections:
            lines.append(f'  {rel_label(section["lang"], section["domain"])}')
            for k in section["missing"]:
                lines.append(f'    manquante : "{k}"')
            for k in section["extra"]:
                lines.append(f'    orpheline : "{k}"')
            for k in section["empty"]:
                lines.append(f'    valeur vide : "{k}"')
            if section["unsorted"]:
                lines.append("    clés non triées par ordre alphabétique (lancer avec --sort)")
    else:
        lines.append("  Aucune.")
    lines.append("")

    if verbose:
        lines.append("--- Valeurs identiques à la référence (indicatif, --verbose — n'affecte pas le verdict) ---")
        any_identical = any(section["identical"] for section in per_file)
        if any_identical:
            for section in per_file:
                if not section["identical"]:
                    continue
                lines.append(f'  {rel_label(section["lang"], section["domain"])}')
                for k in section["identical"]:
                    lines.append(f'    identique : "{k}"')
        else:
            lines.append("  Aucune.")
        lines.append("")

    return lines


def main():
    # Console Windows pas toujours en UTF-8 par défaut : sans ça, les
    # accents s'afficheraient mal dans les messages stdout/stderr (le
    # FICHIER de rapport, lui, est toujours écrit en UTF-8 correct — voir
    # plus bas). reconfigure() existe depuis Python 3.7, stdlib pure — même
    # patron que tools/build_audio_manifest.py.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description="Vérifie la parité des traductions i18n contre REFERENCE_LANG.")
    parser.add_argument("--verbose", action="store_true", help="ajoute la liste des valeurs identiques à la référence (indicatif, n'affecte pas le code de sortie)")
    parser.add_argument("--sort", action="store_true", help="réécrit les fichiers dont les clés ne sont pas triées, avant l'analyse")
    parser.add_argument("--output", default=str(DEFAULT_REPORT_PATH), help=f"chemin du rapport à écrire (défaut : {DEFAULT_REPORT_PATH})")
    args = parser.parse_args()

    if not I18N_ROOT.is_dir():
        print(f"check_i18n_parity: dossier introuvable : {I18N_ROOT}", file=sys.stderr)
        return 2

    languages = discover_languages(I18N_ROOT)
    if REFERENCE_LANG not in languages:
        print(f'check_i18n_parity: langue de référence "{REFERENCE_LANG}" absente de {I18N_ROOT}.', file=sys.stderr)
        return 2

    per_lang_files = {lang: load_domain_files(I18N_ROOT / lang) for lang in languages}
    if args.sort:
        for label in sort_files(per_lang_files):
            print(f"Trié : {label}")

    counts, parse_errors, file_parity, per_file, problems = analyze(languages, per_lang_files)
    lines = render_report(languages, counts, parse_errors, file_parity, per_file, problems, args.verbose)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines) + "\n")

    ok = len(problems) == 0
    print(("Tout est synchrone." if ok else f"{len(problems)} divergence(s) trouvée(s).") + f" Rapport : {output_path}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
