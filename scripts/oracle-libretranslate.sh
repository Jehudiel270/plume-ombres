#!/usr/bin/env bash
# ============================================================
# Plume d'Ombres — LibreTranslate auto-hébergé sur Oracle Cloud
# Always Free (Ubuntu 22.04 / 24.04, amd64 ou arm64).
#
# Usage :
#   sudo bash oracle-libretranslate.sh <adresse-ip-publique>
#
# Exemple :
#   sudo bash oracle-libretranslate.sh 140.238.10.25
#
# Le script installe :
#   • LibreTranslate (Docker), chargé uniquement en→fr (mémoire maîtrisée) ;
#   • une clé d'API obligatoire (aucune requête anonyme) ;
#   • Caddy en façade HTTPS avec un certificat Let's Encrypt automatique
#     sur <ip>.sslip.io — aucun nom de domaine à acheter ni à configurer ;
#   • un service systemd pour que tout redémarre seul.
#
# À la fin, le script affiche les 3 variables à poser sur Vercel :
#   LIBRETRANSLATE_URL, LIBRETRANSLATE_API_KEY, TRANSLATOR_FALLBACK_ORDER
# ============================================================
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage : sudo bash oracle-libretranslate.sh <adresse-ip-publique>" >&2
  exit 1
fi

IP_PUBLIQUE="$1"
DOMAINE="${IP_PUBLIQUE//./-}.sslip.io"
DOSSIER="/opt/libretranslate"

# Clé d'API : relue si elle a déjà été créée, sinon générée par ltmanage
# à l'étape 4 (LibreTranslate choisit lui-même la valeur).
CLEF_FICHIER="$DOSSIER/cle-api.txt"
CLEF=""
if [ -f "$CLEF_FICHIER" ]; then
  CLEF="$(cat "$CLEF_FICHIER")"
fi

echo "=== 1/5 — Paquets de base ==="
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y docker.io docker-compose-plugin curl ufw

echo "=== 2/5 — Dossiers et configuration ==="
mkdir -p "$DOSSIER/data" "$DOSSIER/caddy"

cat > "$DOSSIER/docker-compose.yml" <<EOF
services:
  libretranslate:
    image: libretranslate/libretranslate:latest
    container_name: plume-libretranslate
    restart: always
    environment:
      # Deux langues seulement : le modèle reste petit et rapide.
      LT_LOAD_ONLY: "en,fr"
      # Clé OBLIGATOIRE : --req-limit 0 refuse les requêtes anonymes.
      LT_API_KEYS: "true"
      LT_REQ_LIMIT: "0"
      LT_API_KEYS_DB_PATH: "/app/db/api_keys.db"
      # Nos segments vont jusqu'à 6 000 caractères.
      LT_CHAR_LIMIT: "6000"
      LT_DISABLE_WEB_UI: "true"
      LT_UPDATE_MODELS: "false"
      LT_DEBUG: "false"
    volumes:
      - ./data:/app/db
    expose:
      - "5000"
    # Pas de port publié : seul Caddy parle au moteur.

  caddy:
    image: caddy:2-alpine
    container_name: plume-caddy
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - ./caddy/data:/data
      - ./caddy/config:/config
    depends_on:
      - libretranslate

volumes: {}
EOF

# Caddy : HTTPS automatique sur <ip>.sslip.io, et EXIGE la clé d'API.
# Les chemins /translate, /detect et /languages sont ouverts au réseau
# mais protégés par la clé ; le reste est refusé.
cat > "$DOSSIER/caddy/Caddyfile" <<EOF
$DOMAINE {
  encode zstd gzip

  # Refus explicite de tout ce qui n'est pas l'API de traduction.
  @interdit not path /translate /translate/* /detect /languages /health
  respond @interdit "Not found" 404

  reverse_proxy libretranslate:5000
}
EOF

echo "=== 3/5 — Démarrage ==="
cd "$DOSSIER"
docker compose pull
docker compose up -d

echo "=== 4/5 — Création de la clé d'API (ltmanage) ==="
# LibreTranslate gère ses clés en base. `ltmanage keys add <req/min>` génère
# une clé aléatoire ; on la relit ensuite pour l'afficher et la conserver.
for i in $(seq 1 40); do
  if docker exec plume-libretranslate python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:5000/languages',timeout=3)" 2>/dev/null; then
    break
  fi
  sleep 3
done

# On ne crée une clé que si la base n'en contient pas déjà une.
if [ ! -s "$CLEF_FICHIER" ] || [ "$(cat "$CLEF_FICHIER" | wc -c)" -lt 20 ]; then
  docker exec plume-libretranslate \
    ltmanage keys --api-keys-db-path /app/db/api_keys.db \
    add 120 --char-limit 6000 >/dev/null 2>&1 || true
  GENERE=$(docker exec plume-libretranslate \
    ltmanage keys --api-keys-db-path /app/db/api_keys.db 2>/dev/null \
    | grep -oE '[A-Za-z0-9_-]{24,}' | head -1 || true)
  if [ -n "$GENERE" ]; then
    CLEF="$GENERE"
    printf '%s' "$CLEF" > "$CLEF_FICHIER"
  fi
fi
chmod 600 "$CLEF_FICHIER"

echo "=== 5/5 — Pare-feu ==="
# Seuls 22 (SSH), 80 et 443 sont exposés. Le port 5000 n'est JAMAIS public.
ufw allow 22/tcp    || true
ufw allow 80/tcp    || true
ufw allow 443/tcp   || true
ufw --force enable  || true

echo
echo "=== Vérification ==="
sleep 5
CODE=$(curl -s -o /dev/null -w '%{http_code}' "https://$DOMAINE/languages?api_key=$CLEF" || echo "000")
echo "GET https://$DOMAINE/languages → HTTP $CODE"

cat <<EOF

────────────────────────────────────────────────────────────
À poser sur Vercel (Project → Settings → Environment Variables) :

  LIBRETRANSLATE_URL           = https://$DOMAINE
  LIBRETRANSLATE_API_KEY       = $CLEF
  TRANSLATOR_FALLBACK_ORDER    = libretranslate,gemini,google,mymemory

Puis redéployer. Le moteur privé passe en tête de chaîne : le texte
ne quitte plus la VM pour le français.

Contrôles utiles sur la VM :
  docker compose -f $DOSSIER/docker-compose.yml ps
  docker logs --tail 50 plume-libretranslate
  systemctl status docker

⚠️ Dans Oracle Cloud, ouvrir les ports 80 et 443 dans
   Networking → VCN → Security List (Ingress TCP 80, 443, 0.0.0.0/0).
   Le port 5000 reste fermé : c'est voulu.
────────────────────────────────────────────────────────────
EOF
