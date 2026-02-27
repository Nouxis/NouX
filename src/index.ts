// @Nouxis-ai/NouX — NouX payment middleware for Nouxis AI agents

export { NouxisPaymentGate } from "./middleware.js";

export { AgentResolver } from "./resolver.js";
export type { ResolvedAgent } from "./resolver.js";

export type { NouxisPaymentGateConfig, NouxisRoutePayment } from "./types.js";

export {
  Nouxis_FACILITATOR_URL,
  Nouxis_PROGRAM_ID,
  USDC_MINT_DEVNET,
  USDC_MINT_MAINNET,
  SOLANA_DEVNET,
  SOLANA_MAINNET,
  PROTOCOL_FEE_BPS,
  Nouxis_TREASURY,
  getNetworkId,
  getUsdcMint,
} from "./constants.js";
