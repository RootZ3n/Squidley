#!/usr/bin/env bash
set -euo pipefail

# Filesystem path intentionally unchanged: the physical folder rename
# (/mnt/ai/peh -> /mnt/ai/peh-pub) is a deferred migration step.
REPO_DIR="/mnt/ai/peh"
SERVICE_NAME="peh-public.service"
SOURCE_SERVICE="$REPO_DIR/ops/systemd/$SERVICE_NAME"
USER_SYSTEMD_DIR="$HOME/.config/systemd/user"
TARGET_SERVICE="$USER_SYSTEMD_DIR/$SERVICE_NAME"

if [[ ! -f "$SOURCE_SERVICE" ]]; then
  echo "Could not find $SOURCE_SERVICE"
  exit 1
fi

mkdir -p "$USER_SYSTEMD_DIR"
cp "$SOURCE_SERVICE" "$TARGET_SERVICE"

systemctl --user daemon-reload
systemctl --user enable "$SERVICE_NAME"

cat <<EOF
Installed $SERVICE_NAME for the current user.

The service expects a production build to exist. To build and start:
  cd $REPO_DIR
  npm run build
  systemctl --user start $SERVICE_NAME

Useful commands:
  systemctl --user status $SERVICE_NAME
  journalctl --user -u $SERVICE_NAME -f
  $REPO_DIR/ops/peh-public-rebuild.sh

If you want this user service to keep running after logout:
  loginctl enable-linger "$USER"

Then open:
  http://localhost:3000
EOF
