#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

if ! command -v swift-format >/dev/null 2>&1; then
  echo "swift-format is required. Install it with: brew install swift-format" >&2
  exit 1
fi

swift-format format \
  --configuration .swift-format \
  --in-place \
  --parallel \
  --recursive \
  OpenCodeClient/OpenCodeClient \
  OpenCodeClient/OpenCodeClientTests \
  OpenCodeClient/OpenCodeClientUITests
