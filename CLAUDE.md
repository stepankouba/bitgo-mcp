# BitGo MCP Server

An MCP (Model Context Protocol) server that exposes BitGo custody wallet operations to Claude chat, enabling real-time monitoring of BTC wallet balances, transaction status, pending approvals, and transfer history.

## Project Context

**Product:** Littlebit — a retail savings platform that connects to customers' bank accounts via PSD2, calculates BTC savings based on spending behavior, and executes purchases via payment card. Client assets are fully segregated.

**Custody flow:** BTC is purchased in buckets from an exchange and transferred to LW0, then distributed through the internal wallet hierarchy.

## Tech Stack

- **Runtime:** Node.js
- **SDK:** `@bitgo/sdk-core` (BitGo Node.js SDK v2)
- **Protocol:** MCP (Model Context Protocol) — `@modelcontextprotocol/sdk`
- **Language:** TypeScript
- **Environment:** BitGo Production (`https://app.bitgo.com`)
- **Coin:** BTC only

## Authentication

- Long-lived **access token** passed via environment variable `BITGO_ACCESS_TOKEN`
- No username/password or OTP flows needed

## Wallet Structure

All wallets are BTC. Wallet IDs are stored in environment variables mapped to these logical names:

| Logical Name | Env Var              | Purpose                                                        |
|--------------|----------------------|----------------------------------------------------------------|
| `LW0`        | `WALLET_LW0`         | Primary receiving wallet — all BTC from exchange lands here    |
| `LW1`        | `WALLET_LW1`         | Investment wallet — base for all investment transfers to clients|
| `LIW1`       | `WALLET_LIW1`        | Internal wallet for fees and operational expenses              |
| `LCW1`       | `WALLET_LCW1`        | Main hot wallet for clients' segregated assets                 |
| `LCEW1`      | `WALLET_LCEW1`       | Withdrawal wallet — separates client withdrawals from LCW1     |
| `LCW2`       | `WALLET_LCW2`        | Warm wallet representation (currently unused)                  |
| `LCW3_1`     | `WALLET_LCW3_1`      | Cold wallet representation (currently unused)                  |

## Environment Variables

```
BITGO_ACCESS_TOKEN=   # BitGo long-lived access token
BITGO_ENV=prod        # always "prod" for this project
WALLET_LW0=           # BitGo wallet ID for LW0
WALLET_LW1=           # BitGo wallet ID for LW1
WALLET_LIW1=          # BitGo wallet ID for LIW1
WALLET_LCW1=          # BitGo wallet ID for LCW1
WALLET_LCEW1=         # BitGo wallet ID for LCEW1
WALLET_LCW2=          # BitGo wallet ID for LCW2 (optional)
WALLET_LCW3_1=        # BitGo wallet ID for LCW3_1 (optional)
```

## MCP Tools to Implement

### 1. `get_wallet_balances`
Returns BTC confirmed and spendable balances for all configured wallets (or a specific one).

**Input:** optional `wallet` (logical name, e.g. `"LW0"`) — omit to get all wallets.

**Output:** logical name, wallet ID, confirmed balance (BTC), spendable balance (BTC).

### 2. `get_pending_approvals`
Lists all pending approval requests across all wallets — transactions awaiting multi-sig or policy sign-off.

**Input:** optional `wallet` filter.

**Output:** approval ID, wallet, creator, type, amount (BTC), created timestamp, current approval state.

### 3. `get_transfer_status`
Looks up the status of a specific transfer by transfer ID or transaction hash.

**Input:** `transferId` or `txHash`, optional `wallet` to narrow the search.

**Output:** transfer ID, wallet, direction (send/receive), amount (BTC), fee (BTC), state (confirmed/unconfirmed/failed), confirmations, block height, timestamp.

### 4. `list_transfers`
Returns recent transfer history for one or all wallets with optional filtering.

**Input:** optional `wallet`, optional `state` (confirmed/unconfirmed/failed), optional `limit` (default 25, max 100), optional `direction` (send/receive).

**Output:** list of transfers with ID, wallet, direction, amount (BTC), state, confirmations, timestamp.

## Project Structure

```
bitgo-mcp/
├── CLAUDE.md
├── package.json
├── tsconfig.json
├── .env.example
├── src/
│   ├── index.ts          # MCP server entry point
│   ├── bitgo.ts          # BitGo SDK client singleton
│   ├── wallets.ts        # Wallet ID registry (env var mapping)
│   └── tools/
│       ├── balances.ts
│       ├── approvals.ts
│       ├── transferStatus.ts
│       └── listTransfers.ts
```

## Coding Conventions

- TypeScript strict mode
- All amounts returned in **BTC** (not satoshis) — divide by `1e8` before returning
- Wallet names in tool responses always use the logical name (`LW0`, `LCW1`, etc.)
- Return structured objects, never raw BitGo SDK response blobs
- Graceful error messages when a wallet env var is not configured

## Running the Server

```bash
npm install
npm run build
node dist/index.js
```

For development with auto-reload:
```bash
npm run dev
```

## MCP Client Config (Claude Desktop / claude.ai)

```json
{
  "mcpServers": {
    "bitgo": {
      "command": "node",
      "args": ["/path/to/bitgo-mcp/dist/index.js"],
      "env": {
        "BITGO_ACCESS_TOKEN": "<token>",
        "WALLET_LW0": "<id>",
        "WALLET_LW1": "<id>",
        "WALLET_LIW1": "<id>",
        "WALLET_LCW1": "<id>",
        "WALLET_LCEW1": "<id>"
      }
    }
  }
}
```
