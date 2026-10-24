@echo off
rem Vérification générale du projet (voir tools/verify.js) : syntaxe,
rem vérifications du core, audit du contenu, parité i18n.
rem Double-cliquer ce fichier, ou le lancer depuis une console.

rem Console en UTF-8, sinon les accents s'affichent mal.
chcp 65001 >nul
cd /d "%~dp0"
node tools\verify.js
echo.
pause
