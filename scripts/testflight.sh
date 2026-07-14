#!/usr/bin/env bash

# Archive VibePad and upload it to App Store Connect (TestFlight) using an
# App Store Connect API key — no Apple ID session required.
#
# One-time setup:
#   1. Create the app record once in the App Store Connect web UI
#      (My Apps → + → New App, bundle ID com.vibepad.app). App record
#      creation is the only step the API cannot do.
#   2. Create an API key with the Developer role or higher in
#      App Store Connect → Users and Access → Integrations → App Store
#      Connect API, then download the .p8 file.
#   3. Export the key details (for example in ~/.zshrc):
#        export VIBEPAD_ASC_KEY_ID="ABC123DEFG"
#        export VIBEPAD_ASC_ISSUER_ID="12345678-aaaa-bbbb-cccc-1234567890ab"
#        export VIBEPAD_ASC_KEY_PATH="$HOME/.appstoreconnect/private_keys/AuthKey_ABC123DEFG.p8"
#
# Usage: ./scripts/testflight.sh

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

: "${VIBEPAD_ASC_KEY_ID:?Set VIBEPAD_ASC_KEY_ID to the App Store Connect API key ID}"
: "${VIBEPAD_ASC_ISSUER_ID:?Set VIBEPAD_ASC_ISSUER_ID to the App Store Connect issuer ID}"
: "${VIBEPAD_ASC_KEY_PATH:?Set VIBEPAD_ASC_KEY_PATH to the AuthKey_*.p8 file path}"

if [[ ! -f "$VIBEPAD_ASC_KEY_PATH" ]]; then
  echo "API key file not found: $VIBEPAD_ASC_KEY_PATH" >&2
  exit 1
fi

# Monotonic build number so every upload is accepted by TestFlight.
build_number="$(date +%Y%m%d%H%M)"
archive_path="build/VibePad-${build_number}.xcarchive"

echo "Archiving build ${build_number}…"
xcodebuild archive \
  -workspace VibePad.xcworkspace \
  -scheme OpenCodeClient \
  -destination 'generic/platform=iOS' \
  -archivePath "$archive_path" \
  -allowProvisioningUpdates \
  -authenticationKeyID "$VIBEPAD_ASC_KEY_ID" \
  -authenticationKeyIssuerID "$VIBEPAD_ASC_ISSUER_ID" \
  -authenticationKeyPath "$VIBEPAD_ASC_KEY_PATH" \
  CURRENT_PROJECT_VERSION="$build_number"

echo "Exporting and uploading to App Store Connect…"
xcodebuild -exportArchive \
  -archivePath "$archive_path" \
  -exportOptionsPlist scripts/ExportOptions.plist \
  -exportPath "build/export-${build_number}" \
  -allowProvisioningUpdates \
  -authenticationKeyID "$VIBEPAD_ASC_KEY_ID" \
  -authenticationKeyIssuerID "$VIBEPAD_ASC_ISSUER_ID" \
  -authenticationKeyPath "$VIBEPAD_ASC_KEY_PATH"

echo "Uploaded build ${build_number}. It appears in TestFlight after Apple finishes processing."
