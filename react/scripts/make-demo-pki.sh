#!/usr/bin/env bash
# Throwaway DEMO PKI for SignFlow — fictional identities only, keys are NOT secret (bundled client-side).
# Usage: bash scripts/make-demo-pki.sh  → writes to scripts/out/, then copy the signflow-demo-* files
# into public/certs/. Re-signing the gallery sample (public/documents/signed/) is needed afterwards.
set -euo pipefail
cd "$(dirname "$0")"
export MSYS_NO_PATHCONV=1
rm -rf out && mkdir -p out/db && cd out
touch db/index.txt && echo 1000 > db/serial && echo 1000 > db/crlnumber

cat > ca.cnf <<'CNF'
[ ca ]
default_ca = demo_ca
[ demo_ca ]
database = db/index.txt
serial = db/serial
crlnumber = db/crlnumber
certificate = ca.crt
private_key = ca.key
default_md = sha256
default_crl_days = 3650
policy = any
new_certs_dir = .
[ any ]
commonName = supplied
[ v3_ca ]
basicConstraints = critical, CA:true
keyUsage = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash
[ v3_leaf ]
basicConstraints = critical, CA:false
keyUsage = critical, digitalSignature, nonRepudiation
extendedKeyUsage = emailProtection
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid
[ v3_tsa ]
basicConstraints = critical, CA:false
keyUsage = critical, digitalSignature
extendedKeyUsage = critical, timeStamping
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid
CNF

# Root CA (self-signed, 10y)
openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes -keyout ca.key -out ca.crt \
  -subj "/CN=SignFlow Demo CA/O=SignFlow Demo/OU=Demo trust anchor - not publicly trusted/C=US" \
  -config ca.cnf -extensions v3_ca

# Leaf signing cert: persona Alex Norman (fictional)
openssl req -newkey rsa:2048 -nodes -keyout leaf.key -out leaf.csr \
  -subj "/CN=Alex Norman/emailAddress=alex@northstar.example/O=Northstar Technologies Ltd. (demo)/C=US"
openssl x509 -req -in leaf.csr -CA ca.crt -CAkey ca.key -set_serial 0x5f1a01 -days 3650 -sha256 \
  -extfile ca.cnf -extensions v3_leaf -out leaf.crt

# Demo TSA cert (timeStamping EKU)
openssl req -newkey rsa:2048 -nodes -keyout tsa.key -out tsa.csr \
  -subj "/CN=SignFlow Demo TSA/O=SignFlow Demo/C=US"
openssl x509 -req -in tsa.csr -CA ca.crt -CAkey ca.key -set_serial 0x5f1a02 -days 3650 -sha256 \
  -extfile ca.cnf -extensions v3_tsa -out tsa.crt

# Empty CRL signed by the CA (nothing revoked), valid 10y
openssl ca -config ca.cnf -gencrl -crldays 3650 -out ca.crl.pem -batch

# Outputs for the app
openssl pkcs12 -export -legacy -inkey leaf.key -in leaf.crt -certfile ca.crt -name "Alex Norman (SignFlow demo)" \
  -out signflow-demo-signer.pfx -passout pass:signflow-demo
openssl x509 -in ca.crt -outform DER -out signflow-demo-ca.cer
openssl x509 -in tsa.crt -outform DER -out signflow-demo-tsa.cer
openssl pkcs8 -topk8 -nocrypt -in tsa.key -outform DER -out signflow-demo-tsa.key
openssl crl -in ca.crl.pem -outform DER -out signflow-demo-ca.crl

openssl verify -CAfile ca.crt leaf.crt tsa.crt
openssl crl -in ca.crl.pem -noout -text | grep -E "Last Update|Next Update|No Revoked" || true
ls -la signflow-demo-*
