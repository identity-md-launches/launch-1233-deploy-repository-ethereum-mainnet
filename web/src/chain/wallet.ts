import { getAddress } from "ethers";
import { config } from "../config";

export interface InjectedProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}
export interface WalletChoice {
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: InjectedProvider;
}

const wallets = new Map<string, WalletChoice>();
const discoveryListeners = new Set<() => void>();
const accountListeners = new Set<(address: string | null) => void>();
let selected: WalletChoice | null = null;
let started = false;
let releaseProvider = () => {};
let connectionVersion = 0;
const LAST = "keel.wallet.last";
const CONNECTED = "keel.wallet.connected";
function stored(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Private browsing still works. */
  }
}
export const lastWalletChoice = () => stored(LAST);
export const selectedWallet = () => selected;

export function getWalletChoices(): WalletChoice[] {
  if (wallets.size) return [...wallets.values()];
  const provider = (
    globalThis as typeof globalThis & { ethereum?: InjectedProvider }
  ).ethereum;
  return provider?.request
    ? [
        {
          info: {
            uuid: "injected",
            rdns: "injected",
            name: "Browser wallet",
            icon: "",
          },
          provider,
        },
      ]
    : [];
}

function activate(choice: WalletChoice | null) {
  releaseProvider();
  selected = choice;
  const update = () => {
    void getWalletAddress()
      .then((address) => {
        if (selected === choice) accountListeners.forEach((fn) => fn(address));
      })
      .catch(() => {
        if (selected === choice) accountListeners.forEach((fn) => fn(null));
      });
  };
  const disconnected = () => disconnectWallet();
  choice?.provider.on?.("accountsChanged", update);
  choice?.provider.on?.("chainChanged", update);
  choice?.provider.on?.("disconnect", disconnected);
  releaseProvider = () => {
    choice?.provider.removeListener?.("accountsChanged", update);
    choice?.provider.removeListener?.("chainChanged", update);
    choice?.provider.removeListener?.("disconnect", disconnected);
  };
  update();
}

export function discoverWallets() {
  if (typeof window === "undefined") return;
  if (!started) {
    started = true;
    // Keep listening for late injections throughout this page's lifetime (EIP-6963).
    window.addEventListener("eip6963:announceProvider", (event) => {
      const detail = (event as CustomEvent<WalletChoice>).detail;
      if (
        !detail?.provider?.request ||
        !detail.info ||
        ![
          detail.info.uuid,
          detail.info.name,
          detail.info.icon,
          detail.info.rdns,
        ].every((value) => typeof value === "string") ||
        !detail.info.uuid
      )
        return;
      if (wallets.has(detail.info.uuid)) return;
      const choice = { info: { ...detail.info }, provider: detail.provider };
      wallets.set(choice.info.uuid, choice);
      if (
        !selected &&
        stored(CONNECTED) === "true" &&
        stored(LAST) === choice.info.rdns
      )
        activate(choice);
      discoveryListeners.forEach((fn) => fn());
    });
  }
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  if (
    !selected &&
    stored(CONNECTED) === "true" &&
    stored(LAST) === "injected"
  ) {
    const fallback = getWalletChoices().find(
      (choice) => choice.info.uuid === "injected",
    );
    if (fallback) activate(fallback);
  }
  discoveryListeners.forEach((fn) => fn());
}

export function subscribeDiscovery(callback: () => void) {
  discoveryListeners.add(callback);
  discoverWallets();
  return () => {
    discoveryListeners.delete(callback);
  };
}
export function subscribeWallet(callback: (address: string | null) => void) {
  accountListeners.add(callback);
  return () => {
    accountListeners.delete(callback);
  };
}
export async function getWalletAddress(): Promise<string | null> {
  const choice = selected;
  if (!choice) return null;
  const accounts = (await choice.provider.request({
    method: "eth_accounts",
  })) as string[];
  return selected === choice && accounts[0] ? getAddress(accounts[0]) : null;
}

export async function connectWallet(choice = selected): Promise<string> {
  if (!choice) throw new Error("Choose a wallet to connect.");
  const version = ++connectionVersion;
  const accounts = (await choice.provider.request({
    method: "eth_requestAccounts",
  })) as string[];
  if (!accounts[0]) throw new Error("No wallet account was selected.");
  const chainId = Number(
    await choice.provider.request({ method: "eth_chainId" }),
  );
  if (chainId !== config.chainId)
    await choice.provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x1" }],
    });
  if (
    Number(await choice.provider.request({ method: "eth_chainId" })) !==
    config.chainId
  )
    throw new Error("Switch your wallet to Ethereum mainnet.");
  if (version !== connectionVersion)
    throw new Error("Wallet connection changed. Connect again.");
  // Read again after switching: some wallets change accounts during the request.
  const current = (await choice.provider.request({
    method: "eth_accounts",
  })) as string[];
  if (version !== connectionVersion || !current[0])
    throw new Error("Wallet connection changed. Connect again.");
  remember(LAST, choice.info.rdns);
  remember(CONNECTED, "true");
  activate(choice);
  const address = getAddress(current[0]);
  accountListeners.forEach((fn) => fn(address));
  return address;
}

export function disconnectWallet() {
  connectionVersion++;
  remember(CONNECTED, "false");
  activate(null);
  accountListeners.forEach((fn) => fn(null));
}
