import { paymentMiddleware, NouXResourceServer } from "@NouX/express";
import { ExactSvmScheme } from "@NouX/svm/exact/server";
import { HTTPFacilitatorClient } from "@NouX/core/server";
import type { RequestHandler } from "express";
import type { NouxisPaymentGateConfig } from "./types.js";
import { AgentResolver } from "./resolver.js";
import {
  Nouxis_FACILITATOR_URL,
  Nouxis_TREASURY,
  PROTOCOL_FEE_BPS,
  getNetworkId,
} from "./constants.js";

// ─── Helpers ─────────────────────────────────────────────

function getDefaultRpcUrl(network?: string): string {
  if (network === "mainnet" || network === "mainnet-beta") {
    return "https://api.mainnet-beta.solana.com";
  }
  return "https://api.devnet.solana.com";
}

// ─── Middleware ──────────────────────────────────────────

/**
 * Nouxis payment gate — Express middleware that wraps the Coinbase NouX SDK
 * with Nouxis protocol defaults (facilitator, Solana network, USDC).
 *
 * Supports two modes:
 *
 * **Static mode** — provide `payTo` directly:
 * ```typescript
 * app.use(NouxisPaymentGate({
 *   payTo: "YourSolanaWalletAddress",
 *   network: "devnet",
 *   routes: {
 *     "POST /": { price: "$0.001", description: "Agent query" },
 *   },
 * }));
 * ```
 *
 * **Dynamic mode** — resolve `payTo` and optionally `price` from on-chain:
 * ```typescript
 * app.use(NouxisPaymentGate({
 *   agentMint: "AgentNftMintAddress",
 *   rpcUrl: "https://api.devnet.solana.com",
 *   network: "devnet",
 *   routes: {
 *     "POST /": { description: "Agent query" },
 *   },
 * }));
 * ```
 */
export function NouxisPaymentGate(config: NouxisPaymentGateConfig): RequestHandler {
  // Validate: either payTo or agentMint must be provided
  if (!config.payTo && !config.agentMint) {
    throw new Error(
      "NouxisPaymentGate: either payTo or agentMint must be provided",
    );
  }

  const facilitatorUrl = config.facilitatorUrl ?? Nouxis_FACILITATOR_URL;
  const networkId = getNetworkId(config.network ?? "devnet");

  // Build the Coinbase NouX facilitator client pointing to our facilitator
  const facilitatorClient = new HTTPFacilitatorClient({
    url: facilitatorUrl,
  });

  // Build the resource server with Solana SVM scheme
  const resourceServer = new NouXResourceServer(facilitatorClient).register(
    "solana:*",
    new ExactSvmScheme(),
  );

  // Build route config in the format @NouX/express expects
  const routes: Record<string, any> = {};

  if (config.agentMint) {
    // ── Dynamic mode: resolve payTo + price from on-chain ──
    const rpcUrl = config.rpcUrl ?? getDefaultRpcUrl(config.network);
    const resolver = new AgentResolver(rpcUrl);
    const serviceType = config.serviceType ?? "a2a";

    // Pre-check: eagerly resolve at startup for fast-fail feedback
    resolver
      .resolve(config.agentMint, serviceType)
      .then((r) => {
        if (r && r.active) {
          const dollars = Number(r.amount) / 1_000_000;
          console.log(
            `[Nouxis] Agent resolved: payTo=${r.payTo}, price=$${dollars}, mint=${r.tokenMint}`,
          );
        } else if (r && !r.active) {
          console.warn(
            `[Nouxis] Agent ${config.agentMint} found but INACTIVE on-chain`,
          );
        } else {
          console.warn(
            `[Nouxis] Agent ${config.agentMint} PaymentRequirement PDA not found on-chain (service=${serviceType}, rpc=${rpcUrl})`,
          );
        }
      })
      .catch((err) => {
        console.warn(`[Nouxis] Pre-check failed for agent ${config.agentMint}:`, err);
      });

    for (const [route, payment] of Object.entries(config.routes)) {
      routes[route] = {
        accepts: {
          scheme: "exact" as const,
          network: networkId,
          // payTo resolved per-request from the on-chain PDA
          payTo: async () => {
            const resolved = await resolver.resolve(
              config.agentMint!,
              serviceType,
            );
            if (!resolved || !resolved.active) {
              throw new Error(
                `Agent ${config.agentMint} not found or inactive on-chain`,
              );
            }
            return resolved.payTo;
          },
          // Use static price from route config if provided, otherwise resolve from on-chain
          price: payment.price
            ? payment.price
            : async () => {
                const resolved = await resolver.resolve(
                  config.agentMint!,
                  serviceType,
                );
                if (!resolved) {
                  throw new Error(
                    `Agent ${config.agentMint} not found on-chain`,
                  );
                }
                // Convert raw token units to dollar string (USDC = 6 decimals)
                const dollars = Number(resolved.amount) / 1_000_000;
                return `$${dollars}`;
              },
          extra: {
            agentMint: config.agentMint,
            treasury: config.treasury ?? Nouxis_TREASURY,
            protocolFeeBps: config.protocolFeeBps ?? PROTOCOL_FEE_BPS,
          },
        },
        description: payment.description ?? "Nouxis agent service",
        mimeType: payment.mimeType ?? "application/json",
      };
    }
  } else {
    // ── Static mode (existing behavior) ─────────────────
    for (const [route, payment] of Object.entries(config.routes)) {
      routes[route] = {
        accepts: {
          scheme: "exact" as const,
          network: networkId,
          payTo: config.payTo!,
          price: payment.price,
          extra: {
            treasury: config.treasury ?? Nouxis_TREASURY,
            protocolFeeBps: config.protocolFeeBps ?? PROTOCOL_FEE_BPS,
          },
        },
        description: payment.description ?? "Nouxis agent service",
        mimeType: payment.mimeType ?? "application/json",
      };
    }
  }

  return paymentMiddleware(routes, resourceServer);
}
