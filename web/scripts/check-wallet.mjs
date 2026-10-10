/** Executes the real chain write helpers against local EIP-1193 mocks only. */
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { Interface, id, getAddress, parseUnits } from "ethers";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const scratch = resolve(root, "test/scratch/web-wallet");
await mkdir(scratch, { recursive: true });
for (const [name, source] of [
  ["chain", "web/src/chain/index.ts"],
  ["config", "web/src/config.ts"],
  ["app", "web/src/App.tsx"],
]) {
  execFileSync(
    resolve(root, "web/node_modules/.bin/esbuild"),
    [
      resolve(root, source),
      "--bundle",
      "--platform=node",
      "--format=esm",
      "--loader:.css=empty",
      `--outfile=${scratch}/${name}.mjs`,
    ],
    { stdio: "pipe" },
  );
}
const { config } = await import(pathToFileURL(`${scratch}/config.mjs`));
const chain = await import(pathToFileURL(`${scratch}/chain.mjs`));
const { errorMessage: appErrorMessage } = await import(
  pathToFileURL(`${scratch}/app.mjs`)
);
const A = config.addresses;
const interfaces = {};
const artifacts = {};
for (const name of [
  "KeelToken",
  "KeelVault",
  "KeelFactory",
  "KeelRouter",
  "KeelHook",
]) {
  interfaces[name] = new Interface(
    JSON.parse(
      await readFile(resolve(root, `web/src/abi/${name}.json`), "utf8"),
    ),
  );
  try {
    artifacts[name] = JSON.parse(
      await readFile(
        resolve(root, `test/scratch/forge-out/${name}.sol/${name}.json`),
        "utf8",
      ),
    );
  } catch {
    throw new Error(
      "Compile pinned artifacts first: forge build --out test/scratch/forge-out --cache-path test/scratch/forge-cache",
    );
  }
}
const abiFor = (to) =>
  interfaces[
    Object.keys(interfaces).find(
      (name) => A[name].toLowerCase() === to.toLowerCase(),
    )
  ] ?? interfaces.KeelToken;
const walletAddress = getAddress(A.KeelVault); // Existing address used locally; no signer or key exists.
const mockBlock = `0x${(config.deploymentBlock + 1).toString(16)}`;
const blockHash = id("local-wallet-test-block");
let allowance = 0n;
let balance = parseUnits("100");
let creatorBps = 3700;
let paused = false;
let claimable = 5n;
let rejectAccounts = false;
let rejectSend = false;
let revertMethod = "";
let receiptStatus = "0x1";
let corruptCode = false;
let nonce = 0;
let accepted = [];
let calls = [];
let publicMethods = [];
const transactions = new Map();
const originalFetch = globalThis.fetch;

function localCall(transaction) {
  const abi = abiFor(transaction.to);
  const parsed = abi.parseTransaction({ data: transaction.data });
  calls.push({
    method: "eth_call",
    to: transaction.to,
    name: parsed.name,
    args: parsed.args,
  });
  if (parsed.name === revertMethod) {
    const errorName =
      parsed.name === "launch"
        ? "InvalidSignature"
        : parsed.name === "claim"
          ? "NothingToClaim"
          : "Slippage";
    throw {
      code: 3,
      message: "execution reverted",
      data: abi.encodeErrorResult(errorName),
    };
  }
  if (parsed.name === "project")
    return abi.encodeFunctionResult(parsed.name, [
      {
        creator: walletAddress,
        phase: 0,
        creatorActive: true,
        creatorBps,
        launchedAt: 1,
        closeNotice: 0,
        basket: 0n,
        creatorAccrued: 5n,
        snapshotBlock: 0,
        closeBlock: 0,
        poolAtClose: 0n,
        circulating: 0n,
        totalClaimed: 0n,
        jobHash: id("local job"),
        projectHash: id("local project"),
      },
    ]);
  if (parsed.name === "lowerCreatorShare")
    return abi.encodeFunctionResult(parsed.name, []);
  const value =
    parsed.name === "balanceOf"
      ? balance
      : parsed.name === "symbol"
        ? "CHECK"
        : parsed.name === "claimCreator"
          ? 5n
          : parsed.name === "hook"
            ? A.KeelHook
            : parsed.name === "vault"
              ? A.KeelVault
              : parsed.name === "tokenImplementation"
                ? A.KeelToken
                : parsed.name === "factory"
                  ? A.KeelFactory
                  : parsed.name === "paused"
                    ? paused
                    : parsed.name === "allowance"
                      ? allowance
                      : parsed.name === "approve"
                        ? true
                        : parsed.name === "swapExactInput"
                          ? parseUnits("4")
                          : parsed.name === "launch"
                            ? A.KeelToken
                            : parsed.name === "claimable" ||
                                parsed.name === "claim"
                              ? claimable
                              : undefined;
  assert.notEqual(value, undefined, `Unexpected view method ${parsed.name}`);
  return abi.encodeFunctionResult(parsed.name, [value]);
}

globalThis.fetch = async (_url, init) => {
  const request = JSON.parse(init.body);
  publicMethods.push(request.method);
  // Explicit allowlist guarantees this harness cannot broadcast to a public RPC.
  assert.ok(
    ["eth_chainId", "eth_getCode", "eth_call"].includes(request.method),
  );
  let result;
  if (request.method === "eth_chainId") result = "0x1";
  if (request.method === "eth_call") result = localCall(request.params[0]);
  if (request.method === "eth_getCode") {
    const name =
      Object.keys(artifacts).find(
        (name) => A[name].toLowerCase() === request.params[0].toLowerCase(),
      ) ?? "KeelToken";
    result = corruptCode ? "0x01" : artifacts[name].deployedBytecode.object;
  }
  return Response.json({ jsonrpc: "2.0", id: request.id, result });
};

globalThis.ethereum = {
  request: async ({ method, params = [] }) => {
    calls.push({ method, params });
    if (method === "eth_requestAccounts" && rejectAccounts)
      throw { code: 4001, message: "User rejected account access" };
    if (method === "eth_requestAccounts" || method === "eth_accounts")
      return [walletAddress];
    if (method === "eth_chainId") return "0x1";
    if (method === "eth_blockNumber") return mockBlock;
    if (method === "eth_call") return localCall(params[0]);
    if (method === "eth_estimateGas") return "0x186a0";
    if (method === "eth_getTransactionCount") return `0x${nonce.toString(16)}`;
    if (method === "eth_sendTransaction") {
      if (rejectSend)
        throw { code: 4001, message: "User rejected transaction" };
      const submitted = params[0];
      const decoded = abiFor(submitted.to).parseTransaction({
        data: submitted.data,
      });
      const hash = id(`local-confirmed-transaction-${++nonce}`);
      accepted.push({
        ...submitted,
        name: decoded.name,
        args: decoded.args,
        hash,
      });
      transactions.set(hash, {
        ...submitted,
        hash,
        blockNumber: mockBlock,
        blockHash,
        transactionIndex: "0x0",
        nonce: `0x${nonce.toString(16)}`,
        type: "0x0",
        gas: "0x186a0",
        gasPrice: "0x1",
        value: "0x0",
        input: submitted.data,
        chainId: "0x1",
        // Encoded response fields only: this is not a signed raw transaction.
        r: `0x${"01".repeat(32)}`,
        s: `0x${"01".repeat(32)}`,
        v: "0x25",
      });
      if (decoded.name === "approve") allowance = decoded.args[1];
      return hash;
    }
    if (method === "eth_getTransactionByHash")
      return transactions.get(params[0]) ?? null;
    if (method === "eth_getTransactionReceipt") {
      const transaction = transactions.get(params[0]);
      if (!transaction) return null;
      return {
        transactionHash: transaction.hash,
        transactionIndex: "0x0",
        blockHash,
        blockNumber: mockBlock,
        from: walletAddress,
        to: transaction.to,
        contractAddress: null,
        gasUsed: "0x100",
        cumulativeGasUsed: "0x100",
        effectiveGasPrice: "0x1",
        logs: [],
        logsBloom: `0x${"0".repeat(512)}`,
        status: receiptStatus,
        type: "0x0",
      };
    }
    throw new Error(`Unexpected mock wallet method: ${method}`);
  },
};

let passed = 0;
function reset() {
  allowance = 0n;
  balance = parseUnits("100");
  creatorBps = 3700;
  paused = false;
  claimable = 5n;
  rejectAccounts = false;
  rejectSend = false;
  revertMethod = "";
  receiptStatus = "0x1";
  accepted = [];
  calls = [];
}
async function test(name, body) {
  reset();
  await body();
  passed++;
  console.log(`PASS ${name}`);
}
const deadline = Math.floor(Date.now() / 1000) + 3600;
const trade = {
  token: A.KeelToken,
  side: "buy",
  amount: "1.25",
  minimumOut: "3.5",
  deadline,
};
const launch = {
  name: "Local wallet check",
  symbol: "CHECK",
  jobRef: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  image: "https://example.com/test.png",
  description: "Local fixture only.",
  links: {},
  creatorPercent: 37,
  permit: {
    projectRef: "11111111-2222-3333-4444-555555555555",
    startTick: -100000,
    deadline,
    signature: "0x1234",
  },
};

try {
  await chain.verifyDeployment(true);
  await chain.connectWallet(chain.getWalletChoices()[0]);
  await test("Buy approves exactly the input, then submits protected router calldata", async () => {
    const statuses = [];
    const hash = await chain.executeTrade(trade, (message) =>
      statuses.push(message),
    );
    assert.deepEqual(
      accepted.map((tx) => tx.name),
      ["approve", "swapExactInput"],
    );
    const approval = accepted[0];
    assert.equal(approval.to.toLowerCase(), A.IMD);
    assert.equal(approval.args[0].toLowerCase(), A.KeelRouter);
    assert.equal(approval.args[1], parseUnits("1.25"));
    const swap = accepted[1];
    assert.equal(swap.to.toLowerCase(), A.KeelRouter);
    assert.deepEqual(
      Array.from(swap.args).map((value) =>
        typeof value === "string" ? value.toLowerCase() : value,
      ),
      [
        A.IMD,
        A.KeelToken,
        parseUnits("1.25"),
        parseUnits("3.5"),
        BigInt(deadline),
        walletAddress.toLowerCase(),
      ],
    );
    assert.equal(hash, swap.hash);
    assert.ok(statuses.includes("Approval confirmed."));
    assert.equal(statuses.at(-1), "Trade confirmed.");
    for (const tx of accepted)
      assert.ok(
        calls.findIndex(
          (call) => call.method === "eth_call" && call.name === tx.name,
        ) <
          calls.findIndex(
            (call) =>
              call.method === "eth_sendTransaction" &&
              call.params[0].data === tx.data,
          ),
      );
  });
  await test("Sell with sufficient allowance skips approval and reverses the pair", async () => {
    allowance = parseUnits("100");
    await chain.executeTrade({ ...trade, side: "sell" });
    assert.equal(accepted.length, 1);
    assert.equal(accepted[0].args[0].toLowerCase(), A.KeelToken);
    assert.equal(accepted[0].args[1].toLowerCase(), A.IMD);
  });
  await test("Deadline expiring during approval blocks the swap", async () => {
    const actualNow = Date.now;
    try {
      await assert.rejects(
        () =>
          chain.executeTrade(trade, (message) => {
            if (message === "Approval confirmed.")
              Date.now = () => (deadline + 1) * 1000;
          }),
        /deadline expired during approval/,
      );
      assert.deepEqual(
        accepted.map((tx) => tx.name),
        ["approve"],
      );
      assert.ok(!calls.some((call) => call.name === "swapExactInput"));
    } finally {
      Date.now = actualNow;
    }
  });
  await test("Rejected account access reaches the app as cancellation with no send", async () => {
    rejectAccounts = true;
    await assert.rejects(
      () => chain.executeTrade(trade),
      (error) => {
        assert.equal(chain.errorMessage(error), "Wallet request declined.");
        assert.match(appErrorMessage(error), /cancelled in your wallet/);
        return true;
      },
    );
    assert.equal(accepted.length, 0);
    assert.equal(
      calls.filter((call) => call.method === "eth_sendTransaction").length,
      0,
    );
  });
  await test("Rejected approval cannot proceed to a swap or claim success", async () => {
    rejectSend = true;
    const statuses = [];
    await assert.rejects(
      () => chain.executeTrade(trade, (message) => statuses.push(message)),
      (error) => {
        assert.equal(error.code, "ACTION_REJECTED");
        assert.equal(chain.errorMessage(error), "Wallet request declined.");
        assert.match(appErrorMessage(error), /cancelled in your wallet/);
        return true;
      },
    );
    assert.equal(accepted.length, 0);
    assert.equal(
      calls.filter((call) => call.method === "eth_sendTransaction").length,
      1,
    );
    assert.ok(!calls.some((call) => call.name === "swapExactInput"));
    assert.ok(!statuses.some((message) => message.includes("confirmed")));
  });
  await test("Router simulation failure blocks send with the contract error", async () => {
    allowance = parseUnits("100");
    revertMethod = "swapExactInput";
    await assert.rejects(
      () => chain.executeTrade(trade),
      (error) => {
        assert.match(chain.errorMessage(error), /Slippage/);
        assert.match(appErrorMessage(error), /minimum|quote/i);
        return true;
      },
    );
    assert.equal(accepted.length, 0);
    assert.equal(
      calls.filter((call) => call.method === "eth_sendTransaction").length,
      0,
    );
  });
  await test("Paused launch is rejected before simulation or send", async () => {
    paused = true;
    await assert.rejects(() => chain.launchToken(launch), /Launches open soon/);
    assert.equal(accepted.length, 0);
    assert.ok(!calls.some((call) => call.name === "launch"));
  });
  await test("Launch passes the signed fields, share basis points and JSON metadata", async () => {
    const hash = await chain.launchToken(launch);
    assert.equal(accepted.length, 1);
    const tx = accepted[0];
    assert.equal(hash, tx.hash);
    assert.equal(tx.to.toLowerCase(), A.KeelFactory);
    assert.equal(tx.name, "launch");
    assert.deepEqual(Array.from(tx.args).slice(0, 8), [
      launch.name,
      launch.symbol,
      launch.jobRef,
      launch.permit.projectRef,
      3700n,
      -100000n,
      BigInt(deadline),
      launch.permit.signature,
    ]);
    assert.deepEqual(JSON.parse(tx.args[8]), {
      description: launch.description,
      image: launch.image,
      links: {},
    });
  });
  await test("Invalid launch signature stops at simulation without a transaction", async () => {
    revertMethod = "launch";
    await assert.rejects(
      () => chain.launchToken(launch),
      (error) => {
        assert.match(chain.errorMessage(error), /InvalidSignature/);
        assert.match(appErrorMessage(error), /permit|signature/i);
        return true;
      },
    );
    assert.equal(accepted.length, 0);
  });
  await test("Zero claimable amount prevents claim simulation and send", async () => {
    claimable = 0n;
    await assert.rejects(
      () => chain.claimToken(A.KeelToken),
      /no IMD to claim/,
    );
    assert.equal(accepted.length, 0);
    assert.ok(!calls.some((call) => call.name === "claim"));
    const claimRead = calls.find((call) => call.name === "claimable");
    assert.equal(claimRead.args[0].toLowerCase(), A.KeelToken);
    assert.equal(claimRead.args[1], walletAddress);
  });
  await test("Eligible claim targets the vault and the selected token", async () => {
    const hash = await chain.claimToken(A.KeelToken);
    assert.equal(accepted.length, 1);
    assert.equal(accepted[0].to.toLowerCase(), A.KeelVault);
    assert.equal(accepted[0].name, "claim");
    assert.equal(accepted[0].args[0].toLowerCase(), A.KeelToken);
    assert.equal(hash, accepted[0].hash);
  });
  await test("Reverted receipt surfaces failure and never announces confirmation", async () => {
    receiptStatus = "0x0";
    const statuses = [];
    await assert.rejects(
      () => chain.claimToken(A.KeelToken, (message) => statuses.push(message)),
      (error) => {
        assert.equal(error.code, "CALL_EXCEPTION");
        assert.match(appErrorMessage(error), /reverted/i);
        return true;
      },
    );
    assert.ok(!statuses.includes("Claim confirmed."));
  });
  await test("Insufficient IMD and token balances block approve and swap", async () => {
    balance = 0n;
    for (const side of ["buy", "sell"]) {
      await assert.rejects(
        () => chain.executeTrade({ ...trade, side }),
        new RegExp(side === "buy" ? "Not enough IMD" : "Not enough CHECK"),
      );
    }
    assert.equal(accepted.length, 0);
    assert.ok(!calls.some((call) => call.name === "approve"));
  });
  await test("Creator claim and lower share simulate before sending", async () => {
    await chain.claimCreator(A.KeelToken);
    await chain.lowerCreatorShare(A.KeelToken, 2000);
    assert.deepEqual(
      accepted.map((tx) => tx.name),
      ["claimCreator", "lowerCreatorShare"],
    );
    assert.equal(accepted[1].args[1], 2000n);
    for (const tx of accepted)
      assert.ok(
        calls.findIndex((call) => call.name === tx.name) <
          calls.findIndex(
            (call) =>
              call.method === "eth_sendTransaction" &&
              call.params[0].data === tx.data,
          ),
      );
  });
  await test("Equal, higher and invalid creator shares are rejected before simulation", async () => {
    for (const share of [3700, 3701, -1, 2.5, NaN])
      await assert.rejects(
        () => chain.lowerCreatorShare(A.KeelToken, share),
        /below your current/,
      );
    assert.equal(accepted.length, 0);
    assert.ok(!calls.some((call) => call.name === "lowerCreatorShare"));
  });
  await test("The selected provider handles writes even when window.ethereum changes", async () => {
    const original = globalThis.ethereum;
    globalThis.ethereum = {
      request: () => {
        throw new Error("Wrong wallet used");
      },
    };
    try {
      await chain.claimCreator(A.KeelToken);
      assert.equal(accepted.length, 1);
    } finally {
      globalThis.ethereum = original;
    }
  });
  await test("A failed deployment recheck clears trust and prevents wallet access", async () => {
    corruptCode = true;
    await assert.rejects(() => chain.verifyDeployment(true), /does not match/);
    await assert.rejects(() => chain.executeTrade(trade), /does not match/);
    assert.equal(accepted.length, 0);
    assert.equal(
      calls.filter((call) => call.method === "eth_requestAccounts").length,
      0,
    );
    corruptCode = false;
  });
  assert.ok(
    publicMethods.every(
      (method) =>
        method !== "eth_sendTransaction" && method !== "eth_sendRawTransaction",
    ),
  );
  console.log(
    `${passed} wallet integration checks passed. No network requests, keys or broadcasts.`,
  );
} finally {
  globalThis.fetch = originalFetch;
  delete globalThis.ethereum;
}
