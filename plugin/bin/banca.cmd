@ECHO off
REM Banca: o comando banca no Windows, vindo do plugin. Gerado por scripts/build-plugin.mjs.
WHERE node >NUL 2>NUL || (ECHO Banca: o Node.js nao foi encontrado neste computador. Instale a versao LTS pelo instalador de https://nodejs.org e abra o Claude de novo. 1>&2 & EXIT /b 127)
node "%~dp0..\motor\bin\legalsquad.js" %*
