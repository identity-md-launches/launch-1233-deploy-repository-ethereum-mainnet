import { useState } from "react";
import { formatUnits } from "ethers";
import type { PageProps } from "./App";
import type { Token } from "./chain/types";
import {
  Avatar,
  Chip,
  ErrorNotice,
  Icon,
  Leaves,
  number,
  Pulse,
} from "./components";

export function Market({ data, error, loading, refresh }: PageProps) {
  const [tab, setTab] = useState("New");
  const [query, setQuery] = useState("");
  const [paused, setPaused] = useState(false);
  const tokens = (data?.tokens || [])
    .filter(
      (t) =>
        (tab === "New" || t.status === tab.toLowerCase()) &&
        `${t.name} ${t.symbol} ${t.address}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => b.launchedAt - a.launchedAt);
  return (
    <>
      <section className="hero card" aria-labelledby="hero-heading">
        <div className="hero-image" />
        <Leaves paused={paused} />
        <div className="hero-content">
          <span className="built-pill">
            <svg
              className="imd-symbol"
              aria-hidden="true"
              width="13"
              height="13"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M8 0v16M0 8h16M2.3 2.3l11.4 11.4M2.3 13.7 13.7 2.3" />
            </svg>{" "}
            Built on IMD <span className="pill-line" />
          </span>
          <h1 id="hero-heading" className="chrome-text">
            Every trade
            <br />
            ships code.
          </h1>
          <p>Tokens that turn trading into building.</p>
          <div className="hero-actions">
            <a href="#/launch" className="button primary">
              Launch a token <Icon name="arrow" />
            </a>
            <a
              href="#market"
              onClick={(e) => {
                e.preventDefault();
                document
                  .getElementById("market")
                  ?.scrollIntoView({ behavior: "instant" });
              }}
              className="button ghost"
            >
              Explore market <Icon name="arrow" />
            </a>
          </div>
        </div>
        <div className="hero-index mono" aria-hidden="true">
          KEEL / 001
          <br />
          <span>THE BUILD ECONOMY</span>
        </div>
        <button
          className="motion-button"
          aria-label={paused ? "Play falling leaves" : "Pause falling leaves"}
          aria-pressed={paused}
          onClick={() => setPaused(!paused)}
        >
          <Icon name={paused ? "play" : "pause"} size={14} />
        </button>
        <div className="hero-stats">
          <div>
            <span className="stat-value">
              {data ? number(data.launches, 0) : "—"}
            </span>
            <span>Launches</span>
          </div>
          <div>
            <span className="stat-value">
              {data ? number(data.buildsShipped, 0) : "—"}
            </span>
            <span>Builds shipped</span>
          </div>
          <div>
            <span className="stat-value">
              {data ? number(Number(formatUnits(data.imdInBaskets)), 2) : "—"}
            </span>
            <span>IMD in baskets</span>
          </div>
          <div className="hero-stats-note">
            <span className="status-dot" /> Read from Ethereum
          </div>
        </div>
      </section>
      <section
        id="market"
        className="market-section"
        aria-labelledby="market-heading"
      >
        <div className="section-title">
          <div>
            <span className="eyebrow">BACK THE NEXT BUILD</span>
            <h2 id="market-heading">
              The market
              <span className="count">{data ? data.tokens.length : "—"}</span>
            </h2>
          </div>
          <div className="chain-indicator">
            <span className="status-dot" />
            {error
              ? "Connection interrupted"
              : loading
                ? "Reading Ethereum…"
                : `Block ${data?.blockNumber.toLocaleString()}`}
            <button
              className={`icon-button ${loading ? "loading" : ""}`}
              onClick={refresh}
              disabled={loading}
              aria-label="Refresh market"
            >
              <Icon name="refresh" size={15} />
            </button>
          </div>
        </div>
        <div className="market-controls">
          <div className="filter-tabs" role="group" aria-label="Filter tokens">
            {["New", "Building", "Closed"].map((t) => (
              <button
                key={t}
                aria-pressed={tab === t}
                className={tab === t ? "selected" : ""}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <label className="search-field">
            <Icon name="search" />
            <input
              aria-label="Search tokens"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, ticker or address"
            />
          </label>
        </div>
        {error && (
          <ErrorNotice retry={refresh}>
            Unable to read Ethereum.{" "}
            {data ? "Showing the last loaded snapshot. " : ""}
            {error}
          </ErrorNotice>
        )}
        {!data && loading ? (
          <div className="empty-state card" role="status">
            <div className="loading-orbit" />
            <h3>Reading the chain.</h3>
            <p>Finding launches and verified builds.</p>
          </div>
        ) : !data ? (
          <div className="empty-state card">
            <Icon name="cube" size={40} />
            <h3>Market unavailable.</h3>
            <p>Retry when the public RPC is reachable.</p>
            <button className="button" onClick={refresh}>
              Retry connection <Icon name="refresh" />
            </button>
          </div>
        ) : data.tokens.length === 0 ? (
          <div className="empty-state card">
            <div className="empty-orbit" aria-hidden="true">
              <span />
              <Icon name="cube" size={34} />
              <span />
            </div>
            <span className="eyebrow">THE FIRST CHAPTER</span>
            <h3>No launches yet. Launches open soon.</h3>
            <p>Good things start with a build.</p>
            <a href="#/launch" className="button">
              Explore the launch form <Icon name="arrow" />
            </a>
            <div className="empty-corners" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </div>
          </div>
        ) : tokens.length === 0 ? (
          <div className="empty-state card">
            <h3>No matching tokens.</h3>
            <p>
              {query
                ? `No results for “${query}”.`
                : `No ${tab.toLowerCase()} tokens yet.`}
            </p>
            <button
              className="button"
              onClick={() => {
                setQuery("");
                setTab("New");
              }}
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="token-grid">
            {tokens.map((t) => (
              <TokenCard key={t.address} token={t} timestamp={data.timestamp} />
            ))}
          </div>
        )}
        <p className="market-count muted tiny" role="status">
          {data && data.tokens.length > 0
            ? `${tokens.length} ${tokens.length === 1 ? "token" : "tokens"} shown · Values in IMD`
            : "Locked liquidity. Verified work. On Ethereum."}
        </p>
      </section>
      <a className="learn-strip card" href="#/how">
        <span className="learn-icon">
          <Icon name="code" size={24} />
        </span>
        <span>
          <strong>Built to keep building.</strong>
          <span className="muted small">
            See how a trade becomes a verified build.
          </span>
        </span>
        <span className="learn-cta">
          How it works <Icon name="arrow" />
        </span>
      </a>
    </>
  );
}
function TokenCard({
  token: t,
  timestamp,
}: {
  token: Token;
  timestamp: number;
}) {
  return (
    <article className="token-card card">
      <div className="token-card-head">
        <Avatar image={t.image} symbol={t.symbol} />
        <div>
          <h3>
            <a href={`#/token/${t.address}`}>{t.name}</a>
          </h3>
          <span className="ticker mono">${t.symbol}</span>
        </div>
        <Chip live={t.status === "building"}>
          {t.status === "closed" ? "Closed" : "Building"}
        </Chip>
      </div>
      <div className="token-prices">
        <div>
          <span className="muted tiny">Price · IMD</span>
          <strong className="mono">{number(t.priceImd, 6)}</strong>
        </div>
        <div>
          <span className="muted tiny">Market cap · IMD</span>
          <strong className="mono">{number(t.marketCapImd, 2)}</strong>
        </div>
      </div>
      {t.priceError && (
        <span className="tiny muted">Pool price unavailable</span>
      )}
      <Pulse {...t.pulse} timestamp={timestamp} />
      <div className="token-card-actions">
        <a className="button primary" href={`#/token/${t.address}?buy`}>
          Buy <Icon name="arrow" size={16} />
        </a>
        <a className="button ghost" href={`#/token/${t.address}`}>
          Details
        </a>
      </div>
    </article>
  );
}
