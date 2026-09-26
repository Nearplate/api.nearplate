#!/usr/bin/env bash
# Prepends a section for $TAG to CHANGELOG.md from the commits since the
# previous tag. Env: TAG (required), RELEASE_DATE (ISO timestamp, optional).
set -euo pipefail

: "${TAG:?TAG is required}"
DATE="${RELEASE_DATE:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"
DATE="${DATE%%T*}"
FILE="${CHANGELOG_FILE:-CHANGELOG.md}"

PREV="$(git tag --sort=-version:refname | grep -vxF "$TAG" | head -n1 || true)"
if [ -n "$PREV" ]; then
  RANGE="${PREV}..${TAG}"
else
  RANGE="$TAG"
fi

# Skip the bot's own release commits so they never show up as entries.
ENTRIES="$(git log --no-merges --pretty=format:'- %h %s (%an)' "$RANGE" |
  grep -v ' chore: release ' || true)"
if [ -z "$ENTRIES" ]; then
  ENTRIES="- (no changes)"
fi

SECTION="$(mktemp)"
{
  echo "## ${TAG} — ${DATE}"
  echo ""
  printf '%s\n' "$ENTRIES"
} >"$SECTION"

TMP="$(mktemp)"
if [ -f "$FILE" ]; then
  {
    head -n 1 "$FILE"
    echo ""
    cat "$SECTION"
    echo ""
    tail -n +2 "$FILE" | sed -e '1{/^$/d;}'
  } >"$TMP"
else
  {
    echo "# Changelog"
    echo ""
    cat "$SECTION"
  } >"$TMP"
fi
mv "$TMP" "$FILE"
rm -f "$SECTION"
