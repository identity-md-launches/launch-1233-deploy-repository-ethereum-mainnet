import { useCallback, useEffect, useRef, useState } from "react";
import Island from "./Island";
import {
  loadMarket,
  connectWallet,
  getWalletAddress,
  subscribeWallet,
} from "./chain";
import type { MarketData } from "./chain/types";
import { config, addressUrl } from "./config";
import { Icon, Logo, shortAddress } from "./components";
import { Market } from "./Market";
import { Launch } from "./Launch";
import { TokenPage } from "./TokenPage";
import { HowItWorks } from "./HowItWorks";

export type PageProps = {
  data: MarketData | null;
  loading: boolean;
  error: string;
  refresh: () => void;
  address: string | null;
  connect: () => Promise<void>;
};
export function errorMessage(error: unknown): string {
  const item = error as {
    code?: string | number;
    reason?: string;
    shortMessage?: string;
    message?: string;
  };
  if (item?.code === "ACTION_REJECTED" || item?.code === 4001)
    return "Request cancelled in your wallet. You can try again.";
  const reason = item?.reason || item?.shortMessage || item?.message || "";
  const contractErrors: Record<string, string> = {
    InvalidSignature:
      "This launch permit does not match your wallet or launch details. Paste a matching permit.",
    Paused: "Launches open soon. The factory is currently paused.",
    CreatorHasBuildingToken:
      "This wallet already has a building token. It must close before another launch.",
    JobAlreadyLaunched:
      "This IMD job already has a token. Use a new eligible job.",
    NotConfigured: "Launch setup is not complete. Try again later.",
    Expired:
      "The deadline has expired. Request a fresh quote or launch permit.",
    Slippage:
      "The pool moved beyond your minimum output. Get a fresh quote and review it.",
    NothingToClaim:
      "This wallet has no unclaimed IMD. Refresh the token to check again.",
  };
  const errorName = reason.match(/\b([A-Z][A-Za-z]+)\(/)?.[1];
  if (errorName && contractErrors[errorName]) return contractErrors[errorName];
  return (
    item?.reason ||
    item?.shortMessage ||
    item?.message ||
    "Unable to complete this request. Please try again."
  ).slice(0, 240);
}
function currentRoute() {
  return window.location.hash.slice(1) || "/";
}
export default function App() {
  const [route, setRoute] = useState(currentRoute);
  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [address, setAddress] = useState<string | null>(null);
  const [walletError, setWalletError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const fetching = useRef(false);
  const content = useRef<HTMLElement>(null);
  const refresh = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    setLoading(true);
    setError("");
    try {
      setData(await loadMarket());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
      fetching.current = false;
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    const onHash = () => {
      setRoute(currentRoute());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const initialRoute = useRef(true);
  useEffect(() => {
    if (initialRoute.current) {
      initialRoute.current = false;
      return;
    }
    content.current?.focus({ preventScroll: true });
  }, [route]);
  useEffect(() => {
    void getWalletAddress()
      .then(setAddress)
      .catch(() => {});
    return subscribeWallet((nextAddress) => {
      setAddress(nextAddress);
      setWalletError("");
    });
  }, []);
  async function connect() {
    setWalletError("");
    setConnecting(true);
    try {
      setAddress(await connectWallet());
    } catch (e) {
      setWalletError(errorMessage(e));
    } finally {
      setConnecting(false);
    }
  }
  const props: PageProps = { data, loading, error, refresh, address, connect };
  const island = route === "/" || route === "/island";
  const active = route.startsWith("/token/") ? "/market" : route;
  useEffect(() => {
    document.title = `${island ? "The island" : route === "/launch" ? "Launch a token" : route === "/how" ? "How it works" : route.startsWith("/token/") ? "Token" : "Market"} · Keel`;
  }, [route, island]);
  if (island)
    return (
      <Island
        onEnter={() => {
          window.location.hash = "/market";
        }}
      />
    );
  return (
    <div className="site-shell">
      <a
        className="skip-content"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          content.current?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="site-header">
        <a href="#/market" className="logo-link" aria-label="Keel market">
          <Logo />
        </a>
        <nav aria-label="Main navigation">
          <a
            className={active === "/market" ? "active" : ""}
            aria-current={active === "/market" ? "page" : undefined}
            href="#/market"
          >
            Market
          </a>
          <a
            className={active === "/launch" ? "active" : ""}
            aria-current={active === "/launch" ? "page" : undefined}
            href="#/launch"
          >
            Launch
          </a>
          <a
            className={active === "/how" ? "active" : ""}
            aria-current={active === "/how" ? "page" : undefined}
            href="#/how"
          >
            How it works
          </a>
        </nav>
        <div className="header-actions">
          <a className="island-link" href="#/island">
            ← Island
          </a>
          <button
            className="button wallet-button"
            onClick={connect}
            disabled={connecting}
            title={address || undefined}
          >
            <Icon name="wallet" />
            {connecting
              ? "Connecting…"
              : address
                ? shortAddress(address)
                : "Connect"}
          </button>
        </div>
      </header>
      {walletError && (
        <div className="wallet-notice" role="alert">
          <span>{walletError}</span>
          <button
            aria-label="Dismiss wallet message"
            onClick={() => setWalletError("")}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
      <main
        id="main-content"
        ref={content}
        tabIndex={-1}
        className="main-content"
      >
        {route === "/market" ? (
          <Market {...props} />
        ) : route === "/launch" ? (
          <Launch {...props} />
        ) : route === "/how" ? (
          <HowItWorks />
        ) : route.startsWith("/token/") ? (
          <TokenPage {...props} tokenAddress={route.split("/")[2]} />
        ) : (
          <div className="empty-state card">
            <h1>Page not found.</h1>
            <a className="button primary" href="#/market">
              Explore market <Icon name="arrow" />
            </a>
          </div>
        )}
      </main>
      <footer className="site-footer">
        <div className="footer-brand">
          <Logo />
          <span className="muted small">Built on IMD</span>
          <span className="muted tiny">not operated by IMD</span>
        </div>
        <div className="footer-center">
          <span className="eyebrow">FROM IDEAS TO BUILDS</span>
          <a href="#/island">
            back to the island <span>↗</span>
          </a>
        </div>
        <div className="footer-links">
          <span className="eyebrow">ON ETHEREUM</span>
          <div>
            {(
              [
                "KeelVault",
                "KeelFactory",
                "KeelHook",
                "KeelRouter",
                "KeelToken",
                "IMD",
              ] as const
            ).map((name) => (
              <a
                key={name}
                href={addressUrl(config.addresses[name])}
                target="_blank"
                rel="noreferrer"
              >
                {name.replace("Keel", "")} <Icon name="external" size={12} />
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
