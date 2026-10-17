#!/usr/bin/env bash
# Configure Docker credentials on a Spirit VM so the deploy user can pull images
# from the private Registry. Idempotent; runs on the VM (invoked via `tsh ssh`).
#
# Usage: registry-login.sh <base64-encoded-service-account-key> [dp-cli-version]
set -eo pipefail

KEY_B64="${1:?service-account key (base64) is required}"
DP_CLI_VERSION="${2:-14.1.3}"

echo "[registry-login] user=$(id -un) home=${HOME}"
umask 077
mkdir -p "$HOME/bin"

# Use Spirit's dp explicitly: a system 'dp' (dynamic programming tool) may be on PATH.
if [ ! -x "$HOME/bin/dp" ]; then
  echo "[registry-login] downloading Spirit CLI ${DP_CLI_VERSION}"
  wget -q "https://spirit.t-education.com/cli/tedu/${DP_CLI_VERSION}/linux/dp" -O "$HOME/bin/dp"
  chmod +x "$HOME/bin/dp"
fi

echo "[registry-login] authorizing service account"
echo "$KEY_B64" | base64 -d > "$HOME/sa-key.json"
"$HOME/bin/dp" auth service-acc --key-file "$HOME/sa-key.json"

echo "[registry-login] configuring Docker credentials"
"$HOME/bin/dp" auth configure-kaniko

rm -f "$HOME/sa-key.json"
echo "[registry-login] done"
