#!/usr/bin/env bash

set -euo pipefail

bun_version="1.3.14"
action="install"
host_version=""
release_base_url="https://vibepad.peacockery.studio/downloads/host"
source_dir=""
install_dir=""
automatic_consent="0"
bootstrap_args=()

usage() {
  cat <<'EOF'
VibePad Host installer

Usage:
  ./scripts/install-host.sh [install] [installer options] [setup options]
  ./scripts/install-host.sh uninstall [--install-dir <path>]
  ./scripts/install-host.sh reset [--install-dir <path>]

Actions:
  install                     Install or upgrade VibePad Host (default)
  uninstall                   Remove VibePad Host and preserve pairing data
  reset                       Remove VibePad Host and all VibePad Host data

Installer options:
  --source <path>             Run from an existing VibePad source tree
  --install-dir <path>        Override the managed installation directory
  --release-base-url <url>    Override the Host release origin
  --version <version>         Install a specific Host release
  --yes                       Consent to Bun and selected managed-tool installs
  -h, --help                  Show this help

Other options are passed to VibePad Host setup. Common choices include
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
    install|uninstall|reset)
      action="$1"
      shift
      ;;
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
    --release-base-url)
      require_value "$1" "${2:-}"
      release_base_url="${2%/}"
      shift 2
      ;;
    --version)
      require_value "$1" "${2:-}"
      host_version="${2#v}"
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
architecture="$(uname -m)"
case "$platform_name" in
  Darwin)
    platform="macos"
    release_target="macos-universal"
    archive_extension="zip"
    if [[ -z "$install_dir" ]]; then
      install_dir="$HOME/Library/Application Support/VibePad"
    fi
    ;;
  Linux)
    platform="linux"
    case "$architecture" in
      x86_64|amd64) release_target="linux-x64" ;;
      aarch64|arm64) release_target="linux-arm64" ;;
      *)
        printf 'VibePad Host does not support Linux architecture %s\n' "$architecture" >&2
        exit 1
        ;;
    esac
    archive_extension="tar.gz"
    if [[ -z "$install_dir" ]]; then
      install_dir="${XDG_DATA_HOME:-$HOME/.local/share}/vibepad"
    fi
    ;;
  *)
    printf 'VibePad Host does not support %s\n' "$platform_name" >&2
    exit 1
    ;;
esac

remove_host() {
  local preserve_data="$1"
  local command_path="$HOME/.local/bin/vibepad-host"
  if [[ "$platform" == "macos" ]]; then
    launchctl bootout "gui/$(id -u)/studio.peacockery.vibepad.host" >/dev/null 2>&1 || true
    rm -f "$HOME/Library/LaunchAgents/studio.peacockery.vibepad.host.plist"
    rm -rf "$install_dir/current" "$install_dir/releases" "$install_dir/browser"
    if [[ "$preserve_data" != "1" ]]; then
      rm -rf "$install_dir" "$HOME/Library/Logs/VibePad"
    fi
  else
    systemctl --user disable --now vibepad-host.service >/dev/null 2>&1 || true
    rm -f "$HOME/.config/systemd/user/vibepad-host.service"
    systemctl --user daemon-reload >/dev/null 2>&1 || true
    rm -rf "$install_dir/current" "$install_dir/releases" "$install_dir/browser"
    rm -f "$install_dir/run-host.sh"
    if [[ "$preserve_data" != "1" ]]; then
      rm -rf "$HOME/.config/vibepad" "${XDG_STATE_HOME:-$HOME/.local/state}/vibepad" "$install_dir"
    fi
  fi
  rm -f "$command_path"
  if [[ "$preserve_data" == "1" ]]; then
    printf 'Removed VibePad Host; pairing data and host configuration are preserved.\n'
  else
    printf 'Reset VibePad Host; VibePad pairing, configuration, logs, and browser data are removed.\n'
  fi
  printf 'Bun, Codex, OpenCode, Tailscale, SSH keys, and project files are preserved.\n'
}

if [[ "$action" == "uninstall" ]]; then
  remove_host "1"
  exit 0
fi
if [[ "$action" == "reset" ]]; then
  remove_host "0"
  exit 0
fi

if ! command -v curl >/dev/null 2>&1; then
  printf 'curl is required to install VibePad Host\n' >&2
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
  bun_installer="$(mktemp "${TMPDIR:-/tmp}/vibepad-bun-install.XXXXXX")"
  trap 'rm -f "$bun_installer"' EXIT
  curl -fsSL https://bun.com/install -o "$bun_installer"
  bash "$bun_installer" "bun-v$bun_version"
  rm -f "$bun_installer"
  trap - EXIT
  bun_bin="$HOME/.bun/bin/bun"
fi

if [[ ! -x "$bun_bin" ]]; then
  printf 'Bun executable is unavailable at %s\n' "$bun_bin" >&2
  exit 1
fi

if [[ -n "$source_dir" ]]; then
  if [[ ! -f "$source_dir/package.json" || ! -f "$source_dir/bun.lock" ]]; then
    printf 'VibePad source is incomplete: %s\n' "$source_dir" >&2
    exit 1
  fi
  "$bun_bin" install --frozen-lockfile --cwd="$source_dir"
  exec "$bun_bin" "$source_dir/apps/host/src/bootstrap-cli.ts" "${bootstrap_args[@]}"
fi

if [[ -z "$host_version" ]]; then
  if ! host_version="$(curl -fsSL "$release_base_url/latest-$platform.txt")"; then
    printf 'A VibePad Host release is currently unavailable for %s\n' "$platform" >&2
    exit 1
  fi
fi
if [[ ! "$host_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([+-][0-9A-Za-z.-]+)?$ ]]; then
  printf 'Invalid VibePad Host version: %s\n' "$host_version" >&2
  exit 2
fi

archive_name="vibepad-host-v${host_version}-${release_target}.${archive_extension}"
archive_url="${release_base_url}/v${host_version}/${archive_name}"
temporary_dir="$(mktemp -d "${TMPDIR:-/tmp}/vibepad-host-install.XXXXXX")"
trap 'rm -rf "$temporary_dir"' EXIT
archive_path="$temporary_dir/$archive_name"
checksum_path="$archive_path.sha256"

printf 'Downloading VibePad Host %s for %s...\n' "$host_version" "$release_target"
curl -fsSL "$archive_url" -o "$archive_path"
curl -fsSL "$archive_url.sha256" -o "$checksum_path"
expected_checksum="$(awk -v name="$archive_name" '$2 == name { print $1 }' "$checksum_path")"
if [[ -z "$expected_checksum" ]]; then
  printf 'Release checksum does not describe %s\n' "$archive_name" >&2
  exit 1
fi
if [[ "$platform" == "macos" ]]; then
  actual_checksum="$(shasum -a 256 "$archive_path" | awk '{ print $1 }')"
else
  actual_checksum="$(sha256sum "$archive_path" | awk '{ print $1 }')"
fi
if [[ "$actual_checksum" != "$expected_checksum" ]]; then
  printf 'VibePad Host release checksum failed for %s\n' "$archive_name" >&2
  exit 1
fi

extracted_dir="$temporary_dir/extracted"
mkdir -p "$extracted_dir"
if [[ "$platform" == "macos" ]]; then
  ditto -x -k "$archive_path" "$extracted_dir"
  payload="$extracted_dir/VibePad Host.app"
else
  tar -xzf "$archive_path" -C "$extracted_dir"
  payload="$extracted_dir/vibepad-host"
fi

release_dir="$install_dir/releases/v$host_version"
mkdir -p "$install_dir/releases"
if [[ ! -e "$release_dir" ]]; then
  mv "$payload" "$release_dir"
fi
previous_release=""
if [[ -L "$install_dir/current" ]]; then
  previous_release="$(readlink "$install_dir/current")"
fi
ln -sfn "$release_dir" "$install_dir/current"

if [[ "$platform" == "macos" ]]; then
  host_bin="$install_dir/current/Contents/MacOS/vibepad-host"
  browser_assets="$install_dir/current/Contents/Resources/browser"
else
  host_bin="$install_dir/current/bin/vibepad-host"
  browser_assets="$install_dir/current/browser"
fi
chmod 755 "$browser_assets" "$browser_assets/chrome-entrypoint.sh"
chmod 644 "$browser_assets/compose.yaml" "$browser_assets/surface-proxy.conf"
browser_environment="$install_dir/browser/runtime/compose.env"
if [[ "$previous_release" != "$release_dir" && -f "$browser_environment" ]] && command -v docker >/dev/null 2>&1; then
  docker compose \
    --project-name vibepad-browser \
    --env-file "$browser_environment" \
    --file "$browser_assets/compose.yaml" \
    down
fi
if [[ ! -x "$host_bin" ]]; then
  printf 'Installed VibePad Host executable is unavailable at %s\n' "$host_bin" >&2
  exit 1
fi

command_dir="$HOME/.local/bin"
mkdir -p "$command_dir"
ln -sfn "$host_bin" "$command_dir/vibepad-host"

export VIBEPAD_BROWSER_ASSETS_DIR="$browser_assets"
export VIBEPAD_BUN_BIN="$bun_bin"
export VIBEPAD_HOST_EXECUTABLE="$host_bin"
"$host_bin" setup "${bootstrap_args[@]}"
