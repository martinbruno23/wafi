#!/usr/bin/env bash
# Certificado del Pass Type ID de Apple Wallet, en dos pasos.
#
#   1) bash scripts/apple-cert.sh csr
#      Genera la clave privada (queda en ~/.wafi/apple, NUNCA en el repo) y el
#      pedido de certificado (.certSigningRequest). El pedido es público: se le
#      manda a quien administre la cuenta de Apple Developer.
#
#   2) bash scripts/apple-cert.sh load <archivo.cer | archivo.p12> <TEAM_ID> [PASS_TYPE_ID]
#      Con el .cer que devuelve Apple (o un .p12 exportado de Llaveros),
#      verifica que todo cierre y lo carga en .env.local y, si querés, en Vercel.
set -euo pipefail

KEY_DIR="$HOME/.wafi/apple"
KEY_FILE="$KEY_DIR/pass-type-id.key"
CSR_FILE="$KEY_DIR/wafi-pass.certSigningRequest"

cmd_csr() {
  mkdir -p "$KEY_DIR"
  chmod 700 "$KEY_DIR"
  if [[ -f "$KEY_FILE" ]]; then
    echo "Ya existe una clave en $KEY_FILE — la reutilizo (no la piso)."
  else
    openssl genrsa -out "$KEY_FILE" 2048 2>/dev/null
    chmod 600 "$KEY_FILE"
    echo "✓ Clave privada creada: $KEY_FILE"
  fi
  openssl req -new -key "$KEY_FILE" -out "$CSR_FILE" -subj "/CN=WAFI Pass Type ID/C=AR"
  echo "✓ Pedido de certificado: $CSR_FILE"
  echo
  echo "Mandale ese archivo a quien administre la cuenta de Apple Developer."
  echo "⚠️  Hacé una copia de $KEY_FILE en un lugar seguro (gestor de contraseñas):"
  echo "   sin esa clave, el certificado que devuelva Apple no sirve."
}

cmd_load() {
  local SRC="${1:-}" TEAM_ID="${2:-}" PASS_TYPE_ID="${3:-pass.app.wafi.card}"
  if [[ -z "$SRC" || -z "$TEAM_ID" ]]; then
    echo "Uso: bash scripts/apple-cert.sh load <archivo.cer|archivo.p12> <TEAM_ID> [PASS_TYPE_ID]"
    exit 1
  fi
  [[ -f "$SRC" ]] || { echo "✗ No encuentro el archivo: $SRC"; exit 1; }
  [[ "$TEAM_ID" =~ ^[A-Z0-9]{10}$ ]] || {
    echo "✗ El Team ID son 10 caracteres en mayúscula (ej. AB12CD34EF). Recibí: $TEAM_ID"; exit 1; }

  # Global (no `local`): el trap corre al salir del script, fuera de esta
  # función, y tiene que poder borrar la copia temporal de la clave.
  WORK="$(mktemp -d)"
  trap 'rm -rf "$WORK"' EXIT

  case "$SRC" in
    *.p12|*.pfx)
      read -r -s -p "Contraseña del .p12 (Enter si no tiene): " P12_PASS; echo
      export P12_PASS
      # Llaveros exporta con algoritmos viejos: -legacy los habilita en OpenSSL 3.
      openssl pkcs12 -legacy -in "$SRC" -clcerts -nokeys -passin env:P12_PASS -out "$WORK/cert.pem" 2>/dev/null \
        || openssl pkcs12 -in "$SRC" -clcerts -nokeys -passin env:P12_PASS -out "$WORK/cert.pem" 2>/dev/null \
        || { echo "✗ No pude abrir el .p12. ¿La contraseña es correcta?"; exit 1; }
      openssl pkcs12 -legacy -in "$SRC" -nocerts -nodes -passin env:P12_PASS -out "$WORK/key.pem" 2>/dev/null \
        || openssl pkcs12 -in "$SRC" -nocerts -nodes -passin env:P12_PASS -out "$WORK/key.pem" 2>/dev/null
      unset P12_PASS
      ;;
    *)
      # .cer de Apple (DER) o PEM, emparejado con la clave del paso `csr`.
      [[ -f "$KEY_FILE" ]] || { echo "✗ No encuentro la clave $KEY_FILE (¿corriste el paso csr en esta Mac?)"; exit 1; }
      openssl x509 -inform DER -in "$SRC" -out "$WORK/cert.pem" 2>/dev/null \
        || openssl x509 -in "$SRC" -out "$WORK/cert.pem" 2>/dev/null \
        || { echo "✗ $SRC no parece un certificado."; exit 1; }
      cp "$KEY_FILE" "$WORK/key.pem"
      ;;
  esac

  local SUBJECT EXPIRES
  SUBJECT="$(openssl x509 -in "$WORK/cert.pem" -noout -subject)"
  EXPIRES="$(openssl x509 -in "$WORK/cert.pem" -noout -enddate | cut -d= -f2)"
  echo "Certificado: $SUBJECT"
  echo "Vence:       $EXPIRES"

  if [[ "$SUBJECT" != *"$PASS_TYPE_ID"* ]]; then
    echo "✗ Este certificado no es del Pass Type ID '$PASS_TYPE_ID'. Si el identificador es otro, pasalo como tercer parámetro."
    exit 1
  fi
  [[ "$SUBJECT" == *"$TEAM_ID"* ]] || echo "⚠️  El Team ID '$TEAM_ID' no aparece en el certificado. Revisalo en Membership details."

  local CERT_PUB KEY_PUB
  CERT_PUB="$(openssl x509 -in "$WORK/cert.pem" -noout -pubkey | openssl sha256)"
  KEY_PUB="$(openssl pkey -in "$WORK/key.pem" -pubout | openssl sha256)"
  [[ "$CERT_PUB" == "$KEY_PUB" ]] || { echo "✗ La clave privada no corresponde a este certificado."; exit 1; }
  echo "✓ Certificado y clave coinciden"

  local CERT_B64 KEY_B64
  CERT_B64="$(base64 -i "$WORK/cert.pem" | tr -d '\n')"
  KEY_B64="$(base64 -i "$WORK/key.pem" | tr -d '\n')"

  touch .env.local
  upsert() {
    grep -v "^$1=" .env.local > "$WORK/env" || true
    echo "$1=$2" >> "$WORK/env"
    cat "$WORK/env" > .env.local
  }
  upsert APPLE_TEAM_ID "$TEAM_ID"
  upsert APPLE_PASS_TYPE_ID "$PASS_TYPE_ID"
  upsert APPLE_PASS_CERT_B64 "$CERT_B64"
  upsert APPLE_PASS_KEY_B64 "$KEY_B64"
  grep -v "^APPLE_PASS_KEY_PASSPHRASE=" .env.local > "$WORK/env" || true  # la clave va sin contraseña
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
  echo "Para probar la firma real: npm run check:pkpass -- ~/Desktop/wafi-prueba.pkpass"
  echo "y abrí ese archivo desde el iPhone (AirDrop o Mail)."
}

case "${1:-}" in
  csr)  cmd_csr ;;
  load) shift; cmd_load "$@" ;;
  *)
    echo "Uso:"
    echo "  bash scripts/apple-cert.sh csr"
    echo "  bash scripts/apple-cert.sh load <archivo.cer|archivo.p12> <TEAM_ID> [PASS_TYPE_ID]"
    exit 1
    ;;
esac
