# Ledgerly Production Deployment Guide

This guide documents deploying Ledgerly to container hosting platforms with persistent storage (such as **Fly.io** or **Railway**).

> [!IMPORTANT]
> **Why Serverless (Vercel / AWS Lambda / Cloudflare Pages) Will Not Work:**
> 1. **Persistent SQLite & WAL Files**: Ledgerly uses Node's built-in `node:sqlite` database with Write-Ahead Logging (`PRAGMA journal_mode = WAL`). WAL mode requires continuous access to shared POSIX shared memory files (`ledgerly.sqlite`, `ledgerly.sqlite-wal`, and `ledgerly.sqlite-shm`). Ephemeral serverless lambdas discard disk state between cold starts, corrupting audit chains and wiping encrypted payment requests.
> 2. **Autonomous Background Workers**: Ledgerly runs continuous standing worker intervals (indexer ~3s, settlement ~5s, expiry ~60s, reconciliation ~60s) to monitor on-chain smart contract events, process settlements, and expire stale FX quotes. Serverless runtimes freeze background CPU execution immediately after an HTTP response is delivered.
> 3. **Single-Writer Concurrency**: SQLite requires a single writer process. Multiple serverless lambdas running simultaneously against network shares cause database locking errors (`SQLITE_BUSY`). A single persistent container process guarantees serialized, deterministic transactions.

---

## 1. Hosting Architecture & Architecture Constraints

* **Platform**: Fly.io, Railway, or VPS with Docker.
* **Instance Count**: Exactly **1 single instance** (`min_machines_running = 1`, `max_machines_running = 1`).
* **Auto-Stop**: **Disabled** (`auto_stop_machines = false`). Workers must run continuously to process deposits.
* **Volume**: Persistent NVMe/SSD volume (minimum 1GB) mounted at `/data`.
* **Runtime**: Node.js >= 22.13.0 (Docker image uses Node 24).

---

## 2. Environment Variables Reference

Use **environment variable NAMES only** in your deployment configuration. Never commit secret values to version control.

| Variable Name | Required | Default / Mode | Description |
|:---|:---:|:---|:---|
| `NODE_ENV` | Yes | `production` | Production runtime environment |
| `PORT` | Optional | `3000` | Port listened on by Next.js server |
| `LEDGERLY_DB_PATH` | Optional | `/data/ledgerly.sqlite` | Absolute path to SQLite database on persistent volume |
| `LEDGERLY_NETWORK_MODE` | Optional | `sandbox` | Hosted default is `sandbox`. Set to `testnet` only if running live against NEAR testnet. |
| `DEMO_MODE` | Optional | `false` | When `true`, enables simulation actions (`SIMULATE_BUYER_DEPOSIT`, faucet) on public demo hosts. |
| `DEMO_ADMIN_TOKEN` | Optional | `[unset]` | If set, required in `x-demo-admin-token` header to invoke state reset. |
| `NEAR_RPC_URL` | Optional | `https://rpc.testnet.near.org` | NEAR JSON-RPC endpoint with multi-provider failover |
| `NEAR_ESCROW_CONTRACT_ID` | Optional | `ledgerly-escrow-9e70f9ea.testnet` | Deployed Ledgerly smart contract account |
| `NEAR_USDC_CONTRACT_ID` | Optional | `ledgerly-usdc-a627a4c0.testnet` | Deployed NEP-141 USDC contract account |
| `NEAR_OPERATOR_ACCOUNT_ID` | Optional (testnet) | `[host secret]` | Relayer / operator testnet account ID (required for live mode) |
| `NEAR_OPERATOR_PRIVATE_KEY` | Optional (testnet) | `[host secret]` | Ed25519 secret key (held strictly as a host secret; never logged) |

---

## 3. Fly.io Deployment

### Step 1: Create Fly.io Application & Volume

```bash
# Create the Fly application
fly apps create ledgerly-demo

# Create a 1GB persistent volume in your chosen region (e.g. sin)
fly volumes create ledgerly_data --size 1 --region sin
```

### Step 2: Configure `fly.toml`

```toml
app = "ledgerly-demo"
primary_region = "sin"

[build]
  dockerfile = "Dockerfile"

[env]
  NODE_ENV = "production"
  PORT = "3000"
  LEDGERLY_DB_PATH = "/data/ledgerly.sqlite"
  LEDGERLY_NETWORK_MODE = "sandbox"
  DEMO_MODE = "true"

[mounts]
  source = "ledgerly_data"
  destination = "/data"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true
  min_machines_running = 1

[[http_service.checks]]
  grace_period = "15s"
  interval = "30s"
  method = "GET"
  path = "/api/health"
  timeout = "5s"
```

### Step 3: Set Secrets (If Enabling Live Testnet Mode)

```bash
# Store operator credentials as platform secrets (never in fly.toml)
fly secrets set \
  NEAR_OPERATOR_ACCOUNT_ID="your-operator.testnet" \
  NEAR_OPERATOR_PRIVATE_KEY="ed25519:..." \
  DEMO_ADMIN_TOKEN="your-secure-random-token"
```

### Step 4: Deploy

```bash
fly deploy
```

---

## 4. Railway Deployment

1. **New Project**: Select "Deploy from GitHub repo".
2. **Add Volume**: In the service settings, add a Persistent Volume mounted at `/data`.
3. **Environment Variables**:
   - `NODE_ENV`: `production`
   - `LEDGERLY_DB_PATH`: `/data/ledgerly.sqlite`
   - `LEDGERLY_NETWORK_MODE`: `sandbox` (or `testnet` with secrets)
   - `DEMO_MODE`: `true` (enables simulation buttons for hackathon judges)
   - `DEMO_ADMIN_TOKEN`: `[secure secret]`
4. **Health Check Path**: Set `/api/health`.
5. **Replicas**: Set maximum replicas to **1** (single-writer SQLite constraint).

---

## 5. Verification & Health Monitoring

Verify the deployment using the keyless health endpoint:

```bash
curl -s https://your-hosted-domain/api/health | jq
```

Expected healthy response:

```json
{
  "status": "ok",
  "runtimeMode": "LOCAL_SANDBOX_SIMULATION",
  "db": "ok",
  "rpc": "sandbox",
  "lastIndexedBlock": "185420000",
  "workers": {
    "running": true,
    "heartbeatAgesMs": {
      "indexer": 1250,
      "settlement": 2340,
      "expiry": 14200,
      "reconciliation": 14200
    }
  }
}
```
