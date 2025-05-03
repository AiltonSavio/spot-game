// src/server.ts
import "dotenv/config";
import express from "express";
import { spawnSync } from "child_process";
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import path from "path";

// // your hex-encoded VRF public key
// const hexKey =
//   "cef8641d2309ff408c554c4463d26da3413446bdc186847fb66f173f67e51135";

// // convert it
// const keyBytes = hexToBytes(hexKey);

// // now build your Move call
// tx.moveCall({
//   package: pkgId,
//   module: "spot_game",
//   function: "set_vrf_key",
//   arguments: [tx.object(gameId), tx.pure.vector("u8", keyBytes)],
// });

const {
  SUI_RPC = getFullnodeUrl("devnet"),
  SPOT_PKG_ID,
  SPOT_GAME_ID,
  ADMIN_SECRET_KEY,
  VRF_SECRET_KEY,
  PORT = "8000",
} = process.env;

if (!SPOT_PKG_ID || !SPOT_GAME_ID || !ADMIN_SECRET_KEY || !VRF_SECRET_KEY) {
  console.error({
    SPOT_PKG_ID,
    SPOT_GAME_ID,
    ADMIN_SECRET_KEY,
    VRF_SECRET_KEY,
  });
  throw new Error(
    "Missing one of SPOT_PKG_ID, SPOT_GAME_ID, ADMIN_SECRET_KEY, VRF_SECRET_KEY"
  );
}

const fastcryptoDir = path.resolve(__dirname, "../fastcrypto");

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

async function makeSigner() {
  const keypair = Ed25519Keypair.fromSecretKey(ADMIN_SECRET_KEY || "");
  return keypair;
}

async function triggerNewRound(
  client: SuiClient,
  signer: Ed25519Keypair
): Promise<string> {
  console.log("▶️  trigger_new_round…");

  // alpha = timestamp
  const alpha = Date.now().toString();
  const inputHex = Buffer.from(alpha, "utf8").toString("hex");

  // call ecvrf-cli (must be in PATH)
  const vrf = spawnSync(
    "cargo",
    [
      "run",
      "--bin",
      "ecvrf-cli",
      "--",
      "prove",
      "--input",
      inputHex,
      "--secret-key",
      process.env.VRF_SECRET_KEY!,
    ],
    {
      cwd: fastcryptoDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  if (vrf.error || vrf.status !== 0) {
    const err = vrf.error ?? new Error(vrf.stderr.toString());
    console.error("❌ ecvrf-cli error", err);
    throw err;
  }

  const out = vrf.stdout.trim().split("\n");
  // find the lines beginning with Proof: and Output:
  const proofLine = out.find((l) => l.startsWith("Proof:"));
  const outputLine = out.find((l) => l.startsWith("Output:"));
  if (!proofLine || !outputLine) {
    console.error("Unexpected VRF output:", vrf.stdout);
    throw new Error("Could not parse VRF proof/output");
  }

  // each is of the form "Proof:  18ccf8b..." or "Output: 2b7e45..."
  const proofHex = proofLine.split(":")[1].trim();
  const outputHex = outputLine.split(":")[1].trim();

  console.log("🖊️ Proof: ", proofHex)
  console.log("📜 Output:", outputHex);

  const proofBytes = Array.from(Buffer.from(proofHex, "hex"));
  const outputBytes = Array.from(Buffer.from(outputHex, "hex"));
  const alphaBytes = Array.from(Buffer.from(alpha, "utf8"));

  // build and submit the tx
  const tx = new Transaction();
  tx.moveCall({
    package: SPOT_PKG_ID || "",
    module: "spot_game",
    function: "trigger_new_round",
    arguments: [
      tx.object(SPOT_GAME_ID || ""),
      tx.pure.vector("u8", outputBytes),
      tx.pure.vector("u8", alphaBytes),
      tx.pure.vector("u8", proofBytes),
      tx.object.clock(),
    ],
  });

  const result = await client.signAndExecuteTransaction({
    signer,
    transaction: tx,
  });

  console.log("✅ tx sent:", result.digest);
  return result.digest;
}

async function keeperLoop(client: SuiClient, signer: Ed25519Keypair) {
  while (true) {
    try {
      // 1) fetch the current game object
      const obj = await client.getObject({
        id: SPOT_GAME_ID!,
        options: { showContent: true },
      });
      const round = (obj.data?.content as any)?.fields?.current_round;
      if (!round) {
        console.log("🔍 no active round yet, retrying in 1 s");
        await sleep(1000);
        continue;
      }

      const endMs = Number(round.fields.end_time_ms);
      const now = Date.now();
      const wait = Math.max(endMs - now, 0);

      console.log(
        `🔔 Next trigger in ${Math.ceil(wait / 1000)}s (ends @ ${new Date(endMs).toLocaleString()})`
      );
      await sleep(wait);

      // 2) call triggerNewRound with up to 3 retries
      let attempt = 0;
      while (true) {
        try {
          await triggerNewRound(client, signer);
          break;
        } catch (e) {
          attempt++;
          console.warn(`⚠️ trigger attempt #${attempt} failed:`, e);
          if (attempt >= 5) {
            console.error(
              "❌ All trigger retries failed, giving up until next round"
            );
            break;
          }
          // await sleep(1000);
          await sleep(1000000000);
        }
      }

      // 3) loop back to pick up new round
    } catch (e) {
      console.error("💥 Keeper loop error, retrying in 5 s:", e);
      await sleep(5000);
    }
  }
}

async function main() {
  const client = new SuiClient({ url: SUI_RPC });
  const signer = await makeSigner();

  // start Express
  const app = express();
  app.use(express.json());
  app.post("/trigger", async (_req, res) => {
    try {
      const digest = await triggerNewRound(client, signer);
      res.json({ ok: true, digest });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
  app.listen(Number(PORT), () => {
    console.log(`🚀 keeper HTTP server listening on http://localhost:${PORT}`);
  });

  // kick off background loop
  keeperLoop(client, signer);
}

main().catch((e) => {
  console.error("❌ Fatal startup error:", e);
  process.exit(1);
});
