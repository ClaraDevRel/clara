#!/usr/bin/env bun
// skills/bitcoin-wallet/sign-runner.ts
//
// Signs messages using BIP-137 (Bitcoin Signed Message) with a wallet from
// the MCP wallet store. Unlocks the wallet, signs, and outputs JSON.
//
// Usage:
//   WALLET_ID=... WALLET_PASSWORD=... bun skills/bitcoin-wallet/sign-runner.ts btc-sign --message "Hello"

import { secp256k1 } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha2.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import { mnemonicToSeedSync } from "@scure/bip39";
import { HDKey } from "@scure/bip32";

const walletId = process.env.WALLET_ID;
const walletPassword = process.env.WALLET_PASSWORD;

if (!walletId || !walletPassword) {
  console.log(JSON.stringify({ success: false, error: "WALLET_ID and WALLET_PASSWORD env vars required" }));
  process.exit(1);
}

// Parse command: btc-sign --message <msg>
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd !== "btc-sign") {
  console.log(JSON.stringify({ success: false, error: `Unknown command: ${cmd}. Supported: btc-sign` }));
  process.exit(1);
}

const msgIdx = args.indexOf("--message");
if (msgIdx === -1 || !args[msgIdx + 1]) {
  console.log(JSON.stringify({ success: false, error: "--message <text> required" }));
  process.exit(1);
}
const message = args[msgIdx + 1];

async function getMnemonic(_wid: string, _password: string): Promise<string> {
  const { getCredential } = await import("../../src/credentials.ts");
  const mnemonic = await getCredential("clara-wallet", "mnemonic");
  if (!mnemonic) throw new Error("clara-wallet/mnemonic credential not found");
  return mnemonic;
}

// BIP-137 message signing
function varInt(n: number): Uint8Array {
  if (n < 0xfd) return new Uint8Array([n]);
  const buf = new Uint8Array(3);
  buf[0] = 0xfd; buf[1] = n & 0xff; buf[2] = (n >> 8) & 0xff;
  return buf;
}

function bip137Hash(msg: string): Uint8Array {
  const prefix = "Bitcoin Signed Message:\n";
  const prefixBytes = new TextEncoder().encode(prefix);
  const msgBytes = new TextEncoder().encode(msg);
  const buf = new Uint8Array([
    ...varInt(prefixBytes.length), ...prefixBytes,
    ...varInt(msgBytes.length), ...msgBytes,
  ]);
  return sha256(sha256(buf));
}

try {
  const mnemonic = await getMnemonic(walletId, walletPassword);
  const seed = mnemonicToSeedSync(mnemonic);
  const root = HDKey.fromMasterSeed(seed);
  const btcKey = root.derive("m/84'/0'/0'/0/0").privateKey!;

  const hash = bip137Hash(message);
  const sig = secp256k1.sign(hash, btcKey, { lowS: true });
  const header = 39 + sig.recovery; // compressed P2WPKH
  const sigBytes = new Uint8Array([header, ...sig.toCompactRawBytes()]);
  const signature = Buffer.from(sigBytes).toString("base64");

  console.log(JSON.stringify({ success: true, signature }));
  process.exit(0);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.log(JSON.stringify({ success: false, error: msg }));
  process.exit(1);
}
