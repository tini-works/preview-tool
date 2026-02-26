#!/usr/bin/env bash
# Screen verification script — pass screen path relative to src/screens/
# Usage: bash verify-screen.sh prescription/delivery
# Exit code: number of failed checks (0 = all passed)

if [ -z "${1:-}" ]; then
  echo "Usage: bash verify-screen.sh <section/screen>"
  echo "Example: bash verify-screen.sh prescription/delivery"
  exit 1
fi

SCREEN_PATH="src/screens/$1"
ERRORS=0
TMPFILE=$(mktemp)
trap 'rm -f "$TMPFILE"' EXIT

echo "Verifying screen: $SCREEN_PATH"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. Required files
echo ""
echo "1. Checking required files..."
for f in index.tsx scenarios.ts en.json de.json; do
  if [ -f "$SCREEN_PATH/$f" ]; then
    echo "   ✓ $f"
  else
    echo "   ✗ MISSING: $SCREEN_PATH/$f"
    ERRORS=$((ERRORS + 1))
  fi
done

# Optional: flow.ts (required for multi-step flows)
if [ -f "$SCREEN_PATH/flow.ts" ]; then
  echo "   ✓ flow.ts"
else
  echo "   ⊘ flow.ts (optional — not present)"
fi

# 2. TypeScript compiles
echo ""
echo "2. TypeScript compilation..."
if pnpm exec tsc --noEmit 2>&1; then
  echo "   ✓ TypeScript compiles"
else
  echo "   ✗ TypeScript errors"
  ERRORS=$((ERRORS + 1))
fi

# 3. Build succeeds
echo ""
echo "3. Build check..."
if pnpm build 2>&1; then
  echo "   ✓ Build succeeds"
else
  echo "   ✗ Build failed"
  ERRORS=$((ERRORS + 1))
fi

# 4. i18n key coverage
echo ""
echo "4. i18n key coverage..."
if [ -f "$SCREEN_PATH/index.tsx" ] && [ -f "$SCREEN_PATH/en.json" ] && [ -f "$SCREEN_PATH/de.json" ]; then
  : > "$TMPFILE"
  KEYS=$(grep -oE "t\('[^']+'" "$SCREEN_PATH/index.tsx" 2>/dev/null | sed "s/t('//;s/'//" | sort -u)
  if [ -n "$KEYS" ]; then
    while read -r key; do
      if ! node -e "const j=JSON.parse(require('fs').readFileSync('$SCREEN_PATH/en.json','utf8')); if(j['$key']===undefined){process.exit(1)}" 2>/dev/null; then
        echo "   ✗ MISSING en.json key: $key"
        echo "miss" >> "$TMPFILE"
      fi
      if ! node -e "const j=JSON.parse(require('fs').readFileSync('$SCREEN_PATH/de.json','utf8')); if(j['$key']===undefined){process.exit(1)}" 2>/dev/null; then
        echo "   ✗ MISSING de.json key: $key"
        echo "miss" >> "$TMPFILE"
      fi
    done <<< "$KEYS"
    MISSING_COUNT=$(wc -l < "$TMPFILE" | tr -d ' ')
    if [ "$MISSING_COUNT" -gt 0 ]; then
      ERRORS=$((ERRORS + MISSING_COUNT))
    else
      echo "   ✓ All i18n keys present in en.json and de.json"
    fi
  else
    echo "   ⊘ No t() calls found in index.tsx"
  fi
else
  echo "   ⊘ Skipped (missing index.tsx, en.json, or de.json)"
fi

# 5. Flow trigger coverage
echo ""
echo "5. Flow trigger coverage..."
if [ -f "$SCREEN_PATH/flow.ts" ] && [ -f "$SCREEN_PATH/index.tsx" ]; then
  : > "$TMPFILE"
  TRIGGERS=$(grep -oE "trigger: '[^']+'" "$SCREEN_PATH/flow.ts" 2>/dev/null | sed "s/trigger: '//;s/'//")
  if [ -n "$TRIGGERS" ]; then
    while read -r trigger; do
      if ! grep -q "data-flow-target=\"$trigger\"" "$SCREEN_PATH/index.tsx"; then
        echo "   ✗ MISSING data-flow-target: $trigger"
        echo "miss" >> "$TMPFILE"
      fi
    done <<< "$TRIGGERS"
    TRIGGER_MISS=$(wc -l < "$TMPFILE" | tr -d ' ')
    if [ "$TRIGGER_MISS" -gt 0 ]; then
      ERRORS=$((ERRORS + TRIGGER_MISS))
    else
      echo "   ✓ All flow triggers have matching data-flow-target"
    fi
  else
    echo "   ⊘ No triggers found in flow.ts"
  fi
else
  echo "   ⊘ Skipped (no flow.ts)"
fi

# 6. Forbidden Tailwind color classes
echo ""
echo "6. Forbidden Tailwind colors..."
if [ -f "$SCREEN_PATH/index.tsx" ]; then
  FORBIDDEN=$(grep -nE '(neutral|gray|zinc|red|green|blue|orange)-[0-9]' "$SCREEN_PATH/index.tsx" 2>/dev/null || true)
  if [ -n "$FORBIDDEN" ]; then
    while read -r line; do
      echo "   ✗ $line"
    done <<< "$FORBIDDEN"
    ERRORS=$((ERRORS + 1))
    echo "   ✗ FAIL: Forbidden Tailwind color classes found"
  else
    echo "   ✓ No forbidden color classes"
  fi
fi

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "$ERRORS" -eq 0 ]; then
  echo "✓ All checks passed"
else
  echo "✗ $ERRORS check(s) failed"
fi
exit "$ERRORS"
