#!/usr/bin/env bash

set -euo pipefail

bun_version="1.3.14"
repository_url="https://github.com/chikingsley/vibepad.git"
repository_ref="main"
source_dir=""
install_dir=""
automatic_consent="0"
bootstrap_args=()

usage() {
  cat <<'EOF'
VibePad Host installer

Usage:
  ./scripts/install-host.sh [installer options] [bootstrap options]

Installer options:
  --source <path>       Use an existing VibePad source tree
  --install-dir <path>  Override the managed installation directory
  --repo-url <url>      Override the VibePad Git repository
  --ref <ref>           Install a branch, tag, or commit (default main)
  --yes                 Consent to Bun and selected managed-tool installs
  -h, --help            Show this help

Other options are passed to the typed host bootstrap. Common choices include
--without-codex, --without-opencode, --without-browser, --project-root <path>,
--no-start, and --allow-unauthenticated.
EOF
}

require_value() {
  local flag="$1"
  local value="${2:-}"
  if [[ -z "$value" || "$value" == --* ]]; then
    printf '%s requires a value\n' "$flag" >&2
    exit 2
  fi
}

while (($# > 0)); do
  case "$1" in
    --source)
      require_value "$1" "${2:-}"
      source_dir="$2"
      shift 2
      ;;
    --install-dir)
      require_value "$1" "${2:-}"
      install_dir="$2"
      shift 2
      ;;
    --repo-url)
      require_value "$1" "${2:-}"
      repository_url="$2"
      shift 2
      ;;
    --ref)
      require_value "$1" "${2:-}"
      repository_ref="$2"
      shift 2
      ;;
    --yes)
      automatic_consent="1"
      bootstrap_args+=("$1")
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      bootstrap_args+=("$1")
      shift
      ;;
  esac
done

platform_name="$(uname -s)"
case "$platform_name" in
  Darwin)
    if [[ -z "$install_dir" ]]; then
      install_dir="$HOME/Library/Application Support/VibePad"
    fi
    ;;
  Linux)
    if [[ -z "$install_dir" ]]; then
      install_dir="${XDG_DATA_HOME:-$HOME/.local/share}/vibepad"
    fi
    ;;
  *)
    printf 'VibePad Host does not support %s\n' "$platform_name" >&2
    exit 1
    ;;
esac

if ! command -v curl >/dev/null 2>&1; then
  printf 'curl is required to install Bun\n' >&2
  exit 1
fi
if ! command -v git >/dev/null 2>&1 && [[ -z "$source_dir" ]]; then
  printf 'git is required to install VibePad source\n' >&2
  exit 1
fi
if ! command -v tailscale >/dev/null 2>&1; then
  printf 'Install and connect Tailscale before running VibePad Host setup\n' >&2
  exit 1
fi
if ! tailscale ip -4 >/dev/null 2>&1; then
  printf 'Tailscale is installed but does not have an active IPv4 address\n' >&2
  exit 1
fi

bun_bin="$(command -v bun 2>/dev/null || true)"
if [[ -z "$bun_bin" ]]; then
  if [[ "$automatic_consent" != "1" ]]; then
    if [[ ! -r /dev/tty ]]; then
      printf 'Bun %s is missing; rerun with --yes to install it\n' "$bun_version" >&2
      exit 1
    fi
    read -r -p "Install Bun $bun_version for VibePad? [y/N] " answer </dev/tty
    if [[ ! "$answer" =~ ^[Yy]([Ee][Ss])?$ ]]; then
      printf 'Bun installation was declined\n' >&2
      exit 1
    fi
  fi
  if ! command -v unzip >/dev/null 2>&1; then
    printf 'unzip is required by the Bun installer\n' >&2
    exit 1
  fi
  installer_file="$(mktemp "${TMPDIR:-/tmp}/vibepad-bun-install.XXXXXX")"
  trap 'rm -f "$installer_file"' EXIT
  curl -fsSL https://bun.com/install -o "$installer_file"
  bash "$installer_file" "bun-v$bun_version"
  bun_bin="$HOME/.bun/bin/bun"
fi

if [[ ! -x "$bun_bin" ]]; then
  printf 'Bun executable is unavailable at %s\n' "$bun_bin" >&2
  exit 1
fi

if [[ -z "$source_dir" ]]; then
  source_dir="$install_dir/source"
  mkdir -p "$(dirname "$source_dir")"
  if [[ ! -e "$source_dir" ]]; then
    git clone --branch "$repository_ref" --single-branch "$repository_url" "$source_dir"
  else
    if [[ ! -d "$source_dir/.git" ]]; then
      printf 'Managed source path exists but is not a Git checkout: %s\n' "$source_dir" >&2
      exit 1
    fi
    if [[ -n "$(git -C "$source_dir" status --porcelain --untracked-files=all)" ]]; then
      printf 'Refusing to update a modified managed source tree: %s\n' "$source_dir" >&2
      exit 1
    fi
    git -C "$source_dir" fetch origin "$repository_ref"
    git -C "$source_dir" merge --ff-only FETCH_HEAD
  fi
fi

if [[ ! -f "$source_dir/package.json" || ! -f "$source_dir/bun.lock" ]]; then
  printf 'VibePad source is incomplete: %s\n' "$source_dir" >&2
  exit 1
fi

"$bun_bin" install --frozen-lockfile --cwd="$source_dir"
exec "$bun_bin" "$source_dir/apps/host/src/bootstrap-cli.ts" "${bootstrap_args[@]}"
