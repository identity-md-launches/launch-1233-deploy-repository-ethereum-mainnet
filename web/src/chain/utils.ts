import { formatUnits, parseUnits } from "ethers";
import { config } from "../config";
import type {
  LaunchLinks,
  LaunchInput,
  LaunchPermit,
  Pulse,
  Run,
} from "./types";

export const WEEK = 7 * 86400;
export const MONTH = 30 * 86400;
export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function buildPulse(runs: Pick<Run, "timestamp">[], now: number): Pulse {
  const value = runs.reduce(
    (sum, run) => sum + 2 ** (-Math.max(0, now - run.timestamp) / WEEK),
    0,
  );
  return {
    value,
    percent: Math.min(100, (value / 20) * 100),
    lastRunAt: runs.length
      ? runs.reduce((last, run) => Math.max(last, run.timestamp), 0)
      : null,
    runs7d: runs.filter((run) => now - run.timestamp <= WEEK).length,
    total: runs.length,
  };
}

export function formatAmount(amount: bigint, digits = 4): string {
  const text = formatUnits(amount, 18);
  const [integer, fraction = ""] = text.split(".");
  const decimal = fraction.slice(0, digits).replace(/0+$/, "");
  if (amount > 0n && integer === "0" && !decimal)
    return `<0.${"0".repeat(digits - 1)}1`;
  return `${BigInt(integer).toLocaleString("en-US")}${decimal ? `.${decimal}` : ""}`;
}

export function parseAmount(value: string): bigint {
  if (!/^\d+(\.\d{1,18})?$/.test(value.trim()))
    throw new Error("Enter an amount with up to 18 decimal places.");
  const amount = parseUnits(value.trim(), 18);
  if (amount <= 0n || amount > (1n << 127n) - 1n)
    throw new Error(
      "Enter an amount greater than zero and within the router limit.",
    );
  return amount;
}

export function safeUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password)
      return url.href;
    if (
      url.protocol === "ipfs:" &&
      /^ipfs:\/\/[a-zA-Z0-9]+(?:\/[^\s]*)?$/.test(value)
    ) {
      return `${config.ipfsGateway.replace(/\/?$/, "/")}${value.slice(7)}`;
    }
  } catch {
    /* Untrusted metadata is rendered as plain text only. */
  }
  return undefined;
}

export function parseMetadata(raw: string): {
  description: string;
  image?: string;
  links: Array<{ label: string; url: string }>;
} {
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const links =
      data.links && typeof data.links === "object"
        ? Object.entries(data.links)
        : [];
    return {
      description: typeof data.description === "string" ? data.description : "",
      image: safeUrl(data.image) ? String(data.image) : undefined,
      links: links.flatMap(([label, value]) => {
        const url = safeUrl(value);
        return url
          ? [
              {
                label: /^\d+$/.test(label) ? new URL(url).hostname : label,
                url,
              },
            ]
          : [];
      }),
    };
  } catch {
    return { description: "", links: [] };
  }
}

export function parseLaunchPermit(raw: string): LaunchPermit {
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("Paste a valid launch permit JSON response.");
  }
  if (!value || typeof value !== "object")
    throw new Error("Paste a launch permit object.");
  const permit: LaunchPermit = {
    projectRef: String(value.projectRef ?? ""),
    startTick: Number(value.startTick),
    deadline: Number(value.deadline),
    signature: String(value.signature ?? ""),
  };
  validatePermit(permit);
  return permit;
}

export function validatePermit(permit: LaunchPermit): void {
  if (!UUID.test(permit.projectRef))
    throw new Error("The permit needs a lowercase project UUID.");
  if (
    !Number.isInteger(permit.startTick) ||
    permit.startTick < -887200 ||
    permit.startTick >= 887000
  )
    throw new Error("The permit start tick is outside the contract range.");
  if (
    !Number.isSafeInteger(permit.deadline) ||
    permit.deadline <= Math.floor(Date.now() / 1000)
  )
    throw new Error("The launch permit has expired.");
  if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(permit.signature))
    throw new Error("The permit signature must be nonempty hex bytes.");
}

export function launchArguments(
  input: LaunchInput,
): [string, string, string, string, number, number, number, string, string] {
  const byteLength = (value: string) => new TextEncoder().encode(value).length;
  if (!input.name.trim() || byteLength(input.name) > 128)
    throw new Error("Name must contain 1–128 UTF-8 bytes.");
  if (!input.symbol.trim() || byteLength(input.symbol) > 32)
    throw new Error("Ticker must contain 1–32 UTF-8 bytes.");
  if (!UUID.test(input.jobRef))
    throw new Error("Enter the lowercase IMD job UUID.");
  if (
    !Number.isInteger(input.creatorPercent) ||
    input.creatorPercent < 0 ||
    input.creatorPercent > 80
  )
    throw new Error("Your share must be 0–80%.");
  if (!safeUrl(input.image))
    throw new Error("Choose an image or enter an HTTPS or IPFS image link.");
  if (!input.description.trim()) throw new Error("Add a short description.");
  const links = cleanLaunchLinks(input.links);
  validatePermit(input.permit);
  const metadata = JSON.stringify({
    description: input.description,
    image: input.image,
    links,
  });
  if (byteLength(metadata) > 1024)
    throw new Error(
      "Image, description and links must fit in 1,024 UTF-8 bytes.",
    );
  return [
    input.name,
    input.symbol,
    input.jobRef,
    input.permit.projectRef,
    input.creatorPercent * 100,
    input.permit.startTick,
    input.permit.deadline,
    input.permit.signature,
    metadata,
  ];
}

export function validateLaunchInput(input: LaunchInput): void {
  launchArguments(input);
}

export function errorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const value = error as {
      code?: string | number;
      shortMessage?: string;
      reason?: string;
      message?: string;
    };
    if (value.code === 4001 || value.code === "ACTION_REJECTED")
      return "Wallet request declined.";
    return (
      value.reason ||
      value.shortMessage ||
      value.message ||
      "Request failed. Try again."
    );
  }
  return typeof error === "string" ? error : "Request failed. Try again.";
}

export const linkLabels = {
  website: "Website",
  x: "X",
  telegram: "Telegram",
} as const;
export function linkError(key: keyof LaunchLinks, value: string): string {
  if (!value.trim()) return "";
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password)
      throw new Error();
    const host = url.hostname.toLowerCase();
    if (
      key === "x" &&
      !["x.com", "twitter.com", "www.x.com", "www.twitter.com"].includes(host)
    )
      return "Use an HTTPS link on x.com or twitter.com.";
    if (key === "telegram" && host !== "t.me")
      return "Use an HTTPS link on t.me.";
    return "";
  } catch {
    return `${linkLabels[key]} must use a valid HTTPS link.`;
  }
}
export function cleanLaunchLinks(links: LaunchLinks): LaunchLinks {
  const result: LaunchLinks = {};
  for (const key of Object.keys(linkLabels) as (keyof LaunchLinks)[]) {
    const value = links[key]?.trim();
    if (!value) continue;
    const error = linkError(key, value);
    if (error) throw new Error(error);
    result[key] = value;
  }
  return result;
}
