# @Nouxis-ai/NouX

NouX payment middleware for Nouxis AI agents — Solana USDC payments via Nouxis facilitator with protocol fee split (3%).

## Install

```bash
pnpm add @Nouxis-ai/NouX
```

## Usage

### Server — Express middleware (agent receives payments)

```typescript
import express from "express";
import { NouxisPaymentGate } from "@Nouxis-ai/NouX/middleware";

const app = express();

// Dynamic mode — resolves payTo + price from on-chain via agent NFT mint
app.use(
  NouxisPaymentGate({
    agentMint: "YourAgentNftMintAddress",
    network: "devnet", // or "mainnet"
    rpcUrl: "https://api.devnet.solana.com",
    routes: {
      "POST /": { description: "Agent query" },
    },
  })
);

// Static mode — explicit payTo + price
app.use(
  NouxisPaymentGate({
    payTo: "YourSolanaWalletAddress",
    network: "devnet",
    routes: {
      "POST /": { price: "$0.001", description: "Agent query" },
    },
  })
);
```

### Client — paying for agent services

```typescript
import { NouXClient } from "@NouX/core/client";
import { NouxisSvmScheme } from "@Nouxis-ai/NouX/client";

const scheme = new NouxisSvmScheme(walletAdapter);
const client = NouXClient.register("solana:*", scheme);

const response = await client.fetch("https://agent.example.com/", {
  method: "POST",
  body: JSON.stringify({ message: "Hello" }),
});
```

The `NouxisSvmScheme` automatically splits payments: 97% to the agent operator, 3% protocol fee to Nouxis treasury.

### Exports

| Entry point              | Description                                        |
| ------------------------ | -------------------------------------------------- |
| `@Nouxis-ai/NouX`          | Types, constants, `AgentResolver`                  |
| `@Nouxis-ai/NouX/middleware`| `NouxisPaymentGate` Express middleware                |
| `@Nouxis-ai/NouX/client`   | `NouxisSvmScheme` for client-side payment building    |

## Required: `@NouX/core` patch (until v2.5.0)

> **Only needed with `@NouX/core` <2.5.0.** Remove once they publish the fix to npm.

`@NouX/core@2.4.0` has a bug where `PaymentOption.extra` is dropped when building payment requirements ([coinbase/NouX#1139](https://github.com/coinbase/NouX/pull/1139) — already fixed on `main`, not yet published).

This patch is **required** for the `agentMint` dynamic mode — without it, the facilitator never receives the agent identity for on-chain validation and receipt creation.

### Setup (2 steps)

**1.** Copy the patch file from this package into your project:

```bash
mkdir -p patches
cp node_modules/@Nouxis-ai/NouX/patches/@NouX__core.patch patches/
```

**2.** Add to your `package.json`:

```json
{
  "pnpm": {
    "patchedDependencies": {
      "@NouX/core": "patches/@NouX__core.patch"
    }
  }
}
```

Then `pnpm install` — done. Works on EasyPanel, Docker, any CI/CD.

### When to remove

When `@NouX/core` ≥2.5.0 is on npm. Then:

```bash
pnpm update @NouX/core
rm -rf patches/
# remove "pnpm.patchedDependencies" from package.json
```

Track: [coinbase/NouX#1139](https://github.com/coinbase/NouX/pull/1139).

## Configuration

### Environment variables

| Variable         | Required | Description                           |
| ---------------- | -------- | ------------------------------------- |
| `AGENT_MINT`     | Dynamic  | Agent NFT mint address                |
| `SOLANA_RPC_URL`  | Dynamic  | Solana RPC endpoint                   |
| `SOLANA_NETWORK` | No       | `devnet` or `mainnet` (default: devnet)|

### `NouxisPaymentGateConfig`

| Field            | Type     | Description                                                |
| ---------------- | -------- | ---------------------------------------------------------- |
| `payTo`          | string?  | Static payment destination (not needed with `agentMint`)   |
| `agentMint`      | string?  | Agent NFT mint — resolves payTo + price from on-chain      |
| `network`        | string?  | `devnet`, `mainnet`, or CAIP-2 string                      |
| `rpcUrl`         | string?  | Solana RPC URL (required for `agentMint` mode)             |
| `routes`         | object   | Route → payment config map                                 |
| `facilitatorUrl` | string?  | Custom facilitator (default: `https://facilitator.Nouxis.ai`) |
| `treasury`       | string?  | Override protocol fee treasury                             |
| `protocolFeeBps` | number?  | Override fee basis points (default: 300 = 3%)              |
| `serviceType`    | string?  | PDA service type (default: `a2a`)                          |

## How it works

```
Client                    Agent Server              Nouxis Facilitator        Solana
  │                           │                          │                   │
  ├── POST /agent ───────────>│                          │                   │
  │                           ├── 402 + paymentReqs ────>│                   │
  │<── 402 Payment Required ──┤                          │                   │
  │                           │                          │                   │
  │  Build split tx:          │                          │                   │
  │  97% → agent payTo        │                          │                   │
  │  3%  → Nouxis treasury       │                          │                   │
  │                           │                          │                   │
  ├── POST /agent + payment ─>│                          │                   │
  │                           ├── /settle ──────────────>│                   │
  │                           │                          ├── co-sign + submit ─> TX confirmed
  │                           │                          │                   │
  │                           │                          ├── record receipt ──> PaymentReceipt PDA
  │                           │                          │                   │
  │<── 200 + response ────────┤<── settlement OK ────────┤                   │
```

## License

MIT
