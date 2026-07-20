#!/bin/sh

set -eu

profile_directory=/home/kasm-user/.config/google-chrome-vibepad
mkdir -p "$profile_directory"

exec 9>"$profile_directory/.vibepad-profile.lock"
if ! flock -n 9; then
  printf '%s\n' 'The VibePad browser profile is already owned by another process.' >&2
  exit 1
fi

rm -f \
  "$profile_directory/SingletonCookie" \
  "$profile_directory/SingletonLock" \
  "$profile_directory/SingletonSocket"

exec \
  /dockerstartup/kasm_default_profile.sh \
  /dockerstartup/vnc_startup.sh \
  /dockerstartup/kasm_startup.sh \
  "$@"
