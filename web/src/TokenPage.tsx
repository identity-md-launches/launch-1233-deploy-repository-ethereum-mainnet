import { useEffect, useRef, useState, type FormEvent } from "react";
import { formatUnits, id, parseUnits } from "ethers";
import {
  claimToken,
  claimCreator,
  lowerCreatorShare,
  executeTrade,
  getHolderState,
  quoteTrade,
  linkLabels,
} from "./chain";
import type {
  HolderState,
  Run,
  Token,
  TradeQuote,
  TradeSide,
} from "./chain/types";
import { errorMessage, type PageProps } from "./App";
import { addressUrl, config, jobUrl, txUrl } from "./config";
import {
  Avatar,
  Chip,
  ErrorNotice,
  Icon,
  number,
  Pulse,
  shortAddress,
} from "./components";

export function TokenPage(props: PageProps & { tokenAddress: string }) {
  const { data, loading, error, refresh, address, connect } = props;
  const tokenAddress = props.tokenAddress.split("?")[0];
  const token = data?.tokens.find(
    (t) => t.address.toLowerCase() === tokenAddress.toLowerCase(),
  );
  const [holder, setHolder] = useState<HolderState | null>(null);
  const [holderError, setHolderError] = useState("");
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimStatus, setClaimStatus] = useState("");
  const [claimHash, setClaimHash] = useState("");
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    let cancelled = false;
    setHolder(null);
    setHolderError("");
    if (address && token)
      getHolderState(token.address, address)
        .then((state) => {
          if (!cancelled) setHolder(state);
        })
        .catch((e) => {
          if (!cancelled) setHolderError(errorMessage(e));
        });
    return () => {
      cancelled = true;
    };
  }, [address, token?.address, data?.blockNumber]);
  async function claim() {
    if (!address) {
      await connect();
      return;
    }
    if (!token) return;
    setClaimBusy(true);
    setHolderError("");
    setClaimHash("");
    try {
      const hash = await claimToken(token.address, setClaimStatus);
      setClaimHash(hash);
      setClaimStatus("Claim confirmed.");
      refresh();
    } catch (e) {
      setHolderError(errorMessage(e));
      setClaimStatus("");
    } finally {
      setClaimBusy(false);
    }
  }
  if (!token)
    return (
      <div className="token-missing card">
        <a href="#/market" className="back-link">
          ← Market
        </a>
        <h1>
          {loading
            ? "Reading this token…"
            : data
              ? "Token not found."
              : "Token unavailable."}
        </h1>
        {error && <ErrorNotice retry={refresh}>{error}</ErrorNotice>}
        <p className="muted">
          {data && !loading
            ? "This address is not in the loaded Keel launch events."
            : "Fetching verified launch events from Ethereum."}
        </p>
        <button className="button" onClick={refresh} disabled={loading}>
          Refresh <Icon name="refresh" />
        </button>
      </div>
    );
  const t = token;
  const creatorShare = t.creatorActive ? t.creatorBps / 100 : 0;
  const left =
    t.earliestClose == null ? null : Math.max(0, t.earliestClose - now);
  return (
    <>
      <a href="#/market" className="back-link">
        ← Market
      </a>
      <div className="token-page-heading">
        <Avatar image={t.image} symbol={t.symbol} size="avatar-large" />
        <div>
          <div className="token-heading-line">
            <h1>{t.name}</h1>
            <Chip live={t.status === "building"}>
              {t.status === "closed" ? "Closed" : "Building"}
            </Chip>
          </div>
          <span className="mono muted">${t.symbol}</span>
          <a
            href={addressUrl(t.address)}
            target="_blank"
            rel="noreferrer"
            className="token-address mono"
          >
            {shortAddress(t.address)} <Icon name="external" size={12} />
          </a>
        </div>
        <div className="token-current-price">
          <span className="eyebrow">PRICE IN IMD</span>
          <strong className="mono">{number(t.priceImd, 8)}</strong>
          <span className="muted small">FDV {number(t.fdvImd, 2)} IMD</span>
        </div>
      </div>
      {error && (
        <ErrorNotice retry={refresh}>
          Showing the last loaded snapshot. {error}
        </ErrorNotice>
      )}
      {t.priceError && (
        <ErrorNotice retry={refresh}>
          Pool price is unavailable. Refresh to retry.
        </ErrorNotice>
      )}
      <div className="token-layout">
        <div className="token-overview">
          <section className="card token-about">
            <span className="eyebrow">THE PROJECT</span>
            <h2>Made to move forward.</h2>
            {t.description && <p>{t.description}</p>}
            <div className="project-links">
              <a href={jobUrl(t.jobRef)} target="_blank" rel="noreferrer">
                Launch job <Icon name="external" size={13} />
              </a>
              {t.links.map((link, i) => (
                <a
                  key={`${link.url}-${i}`}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Icon
                    name={link.label in linkLabels ? link.label : "website"}
                    size={16}
                  />{" "}
                  {linkLabels[link.label as keyof typeof linkLabels] ||
                    link.label}{" "}
                  <Icon name="external" size={13} />
                </a>
              ))}
            </div>
          </section>
          <section className="card basket-card">
            <div className="panel-heading">
              <h2>The basket</h2>
              <Icon name="cube" />
            </div>
            <strong className="basket-value mono">
              {number(Number(formatUnits(t.basket)), 4)} <span>IMD</span>
            </strong>
            <p className="muted small">
              {t.status === "closed"
                ? "Remaining holder allocations."
                : "Funds the next verified continuation."}
            </p>
            <div className="basket-details">
              <div>
                <span>Current run price</span>
                <strong className="mono">
                  {number(Number(formatUnits(data!.runPrice)), 4)} IMD
                </strong>
              </div>
              <div>
                <span>Fees awaiting distribution</span>
                <strong className="mono">
                  {number(Number(formatUnits(t.pendingFees)), 4)} IMD
                </strong>
              </div>
            </div>
          </section>
          <section className="card build-card">
            <div className="panel-heading">
              <h2>Build pulse</h2>
              <Chip>{t.pulse.value < 0.5 ? "Quiet" : "Building"}</Chip>
            </div>
            <Pulse {...t.pulse} timestamp={now} />
            <p className="mono tiny muted">
              {t.pulse.lastRunAt
                ? `last build ${Math.max(0, Math.floor((now - t.pulse.lastRunAt) / 3600))} h ago`
                : "No builds yet"}
              , {t.pulse.runs7d} in 7 days, {t.pulse.total} total
            </p>
            <p className="field-hint">
              +1 per run. Halves every 7 days. Full at 20.
            </p>
            <h3 className="run-feed-title">
              Verified runs <span className="count">{t.runs.length}</span>
            </h3>
            {t.runs.length ? (
              <ol className="run-feed">
                {t.runs.map((run) => (
                  <RunRow
                    key={`${run.transactionHash}-${run.jobRef}`}
                    run={run}
                  />
                ))}
              </ol>
            ) : (
              <div className="run-empty">
                <Icon name="code" />
                <span>No verified builds yet.</span>
              </div>
            )}
          </section>
          <section className="card close-card">
            <div className="panel-heading">
              <h2>Close & claim</h2>
              <Chip>
                {t.status === "closed"
                  ? "Closed"
                  : t.closeNotice
                    ? "Notice active"
                    : "No notice"}
              </Chip>
            </div>
            {t.status === "closed" ? (
              <p>The basket is fixed. Eligible holders can claim once.</p>
            ) : t.closeNotice ? (
              <>
                <span className="eyebrow">EARLIEST TEAM CLOSE</span>
                <strong className="countdown mono">
                  {left === 0
                    ? "Ready for team close"
                    : `${Math.floor(left! / 86400)}d ${Math.floor((left! % 86400) / 3600)}h ${Math.floor((left! % 3600) / 60)}m ${left! % 60}s`}
                </strong>
                <p className="small muted">
                  {new Date(t.earliestClose! * 1000).toLocaleString()} · The
                  team chooses when to close.
                </p>
                <div className="notice">
                  <Icon name="info" />
                  <span>
                    Your claim uses the lower of your balances at the notice and
                    at close.
                  </span>
                </div>
              </>
            ) : (
              <p>
                Only the team closes, after a 7-day notice and at least 30 days
                from launch.
              </p>
            )}
            {t.status === "closed" && (
              <>
                <div className="claim-row">
                  <span>Your claim</span>
                  <strong className="mono">
                    {holder
                      ? number(Number(formatUnits(holder.claimable)), 6)
                      : "—"}{" "}
                    IMD
                  </strong>
                </div>
                {holder?.claimed && (
                  <p className="small muted">
                    This wallet has already claimed.
                  </p>
                )}
                <button
                  className="button primary"
                  onClick={claim}
                  disabled={
                    claimBusy ||
                    (!!address && (!holder || holder.claimable === 0n)) ||
                    !data?.verified ||
                    !!error
                  }
                >
                  {claimBusy
                    ? "Confirming claim…"
                    : !address
                      ? "Connect to claim"
                      : holder?.claimed
                        ? "Already claimed"
                        : holder?.claimable === 0n
                          ? "No claim available"
                          : "Claim IMD"}
                  <Icon name="arrow" />
                </button>
                <div className="transaction-status" role="status">
                  {claimStatus}
                  {claimHash && (
                    <a href={txUrl(claimHash)} target="_blank" rel="noreferrer">
                      View transaction <Icon name="external" size={13} />
                    </a>
                  )}
                </div>
              </>
            )}
            {holderError && (
              <ErrorNotice retry={refresh}>{holderError}</ErrorNotice>
            )}
            <p className="field-hint">
              Claims use the smaller balance at both snapshots. Rounding
              leftovers stay in the contract.{" "}
              <a href="#/how">Read the mechanics.</a>
            </p>
          </section>
        </div>
        <aside className="trade-aside">
          <Trade
            key={t.address}
            token={t}
            holder={holder}
            buyRequested={props.tokenAddress.includes("?buy")}
            {...props}
          />
          {address?.toLowerCase() === t.creator.toLowerCase() && (
            <CreatorPanel
              key={`${t.address}-${address}`}
              token={t}
              {...props}
            />
          )}
          <section className="card fee-card">
            <div className="panel-heading">
              <h2>Trade fee</h2>
              <span className="mono">1%</span>
            </div>
            <p className="muted small">
              Collected in IMD. Split on distribution.
            </p>
            <dl className="detail-list">
              <div>
                <dt>Team</dt>
                <dd className="mono">{10}%</dd>
              </div>
              <div>
                <dt>Creator</dt>
                <dd className="mono">
                  {t.status === "closed" ? 90 : creatorShare}%
                </dd>
              </div>
              <div>
                <dt>Basket</dt>
                <dd className="mono">
                  {t.status === "closed" ? 0 : 90 - creatorShare}%
                </dd>
              </div>
            </dl>
            <div className="creator-line">
              <span>Creator {t.creatorActive ? "active" : "inactive"}</span>
              <a
                className="mono"
                href={addressUrl(t.creator)}
                target="_blank"
                rel="noreferrer"
              >
                {shortAddress(t.creator)} <Icon name="external" size={12} />
              </a>
            </div>
          </section>
          <div className="chain-footnote small muted">
            <span className="status-dot" /> Ethereum · Block{" "}
            {data!.blockNumber.toLocaleString()}
            <button
              className="text-button"
              onClick={refresh}
              disabled={loading}
            >
              Refresh <Icon name="refresh" size={13} />
            </button>
          </div>
        </aside>
      </div>
    </>
  );
}
function Trade({
  token,
  holder,
  address,
  connect,
  data,
  error,
  refresh,
  buyRequested,
}: PageProps & {
  token: Token;
  holder: HolderState | null;
  buyRequested: boolean;
}) {
  const [side, setSide] = useState<TradeSide>("buy");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState("1");
  const [minutes, setMinutes] = useState("20");
  const [minimum, setMinimum] = useState("");
  const [quote, setQuote] = useState<TradeQuote | null>(null);
  const [deadline, setDeadline] = useState(0);
  const [busy, setBusy] = useState(false);
  const [tradeError, setTradeError] = useState("");
  const [balanceRejected, setBalanceRejected] = useState(false);
  const [status, setStatus] = useState("");
  const [hash, setHash] = useState("");
  const [clock, setClock] = useState(Date.now());
  const amountInput = useRef<HTMLInputElement>(null);
  const card = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!buyRequested) return;
    setSide("buy");
    const frame = requestAnimationFrame(() => {
      card.current?.scrollIntoView({ behavior: "instant", block: "start" });
      amountInput.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [buyRequested, token.address]);
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setQuote(null);
    setBalanceRejected(false);
    setMinimum("");
    setTradeError("");
    setHash("");
    setStatus("");
  }, [side, amount, slippage, minutes, token.address, address]);
  useEffect(() => {
    const tick = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);
  useEffect(() => setBalanceRejected(false), [holder]);
  const expired =
    !!quote && (clock / 1000 >= deadline || clock - quote.quotedAt > 60000);
  const inputSymbol = side === "buy" ? "IMD" : token.symbol;
  const outputSymbol = side === "buy" ? token.symbol : "IMD";
  let insufficient = balanceRejected;
  if (holder && /^\d+(\.\d{1,18})?$/.test(amount)) {
    insufficient ||=
      parseUnits(amount, 18) >
      (side === "buy" ? holder.imdBalance : holder.tokenBalance);
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setTradeError("");
    if (insufficient || (address && !holder)) return;
    if (!quote || expired) {
      setBusy(true);
      const request = ++generation.current;
      try {
        const slip = Number(slippage);
        if (!Number.isFinite(slip) || slip < 0.1 || slip > 20)
          throw new Error("Choose slippage from 0.1% to 20%.");
        const result = await quoteTrade(token.address, side, amount);
        if (request !== generation.current) return;
        const minimumRaw =
          (result.amountOut * BigInt(10000 - Math.round(slip * 100))) / 10000n;
        if (minimumRaw <= 0n)
          throw new Error(
            "The output is too small. Increase the input amount.",
          );
        setQuote(result);
        setMinimum(formatUnits(minimumRaw));
        setDeadline(Math.floor(Date.now() / 1000) + Number(minutes) * 60);
        setClock(Date.now());
      } catch (err) {
        if (request === generation.current) setTradeError(errorMessage(err));
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!address) {
      await connect();
      return;
    }
    setBusy(true);
    setHash("");
    try {
      const result = await executeTrade(
        { token: token.address, side, amount, minimumOut: minimum, deadline },
        setStatus,
      );
      setHash(result);
      setStatus("Trade confirmed.");
      setQuote(null);
      refresh();
    } catch (err) {
      const message = errorMessage(err);
      setTradeError(message);
      if (message.startsWith("Not enough ")) {
        setBalanceRejected(true);
        refresh();
      }
      setStatus("");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card trade-card" id="trade" ref={card}>
      <h2 className="sr-only">Trade {token.symbol}</h2>
      <form onSubmit={submit}>
        <div className="trade-tabs" role="group" aria-label="Trade direction">
          {(["buy", "sell"] as const).map((s) => (
            <button
              type="button"
              key={s}
              aria-pressed={side === s}
              disabled={busy}
              onClick={() => setSide(s)}
              className={side === s ? "selected" : ""}
            >
              {s === "buy" ? "Buy" : "Sell"}
            </button>
          ))}
        </div>
        {side === "buy" &&
          token.closeNotice > 0 &&
          token.status !== "closed" && (
            <div className="notice buy-notice">
              <Icon name="info" />
              <span>
                Tokens bought now do not count toward the basket claim.
              </span>
            </div>
          )}
        <label className="trade-amount-label">
          You pay <span className="mono">{inputSymbol}</span>
          <input
            ref={amountInput}
            name="amount"
            type="text"
            inputMode="decimal"
            pattern="[0-9]+([.][0-9]{1,18})?"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            disabled={busy}
            autoComplete="off"
            placeholder="Enter amount"
          />
        </label>
        <div className="balance-row">
          <span>
            Balance{" "}
            {holder
              ? number(
                  Number(
                    formatUnits(
                      side === "buy" ? holder.imdBalance : holder.tokenBalance,
                    ),
                  ),
                  5,
                )
              : "—"}{" "}
            {inputSymbol}
          </span>
          {holder && (
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() =>
                setAmount(
                  formatUnits(
                    side === "buy" ? holder.imdBalance : holder.tokenBalance,
                  ),
                )
              }
            >
              Max
            </button>
          )}
        </div>
        <div className="trade-output">
          <span className="small muted">Estimated receive</span>
          <strong className="mono">
            {quote ? number(Number(formatUnits(quote.amountOut)), 6) : "—"}{" "}
            <span>{outputSymbol}</span>
          </strong>
        </div>
        <div className="form-row trade-settings">
          <label>
            Slippage %
            <input
              name="slippage"
              type="number"
              min="0.1"
              max="20"
              step="0.1"
              value={slippage}
              onChange={(e) => setSlippage(e.target.value)}
              required
              disabled={busy}
            />
          </label>
          <label>
            Deadline
            <select
              name="deadline"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              disabled={busy}
            >
              <option value="5">5 minutes</option>
              <option value="10">10 minutes</option>
              <option value="20">20 minutes</option>
            </select>
          </label>
        </div>
        {quote && (
          <div className="quote-review">
            <label>
              Minimum receive · {outputSymbol}
              <input
                type="text"
                inputMode="decimal"
                pattern="[0-9]+([.][0-9]{1,18})?"
                className="mono"
                value={minimum}
                onChange={(e) => setMinimum(e.target.value)}
                required
                disabled={busy}
              />
            </label>
            <dl className="detail-list tiny">
              <div>
                <dt>Expires</dt>
                <dd>{new Date(deadline * 1000).toLocaleTimeString()}</dd>
              </div>
              <div>
                <dt>Quote block</dt>
                <dd className="mono">{quote.blockNumber.toLocaleString()}</dd>
              </div>
            </dl>
            <span className="tiny muted">
              1% Keel fee included. Network gas is extra.
            </span>
            {expired && (
              <p className="small">Quote expired. Refresh before trading.</p>
            )}
          </div>
        )}
        {insufficient && (
          <p className="field-error" role="status">
            Not enough {inputSymbol}
          </p>
        )}
        {tradeError && <ErrorNotice>{tradeError}</ErrorNotice>}
        <div className="transaction-status" role="status">
          {status}
          {hash && (
            <a href={txUrl(hash)} target="_blank" rel="noreferrer">
              View transaction <Icon name="external" size={13} />
            </a>
          )}
        </div>
        <button
          className="button primary trade-submit"
          disabled={
            busy ||
            !data?.verified ||
            !!error ||
            insufficient ||
            (!!address && !holder)
          }
        >
          {busy
            ? "Waiting for confirmation…"
            : !data?.verified || error
              ? "Waiting for chain verification"
              : insufficient
                ? `Not enough ${inputSymbol}`
                : address && !holder
                  ? "Waiting for wallet balance"
                  : !quote
                    ? "Get quote"
                    : expired
                      ? "Refresh quote"
                      : !address
                        ? "Connect to trade"
                        : `${side === "buy" ? "Buy" : "Sell"} ${token.symbol}`}
          <Icon name="arrow" />
        </button>
        <p className="field-hint">
          {quote
            ? "Review the minimum and deadline, then confirm in your wallet."
            : "Direct pool quote through KeelRouter."}
        </p>
      </form>
    </section>
  );
}
function CreatorPanel({
  token,
  data,
  error,
  refresh,
}: PageProps & { token: Token }) {
  const [share, setShare] = useState("");
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState("");
  const [failure, setFailure] = useState("");
  const [hash, setHash] = useState("");
  const bps = /^\d+(\.\d{1,2})?$/.test(share)
    ? Number(parseUnits(share, 2))
    : NaN;
  const valid = Number.isSafeInteger(bps) && bps >= 0 && bps < token.creatorBps;
  const disabled = !!busy || !data?.verified || !!error;
  async function send(action: "claim" | "lower") {
    if (disabled || (action === "lower" && !valid)) return;
    setBusy(action);
    setFailure("");
    setHash("");
    try {
      const result =
        action === "claim"
          ? await claimCreator(token.address, setStatus)
          : await lowerCreatorShare(token.address, bps, setStatus);
      setHash(result);
      if (action === "lower") setShare("");
      refresh();
    } catch (err) {
      setFailure(errorMessage(err));
      setStatus("");
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="card creator-panel" aria-labelledby="creator-heading">
      <div className="panel-heading">
        <h2 id="creator-heading">Creator controls</h2>
        <Icon name="wallet" />
      </div>
      <div className="claim-row">
        <span>Your accrued IMD</span>
        <strong className="mono">
          {number(Number(formatUnits(token.creatorAccrued)), 6)} IMD
        </strong>
      </div>
      <button
        className="button"
        disabled={disabled || token.creatorAccrued === 0n}
        onClick={() => void send("claim")}
      >
        {busy === "claim" ? "Confirming claim…" : "Claim"}
        <Icon name="arrow" />
      </button>
      {token.status !== "closed" && (
        <form
          className="creator-share-form"
          onSubmit={(event) => {
            event.preventDefault();
            void send("lower");
          }}
        >
          <label htmlFor="lower-share">
            Lower my share{" "}
            <span className="muted small">
              Current: {token.creatorBps / 100}%
            </span>
          </label>
          <input
            id="lower-share"
            type="number"
            min="0"
            max={Math.max(0, (token.creatorBps - 1) / 100)}
            step="0.01"
            value={share}
            disabled={disabled || token.creatorBps === 0}
            aria-describedby="lower-share-help"
            aria-invalid={!!share && !valid}
            onChange={(event) => setShare(event.target.value)}
            required
          />
          <p id="lower-share-help" className="field-hint">
            {token.creatorBps === 0
              ? "Your share is already at its minimum."
              : "Choose a percentage below your current share. This cannot be undone. Pending fees use your current share before it changes."}
          </p>
          <button className="button" disabled={disabled || !valid}>
            {busy === "lower" ? "Confirming change…" : "Lower my share"}
          </button>
        </form>
      )}
      {failure && <ErrorNotice>{failure}</ErrorNotice>}
      <div className="transaction-status" role="status">
        {status}
        {hash && (
          <a href={txUrl(hash)} target="_blank" rel="noreferrer">
            View transaction <Icon name="external" size={13} />
          </a>
        )}
      </div>
    </section>
  );
}

function RunRow({ run }: { run: Run }) {
  const [job, setJob] = useState("");
  const valid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      job,
    ) && id(job).toLowerCase() === run.jobRef.toLowerCase();
  return (
    <li>
      <span className="run-dot" aria-hidden="true">
        <Icon name="check" size={12} />
      </span>
      <div className="run-content">
        <div className="run-line">
          <strong>
            {run.amount === 0n
              ? "Recorded only"
              : `${number(Number(formatUnits(run.amount)), 5)} IMD repaid`}
          </strong>
          <time
            className="tiny muted"
            dateTime={new Date(run.timestamp * 1000).toISOString()}
          >
            {new Date(run.timestamp * 1000).toLocaleDateString()}
          </time>
        </div>
        <a
          href={txUrl(run.transactionHash)}
          target="_blank"
          rel="noreferrer"
          className="mono tiny muted"
        >
          Commit {run.commit.slice(0, 10)}… <Icon name="external" size={12} />
        </a>
        <details className="run-job">
          <summary>Open IMD job</summary>
          <label>
            Original job id
            <input
              value={job}
              onChange={(e) => setJob(e.target.value.trim())}
              className="mono"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <p className="field-hint">
            The event stores a hash. Enter the job ID to verify the link.
          </p>
          {valid ? (
            <a href={jobUrl(job)} target="_blank" rel="noreferrer">
              View verified job <Icon name="external" size={12} />
            </a>
          ) : (
            job && (
              <p className="tiny" role="status">
                This ID does not match the recorded hash.
              </p>
            )
          )}
        </details>
      </div>
    </li>
  );
}
