#!/usr/bin/env node
/**
 * warden402-mcp
 *
 * Bir MCP stdio sunucusu. Warden'ın pre-execution güvenlik kontrollerini ajan
 * araçları olarak sunar: bir token / bekleyen işlem / adres ver → block·review·clear.
 *
 * Ajan, herhangi bir on-chain aksiyondan (al-sat, imzala, approve) ÖNCE bu aracı
 * çağırmalı ve 'block' dönerse işlemi yapmamalı.
 *
 * Opsiyonel env:
 *   WARDEN_API_URL  – Warden API kökü (varsayılan: https://warden402.xyz/api)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API = (process.env.WARDEN_API_URL ?? "https://warden402.xyz/api").replace(/\/$/, "");
const log = (m) => process.stderr.write(`[warden402-mcp] ${m}\n`);

async function callGuard(path, init) {
  const res = await fetch(`${API}${path}`, init);
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  return data;
}

function asText(verdict) {
  // Ajanın anlaması için kısa, kararı öne çıkaran özet + tam JSON.
  const head =
    verdict?.decision
      ? `DECISION=${String(verdict.decision).toUpperCase()} risk=${verdict.riskScore}/100` +
        (verdict.degraded ? " (degraded)" : "") +
        (verdict.reasons?.length ? ` reasons=${verdict.reasons.join(",")}` : "")
      : "verdict alınamadı";
  return {
    content: [
      { type: "text", text: head },
      { type: "text", text: JSON.stringify(verdict, null, 2) },
    ],
  };
}

const server = new McpServer({ name: "warden402", version: "0.1.0" });

server.tool(
  "guard_token",
  "Bir Base token kontratını AL-SAT'tan önce güvenlik açısından değerlendir. Honeypot, sınırsız satış vergisi, likidite, holder yoğunluğu ve OFAC yaptırımını birleştirip block/review/clear döner. 'block' ise tokenı alma.",
  { address: z.string().describe("Token kontrat adresi (0x..40 hex)"), chainId: z.coerce.number().optional().describe("Zincir id (varsayılan 8453 Base)") },
  async ({ address, chainId }) => {
    const q = new URLSearchParams({ type: "token", address, ...(chainId ? { chainId: String(chainId) } : {}) });
    return asText(await callGuard(`/guard?${q.toString()}`));
  },
);

server.tool(
  "guard_tx",
  "Bekleyen bir işlemi İMZALAMADAN önce değerlendir. Calldata'yı çözer (sınırsız approve / setApprovalForAll), karşı tarafı OFAC ve kontrat riskine karşı kontrol eder. 'block'/'review' ise imzalama.",
  {
    from: z.string().describe("Gönderen adres"),
    to: z.string().describe("Hedef kontrat/adres"),
    calldata: z.string().describe("İşlem calldata'sı (0x..)"),
    value: z.string().optional().describe("Wei cinsinden value (opsiyonel)"),
    chainId: z.coerce.number().optional(),
  },
  async ({ from, to, calldata, value, chainId }) => {
    const body = { type: "tx", from, to, calldata, ...(value ? { value } : {}), ...(chainId ? { chainId } : {}) };
    return asText(await callGuard(`/guard`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  },
);

server.tool(
  "guard_address",
  "Bir karşı taraf adresini (counterparty) etkileşimden önce değerlendir: OFAC yaptırımı, kontrat riski ve yaş/aktivite. block/review/clear döner.",
  { address: z.string().describe("Değerlendirilecek adres (0x..40 hex)"), chainId: z.coerce.number().optional() },
  async ({ address, chainId }) => {
    const q = new URLSearchParams({ type: "address", address, ...(chainId ? { chainId: String(chainId) } : {}) });
    return asText(await callGuard(`/guard?${q.toString()}`));
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
log(`hazır → ${API}`);
