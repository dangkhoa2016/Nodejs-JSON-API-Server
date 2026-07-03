#!/usr/bin/env bash
set -euo pipefail

BASE="${1:-$(git rev-list --max-parents=0 HEAD)}"
HEAD="${2:-HEAD}"
RESULTS_DIR="$(dirname "$0")/results"
REPORT="$(dirname "$0")/coverage-report.md"

mkdir -p "$RESULTS_DIR"

echo "# Coverage Report" > "$REPORT"
echo "" >> "$REPORT"
echo "| # | Commit | Stmts | Branch | Funcs | Lines | Message |" >> "$REPORT"
echo "|--:|--------|------:|-------:|------:|------:|---------|" >> "$REPORT"

COMMITS=()
while IFS= read -r line; do
  COMMITS+=("$line")
done < <(git log --oneline --reverse "${BASE}..${HEAD}")

TOTAL=${#COMMITS[@]}
IDX=1
ORIG_BRANCH=$(git rev-parse --abbrev-ref HEAD)

cleanup() {
  git checkout "$ORIG_BRANCH" 2>/dev/null || true
  # mise is optional: only load if the user has it installed
  command -v mise &>/dev/null && eval "$(mise activate bash)" || true
}
trap cleanup EXIT

for entry in "${COMMITS[@]}"; do
  HASH=$(echo "$entry" | awk '{print $1}')
  MSG=$(echo "$entry" | cut -d' ' -f2-)
  SAFE_MSG=$(echo "$MSG" | sed 's/[^a-zA-Z0-9._-]/_/g' | head -c 80)
  LOGFILE="$RESULTS_DIR/${IDX}-${HASH}-${SAFE_MSG}.log"

  echo ""
  echo "========================================"
  echo "[${IDX}/${TOTAL}] Checking ${HASH}: ${MSG}"
  echo "========================================"

  git checkout "$HASH" > /dev/null 2>&1
  # mise is optional: only load if the user has it installed
  command -v mise &>/dev/null && eval "$(mise activate bash)" || true

  yarn test:coverage 2>&1 | tee "$LOGFILE" || true

  COV_LINE=$(grep -E "^All files" "$LOGFILE" || true)
  if [ -n "$COV_LINE" ]; then
    STMTS=$(echo "$COV_LINE" | awk '{print $4}')
    BRANCH=$(echo "$COV_LINE" | awk '{print $6}')
    FUNCS=$(echo "$COV_LINE" | awk '{print $8}')
    LINES=$(echo "$COV_LINE" | awk '{print $10}')
  else
    STMTS="-"
    BRANCH="-"
    FUNCS="-"
    LINES="-"
  fi

  echo "| $IDX | \`${HASH}\` | $STMTS | $BRANCH | $FUNCS | $LINES | $MSG |" >> "$REPORT"

  IDX=$((IDX + 1))
done

cleanup
echo ""
echo "Report written to $REPORT"
