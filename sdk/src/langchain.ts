/**
 * warden402-sdk/langchain
 * Warden as LangChain tools. The agent calls them before it trades or signs.
 *
 *   import { wardenTools } from "warden402-sdk/langchain";
 *   const tools = await wardenTools();                     // guard_token, guard_address, guard_tx
 *   const tools = await wardenTools({ agentKey: "wk_..." }); // + firewall_check
 *
 * @langchain/core and zod are optional peer dependencies.
 */
import { Warden, type WardenOptions } from "./index.js";

export async function wardenTools(opts: WardenOptions = {}) {
  // Dynamic import: the rest of the SDK works without @langchain/core installed.
  // @ts-ignore — optional peer dependency
  const { DynamicStructuredTool } = await import("@langchain/core/tools");
  // @ts-ignore — optional peer dependency
  const { z } = await import("zod");
  const warden = new Warden(opts);

  // Errors come back as text so the agent sees "do not proceed" rather than crashing the run.
  const run = (fn: () => Promise<unknown>) => async () => {
    try { return JSON.stringify(await fn()); }
    catch (e) { return JSON.stringify({ error: String(e instanceof Error ? e.message : e), instruction: "No verdict — do NOT proceed." }); }
  };

  const tools = [
    new DynamicStructuredTool({
      name: "guard_token",
      description:
        "Check a Base token BEFORE buying or selling it (can it be sold, honeypot, tax, owner powers, liquidity, holder concentration, deployer, OFAC). Returns block/review/clear. Do not buy on 'block'.",
      schema: z.object({ address: z.string(), chainId: z.number().optional() }),
      func: async ({ address, chainId }: { address: string; chainId?: number }) => run(() => warden.token(address, chainId ?? 8453))(),
    }),
    new DynamicStructuredTool({
      name: "guard_address",
      description: "Check a counterparty address before interacting (OFAC, sanctioned-counterparty exposure, contract risk, identity).",
      schema: z.object({ address: z.string(), chainId: z.number().optional() }),
      func: async ({ address, chainId }: { address: string; chainId?: number }) => run(() => warden.address(address, chainId ?? 8453))(),
    }),
    new DynamicStructuredTool({
      name: "guard_tx",
      description:
        "Check a pending transaction BEFORE signing. Decodes calldata (unlimited approve, permit, setApprovalForAll), simulates it, checks the counterparty and address poisoning. Don't sign on 'block'/'review'.",
      schema: z.object({ from: z.string(), to: z.string(), calldata: z.string(), value: z.string().optional(), chainId: z.number().optional() }),
      func: async (input: { from: string; to: string; calldata: string; value?: string; chainId?: number }) => run(() => warden.tx(input))(),
    }),
  ];

  if (opts.agentKey) {
    tools.push(new DynamicStructuredTool({
      name: "firewall_check",
      description:
        "Check a payment or transaction against this agent's spending policy BEFORE executing it. Returns allow / hold (wait for human approval) / deny. Only proceed on 'allow'.",
      schema: z.object({
        kind: z.enum(["x402_payment", "tx"]).optional(), to: z.string(), amountUsd: z.number().optional(),
        from: z.string().optional(), calldata: z.string().optional(),
      }),
      func: async (action: { kind?: "x402_payment" | "tx"; to: string; amountUsd?: number; from?: string; calldata?: string }) => run(() => warden.firewall(action))(),
    }));
  }
  return tools;
}
