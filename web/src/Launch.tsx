import { useRef, useState, type FormEvent } from "react";
import { launchToken, parseLaunchPermit, validateLaunchInput } from "./chain";
import type { LaunchInput, LaunchPermit } from "./chain/types";
import { txUrl } from "./config";
import { errorMessage, type PageProps } from "./App";
import { Avatar, Chip, ErrorNotice, FeeSplit, Icon } from "./components";

export function Launch({
  data,
  loading,
  error,
  refresh,
  address,
  connect,
}: PageProps) {
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [job, setJob] = useState("");
  const [image, setImage] = useState("");
  const [description, setDescription] = useState("");
  const [links, setLinks] = useState("");
  const [share, setShare] = useState(40);
  const [permitText, setPermitText] = useState("");
  const [formError, setFormError] = useState("");
  const [errorField, setErrorField] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const fieldState = (field: string, hint?: string) => ({
    disabled: busy,
    "aria-invalid": errorField === field || undefined,
    "aria-describedby":
      [hint, errorField === field ? "launch-error" : undefined]
        .filter(Boolean)
        .join(" ") || undefined,
  });
  const invalid = (message: string, field: string) => {
    setFormError(message);
    setErrorField(field);
    if (field === "permit" && permitRef.current) permitRef.current.open = true;
    (formRef.current?.elements.namedItem(field) as HTMLElement | null)?.focus();
  };
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [hash, setHash] = useState("");
  const permitRef = useRef<HTMLDetailsElement>(null);
  const permitInput = useRef<HTMLTextAreaElement>(null);
  const linkList = links
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const metadataBytes = new TextEncoder().encode(
    JSON.stringify({ image, description, links: linkList }),
  ).length;
  let permit: LaunchPermit | null = null;
  try {
    const value = JSON.parse(permitText);
    if (value && typeof value === "object") permit = value;
  } catch {
    /* Only validated on submission. */
  }
  const available = data?.verified && !data.paused && !error;
  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError("");
    setHash("");
    if (!available) return;
    setErrorField("");
    if (metadataBytes > 1024) {
      invalid(
        "Shorten the description or links. Metadata must fit in 1,024 bytes.",
        "description",
      );
      return;
    }
    let launchInput: LaunchInput;
    try {
      const parsedPermit = parseLaunchPermit(permitText);
      launchInput = {
        name,
        symbol,
        jobRef: job,
        image,
        description,
        links: linkList,
        creatorPercent: share,
        permit: parsedPermit,
      };
    } catch (e) {
      invalid(errorMessage(e), "permit");
      return;
    }
    try {
      validateLaunchInput(launchInput);
    } catch (e) {
      const message = errorMessage(e);
      const field = /Name/.test(message)
        ? "tokenName"
        : /Ticker/.test(message)
          ? "ticker"
          : /job UUID/.test(message)
            ? "jobRef"
            : /image URL/.test(message)
              ? "image"
              : /Links/.test(message)
                ? "links"
                : /share/.test(message)
                  ? "creatorShare"
                  : "description";
      invalid(message, field);
      return;
    }
    if (!address) {
      await connect();
      return;
    }
    setBusy(true);
    try {
      const result = await launchToken(launchInput, setStatus);
      setHash(result);
      setStatus("Token launched. Refreshing the market.");
      refresh();
    } catch (e) {
      setFormError(errorMessage(e));
      setStatus("");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">GIVE YOUR PROJECT A MARKET</span>
          <h1 className="chrome-text">Launch a token.</h1>
          <p>One IMD project. A basket for what comes next.</p>
        </div>
        <Chip live={!!available}>
          {data?.paused
            ? "Preview"
            : available
              ? "Launches open"
              : "Checking launch status"}
        </Chip>
      </div>
      {error && <ErrorNotice retry={refresh}>{error}</ErrorNotice>}
      {data?.paused && (
        <div className="notice launch-notice">
          <Icon name="lock" />
          <div>
            <strong>Launches open soon</strong>
            <span>Explore the form while the launch gate is closed.</span>
          </div>
          <span className="mono tiny">PREVIEW</span>
        </div>
      )}
      {!data && !error && (
        <div className="notice" role="status">
          {loading
            ? "Checking the factory on Ethereum…"
            : "Launch status unavailable."}
        </div>
      )}
      {data && !data.verified && (
        <ErrorNotice>
          {data.verificationError ||
            "Deployment verification is incomplete. Refresh before launching."}
        </ErrorNotice>
      )}
      <div className="launch-layout">
        <form
          ref={formRef}
          className="launch-form card"
          onSubmit={submit}
          aria-busy={busy}
        >
          <div className="form-section-heading">
            <span className="step-number mono">01</span>
            <div>
              <h2>The essentials</h2>
              <p className="muted small">A name for what you’re building.</p>
            </div>
          </div>
          <div className="form-row">
            <label>
              Token name
              <input
                name="tokenName"
                {...fieldState("tokenName")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={128}
                autoComplete="off"
              />
            </label>
            <label>
              Ticker
              <input
                name="ticker"
                {...fieldState("ticker")}
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                required
                maxLength={32}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
          </div>
          <label>
            IMD job id
            <input
              name="jobRef"
              {...fieldState("jobRef", "job-hint")}
              className="mono"
              value={job}
              onChange={(e) => setJob(e.target.value)}
              required
              pattern="[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
              autoComplete="off"
              spellCheck={false}
            />
            <span id="job-hint" className="field-hint">
              The lowercase UUID of your completed IMD job.
            </span>
          </label>
          <label>
            Image URL
            <input
              name="image"
              {...fieldState("image", "image-hint")}
              value={image}
              onChange={(e) => setImage(e.target.value)}
              type="url"
              pattern="https://.*"
              required
              autoComplete="url"
            />
            <span id="image-hint" className="field-hint">
              A public HTTPS image. Stored in your launch event.
            </span>
          </label>
          <label>
            Description
            <textarea
              name="description"
              {...fieldState("description")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              required
              maxLength={900}
            />
          </label>
          <label>
            Links <span className="optional">Optional</span>
            <textarea
              name="links"
              {...fieldState("links", "links-hint")}
              value={links}
              onChange={(e) => setLinks(e.target.value)}
              rows={2}
              spellCheck={false}
            />
            <span id="links-hint" className="field-hint">
              One web or IPFS link per line.
            </span>
          </label>
          <div
            className={`metadata-budget tiny mono ${metadataBytes > 1024 ? "budget-invalid" : ""}`}
          >
            {metadataBytes} / 1,024 metadata bytes
          </div>
          <div className="form-divider" />
          <div className="form-section-heading">
            <span className="step-number mono">02</span>
            <div>
              <h2>Share the upside</h2>
              <p className="muted small">Every trade pays a 1% IMD fee.</p>
            </div>
          </div>
          <label className="share-label" htmlFor="creator-share">
            Your share{" "}
            <output className="mono" htmlFor="creator-share">
              {share}%
            </output>
          </label>
          <input
            id="creator-share"
            name="creatorShare"
            {...fieldState("creatorShare", "share-hint")}
            type="range"
            min="0"
            max="80"
            step="1"
            value={share}
            onChange={(e) => setShare(Number(e.target.value))}
          />
          <div className="range-labels mono tiny">
            <span>0%</span>
            <span>80%</span>
          </div>
          <FeeSplit creator={share} />
          <p id="share-hint" className="field-hint">
            Your share can decrease after launch. It can never increase.
          </p>
          <details className="permit-section" ref={permitRef}>
            <summary>
              Launch permit{" "}
              <span className="tiny muted">Signed by the launch gate</span>
              <span className="disclosure-plus" aria-hidden="true">
                +
              </span>
            </summary>
            <div className="permit-content">
              <label>
                Launch gate response
                <textarea
                  ref={permitInput}
                  name="permit"
                  {...fieldState("permit", "permit-hint")}
                  className="mono"
                  rows={6}
                  value={permitText}
                  onChange={(e) => setPermitText(e.target.value)}
                  spellCheck={false}
                  maxLength={8192}
                />
              </label>
              <p id="permit-hint" className="field-hint">
                Paste the signed JSON: projectRef, startTick, deadline and
                signature. The permit must match this wallet, name and ticker.
              </p>
              {permit && (
                <dl className="permit-values">
                  <div>
                    <dt>Project</dt>
                    <dd>{String(permit.projectRef ?? "Missing")}</dd>
                  </div>
                  <div>
                    <dt>Start tick</dt>
                    <dd>{String(permit.startTick ?? "Missing")}</dd>
                  </div>
                  <div>
                    <dt>Deadline</dt>
                    <dd>
                      {Number.isFinite(permit.deadline)
                        ? new Date(permit.deadline * 1000).toLocaleString()
                        : "Missing"}
                    </dd>
                  </div>
                  <div>
                    <dt>Signature</dt>
                    <dd>
                      {permit.signature
                        ? `${String(permit.signature).slice(0, 18)}…`
                        : "Missing"}
                    </dd>
                  </div>
                </dl>
              )}
            </div>
          </details>
          {formError && (
            <div id="launch-error">
              <ErrorNotice>{formError}</ErrorNotice>
            </div>
          )}
          <div className="transaction-status" role="status">
            {status}
            {hash && (
              <>
                {" "}
                <a href={txUrl(hash)} target="_blank" rel="noreferrer">
                  View transaction <Icon name="external" size={13} />
                </a>
              </>
            )}
          </div>
          <button
            type="submit"
            className="button primary launch-submit"
            disabled={!available || busy}
          >
            {busy
              ? "Confirming launch…"
              : data?.paused
                ? "Launches open soon"
                : !available
                  ? "Waiting for chain verification"
                  : !address
                    ? "Connect wallet to launch"
                    : "Launch token"}
            <Icon name={data?.paused ? "lock" : "arrow"} />
          </button>
          <p className="field-hint launch-footnote">
            Launching creates permanently locked liquidity. Review the{" "}
            <a href="#/how">mechanics</a> before you sign.
          </p>
        </form>
        <aside className="launch-aside">
          <div className="preview-label eyebrow">
            LIVE PREVIEW <span className="status-dot" />
          </div>
          <article className="card launch-preview">
            <div className="preview-art">
              <div className="preview-orbit" />
              <Avatar image={image} symbol={symbol} size="avatar-large" />
            </div>
            <div className="preview-card-content">
              <Chip>Preview</Chip>
              <h2>{name || "Token preview"}</h2>
              <span className="mono muted">
                {symbol ? `$${symbol}` : "Your ticker will appear here"}
              </span>
              <p>
                {description || "Add your project details to see the preview."}
              </p>
              <div className="preview-split">
                <span>Creator share</span>
                <strong className="mono">{share}%</strong>
              </div>
              <div className="preview-split">
                <span>Basket share</span>
                <strong className="mono">{90 - share}%</strong>
              </div>
            </div>
          </article>
          <div className="launch-note">
            <Icon name="lock" size={18} />
            <div>
              <strong>Liquidity stays locked.</strong>
              <p>Your pool keeps trading, even after the project closes.</p>
              <a href="#/how">
                How it works <Icon name="arrow" size={14} />
              </a>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
