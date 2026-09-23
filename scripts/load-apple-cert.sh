#!/usr/bin/env bash
# Carga el certificado del Pass Type ID de Apple en .env.local (y opcionalmente
# en Vercel). La contraseña del .p12 se pide acá, en tu terminal: nunca sale de
# tu máquina ni queda en ningún archivo.
#
# Uso:
#   bash scripts/load-apple-cert.sh <archivo.p12> <TEAM_ID> [PASS_TYPE_ID]
#
# Ejemplo:
#   bash scripts/load-apple-cert.sh ~/Downloads/wafi-pass.p12 AB12CD34EF
set -euo pipefail

P12="${1:-}"
TEAM_ID="${2:-}"
PASS_TYPE_ID="${3:-pass.app.wafi.card}"

if [[ -z "$P12" || -z "$TEAM_ID" ]]; then
  echo "Uso: bash scripts/load-apple-cert.sh <archivo.p12> <TEAM_ID> [PASS_TYPE_ID]"
  exit 1
fi
if [[ ! -f "$P12" ]]; then
  echo "✗ No encuentro el archivo: $P12"
  exit 1
fi
if [[ ! "$TEAM_ID" =~ ^[A-Z0-9]{10}$ ]]; then
  echo "✗ El Team ID son 10 caracteres en mayúscula (ej. AB12CD34EF). Recibí: $TEAM_ID"
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

read -r -s -p "Contraseña del .p12 (Enter si no tiene): " P12_PASS
echo
export P12_PASS

# macOS/Keychain exporta .p12 con algoritmos viejos: -legacy los habilita en OpenSSL 3.
openssl pkcs12 -legacy -in "$P12" -clcerts -nokeys -passin env:P12_PASS -out "$WORK/cert.pem" 2>/dev/null \
  || openssl pkcs12 -in "$P12" -clcerts -nokeys -passin env:P12_PASS -out "$WORK/cert.pem" 2>/dev/null \
  || { echo "✗ No pude abrir el .p12. ¿La contraseña es correcta?"; exit 1; }
openssl pkcs12 -legacy -in "$P12" -nocerts -nodes -passin env:P12_PASS -out "$WORK/key.pem" 2>/dev/null \
  || openssl pkcs12 -in "$P12" -nocerts -nodes -passin env:P12_PASS -out "$WORK/key.pem" 2>/dev/null
unset P12_PASS

SUBJECT="$(openssl x509 -in "$WORK/cert.pem" -noout -subject)"
EXPIRES="$(openssl x509 -in "$WORK/cert.pem" -noout -enddate | cut -d= -f2)"
echo "Certificado: $SUBJECT"
echo "Vence:       $EXPIRES"

if [[ "$SUBJECT" != *"$PASS_TYPE_ID"* ]]; then
  echo "✗ Este certificado no es del Pass Type ID '$PASS_TYPE_ID'."
  echo "  Si el identificador es otro, pasalo como tercer parámetro."
  exit 1
fi
if [[ "$SUBJECT" != *"$TEAM_ID"* ]]; then
  echo "⚠️  El Team ID '$TEAM_ID' no aparece en el certificado. Revisalo en developer.apple.com → Membership."
fi

# El certificado y la clave tienen que ser pareja.
CERT_PUB="$(openssl x509 -in "$WORK/cert.pem" -noout -pubkey | openssl sha256)"
KEY_PUB="$(openssl pkey -in "$WORK/key.pem" -pubout | openssl sha256)"
if [[ "$CERT_PUB" != "$KEY_PUB" ]]; then
  echo "✗ La clave privada no corresponde a este certificado."
  exit 1
fi
echo "✓ Certificado y clave coinciden"

CERT_B64="$(base64 -i "$WORK/cert.pem" | tr -d '\n')"
KEY_B64="$(base64 -i "$WORK/key.pem" | tr -d '\n')"

# Reemplaza o agrega cada variable en .env.local sin tocar el resto.
touch .env.local
upsert() {
  local key="$1" value="$2"
  grep -v "^${key}=" .env.local > "$WORK/env" || true
  echo "${key}=${value}" >> "$WORK/env"
  cat "$WORK/env" > .env.local
}
upsert APPLE_TEAM_ID "$TEAM_ID"
upsert APPLE_PASS_TYPE_ID "$PASS_TYPE_ID"
upsert APPLE_PASS_CERT_B64 "$CERT_B64"
upsert APPLE_PASS_KEY_B64 "$KEY_B64"
grep -v "^APPLE_PASS_KEY_PASSPHRASE=" .env.local > "$WORK/env" || true   # la clave va sin contraseña
cat "$WORK/env" > .env.local
echo "✓ .env.local actualizado"

read -r -p "¿Cargarlo también en Vercel (production + preview)? [s/N] " ANSWER
if [[ "$ANSWER" =~ ^[sS]$ ]]; then
  for target in production preview; do
    printf '%s' "$TEAM_ID"      | vercel env add APPLE_TEAM_ID       "$target" --force --yes >/dev/null
    printf '%s' "$PASS_TYPE_ID" | vercel env add APPLE_PASS_TYPE_ID  "$target" --force --yes >/dev/null
    printf '%s' "$CERT_B64"     | vercel env add APPLE_PASS_CERT_B64 "$target" --force --yes >/dev/null
    printf '%s' "$KEY_B64"      | vercel env add APPLE_PASS_KEY_B64  "$target" --force --yes --sensitive >/dev/null
    echo "✓ Vercel ($target)"
  done
  echo "Falta redeployar para que producción lo tome."
fi

echo
echo "Listo. Para verificar la firma con el certificado real:"
echo "  npx tsx --conditions react-server scripts/apple-pkpass-check.mts ~/Desktop/wafi-prueba.pkpass"
echo "y abrí ese archivo desde el iPhone (AirDrop o Mail)."
