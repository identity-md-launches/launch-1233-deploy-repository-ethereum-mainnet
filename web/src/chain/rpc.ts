import { config } from "../config";

interface RpcEnvelope<T> {
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}
export interface ChainLog {
  address: string;
  blockNumber: string;
  blockHash: string;
  data: string;
  topics: string[];
  transactionHash: string;
  logIndex: string;
  removed?: boolean;
}

let nextId = 0;
let preferred = 0;

export class RpcError extends Error {
  data?: unknown;
  constructor(message: string, data?: unknown) {
    super(message);
    this.name = "RpcError";
    this.data = data;
  }
}

/** Every public read has a bounded timeout and a second independent RPC. */
export async function rpc<T>(
  method: string,
  params: unknown[] = [],
): Promise<T> {
  let reason = "";
  const startingEndpoint = preferred;
  for (let attempt = 0; attempt < config.rpcUrls.length; attempt++) {
    const index = (startingEndpoint + attempt) % config.rpcUrls.length;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(config.rpcUrls[index], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++nextId, method, params }),
        signal: controller.signal,
      });
      let body: RpcEnvelope<T>;
      try {
        body = (await response.json()) as RpcEnvelope<T>;
      } catch {
        throw new Error(`RPC HTTP ${response.status}: unreadable response`);
      }
      // Some providers report log-range limits with HTTP 400. Preserve their
      // message so scanLogs can shrink the window instead of failing the page.
      if (!response.ok)
        throw new Error(body.error?.message || `RPC HTTP ${response.status}`);
      if (body.error) {
        // Contract reverts are valid responses, not an unavailable endpoint.
        if (
          body.error.code === 3 ||
          /execution reverted/i.test(body.error.message)
        ) {
          throw new RpcError(body.error.message, body.error.data);
        }
        throw new Error(body.error.message);
      }
      if (body.result === undefined) throw new Error("RPC returned no result");
      preferred = index;
      return body.result;
    } catch (error) {
      if (error instanceof RpcError) throw error;
      reason = error instanceof Error ? error.message : "Unavailable";
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(`Ethereum RPC unavailable. Retry shortly. (${reason})`);
}

export const blockHex = (block: number) => `0x${block.toString(16)}`;

/** Scan bounded windows, shrinking for providers with restrictive log limits. */
export async function scanLogs(
  address: string,
  topics: Array<string | string[] | null>,
  from: number,
  to: number,
): Promise<ChainLog[]> {
  const all: ChainLog[] = [];
  let cursor = from;
  let window = 20_000;
  while (cursor <= to) {
    const end = Math.min(to, cursor + window - 1);
    try {
      const logs = await rpc<ChainLog[]>("eth_getLogs", [
        {
          address,
          topics,
          fromBlock: blockHex(cursor),
          toBlock: blockHex(end),
        },
      ]);
      all.push(...logs.filter((log) => !log.removed));
      cursor = end + 1;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "";
      if (
        window <= 100 ||
        !/range|limit|too many|response size|query returned|more than|exceed/i.test(
          reason,
        )
      )
        throw error;
      window = Math.max(100, Math.floor(window / 4));
    }
  }
  return all;
}

export async function mapLimit<T, U>(
  items: T[],
  maximum: number,
  fn: (item: T) => Promise<U>,
): Promise<U[]> {
  const values = new Array<U>(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const position = cursor++;
      values[position] = await fn(items[position]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(maximum, items.length) }, worker),
  );
  return values;
}
