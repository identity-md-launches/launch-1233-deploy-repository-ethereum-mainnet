export type TradeSide = "buy" | "sell";

export interface Run {
  jobRef: string;
  commit: string;
  amount: bigint;
  timestamp: number;
  blockNumber: number;
  transactionHash: string;
  /** Job references emitted by the verifier are hashes, not reversible UUIDs. */
  jobUrl?: string;
}

export interface Pulse {
  value: number;
  percent: number;
  lastRunAt: number | null;
  runs7d: number;
  total: number;
}

export interface Token {
  address: string;
  creator: string;
  name: string;
  symbol: string;
  jobRef: string;
  projectRef: string;
  poolId: string;
  image?: string;
  description: string;
  links: Array<{ label: string; url: string }>;
  launchedAt: number;
  launchBlock: number;
  status: "building" | "closed";
  creatorBps: number;
  creatorActive: boolean;
  basket: bigint;
  creatorAccrued: bigint;
  priceImd: number | null;
  imdInPool: bigint | null;
  fdvImd: number | null;
  priceError?: string;
  supply: bigint;
  pendingFees: bigint;
  runs: Run[];
  pulse: Pulse;
  closeNotice: number;
  earliestClose: number | null;
  snapshotBlock: number;
  closeBlock: number;
  poolAtClose: bigint;
  circulating: bigint;
  totalClaimed: bigint;
}

export interface MarketData {
  tokens: Token[];
  paused: boolean;
  blockNumber: number;
  timestamp: number;
  verified: boolean;
  verificationError?: string;
  runPrice: bigint;
  launches: number;
  buildsShipped: number;
  imdInBaskets: bigint;
  livePools: number;
  imdInPools: bigint | null;
  fees: { total: bigint; team: bigint; creators: bigint; baskets: bigint };
  repaid: bigint;
  lastRunAt: number | null;
}

export interface HolderState {
  claimable: bigint;
  tokenBalance: bigint;
  imdBalance: bigint;
  claimed: boolean;
}

export interface LaunchPermit {
  projectRef: string;
  startTick: number;
  deadline: number;
  signature: string;
}

export interface LaunchInput {
  name: string;
  symbol: string;
  jobRef: string;
  image: string;
  description: string;
  links: LaunchLinks;
  creatorPercent: number;
  permit: LaunchPermit;
}

export interface TradeQuote {
  token: string;
  side: TradeSide;
  amountIn: bigint;
  amountOut: bigint;
  quotedAt: number;
  blockNumber: number;
}

export interface TradeInput {
  token: string;
  side: TradeSide;
  amount: string;
  minimumOut: string;
  /** Absolute Unix timestamp, shown before wallet confirmation. */
  deadline: number;
}

export type TransactionStatus = (message: string) => void;

export type LaunchLinks = Partial<Record<"website" | "x" | "telegram", string>>;
