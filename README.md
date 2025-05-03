# Spot Game

A decentralized “keno” lottery built on Sui Move with verifiable randomness (ECVRF),  
a Next.js frontend, and an Express/Keeper service that automatically advances rounds.

---

## 📁 Repository Layout

```

/
├─ package.json           # Root workspace definitions & scripts
├─ packages
│   ├─ contracts          # Move modules, tests, build & publish
│   ├─ ui                 # Next.js + @mysten/dapp-kit frontend
│   └─ backend            # Express keeper service
│       └─ fastcrypto     # Git submodule pointing at MystenLabs/fastcrypto
└─ pnpm-workspace.yaml

```

---

## 🚀 Quickstart

### 0️⃣ Clone with submodules

We vendor the FastCrypto repo as a submodule under `packages/backend/fastcrypto`, so you get the exact CLI we need:

```bash
git clone --recurse-submodules https://github.com/you/spot-game.git
cd spot-game
```

If you already cloned without `--recurse-submodules`, do:

```bash
git submodule update --init --recursive
```

---

### 1️⃣ Install prerequisites

- [Node.js ≥18](https://nodejs.org/)
- [pnpm](https://pnpm.io/)
- Sui CLI & devnet ([see here](https://docs.sui.io/guides/developer/getting-started/sui-install))
- [Rust & Cargo](https://www.rust-lang.org/tools/install) (for building the `ecvrf-cli`)
- `fastcrypto` submodule (already pulled by step 0)

```bash
pnpm install
```

---

### 2️⃣ Build & publish your Move contracts

```bash
# Compile Move modules
pnpm run contracts:build

# Run Move unit tests
pnpm run contracts:test

# Publish to your local/devnet (creates the on-chain package & Game object)
pnpm run contracts:publish
```

After publishing you’ll see two new on-chain IDs:

- **Package ID** (the Move package)
- **Game ID** (the on-chain Game object)

---

### 3️⃣ Configure & run the frontend

1. In `packages/ui/`, create a `.env.local`:

   ```
   NEXT_PUBLIC_SPOT_PKG_ID=<your package ID>
   NEXT_PUBLIC_SPOT_GAME_ID=<your game ID>
   ```

2. From the repo root:

   ```bash
   cd packages/ui
   pnpm install
   pnpm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000), connect your wallet, pick numbers, and play.

---

### 4️⃣ Generate ECVRF keys

```bash
# Inside backend, we vendor the ecvrf-cli in packages/backend/fastcrypto
cd packages/backend/fastcrypto

# Build it once
cargo build --bin ecvrf-cli

# Generate a new VRF keypair:
# (prints "Secret key: <hex>"  and "Public key: <hex>")
cargo run --bin ecvrf-cli keygen
```

**Save** the 32-byte **secret key** (hex) for your keeper service’s `VRF_SECRET_KEY`.

---

### 5️⃣ Configure & run the keeper backend

1. In `packages/backend/`, create a `.env`:

   ```dotenv
   SPOT_PKG_ID=<your package ID>
   SPOT_GAME_ID=<your game ID>
   ADMIN_SECRET_KEY=<admin secret key for signing txs>
   VRF_SECRET_KEY=<hex-encoded VRF secret key from step 4>
   ```

2. From the repo root:

   ```bash
   cd packages/backend
   pnpm install
   pnpm run start
   ```

The keeper will:

1. Watch the on-chain `current_round.end_time_ms`
2. When a round ends, call your Move `trigger_new_round` entry
3. Invoke `ecvrf-cli` (via the submodule) to generate randomness & proof
4. Retry up to 3× on failure

---

## 📜 Available Scripts

> **Run from repo root:**

| Command             | What it does                                   |
| ------------------- | ---------------------------------------------- |
| `contracts:build`   | Compile your Move package                      |
| `contracts:test`    | Run Move unit tests                            |
| `contracts:publish` | Publish package & instantiate `Game` on devnet |
| `ui:dev`            | Start Next.js dev server                       |
| `ui:build`          | Build Next.js for production                   |
| `backend:start`     | Launch the Express keeper service              |
| `build`             | `contracts:build` **then** `ui:build`          |
| `test`              | `contracts:test` **and** UI linting            |
| `dev`               | Parallel publish contracts & run `ui:dev`      |

---

## 📚 Further Reading

- **Sui Devnet & CLI**
  [https://docs.sui.io/guides/developer/getting-started/connect](https://docs.sui.io/guides/developer/getting-started/connect)
- **Move & Sui Framework**
  [https://docs.sui.io/guides/developer/sui-101](https://docs.sui.io/guides/developer/sui-101)
- **ECVRF in Sui**
  [https://docs.sui.io/guides/developer/cryptography/ecvrf](https://docs.sui.io/guides/developer/cryptography/ecvrf)
- **Dapp Kit & Mysten Labs SDK**
  [https://sdk.mystenlabs.com/dapp-kit](https://sdk.mystenlabs.com/dapp-kit)
