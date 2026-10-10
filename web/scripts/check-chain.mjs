/** Read-only checks. Local fixtures never enter the production application. */
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { Interface, id } from "ethers";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const configSource = await readFile(resolve(root, "web/src/config.ts"), "utf8");
const knownAddress = configSource.match(
  /KeelVault:\s*['"](0x[0-9a-f]+)['"]/,
)[1];
const scratch = resolve(root, "test/scratch/web-chain");
await mkdir(scratch, { recursive: true });
for (const module of ["index", "rpc", "utils"]) {
  execFileSync(
    resolve(root, "web/node_modules/.bin/esbuild"),
    [
      resolve(root, `web/src/chain/${module}.ts`),
      "--bundle",
      "--platform=node",
      "--format=esm",
      `--outfile=${scratch}/${module}.mjs`,
    ],
    { stdio: "pipe" },
  );
}
const chain = await import(pathToFileURL(`${scratch}/index.mjs`));
const utils = await import(pathToFileURL(`${scratch}/utils.mjs`));
const { rpc, scanLogs } = await import(pathToFileURL(`${scratch}/rpc.mjs`));
let passed = 0;
async function check(name, run) {
  await run();
  passed++;
  console.log(`PASS ${name}`);
}

await check("Pulse counts finished runs and halves every seven days", () => {
  const now = 3_000_000;
  const pulse = utils.buildPulse(
    [
      { timestamp: now },
      { timestamp: now - utils.WEEK },
      { timestamp: now - utils.WEEK * 2 },
    ],
    now,
  );
  assert.equal(pulse.value, 1.75);
  assert.equal(pulse.percent, 8.75);
  assert.equal(pulse.runs7d, 2);
  assert.equal(pulse.total, 3);
  assert.equal(pulse.lastRunAt, now);
  assert.equal(utils.buildPulse([], now).lastRunAt, null);
  assert.ok(
    utils.buildPulse([{ timestamp: now - utils.WEEK - 1 }], now).value < 0.5,
  );
  assert.equal(
    utils.buildPulse(
      Array.from({ length: 21 }, () => ({ timestamp: now })),
      now,
    ).percent,
    100,
  );
});

await check(
  "Amounts retain all 18 decimals and reject zero, negatives and exponent notation",
  () => {
    assert.equal(utils.parseAmount("0.000000000000000001"), 1n);
    assert.equal(
      utils.parseAmount("1.234567890123456789"),
      1234567890123456789n,
    );
    for (const value of [
      "0",
      "-1",
      "1e3",
      "Infinity",
      "0.0000000000000000001",
      "",
      "1.2.3",
    ])
      assert.throws(() => utils.parseAmount(value));
    assert.equal(utils.formatAmount(0n), "0");
    assert.equal(utils.formatAmount(1n), "<0.0001");
  },
);

await check(
  "Untrusted metadata cannot create executable links or data images",
  () => {
    const metadata = utils.parseMetadata(
      JSON.stringify({
        description: "<script>alert(1)</script>",
        image: "javascript:alert(1)",
        links: ["javascript:alert(1)", "https://example.com/project"],
      }),
    );
    assert.equal(metadata.description, "<script>alert(1)</script>");
    assert.equal(metadata.image, undefined);
    assert.equal(metadata.links.length, 1);
    assert.equal(utils.safeUrl("data:image/svg+xml,<svg/>"), undefined);
    assert.deepEqual(utils.parseMetadata("not json"), {
      description: "",
      links: [],
    });
    assert.deepEqual(utils.parseMetadata("null"), {
      description: "",
      links: [],
    });
  },
);

await check(
  "Launch validation enforces contract byte limits, UUIDs, share and expiry",
  () => {
    const input = {
      name: "Validation fixture",
      symbol: "CHECK",
      jobRef: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      image: "https://example.com/image.png",
      description: "Local test only.",
      links: [],
      creatorPercent: 80,
      permit: {
        projectRef: "11111111-2222-3333-4444-555555555555",
        startTick: -100000,
        deadline: Math.floor(Date.now() / 1000) + 3600,
        signature: "0x1234",
      },
    };
    const args = utils.launchArguments(input);
    assert.equal(args[4], 8000);
    assert.deepEqual(JSON.parse(args[8]), {
      description: input.description,
      image: input.image,
      links: [],
    });
    assert.throws(
      () => utils.validateLaunchInput({ ...input, creatorPercent: 81 }),
      /share/i,
    );
    assert.throws(
      () => utils.validateLaunchInput({ ...input, name: "é".repeat(65) }),
      /UTF-8/,
    );
    assert.throws(
      () =>
        utils.validateLaunchInput({
          ...input,
          jobRef: input.jobRef.toUpperCase(),
        }),
      /UUID/,
    );
    assert.throws(
      () =>
        utils.validateLaunchInput({ ...input, description: "a".repeat(1024) }),
      /1,024/,
    );
    assert.throws(() => utils.parseLaunchPermit("{}"));
    assert.throws(
      () =>
        utils.parseLaunchPermit(
          JSON.stringify({ ...input.permit, deadline: 1 }),
        ),
      /expired/,
    );
    assert.throws(
      () => utils.validateLaunchInput({ ...input, image: "" }),
      /image URL/,
    );
  },
);

const originalFetch = globalThis.fetch;
await check("RPC moves to fallback after a failed endpoint", async () => {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (calls.length === 1) return new Response("Unavailable", { status: 503 });
    return Response.json({ jsonrpc: "2.0", id: 1, result: "0x1" });
  };
  try {
    assert.equal(await rpc("eth_chainId"), "0x1");
    assert.equal(calls.length, 2);
    assert.notEqual(calls[0], calls[1]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await check(
  "Failed public reads surface an error instead of false zero data",
  async () => {
    globalThis.fetch = async () => new Response("Unavailable", { status: 503 });
    try {
      await assert.rejects(() => chain.loadMarket(), /RPC unavailable/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);

await check(
  "Event scan shrinks provider-limited windows and excludes removed logs",
  async () => {
    const windows = [];
    globalThis.fetch = async (_url, init) => {
      const request = JSON.parse(init.body);
      const range = request.params[0];
      const span = Number(range.toBlock) - Number(range.fromBlock) + 1;
      windows.push(span);
      if (span > 100)
        return Response.json({
          error: { code: -32005, message: "Block range too large" },
        });
      return Response.json({
        result: [
          { blockNumber: range.fromBlock, removed: false },
          { blockNumber: range.fromBlock, removed: true },
        ],
      });
    };
    try {
      const logs = await scanLogs("local-fixture", [], 1, 500);
      assert.ok(windows.some((span) => span > 100));
      assert.equal(logs.length, 5);
      assert.ok(logs.every((log) => !log.removed));
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);

await check(
  "Wallet connection handles absent wallets and switches to mainnet",
  async () => {
    assert.equal(await chain.getWalletAddress(), null);
    await assert.rejects(() => chain.connectWallet(), /wallet browser/);
    // Existing deployment address used only to exercise address handling locally.
    const account = knownAddress;
    let network = "0xa";
    const calls = [];
    globalThis.ethereum = {
      request: async (request) => {
        calls.push(request);
        if (
          request.method === "eth_requestAccounts" ||
          request.method === "eth_accounts"
        )
          return [account];
        if (request.method === "eth_chainId") return network;
        if (request.method === "wallet_switchEthereumChain") {
          network = request.params[0].chainId;
          return null;
        }
        throw new Error("Unexpected wallet request");
      },
    };
    try {
      assert.equal((await chain.connectWallet()).toLowerCase(), account);
      assert.equal(network, "0x1");
      assert.ok(
        calls.some((call) => call.method === "wallet_switchEthereumChain"),
      );
    } finally {
      delete globalThis.ethereum;
    }
  },
);

await check("Expired trades fail before requesting wallet access", async () => {
  await assert.rejects(
    () =>
      chain.executeTrade({
        token: knownAddress,
        side: "buy",
        amount: "1",
        minimumOut: "1",
        deadline: 1,
      }),
    /deadline has expired/,
  );
});

await check(
  "ABI event decoding preserves the onchain run hash and repayment",
  async () => {
    const abi = JSON.parse(
      await readFile(resolve(root, "web/src/abi/KeelVault.json"), "utf8"),
    );
    const iface = new Interface(abi);
    const reference = id("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    const event = iface.encodeEventLog(iface.getEvent("RunVerified"), [
      knownAddress,
      reference,
      id("commit"),
      0n,
    ]);
    const decoded = iface.parseLog(event);
    assert.equal(decoded.args.jobRef, reference);
    assert.equal(decoded.args.amount, 0n);
    assert.equal(reference.length, 66);
  },
);

if (process.argv.includes("--live")) {
  await check(
    "Live Ethereum pinned deployment code, wiring and event reads",
    async () => {
      await chain.verifyDeployment(true);
      const market = await chain.loadMarket();
      assert.equal(market.verified, true);
      assert.ok(market.blockNumber >= 26162060);
      console.log(
        JSON.stringify({
          block: market.blockNumber,
          timestamp: market.timestamp,
          paused: market.paused,
          launches: market.launches,
          runs: market.buildsShipped,
          baskets: market.imdInBaskets.toString(),
          runPrice: market.runPrice.toString(),
        }),
      );
    },
  );
  await check(
    "Encoded event integration reads pool price, recorded runs, close notice and holder claim",
    async () => {
      // This block is a local RPC fixture after the live code check. Nothing is sent.
      const address = (name) =>
        configSource.match(new RegExp(`${name}:\\s*['"](0x[0-9a-f]+)['"]`))[1];
      const factory = new Interface(
        JSON.parse(
          await readFile(resolve(root, "web/src/abi/KeelFactory.json"), "utf8"),
        ),
      );
      const vault = new Interface(
        JSON.parse(
          await readFile(resolve(root, "web/src/abi/KeelVault.json"), "utf8"),
        ),
      );
      const token = new Interface(
        JSON.parse(
          await readFile(resolve(root, "web/src/abi/KeelToken.json"), "utf8"),
        ),
      );
      const hook = new Interface(
        JSON.parse(
          await readFile(resolve(root, "web/src/abi/KeelHook.json"), "utf8"),
        ),
      );
      const state = new Interface([
        "function getSlot0(bytes32) view returns (uint160,int24,uint24,uint24)",
      ]);
      const now = 2_000_000_000;
      const block = 26162070;
      const uuid = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
      const project = "11111111-2222-3333-4444-555555555555";
      const launch = factory.encodeEventLog(factory.getEvent("Launched"), [
        address("KeelToken"),
        knownAddress,
        id(uuid),
        id(project),
        id("fixture-pool"),
        "Local check only",
        "CHECK",
        uuid,
        project,
        2000,
        0,
        200,
        1000,
        JSON.stringify({
          description: "Local fixture.",
          image: "invalid-image",
          links: [],
        }),
      ]);
      const run = vault.encodeEventLog(vault.getEvent("RunVerified"), [
        address("KeelToken"),
        id("unresolved-run-uuid"),
        id("fixture-commit"),
        0,
      ]);
      const asLog = (event, contract, index) => ({
        ...event,
        address: contract,
        blockNumber: `0x${block.toString(16)}`,
        blockHash: id("fixture-block"),
        transactionHash: id("fixture-tx"),
        logIndex: `0x${index}`,
      });
      let poolUnavailable = false;
      globalThis.fetch = async (_url, init) => {
        const request = JSON.parse(init.body);
        const result = (value) => Response.json({ result: value });
        if (request.method === "eth_chainId") return result("0x1");
        if (request.method === "eth_getBlockByNumber")
          return result({
            number: `0x${block.toString(16)}`,
            timestamp: `0x${now.toString(16)}`,
          });
        if (request.method === "eth_getBlockByHash")
          return result({
            timestamp: `0x${(now - utils.WEEK / 2).toString(16)}`,
          });
        if (request.method === "eth_getLogs")
          return result([
            request.params[0].address.toLowerCase() === address("KeelFactory")
              ? asLog(launch, address("KeelFactory"), 0)
              : asLog(run, address("KeelVault"), 1),
          ]);
        if (request.method === "eth_call") {
          const call = request.params[0];
          const to = call.to.toLowerCase();
          const abi =
            to === address("KeelFactory")
              ? factory
              : to === address("KeelVault")
                ? vault
                : to === address("KeelHook")
                  ? hook
                  : to === address("StateView")
                    ? state
                    : token;
          const method = abi.parseTransaction({ data: call.data }).name;
          if (method === "paused")
            return result(abi.encodeFunctionResult(method, [false]));
          if (method === "runPrice")
            return result(
              abi.encodeFunctionResult(method, [500000000000000000n]),
            );
          if (method === "project")
            return result(
              abi.encodeFunctionResult(method, [
                {
                  creator: knownAddress,
                  phase: 0,
                  creatorActive: true,
                  creatorBps: 2000,
                  launchedAt: now - 35 * 86400,
                  closeNotice: now - 2 * 86400,
                  basket: 10000000000000000000n,
                  creatorAccrued: 1n,
                  snapshotBlock: block - 1,
                  closeBlock: 0,
                  poolAtClose: 0,
                  circulating: 0,
                  totalClaimed: 0,
                  jobHash: id(uuid),
                  projectHash: id(project),
                },
              ]),
            );
          if (method === "totalSupply")
            return result(abi.encodeFunctionResult(method, [10n ** 27n]));
          if (method === "pending")
            return result(
              abi.encodeFunctionResult(method, [10000000000000000n]),
            );
          if (method === "getSlot0") {
            if (poolUnavailable)
              return Response.json({
                error: { code: 3, message: "execution reverted" },
              });
            return result(
              abi.encodeFunctionResult(method, [2n ** 96n, 0, 0, 0]),
            );
          }
          if (method === "claimable")
            return result(abi.encodeFunctionResult(method, [3n]));
          if (method === "balanceOf")
            return result(abi.encodeFunctionResult(method, [4n]));
          if (method === "claimed")
            return result(abi.encodeFunctionResult(method, [false]));
        }
        throw new Error(`Unexpected local RPC request: ${request.method}`);
      };
      try {
        const market = await chain.loadMarket();
        assert.equal(market.launches, 1);
        assert.equal(market.buildsShipped, 1);
        const item = market.tokens[0];
        assert.equal(item.name, "Local check only");
        assert.equal(item.image, undefined);
        assert.equal(item.priceImd, 1);
        assert.equal(item.marketCapImd, 1_000_000_000);
        assert.equal(item.basket, 10000000000000000000n);
        assert.equal(item.pendingFees, 10000000000000000n);
        assert.equal(item.runs[0].amount, 0n);
        assert.equal(item.runs[0].jobUrl, undefined);
        assert.equal(item.pulse.total, 1);
        assert.ok(Math.abs(item.pulse.value - Math.SQRT1_2) < 1e-12);
        assert.equal(item.earliestClose, now + 5 * 86400);
        const holder = await chain.getHolderState(
          address("KeelToken"),
          knownAddress,
        );
        assert.equal(holder.claimable, 3n);
        assert.equal(holder.tokenBalance, 4n);
        poolUnavailable = true;
        const missingPrice = await chain.loadMarket();
        assert.equal(missingPrice.tokens[0].priceImd, null);
        assert.equal(missingPrice.tokens[0].marketCapImd, null);
        assert.equal(missingPrice.imdInBaskets, market.imdInBaskets);
      } finally {
        globalThis.fetch = originalFetch;
      }
    },
  );
}
console.log(`${passed} chain checks passed. No transactions sent.`);
