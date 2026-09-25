#!/usr/bin/env bash
# One-time setup of the production VM (Debian 12 on GCP Compute Engine), run as root:
#
#   sudo bash vm-setup.sh "<the deploy user's SSH public key>"
#
# Installs Docker Engine + the Compose plugin from Docker's apt repository, adds 2 GiB of swap
# (the e2-micro has 1 GiB of RAM), keeps container logs bounded, turns on unattended security
# upgrades and creates the `deploy` user that GitHub Actions logs in as (key only, in the docker
# group) with the stack directory /opt/anthonyzng-web. Safe to run again.
set -euo pipefail

DEPLOY_USER=deploy
STACK_DIR=/opt/anthonyzng-web
PUBLIC_KEY="${1:?usage: vm-setup.sh \"<ssh public key>\"}"

# --- swap -----------------------------------------------------------------------------------
if ! swapon --show=NAME --noheadings | grep -q '^/swapfile$'; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
echo 'vm.swappiness=10' > /etc/sysctl.d/90-swappiness.conf
sysctl -q --system

# --- Docker Engine + Compose plugin (https://docs.docker.com/engine/install/debian/) ---------
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q ca-certificates curl unattended-upgrades
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
# shellcheck source=/dev/null
. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian ${VERSION_CODENAME} stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -q
apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Bounded, compressed container logs (the default json-file driver grows without limit).
install -m 0755 -d /etc/docker
cat > /etc/docker/daemon.json <<'JSON'
{
  "log-driver": "local",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
JSON
systemctl enable docker
systemctl restart docker

# --- unattended security upgrades ------------------------------------------------------------
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
CONF

# --- the deploy user --------------------------------------------------------------------------
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "$DEPLOY_USER"
fi
passwd -l "$DEPLOY_USER" >/dev/null   # no password: SSH key only
usermod -aG docker "$DEPLOY_USER"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
# `restrict`: commands and scp only (no port, agent or X11 forwarding, no pseudo-terminal).
printf 'restrict %s\n' "$PUBLIC_KEY" > "/home/$DEPLOY_USER/.ssh/authorized_keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"
chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"

# --- the stack directory (docker-compose.yml, proxy/Caddyfile come from CI; the .env files are
# written once by hand and stay readable by the deploy user only) ------------------------------
install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$STACK_DIR" "$STACK_DIR/backend" "$STACK_DIR/proxy"

docker --version
docker compose version
echo "VM ready: $DEPLOY_USER can deploy to $STACK_DIR"
