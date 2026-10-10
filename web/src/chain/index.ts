import {
  BrowserProvider,
  Contract,
  Interface,
  formatUnits,
  id,
  isAddress,
  keccak256,
} from "ethers";
import { connectWallet, selectedWallet } from "./wallet";
import { poolImdBalance } from "./pool";
export * from "./wallet";
import factoryAbi from "../abi/KeelFactory.json";
import vaultAbi from "../abi/KeelVault.json";
import routerAbi from "../abi/KeelRouter.json";
import tokenAbi from "../abi/KeelToken.json";
import hookAbi from "../abi/KeelHook.json";
import fingerprints from "../abi/runtime-fingerprints.json";
import { config, jobUrl } from "../config";
import { blockHex, mapLimit, rpc, scanLogs, type ChainLog } from "./rpc";
import {
  buildPulse,
  errorMessage,
  launchArguments,
  MONTH,
  parseAmount,
  parseMetadata,
  WEEK,
} from "./utils";
import type {
  HolderState,
  LaunchInput,
  MarketData,
  Run,
  Token,
  TradeInput,
  TradeQuote,
  TradeSide,
  TransactionStatus,
} from "./types";

export * from "./types";
export * from "./utils";

const interfaces = {
  factory: new Interface(factoryAbi),
  vault: new Interface(vaultAbi),
  router: new Interface(routerAbi),
  token: new Interface(tokenAbi),
  hook: new Interface(hookAbi),
  state: new Interface([
    "function getPositionInfo(bytes32 poolId,address owner,int24 tickLower,int24 tickUpper,bytes32 salt) view returns (uint128 liquidity,uint256 feeGrowthInside0LastX128,uint256 feeGrowthInside1LastX128)",
    "function getFeeGrowthInside(bytes32 poolId,int24 tickLower,int24 tickUpper) view returns (uint256 feeGrowthInside0X128,uint256 feeGrowthInside1X128)",
    "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96,int24 tick,uint24 protocolFee,uint24 lpFee)",
  ]),
};
const A = config.addresses;

async function read(
  address: string,
  abi: Interface,
  method: string,
  args: unknown[] = [],
  block: number | "latest" = "latest",
) {
  const result = await rpc<string>("eth_call", [
    { to: address, data: abi.encodeFunctionData(method, args) },
    block === "latest" ? block : blockHex(block),
  ]);
  return abi.decodeFunctionResult(method, result);
}

let verifiedAt = 0;
let verificationInFlight: Promise<void> | null = null;

/** Compare runtime bytecode to the pinned source, masking only Solidity immutable slots. */
export async function verifyDeployment(force = false): Promise<void> {
  if (!force && Date.now() - verifiedAt < 300_000) return;
  if (verificationInFlight) return verificationInFlight;
  verificationInFlight = (async () => {
    const chain = Number(await rpc<string>("eth_chainId"));
    if (chain !== config.chainId)
      throw new Error("The RPC is not on Ethereum mainnet.");
    await mapLimit(
      Object.entries(fingerprints),
      3,
      async ([name, fingerprint]) => {
        const address = A[name as keyof typeof A];
        if (!address) throw new Error("Unknown deployment contract.");
        let code = (await rpc<string>("eth_getCode", [address, "latest"]))
          .slice(2)
          .toLowerCase();
        if (code.length !== fingerprint.bytes * 2)
          throw new Error(
            `${name} deployed code does not match the pinned source.`,
          );
        for (const slot of fingerprint.immutableReferences) {
          code =
            code.slice(0, slot.start * 2) +
            "0".repeat(slot.length * 2) +
            code.slice((slot.start + slot.length) * 2);
        }
        if (keccak256(`0x${code}`) !== fingerprint.normalizedKeccak)
          throw new Error(
            `${name} deployed code does not match the pinned source.`,
          );
      },
    );
    const [
      hook,
      vault,
      implementation,
      routerFactory,
      hookFactory,
      hookVault,
      imdCode,
    ] = await Promise.all([
      read(A.KeelFactory, interfaces.factory, "hook"),
      read(A.KeelFactory, interfaces.factory, "vault"),
      read(A.KeelFactory, interfaces.factory, "tokenImplementation"),
      read(A.KeelRouter, interfaces.router, "factory"),
      read(A.KeelHook, interfaces.hook, "factory"),
      read(A.KeelHook, interfaces.hook, "vault"),
      rpc<string>("eth_getCode", [A.IMD, "latest"]),
    ]);
    const same = (a: unknown, b: string) =>
      String(a).toLowerCase() === b.toLowerCase();
    if (
      !same(hook[0], A.KeelHook) ||
      !same(vault[0], A.KeelVault) ||
      !same(implementation[0], A.KeelToken) ||
      !same(routerFactory[0], A.KeelFactory) ||
      !same(hookFactory[0], A.KeelFactory) ||
      !same(hookVault[0], A.KeelVault) ||
      imdCode === "0x"
    )
      throw new Error("Deployment wiring did not match the pinned handoff.");
    verifiedAt = Date.now();
  })();
  try {
    await verificationInFlight;
  } catch (error) {
    verifiedAt = 0;
    throw error;
  } finally {
    verificationInFlight = null;
  }
}

let cachedEvents: {
  block: number;
  launches: ChainLog[];
  runs: ChainLog[];
  accounting: ChainLog[];
} | null = null;
const timestamps = new Map<string, number>();

async function eventTimestamp(log: ChainLog): Promise<number> {
  const known = timestamps.get(log.blockHash);
  if (known !== undefined) return known;
  const block = await rpc<{ timestamp: string } | null>("eth_getBlockByHash", [
    log.blockHash,
    false,
  ]);
  if (!block)
    throw new Error(
      "A chain reorganization changed the event history. Refresh to retry.",
    );
  const timestamp = Number(block.timestamp);
  timestamps.set(log.blockHash, timestamp);
  return timestamp;
}

async function loadEvents(block: number) {
  const prior =
    cachedEvents && cachedEvents.block <= block ? cachedEvents : null;
  const from = prior
    ? Math.max(config.deploymentBlock, prior.block - 12)
    : config.deploymentBlock;
  const [launches, runs, accounting] = await Promise.all([
    scanLogs(
      A.KeelFactory,
      [interfaces.factory.getEvent("Launched")!.topicHash],
      from,
      block,
    ),
    scanLogs(
      A.KeelVault,
      [interfaces.vault.getEvent("RunVerified")!.topicHash],
      from,
      block,
    ),
    scanLogs(
      A.KeelVault,
      [
        ["FeeAccrued", "Reimbursed", "Closed"].map(
          (name) => interfaces.vault.getEvent(name)!.topicHash,
        ),
      ],
      from,
      block,
    ),
  ]);
  const keep = (logs: ChainLog[]) =>
    logs.filter((log) => Number(log.blockNumber) < from);
  const result = {
    block,
    launches: [...keep(prior?.launches ?? []), ...launches],
    runs: [...keep(prior?.runs ?? []), ...runs],
    accounting: [...keep(prior?.accounting ?? []), ...accounting],
  };
  cachedEvents = result;
  return result;
}

export async function loadMarket(): Promise<MarketData> {
  const chainId = Number(await rpc<string>("eth_chainId"));
  if (chainId !== config.chainId)
    throw new Error("The RPC is not on Ethereum mainnet.");
  const head = await rpc<{ number: string; timestamp: string } | null>(
    "eth_getBlockByNumber",
    ["latest", false],
  );
  if (!head) throw new Error("The latest Ethereum block is unavailable.");
  const blockNumber = Number(head.number);
  const timestamp = Number(head.timestamp);
  if (blockNumber < config.deploymentBlock)
    throw new Error("RPC is behind the Keel deployment. Try again shortly.");
  const [events, pause, runPriceValue, verification] = await Promise.all([
    loadEvents(blockNumber),
    read(A.KeelFactory, interfaces.factory, "paused", [], blockNumber),
    read(A.KeelVault, interfaces.vault, "runPrice", [], blockNumber),
    verifyDeployment()
      .then(() => ({ verified: true, verificationError: undefined }))
      .catch((error) => ({
        verified: false,
        verificationError: errorMessage(error),
      })),
  ]);
  const knownJobs = new Map(
    events.launches.map((log) => {
      const event = interfaces.factory.parseLog(log)!;
      return [id(event.args.jobRef), String(event.args.jobRef)];
    }),
  );
  const runs = await mapLimit(events.runs, 6, async (log) => {
    const decoded = interfaces.vault.parseLog(log)!;
    const run: Run = {
      jobRef: decoded.args.jobRef,
      commit: decoded.args.commit,
      amount: BigInt(decoded.args.amount),
      blockNumber: Number(log.blockNumber),
      transactionHash: log.transactionHash,
      timestamp: await eventTimestamp(log),
      jobUrl: knownJobs.has(decoded.args.jobRef)
        ? jobUrl(knownJobs.get(decoded.args.jobRef)!)
        : undefined,
    };
    return { token: String(decoded.args.token).toLowerCase(), run };
  });
  const tokens = await mapLimit(events.launches, 4, async (log) => {
    const event = interfaces.factory.parseLog(log)!;
    const address = String(event.args.token);
    const [project, supply, pending] = await Promise.all([
      read(A.KeelVault, interfaces.vault, "project", [address], blockNumber),
      read(address, interfaces.token, "totalSupply", [], blockNumber),
      read(A.KeelHook, interfaces.hook, "pending", [address], blockNumber),
    ]);
    const p = project[0];
    let priceImd: number | null = null;
    let priceError: string | undefined;
    let imdInPool: bigint | null = null;
    try {
      const slot = await read(
        A.StateView,
        interfaces.state,
        "getSlot0",
        [event.args.poolId],
        blockNumber,
      );
      const sqrt = Number(slot[0]);
      if (sqrt === 0) throw new Error("Pool is not initialized.");
      priceImd = (sqrt / 2 ** 96) ** 2;
      const lower = Number(event.args.lowerTick);
      const [position, growth] = await Promise.all([
        read(
          A.StateView,
          interfaces.state,
          "getPositionInfo",
          [
            event.args.poolId,
            A.KeelFactory,
            lower,
            887200,
            "0x" + "00".repeat(32),
          ],
          blockNumber,
        ),
        read(
          A.StateView,
          interfaces.state,
          "getFeeGrowthInside",
          [event.args.poolId, lower, 887200],
          blockNumber,
        ),
      ]);
      imdInPool = poolImdBalance(
        BigInt(slot[0]),
        lower,
        BigInt(position[0]),
        BigInt(growth[1]),
        BigInt(position[2]),
      );
    } catch (error) {
      if (priceImd === null) priceError = errorMessage(error);
    }
    const tokenRuns = runs
      .filter((run) => run.token === address.toLowerCase())
      .map((run) => run.run)
      .sort((a, b) => b.blockNumber - a.blockNumber);
    const closeNotice = Number(p.closeNotice);
    const launchedAt = Number(p.launchedAt);
    const token: Token = {
      address,
      name: event.args.name,
      symbol: event.args.symbol,
      creator: p.creator,
      jobRef: event.args.jobRef,
      projectRef: event.args.projectRef,
      poolId: event.args.poolId,
      ...parseMetadata(event.args.metadata),
      launchedAt,
      launchBlock: Number(log.blockNumber),
      status: Number(p.phase) === 1 ? "closed" : "building",
      creatorBps: Number(p.creatorBps),
      creatorActive: Boolean(p.creatorActive),
      basket: BigInt(p.basket),
      creatorAccrued: BigInt(p.creatorAccrued),
      priceImd,
      imdInPool,
      priceError,
      supply: BigInt(supply[0]),
      fdvImd:
        priceImd === null
          ? null
          : priceImd * Number(formatUnits(supply[0], 18)),
      pendingFees: BigInt(pending[0]),
      runs: tokenRuns,
      pulse: buildPulse(tokenRuns, timestamp),
      closeNotice,
      earliestClose: closeNotice
        ? Math.max(closeNotice + WEEK, launchedAt + MONTH)
        : null,
      snapshotBlock: Number(p.snapshotBlock),
      closeBlock: Number(p.closeBlock),
      poolAtClose: BigInt(p.poolAtClose),
      circulating: BigInt(p.circulating),
      totalClaimed: BigInt(p.totalClaimed),
    };
    return token;
  });
  const fees = { total: 0n, team: 0n, creators: 0n, baskets: 0n };
  let repaid = 0n;
  let closed = 0;
  for (const log of events.accounting) {
    const event = interfaces.vault.parseLog(log)!;
    if (event.name === "FeeAccrued") {
      fees.total += BigInt(event.args.amount);
      fees.team += BigInt(event.args.team);
      fees.creators += BigInt(event.args.creator);
      fees.baskets += BigInt(event.args.basket);
    } else if (event.name === "Reimbursed") repaid += BigInt(event.args.amount);
    else if (event.name === "Closed") closed++;
  }
  return {
    fees,
    repaid,
    lastRunAt: runs.length
      ? runs.reduce((latest, { run }) => Math.max(latest, run.timestamp), 0)
      : null,
    livePools: events.launches.length - closed,
    imdInPools: tokens.some((token) => token.imdInPool === null)
      ? null
      : tokens.reduce((sum, token) => sum + token.imdInPool!, 0n),
    tokens: tokens.sort((a, b) => b.launchBlock - a.launchBlock),
    paused: Boolean(pause[0]),
    blockNumber,
    timestamp,
    ...verification,
    runPrice: BigInt(runPriceValue[0]),
    launches: tokens.length,
    buildsShipped: runs.length,
    imdInBaskets: tokens.reduce((sum, token) => sum + token.basket, 0n),
  };
}

export async function getHolderState(
  token: string,
  address: string,
): Promise<HolderState> {
  if (!isAddress(token) || !isAddress(address))
    throw new Error("Invalid token or wallet address.");
  const [claimable, balance, imd, claimed] = await Promise.all([
    read(A.KeelVault, interfaces.vault, "claimable", [token, address]),
    read(token, interfaces.token, "balanceOf", [address]),
    read(A.IMD, interfaces.token, "balanceOf", [address]),
    read(A.KeelVault, interfaces.vault, "claimed", [token, address]),
  ]);
  return {
    claimable: BigInt(claimable[0]),
    tokenBalance: BigInt(balance[0]),
    imdBalance: BigInt(imd[0]),
    claimed: Boolean(claimed[0]),
  };
}

export async function quoteTrade(
  token: string,
  side: TradeSide,
  amount: string,
): Promise<TradeQuote> {
  if (!isAddress(token)) throw new Error("Invalid token address.");
  const amountIn = parseAmount(amount);
  const blockNumber = Number(await rpc<string>("eth_blockNumber"));
  const [tokenIn, tokenOut] = side === "buy" ? [A.IMD, token] : [token, A.IMD];
  const result = await read(
    A.KeelRouter,
    interfaces.router,
    "quoteExactInput",
    [tokenIn, tokenOut, amountIn],
    blockNumber,
  );
  return {
    token,
    side,
    amountIn,
    amountOut: BigInt(result[0]),
    quotedAt: Date.now(),
    blockNumber,
  };
}

async function signer() {
  await verifyDeployment();
  const choice = selectedWallet();
  const address = await connectWallet(choice);
  if (!choice || selectedWallet() !== choice)
    throw new Error("Wallet connection changed. Connect again.");
  const provider = new BrowserProvider(choice.provider);
  return { signer: await provider.getSigner(address), address };
}

async function confirmed(
  tx: { hash: string; wait: () => Promise<{ status: number | null } | null> },
  status: TransactionStatus,
  label: string,
): Promise<string> {
  status(`${label} submitted. Waiting for confirmation…`);
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1)
    throw new Error(`${label} did not confirm successfully.`);
  status(`${label} confirmed.`);
  return tx.hash;
}

export async function executeTrade(
  input: TradeInput,
  status: TransactionStatus = () => {},
): Promise<string> {
  if (!isAddress(input.token)) throw new Error("Invalid token address.");
  const amountIn = parseAmount(input.amount);
  const minimumOut = parseAmount(input.minimumOut);
  if (
    !Number.isSafeInteger(input.deadline) ||
    input.deadline <= Math.floor(Date.now() / 1000)
  )
    throw new Error("The trade deadline has expired. Request a new quote.");
  const [tokenIn, tokenOut] =
    input.side === "buy" ? [A.IMD, input.token] : [input.token, A.IMD];
  status("Checking Ethereum deployment…");
  const wallet = await signer();
  const source = new Contract(tokenIn, tokenAbi, wallet.signer);
  const balance = BigInt(await source.balanceOf(wallet.address));
  if (balance < amountIn) {
    const symbol = input.side === "buy" ? "IMD" : String(await source.symbol());
    throw new Error(`Not enough ${symbol}`);
  }
  const allowance = BigInt(
    await source.allowance(wallet.address, A.KeelRouter),
  );
  if (allowance < amountIn) {
    status("Approve the exact input amount in your wallet.");
    await source.approve.staticCall(A.KeelRouter, amountIn);
    await confirmed(
      await source.approve(A.KeelRouter, amountIn),
      status,
      "Approval",
    );
  }
  if (input.deadline <= Math.floor(Date.now() / 1000))
    throw new Error(
      "The trade deadline expired during approval. Request a new quote.",
    );
  const router = new Contract(A.KeelRouter, routerAbi, wallet.signer);
  const args = [
    tokenIn,
    tokenOut,
    amountIn,
    minimumOut,
    input.deadline,
    wallet.address,
  ];
  status("Simulating the trade…");
  await router.swapExactInput.staticCall(...args);
  status("Confirm the trade in your wallet.");
  return confirmed(await router.swapExactInput(...args), status, "Trade");
}

export async function launchToken(
  input: LaunchInput,
  status: TransactionStatus = () => {},
): Promise<string> {
  const args = launchArguments(input);
  status("Checking Ethereum deployment…");
  const wallet = await signer();
  const factory = new Contract(A.KeelFactory, factoryAbi, wallet.signer);
  if (await factory.paused()) throw new Error("Launches open soon.");
  status("Checking your launch permit…");
  await factory.launch.staticCall(...args);
  status("Confirm the launch in your wallet.");
  return confirmed(await factory.launch(...args), status, "Launch");
}

export async function claimToken(
  token: string,
  status: TransactionStatus = () => {},
): Promise<string> {
  if (!isAddress(token)) throw new Error("Invalid token address.");
  status("Checking Ethereum deployment…");
  const wallet = await signer();
  const vault = new Contract(A.KeelVault, vaultAbi, wallet.signer);
  if (BigInt(await vault.claimable(token, wallet.address)) <= 0n)
    throw new Error("There is no IMD to claim for this wallet.");
  await vault.claim.staticCall(token);
  status("Confirm the claim in your wallet.");
  return confirmed(await vault.claim(token), status, "Claim");
}

export async function claimCreator(
  token: string,
  status: TransactionStatus = () => {},
): Promise<string> {
  if (!isAddress(token)) throw new Error("Invalid token address.");
  const wallet = await signer();
  const vault = new Contract(A.KeelVault, vaultAbi, wallet.signer);
  status("Simulating your creator claim…");
  await vault.claimCreator.staticCall(token);
  status("Confirm the creator claim in your wallet.");
  return confirmed(await vault.claimCreator(token), status, "Creator claim");
}

export async function lowerCreatorShare(
  token: string,
  newBps: number,
  status: TransactionStatus = () => {},
): Promise<string> {
  if (!isAddress(token)) throw new Error("Invalid token address.");
  const wallet = await signer();
  const vault = new Contract(A.KeelVault, vaultAbi, wallet.signer);
  const project = await vault.project(token);
  if (String(project.creator).toLowerCase() !== wallet.address.toLowerCase())
    throw new Error("Connect the creator's wallet.");
  if (
    !Number.isInteger(newBps) ||
    newBps < 0 ||
    newBps >= Number(project.creatorBps)
  )
    throw new Error("Choose a share below your current share.");
  status("Simulating your lower share…");
  await vault.lowerCreatorShare.staticCall(token, newBps);
  status("Confirm the lower share in your wallet. This cannot be undone.");
  return confirmed(
    await vault.lowerCreatorShare(token, newBps),
    status,
    "Lower share",
  );
}
