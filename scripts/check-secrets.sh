#!/usr/bin/env bash
# Verify all required 1Password secrets are accessible.
# Usage: ./scripts/check-secrets.sh

set -euo pipefail

secrets=(
  "op://Eviebot/Apple MusicKit Team ID/credential"
  "op://Eviebot/Apple MusicKit Key ID/credential"
  "op://Eviebot/Apple MusicKit Private Key/credential"
  "op://Eviebot/Apple Music User Token/credential"
  "op://Eviebot/Unsplash Access Key/credential"
  "op://Eviebot/Mood Playlist OAuth Consent Password/credential"
  "op://Eviebot/Mood Playlist JWT Secret/credential"
)

pass=0
fail=0

for ref in "${secrets[@]}"; do
  # Extract the item name (second path component) for display
  name=$(echo "$ref" | cut -d'/' -f4)
  if op read "$ref" > /dev/null 2>&1; then
    printf "  OK  %s\n" "$name"
    pass=$((pass + 1))
  else
    printf "  MISSING  %s\n" "$name"
    fail=$((fail + 1))
  fi
done

echo ""
echo "$pass passed, $fail failed out of ${#secrets[@]} secrets"

if [ "$fail" -gt 0 ]; then
  exit 1
fi
