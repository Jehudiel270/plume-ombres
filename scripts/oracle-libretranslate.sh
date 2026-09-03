#!/usr/bin/env bash
# ============================================================
# Plume d'Ombres — Installation LibreTranslate sur VM
# Oracle Cloud Always Free (Ubuntu 22.04/24.04) en tant que root.
#
# Usage : sudo bash oracle-libretranslate.sh
# Après exécution : http://<IP-PUBLIQUE>:5000 répond « LibreTranslate ».
# Pensez à ouvrir le port 5000 dans OCI : Networking → Security
# List → ajouter une règle Ingress TCP 5000 (0.0.0.0/0).
# ============================================================
set -euo pipefail

echo "=== 1/4 Mise à jour du système ==="
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y python3 python3-venv python3-pip curl

echo "=== 2/4 Environnement Python ==="
mkdir -p /opt/libretranslate
python3 -m venv /opt/libretranslate/venv
/opt/libretranslate/venv/bin/pip install --quiet --upgrade pip
/opt/libretranslate/venv/bin/pip install --quiet libretranslate

echo "=== 3/4 Service systemd (démarrage auto + redémarrage) ==="
cat > /etc/systemd/system/libretranslate.service <<'EOF'
[Unit]
Description=LibreTranslate (Plume d'Ombres)
After=network.target

[Service]
ExecStart=/opt/libretranslate/venv/bin/libretranslate --host 0.0.0.0 --port 5000 --load-only en,fr
Restart=always
RestartSec=5
User=nobody
Group=nogroup
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable libretranslate
systemctl restart libretranslate

echo "=== 4/4 Vérification ==="
sleep 4
systemctl --no-pager --lines=5 status libretranslate || true
echo ""
echo "Réponse du serveur :"
curl -s http://127.0.0.1:5000/ | head -c 80
echo ""
echo "Terminé. Depuis l'extérieur : http://$(curl -s ifconfig.me):5000 (après ouverture du port 5000 dans OCI)"
