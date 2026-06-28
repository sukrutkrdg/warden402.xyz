/**
 * @warden402/sdk/langchain
 * Warden'ı LangChain araçları olarak sunar. Ajan, trade/sign'dan önce çağırır.
 *
 *   import { wardenTools } from "@warden402/sdk/langchain";
 *   const tools = wardenTools();  // [guard_token, guard_address, guard_tx]
 *
 * @langchain/core opsiyonel bir peer dependency'dir.
 */
import { Warden, type WardenOptions } from "./index.js";

// Dinamik import: @langchain/core kurulu değilse SDK'nın geri kalanı çalışmaya devam eder.
export async function wardenTools(opts: WardenOptions = {}) {
  // @ts-ignore — opsiyonel peer dependency, kurulu olmayabilir
  const { DynamicStructuredTool } = await import("@langchain/core/tools");
  // @ts-ignore — opsiyonel peer dependency
  const { z } = await import("zod");
  const warden = new Warden(opts);

  const fmt = (v: unknown) => JSON.stringify(v);

  const guardToken = new DynamicStructuredTool({
    name: "guard_token",
    description:
      "Bir Base token'ını AL-SAT'tan önce güvenlik açısından değerlendir (honeypot, vergi, likidite, holder yoğunluğu, OFAC). block/review/clear döner. 'block' ise alma.",
    schema: z.object({ address: z.string(), chainId: z.number().optional() }),
    func: async ({ address, chainId }) => fmt(await warden.token(address, chainId ?? 8453)),
  });

  const guardAddress = new DynamicStructuredTool({
    name: "guard_address",
    description: "Bir karşı taraf adresini etkileşim öncesi değerlendir (OFAC, kontrat riski, yaş/aktivite).",
    schema: z.object({ address: z.string(), chainId: z.number().optional() }),
    func: async ({ address, chainId }) => fmt(await warden.address(address, chainId ?? 8453)),
  });

  const guardTx = new DynamicStructuredTool({
    name: "guard_tx",
    description:
      "Bekleyen bir işlemi İMZALAMADAN önce değerlendir. Calldata'yı çözer (sınırsız approve), karşı tarafı kontrol eder.",
    schema: z.object({
      from: z.string(),
      to: z.string(),
      calldata: z.string(),
      value: z.string().optional(),
      chainId: z.number().optional(),
    }),
    func: async (input) => fmt(await warden.tx(input)),
  });

  return [guardToken, guardAddress, guardTx];
}
