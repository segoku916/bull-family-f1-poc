# Bull Family — F1 PoC: `deal()` does not verify the payee

Proof of concept for the Bull Family bug bounty report "SDK `deal()` does not
verify the payee of created agreements".

## What it proves

`Bull.deal(template, params)` in the live SDK (`bull.mjs`, sha256
`f92cb5e84d758f2b540ecb334cb3d2c30e3f2fdcf30f5b83926e934df5cd89c4`) only checks
that the total amount of created agreements does not exceed the requested amount
and that at least one `AgreementCreated` event exists. It never compares the
event's `payee` against the requested payee.

A malicious or compromised API server returns a step that creates the agreement
with `payee = attacker`. The SDK accepts it silently; the keeper then releases
the payer's funds to the attacker.

## How to run

Requires Node.js and Foundry (`anvil`).

```bash
npm i viem
anvil --chain-id 4663 --port 8546
node poc-deal-payee.mjs
```

The script starts a fake API server that returns one tampered step, then calls
the REAL live SDK's `deal("arbiter_escrow", …)`.

## Expected result

- Payer asked for payee `0x3C44…93BC` (friend), amount 0.001 ETH.
- Server substituted payee `0x7099…79C8` (attacker).
- `deal()` returns an agreement id **without throwing**.
- The on-chain payee is the attacker; the payer's 0.001 ETH sits in the
  agreement payable to the attacker.

## Files

- `poc-deal-payee.mjs` — the PoC script (Node + viem, local Anvil only)
- `MockAgreement.sol` — mock emitting the real `AgreementCreated` event,
  etched at the real Agreement address
- `bull-live.mjs` — the exact live SDK this PoC ran against

## Notes

- Everything runs locally; nothing is sent to any mainnet.
- The agreement id in the PoC output is 0, not 1 — an artifact of etching the
  mock's runtime code without running its constructor (`nextId` starts at 0).
  The payee substitution itself is unaffected.
- Contrast `agree()` in the same SDK, which DOES verify the payee and throws
  "the agreement that was created has a different payer or payee than you asked
  for." The `deal()` template path never got the same check.
