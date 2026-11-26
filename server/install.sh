#!/usr/bin/env bash
# Installa (o aggiorna) "Backup iPhone" su Debian 13 come servizio systemd.
# Uso:   sudo ./install.sh [--port 8765] [--backup-dir /percorso/dei/backup]
# Rilanciarlo aggiorna il programma mantenendo impostazioni, associazione e backup.
set -euo pipefail

PORT=""
BACKUP_DIR=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --port) PORT="${2:?manca il numero di porta}"; shift 2 ;;
    --backup-dir) BACKUP_DIR="${2:?manca la cartella}"; shift 2 ;;
    -h|--help) sed -n '2,5p' "$0"; exit 0 ;;
    *) echo "Opzione sconosciuta: $1 (usa --help)" >&2; exit 1 ;;
  esac
done

if [[ $EUID -ne 0 ]]; then
  echo "Serve l'amministratore: sudo ./install.sh" >&2
  exit 1
fi

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR=/opt/iphone-backup
DATA_DIR=/var/lib/iphone-backup
SERVICE_USER=iphonebackup
ENV_FILE=/etc/default/iphone-backup
UNIT_FILE=/etc/systemd/system/iphone-backup.service

echo "==> 1/6 Pacchetti di sistema (python3, usbmuxd, rsync)"
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq python3 python3-venv usbmuxd rsync >/dev/null

echo "==> 2/6 Utente di servizio '$SERVICE_USER'"
if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$DATA_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
fi

echo "==> 3/6 Programma in $APP_DIR"
install -d -m 0755 "$APP_DIR"
if [[ ! -x "$APP_DIR/venv/bin/python" ]]; then
  python3 -m venv "$APP_DIR/venv"
fi
"$APP_DIR/venv/bin/pip" install -q --upgrade pip
"$APP_DIR/venv/bin/pip" install -q -r "$SRC_DIR/requirements.txt"
"$APP_DIR/venv/bin/pip" install -q --no-deps --force-reinstall "$SRC_DIR"

echo "==> 4/6 Configurazione ($ENV_FILE)"
if [[ ! -f "$ENV_FILE" ]]; then
  cat > "$ENV_FILE" <<EOF
# Impostazioni del servizio Backup iPhone.
# Dopo una modifica: sudo systemctl restart iphone-backup
IPHONE_BACKUP_HOST=0.0.0.0
IPHONE_BACKUP_PORT=${PORT:-8765}
IPHONE_BACKUP_DATA=$DATA_DIR
IPHONE_BACKUP_DIR=${BACKUP_DIR:-$DATA_DIR/backups}
EOF
else
  [[ -n "$PORT" ]] && sed -i "s|^IPHONE_BACKUP_PORT=.*|IPHONE_BACKUP_PORT=$PORT|" "$ENV_FILE"
  [[ -n "$BACKUP_DIR" ]] && sed -i "s|^IPHONE_BACKUP_DIR=.*|IPHONE_BACKUP_DIR=$BACKUP_DIR|" "$ENV_FILE"
fi
# shellcheck disable=SC1090
source "$ENV_FILE"

echo "==> 5/6 Cartelle dati e backup"
install -d -o "$SERVICE_USER" -g "$SERVICE_USER" -m 0700 "$IPHONE_BACKUP_DATA"
install -d -o "$SERVICE_USER" -g "$SERVICE_USER" -m 0750 "$IPHONE_BACKUP_DIR"
chown -R "$SERVICE_USER:$SERVICE_USER" "$IPHONE_BACKUP_DATA"

echo "==> 6/6 Servizio systemd"
install -m 0644 "$SRC_DIR/iphone-backup.service" "$UNIT_FILE"
if command -v systemctl >/dev/null 2>&1 && [[ -d /run/systemd/system ]]; then
  systemctl daemon-reload
  systemctl enable --quiet iphone-backup
  systemctl restart iphone-backup
  sleep 3
  if ! systemctl is-active --quiet iphone-backup; then
    echo "Il servizio non è partito. Ultime righe del registro:" >&2
    journalctl -u iphone-backup -n 30 --no-pager >&2 || true
    exit 1
  fi
else
  echo "systemd non è attivo qui: avvia a mano con"
  echo "  sudo -u $SERVICE_USER env \$(cat $ENV_FILE | grep -v '^#' | xargs) $APP_DIR/venv/bin/python -m iphone_backup"
fi

echo
echo "Fatto! Apri in Chrome uno di questi indirizzi:"
for ip in $(hostname -I 2>/dev/null); do
  [[ "$ip" == *:* ]] && continue
  echo "  http://$ip:$IPHONE_BACKUP_PORT"
done
if command -v tailscale >/dev/null 2>&1; then
  TS_IP="$(tailscale ip -4 2>/dev/null | head -n1 || true)"
  [[ -n "$TS_IP" ]] && echo "  http://$TS_IP:$IPHONE_BACKUP_PORT   (da fuori casa, con Tailscale)"
fi
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  echo
  echo "Il firewall ufw è attivo: permetti la porta della pagina web e la ricerca dell'iPhone in rete:"
  echo "  sudo ufw allow $IPHONE_BACKUP_PORT/tcp && sudo ufw allow 5353/udp"
fi
echo
echo "Backup in: $IPHONE_BACKUP_DIR   ·   registro: journalctl -u iphone-backup -f"
