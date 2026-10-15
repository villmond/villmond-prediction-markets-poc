#!/usr/bin/env bash
#
# Configuration + deployment automation for villmond-prediction-markets-poc.
#
# This is the scriptable version of DEPLOYMENT.md / ADMINISTRATION.md, not a
# replacement for reading them. By design it never touches git, never talks
# to a hosting provider, and never deploys a Mina contract unless you pass
# --deploy-contracts explicitly — that step needs a Devnet-funded key, which
# only you can provide (via DEVNET_DEPLOYER_KEY). Secrets are read from
# environment variables only; this script never prompts for them and never
# writes them to disk.
#
# Usage: scripts/deploy.sh [options]   (run from anywhere; cd's to repo root)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ -f "$ROOT_DIR/.env" ]; then
  echo "Loading $ROOT_DIR/.env (already-exported shell variables take precedence)"
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ''|'#'*) continue ;;
    esac
    key="${line%%=*}"
    value="${line#*=}"
    # Don't clobber a variable the caller already exported.
    if [ -z "${!key+x}" ]; then
      export "$key=$value"
    fi
  done < "$ROOT_DIR/.env"
fi

DO_INSTALL=1
DO_VERIFY=1
DO_CONTRACTS=0
IPFS_MODE="skip"     # skip | local | remote
HOST_MODE="none"     # none | preview
CONFIG_PATH="$ROOT_DIR/config.yaml"
GENERATE_CONFIG=0

usage() {
  cat <<'EOF'
Usage: scripts/deploy.sh [options]

  --skip-install          Skip `npm install`
  --skip-verify           Skip the build+lint+test gate
  --deploy-contracts      Deploy a reference MarketSettlement to Mina Devnet
                          (needs DEVNET_DEPLOYER_KEY; generates+faucet-funds
                          a fresh one if unset — see DEPLOYMENT.md §1)
  --ipfs=MODE             local (start a Kubo daemon), remote (just checks
                          reachability of $IPFS_API_URL), or skip (default)
  --host=MODE             none (default: just build) or preview (serve
                          client/dist/ locally on $PREVIEW_PORT to smoke-test)
  --config=PATH           config.yaml to validate (default: repo-root one)
  --generate-config       Scaffold config.yaml from env vars if missing
  -h, --help              Show this help

Environment variables (all optional):
  DEVNET_DEPLOYER_KEY, MARKET_ADMIN_PUBLIC_KEY, MARKET_ORACLE_PUBLIC_KEY
  IPFS_API_URL            default http://127.0.0.1:5001
  PREVIEW_PORT            default 4173
  APP_NAME, TOKEN_NAME, INITIAL_USER_BALANCE, ADMIN_FEE_PERCENTAGE,
  ADMIN_NOSTR_PUBKEY, ENABLE_CASHIER_NETWORK, ESCROW_TIMEOUT_BLOCKS,
  MIN_CASHIER_STAKE, ENABLE_PHYSICAL_P2P, MIN_REPUTATION_THRESHOLD
                          used only with --generate-config
EOF
}

for arg in "$@"; do
  case "$arg" in
    --skip-install) DO_INSTALL=0 ;;
    --skip-verify) DO_VERIFY=0 ;;
    --deploy-contracts) DO_CONTRACTS=1 ;;
    --ipfs=*) IPFS_MODE="${arg#*=}" ;;
    --host=*) HOST_MODE="${arg#*=}" ;;
    --config=*) CONFIG_PATH="${arg#*=}" ;;
    --generate-config) GENERATE_CONFIG=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; usage; exit 1 ;;
  esac
done

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }
die() { printf '\033[1;31mERROR: %s\033[0m\n' "$1" >&2; exit 1; }

# ---------------------------------------------------------------- preflight
log "Preflight checks"
command -v node >/dev/null 2>&1 || die "Node.js not found. Install Node >= 20 (see README.md)."
command -v npm  >/dev/null 2>&1 || die "npm not found."

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  die "Node >= 20 required (found $(node -v))."
fi
echo "Node $(node -v), npm $(npm -v) — OK"

# ------------------------------------------------------------------ install
if [ "$DO_INSTALL" -eq 1 ]; then
  log "Installing dependencies (npm install)"
  npm install
else
  log "Skipping npm install (--skip-install)"
fi

# ------------------------------------------------------------------ config
log "Configuration (config.yaml)"
if [ ! -f "$CONFIG_PATH" ]; then
  if [ "$GENERATE_CONFIG" -eq 1 ]; then
    log "Generating $CONFIG_PATH from environment"
    cat > "$CONFIG_PATH" <<YAML
app:
  name: "${APP_NAME:-Villmond Markets}"
  logo_url: "/assets/logo.svg"
  theme: "dark"

economy:
  token_name: "${TOKEN_NAME:-VILCOIN}"
  initial_user_balance: ${INITIAL_USER_BALANCE:-1000}
  admin_fee_percentage: ${ADMIN_FEE_PERCENTAGE:-2.5}
  admin_public_key: "${ADMIN_NOSTR_PUBKEY:-npub1...}"
  enable_cashier_network: ${ENABLE_CASHIER_NETWORK:-false}

cashier_module:
  escrow_timeout_blocks: ${ESCROW_TIMEOUT_BLOCKS:-150}
  supported_currencies: ["USD", "EUR", "ZEC", "CASH_P2P"]
  min_cashier_stake: ${MIN_CASHIER_STAKE:-5000}
  enable_physical_p2p: ${ENABLE_PHYSICAL_P2P:-true}
  designated_public_keys: []

network:
  default_relays:
    - "wss://relay.damus.io"
    - "wss://nos.lol"

oracles:
  min_reputation_threshold: ${MIN_REPUTATION_THRESHOLD:-3.0}
  require_stake: false
  designated_public_keys: []
YAML
    echo "Wrote $CONFIG_PATH"
  else
    die "$CONFIG_PATH not found. Re-run with --generate-config, or create one manually (see README.md)."
  fi
else
  echo "Found $CONFIG_PATH"
fi

log "Validating config.yaml (same rules as nostr/src/config.ts's loadConfig)"
node --input-type=module -e '
import { load } from "js-yaml";
import { readFileSync } from "node:fs";
const path = process.argv[1];
const parsed = load(readFileSync(path, "utf8"));
if (!parsed) { console.error("config.yaml is empty or invalid YAML"); process.exit(1); }
for (const section of ["app", "economy", "cashier_module", "network", "oracles"]) {
  if (!parsed[section]) { console.error(`Missing required section: "${section}"`); process.exit(1); }
}
if (!Array.isArray(parsed.network.default_relays) || parsed.network.default_relays.length === 0) {
  console.error("network.default_relays must be a non-empty array");
  process.exit(1);
}
console.log("config.yaml OK");
' "$CONFIG_PATH" || die "config.yaml failed validation."

if [ "$CONFIG_PATH" = "$ROOT_DIR/config.yaml" ] && [ ! -e "client/public/config.yaml" ]; then
  log "Linking client/public/config.yaml -> ../../config.yaml"
  ln -s "../../config.yaml" "client/public/config.yaml"
fi

# ------------------------------------------------------------------- verify
if [ "$DO_VERIFY" -eq 1 ]; then
  log "Build + lint + test (verification gate)"
  npm run build
  npm run lint
  npm test
else
  log "Skipping verification gate (--skip-verify)"
fi

# ----------------------------------------------------------------- contracts
if [ "$DO_CONTRACTS" -eq 1 ]; then
  log "Deploying a reference MarketSettlement to Mina Devnet"
  if [ -z "${DEVNET_DEPLOYER_KEY:-}" ]; then
    echo "DEVNET_DEPLOYER_KEY not set — deploy-devnet.ts will generate a fresh key"
    echo "and fund it via the Devnet faucet (one-time, rate-limited). Save the"
    echo "printed private key afterwards if you want to reuse this deployer."
  fi
  (cd contracts && npm run deploy:devnet)
else
  log "Skipping contract deployment (pass --deploy-contracts to enable)"
fi

# ---------------------------------------------------------------------- ipfs
case "$IPFS_MODE" in
  local)
    log "Starting a local IPFS (Kubo) node"
    command -v ipfs >/dev/null 2>&1 || die "ipfs (Kubo) not installed — https://docs.ipfs.tech/install/command-line/"
    ipfs id >/dev/null 2>&1 || ipfs init
    if pgrep -f "ipfs daemon" >/dev/null 2>&1; then
      echo "ipfs daemon already running"
    else
      nohup ipfs daemon > /tmp/ipfs-daemon.log 2>&1 &
      sleep 2
      echo "ipfs daemon started (PID $!) — logs: /tmp/ipfs-daemon.log"
    fi
    ;;
  remote)
    IPFS_API_URL="${IPFS_API_URL:-http://127.0.0.1:5001}"
    log "Checking IPFS endpoint reachability: $IPFS_API_URL"
    curl -sf -X POST "$IPFS_API_URL/api/v0/version" >/dev/null \
      && echo "IPFS endpoint reachable" \
      || die "Could not reach $IPFS_API_URL — set IPFS_API_URL, or see ADMINISTRATION.md §7 for pinning-service setup."
    ;;
  skip)
    log "Skipping IPFS setup (--ipfs=skip, default)"
    ;;
  *)
    die "Unknown --ipfs mode: $IPFS_MODE (expected local|remote|skip)"
    ;;
esac

# --------------------------------------------------------------- client build
log "Client PWA build"
if [ "$DO_VERIFY" -eq 0 ] || [ ! -d "client/dist" ]; then
  npm run build --workspace=@villmond/client
fi
[ -d "client/dist" ] || die "client/dist not found after build."
echo "Built: $ROOT_DIR/client/dist/"

# ---------------------------------------------------------------------- host
case "$HOST_MODE" in
  none)
    log "Skipping hosting step (--host=none, default)"
    echo "Static build is ready at client/dist/ — point your host of choice at it."
    ;;
  preview)
    PREVIEW_PORT="${PREVIEW_PORT:-4173}"
    command -v python3 >/dev/null 2>&1 || die "python3 not found — needed for --host=preview's local static server."
    log "Serving client/dist/ on http://localhost:$PREVIEW_PORT for a smoke test (Ctrl+C to stop)"
    python3 -m http.server "$PREVIEW_PORT" --directory client/dist
    ;;
  *)
    die "Unknown --host mode: $HOST_MODE (expected none|preview)"
    ;;
esac

log "Done"
