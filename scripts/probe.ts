/**
 * probe — gerçek Bazaar yanıt ŞEKİLLERİNİ çek, böylece signals.ts'teki alan
 * adlarını kalibre edebiliriz. internal-auth (BAZAAR_INTERNAL_SECRET) kurulunca çalışır.
 *
 *   npx tsx scripts/probe.ts 0xTOKEN_ADDRESS
 */
import { bazaarGet } from "../src/bazaar/client.js";

const address = process.argv[2];
if (!address) {
  console.error("Kullanım: tsx scripts/probe.ts 0xTokenAddress");
  process.exit(1);
}

const endpoints = [
  "/api/x402/rug-score",
  "/api/x402/token-risk",
  "/api/x402/holders",
  "/api/x402/token-pools",
  "/api/x402/sanctions",
];

for (const path of endpoints) {
  const r = await bazaarGet(path, { address });
  console.log(`\n=== ${path} ===`);
  console.log(JSON.stringify(r, null, 2));
}
