#!/usr/bin/env bash
# Puts the Fissure icon files where they belong, then commits and pushes.
#
#   app/app/   favicon.ico, icon.svg, apple-icon.png   (Next.js picks these up by name)
#   assets/icon/  icon-512.png, icon-180.png, icon.svg, favicon.ico   (for the README / Devpost)
#
# Usage, from anywhere inside the repo:
#   bash scripts/organize-assets.sh            # looks for downloads in ~/Downloads
#   bash scripts/organize-assets.sh ~/Desktop  # or wherever you saved them
#   NO_PUSH=1 bash scripts/organize-assets.sh  # commit only, don't push

set -euo pipefail

SRC="${1:-$HOME/Downloads}"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "x  Run this inside the fissure git repo."; exit 1; }
APPDIR="$ROOT/app/app"
ASSETS="$ROOT/assets/icon"

[ -d "$APPDIR" ] || { echo "x  Expected the Next.js app router folder at $APPDIR"; exit 1; }
mkdir -p "$ASSETS"

say() { printf '%s\n' "$*"; }

# Copy $1 (if it exists in SRC) over $2. Returns 0 if something was copied.
take_from_src() {
  if [ -f "$SRC/$1" ]; then
    cp "$SRC/$1" "$2"
    say "ok $1  ->  ${2#$ROOT/}"
    return 0
  fi
  return 1
}

# --- 1. icon-512.png: lives in assets, not in the app router ---------------
if [ -f "$APPDIR/icon-512.png" ]; then
  mv "$APPDIR/icon-512.png" "$ASSETS/icon-512.png"
  say "ok moved app/app/icon-512.png  ->  assets/icon/icon-512.png"
else
  take_from_src icon-512.png "$ASSETS/icon-512.png" || true
fi

# --- 2. Next.js icon files in app/app ---------------------------------------
take_from_src favicon.ico "$APPDIR/favicon.ico" || true
take_from_src icon.svg    "$APPDIR/icon.svg"    || true
if ! take_from_src icon-180.png "$APPDIR/apple-icon.png"; then
  [ -f "$APPDIR/apple-icon.png" ] || say "!  No icon-180.png in $SRC and no app/app/apple-icon.png yet (iPhone icon will be missing)"
fi

for f in favicon.ico icon.svg; do
  [ -f "$APPDIR/$f" ] || say "!  app/app/$f is missing. Download it and re-run."
done

# --- 3. Mirror into assets/ for the README ----------------------------------
[ -f "$APPDIR/favicon.ico" ]    && cp "$APPDIR/favicon.ico"    "$ASSETS/favicon.ico"
[ -f "$APPDIR/icon.svg" ]       && cp "$APPDIR/icon.svg"       "$ASSETS/icon.svg"
[ -f "$APPDIR/apple-icon.png" ] && cp "$APPDIR/apple-icon.png" "$ASSETS/icon-180.png"
say "ok assets/icon/ now has: $(ls "$ASSETS" | tr '\n' ' ')"

# --- 4. Logo at the top of the README ---------------------------------------
README="$ROOT/README.md"
LOGO='<p align="center"><img src="assets/icon/icon-512.png" alt="Fissure" width="120"></p>'
if [ ! -f "$README" ]; then
  printf '%s\n\n# Fissure\n\nEarly vehicle defect detection from NHTSA owner complaints.\n' "$LOGO" > "$README"
  say "ok created README.md with the logo"
elif ! grep -q 'assets/icon/icon-512.png' "$README"; then
  { printf '%s\n\n' "$LOGO"; cat "$README"; } > "$README.tmp" && mv "$README.tmp" "$README"
  say "ok added the logo to the top of README.md"
else
  say "ok README.md already shows the logo"
fi

# --- 5. Commit + push (explicit paths only, never .env files) ---------------
cd "$ROOT"
git add -A assets app/app README.md
[ -f scripts/organize-assets.sh ] && git add scripts/organize-assets.sh

if git diff --cached --name-only | grep -qi '\.env'; then
  echo "x  An .env file got staged. Unstaging everything, nothing committed."
  git reset -q
  exit 1
fi

if git diff --cached --quiet; then
  say "ok nothing new to commit"
else
  git diff --cached --name-status
  git commit -q -m "Add Fissure favicon and app icons, assets folder for README"
  say "ok committed"
fi

if [ "${NO_PUSH:-0}" = "1" ]; then
  say "ok skipped push (NO_PUSH=1)"
else
  git push && say "ok pushed. Vercel will redeploy in a minute or two."
fi
