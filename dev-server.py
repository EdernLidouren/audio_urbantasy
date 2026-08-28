#!/usr/bin/env python3
"""Serveur de dev local : sert les fichiers statiques du projet depuis la racine.

Stdlib seulement. Force les bons types MIME (Windows mappe parfois .js en
text/plain via le registre, ce qui casse les modules ES en silence) et
désactive le cache pour que chaque rafraîchissement serve la dernière version.
"""

import argparse
import http.server
import sys

# Types MIME forcés, indépendamment de la table du système (mimetypes/registre
# Windows). Complète http.server.SimpleHTTPRequestHandler.extensions_map.
EXTRA_MIME_TYPES = {
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".json": "application/json",
    ".wasm": "application/wasm",
}


class DevRequestHandler(http.server.SimpleHTTPRequestHandler):
    # Fusionne la table par défaut avec nos overrides forcés.
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, **EXTRA_MIME_TYPES}

    def guess_type(self, path):
        # Court-circuite mimetypes/le registre OS pour nos extensions connues,
        # avant de retomber sur le comportement par défaut.
        for ext, mime in EXTRA_MIME_TYPES.items():
            if path.endswith(ext):
                return mime
        return super().guess_type(path)

    def end_headers(self):
        # Anti-cache sur toutes les réponses : un refresh doit toujours servir
        # la dernière version pendant le dev.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def serve(port):
    address = ("127.0.0.1", port)
    try:
        # ThreadingHTTPServer plutôt que HTTPServer : mono-thread, ce dernier ne
        # sert qu'UNE connexion à la fois et se bloque dès qu'un client garde une
        # connexion HTTP/1.1 keep-alive ouverte (ex. le navigateur en train de
        # streamer une musique html5) — toute requête concurrente (rafale de
        # préchargement audio, plusieurs dizaines de fichiers à la fois) reste
        # en attente derrière, jusqu'à saturer la file d'écoute (ERR_CONNECTION_REFUSED
        # observé en direct). Un thread par connexion lève cette limite.
        httpd = http.server.ThreadingHTTPServer(address, DevRequestHandler)
    except OSError as error:
        print(f"Impossible d'écouter sur le port {port} : {error}")
        sys.exit(1)

    url = f"http://{address[0]}:{port}/"
    print(f"Serveur de dev démarré sur {url} (Ctrl+C pour arrêter)")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nArrêt du serveur.")
        httpd.server_close()


def main():
    parser = argparse.ArgumentParser(description="Serveur de dev statique local pour Templeton.")
    parser.add_argument("port", nargs="?", type=int, default=8000, help="Port d'écoute (défaut : 8000)")
    args = parser.parse_args()
    serve(args.port)


if __name__ == "__main__":
    main()
