#!/usr/bin/env bash
# Builds the avatar maker bundle: tools/avatar-maker-v32/maker.ts (+ kit/, AUREVIA character kit v4, unchanged)
# -> public/drawup-avatar-v32/maker.js. Needs three@0.180.0 and esbuild@0.24.0 (npm i in this folder).
set -euo pipefail
cd "$(dirname "$0")"
npx esbuild maker.ts --bundle --minify --format=iife --target=es2020 --outfile=../../public/drawup-avatar-v32/maker.js --legal-comments=eof
