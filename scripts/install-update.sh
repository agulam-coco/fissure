#!/usr/bin/env bash
# Installs the latest README + header files from your Downloads folder.
#
#  1. Finds the NEWEST fissure-readme*.zip, Hero*.tsx, Logo*.tsx and globals*.css
#     in Downloads (so "Hero (2).tsx" style renames are handled).
#  2. Unzips into a fresh folder: ~/Downloads/fissure-update-<time>/
#     (nothing gets unzipped straight into the repo).
#  3. Checks each file is the right version, copies everything into place,
#     then commits and pushes.
#
# Run from anywhere inside the repo:
#   bash scripts/install-update.sh
#   bash scripts/install-update.sh ~/Desktop     (if your downloads are elsewhere)
#   NO_PUSH=1 bash scripts/install-update.sh     (commit, but don't push)

set -euo pipefail
shopt -s nullglob

DL="${1:-$HOME/Downloads}"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "x  Run this inside the fissure repo."; exit 1; }
cd "$ROOT"

say() { printf '%s\n' "$*"; }
die() { printf 'x  %s\n' "$*"; exit 1; }

# Newest file matching a glob pattern, or empty if none.
newest() {
  local files=( "$DL"/$1 )
  [ ${#files[@]} -eq 0 ] && return 0
  ls -t "${files[@]}" | head -n 1
}

ZIP="$(newest 'fissure-readme*.zip')"
HERO="$(newest 'Hero*.tsx')"
LOGO="$(newest 'Logo*.tsx')"
CSS="$(newest 'globals*.css')"

say "Using from $DL:"
say "   zip:     ${ZIP:-MISSING}"
say "   hero:    ${HERO:-MISSING}"
say "   logo:    ${LOGO:-MISSING}"
say "   css:     ${CSS:-MISSING}"
[ -n "$ZIP" ] && [ -n "$HERO" ] && [ -n "$LOGO" ] && [ -n "$CSS" ] || die "Something is missing. Re-download it and run again."

# --- Make sure these are the new versions, not older downloads ---------------
grep -q 'import Logo' "$HERO"   || die "$(basename "$HERO") is an old Hero.tsx (no Logo import). Re-download the latest one."
grep -q 'logo-mark' "$LOGO"     || die "$(basename "$LOGO") doesn't look like the Logo component."
grep -q '\.brand' "$CSS"        || die "$(basename "$CSS") is an old globals.css (no .brand styles). Re-download the latest one."

# --- Unzip into its own folder ----------------------------------------------
OUT="$DL/fissure-update-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"
unzip -q -o "$ZIP" -d "$OUT"
[ -f "$OUT/README.md" ] && [ -d "$OUT/assets" ] || die "Zip didn't contain README.md and assets/. Check $OUT"
say "ok unzipped to $OUT"

# --- Copy into the repo -------------------------------------------------------
mkdir -p assets app/components app/app
cp "$OUT/README.md" README.md
cp -R "$OUT/assets/." assets/
cp "$HERO" app/components/Hero.tsx
cp "$LOGO" app/components/Logo.tsx
cp "$CSS"  app/app/globals.css
say "ok README.md, assets/, Hero.tsx, Logo.tsx, globals.css in place"

# --- Verify -------------------------------------------------------------------
for f in assets/banner/banner.png assets/banner/stats.png assets/screenshots/eruption.png \
         assets/icon/icon-512.png app/components/Logo.tsx; do
  [ -f "$f" ] || die "missing after copy: $f"
done
say "ok all files verified"

# --- Commit + push (explicit paths only, never .env) --------------------------
git add README.md assets app/components/Hero.tsx app/components/Logo.tsx app/app/globals.css
[ -f scripts/install-update.sh ] && git add scripts/install-update.sh

if git diff --cached --name-only | grep -qi '\.env'; then
  git reset -q
  die "An .env file got staged. Nothing committed."
fi

if git diff --cached --quiet; then
  say "ok nothing new to commit"
else
  git diff --cached --stat | tail -n 1
  git commit -q -m "README banner, badges, stats; logo in header"
  say "ok committed"
fi

if [ "${NO_PUSH:-0}" = "1" ]; then
  say "ok skipped push"
else
  git push -q && say "ok pushed. Vercel redeploys in a minute or two."
fi

say "   (you can delete $OUT whenever)"
