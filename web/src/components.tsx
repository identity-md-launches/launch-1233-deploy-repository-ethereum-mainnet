import { useEffect, useState, type ReactNode } from "react";

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    arrow: (
      <>
        <path d="M5 12h14m-5-5 5 5-5 5" />
      </>
    ),
    external: (
      <>
        <path d="M14 4h6v6m0-6L10 14" />
        <path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" />
      </>
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 4 4" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7v5h-5M4 17v-5h5" />
        <path d="M5.5 7a7.5 7.5 0 0 1 12.4-2L20 8M4 16l2.1 3A7.5 7.5 0 0 0 18.5 17" />
      </>
    ),
    wallet: (
      <>
        <path d="M4 6h15a1 1 0 0 1 1 1v12H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h13v2" />
        <path d="M20 10h-6v5h6" />
        <path d="M16 12.5h.01" />
      </>
    ),
    cube: (
      <>
        <path d="m12 3 9 5-9 5-9-5 9-5Z" />
        <path d="M3 8v9l9 5 9-5V8M12 13v9M7.5 5.5l9 5" />
      </>
    ),
    code: (
      <>
        <path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6m0-10v.01" />
      </>
    ),
    pause: (
      <>
        <path d="M8 5v14M16 5v14" />
      </>
    ),
    play: <path d="m8 5 11 7-11 7V5Z" />,
    bars: (
      <>
        <path d="M4 17v3m5-8v8m6-14v14m5-18v18" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.arrow}
    </svg>
  );
}
export function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand ${small ? "brand-small" : ""}`}>
      <img src="./keel-mark.svg" alt="" width="34" height="40" />
      <span className="chrome-text">KEEL</span>
    </span>
  );
}
export function Avatar({
  image,
  symbol,
  size = "",
}: {
  image?: string;
  symbol: string;
  size?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [image]);
  const safe = image && /^https:\/\//i.test(image);
  return (
    <span className={`avatar ${size}`} aria-hidden="true">
      {safe && !failed ? (
        <img
          src={image}
          alt=""
          onError={() => setFailed(true)}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span>{symbol.slice(0, 1).toUpperCase()}</span>
      )}
    </span>
  );
}
export function Chip({
  children,
  live = false,
}: {
  children: ReactNode;
  live?: boolean;
}) {
  return (
    <span className={`chip ${live ? "chip-live" : ""}`}>
      {live && <span className="status-dot" />}
      {children}
    </span>
  );
}
export function ErrorNotice({
  children,
  retry,
}: {
  children: ReactNode;
  retry?: () => void;
}) {
  return (
    <div className="notice notice-error" role="alert">
      <Icon name="info" />
      <div>{children}</div>
      {retry && (
        <button className="text-button" onClick={retry}>
          Try again <Icon name="refresh" size={15} />
        </button>
      )}
    </div>
  );
}
export function Pulse({
  value,
  percent,
  lastRunAt,
  timestamp,
}: {
  value: number;
  percent: number;
  lastRunAt: number | null;
  timestamp: number;
}) {
  const hours =
    lastRunAt == null
      ? null
      : Math.max(0, Math.floor((timestamp - lastRunAt) / 3600));
  return (
    <div className="pulse">
      <div className="pulse-label">
        <span>
          <Icon name="bars" size={13} /> Build pulse
        </span>
        <span className="mono">{value < 0.5 ? "Quiet" : value.toFixed(1)}</span>
      </div>
      <div
        className="pulse-track"
        role="progressbar"
        aria-label="Build pulse"
        aria-valuenow={Math.min(20, value)}
        aria-valuemin={0}
        aria-valuemax={20}
      >
        <span style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
      </div>
      <span className="muted tiny">
        {hours === null ? "No builds yet" : `last build ${hours} h ago`}
      </span>
    </div>
  );
}
export function FeeSplit({
  creator,
  active = true,
}: {
  creator: number;
  active?: boolean;
}) {
  const share = active ? creator : 0;
  return (
    <div className="fee-split">
      <div className="split-track" aria-hidden="true">
        <span style={{ width: "10%" }} />
        <span style={{ width: `${share}%` }} />
        <span style={{ width: `${90 - share}%` }} />
      </div>
      <div className="split-labels">
        <span>
          <i className="split-dot team" />
          Team <b>{10}%</b>
        </span>
        <span>
          <i className="split-dot creator" />
          You <b>{share}%</b>
        </span>
        <span>
          <i className="split-dot basket" />
          Basket <b>{90 - share}%</b>
        </span>
      </div>
    </div>
  );
}
export function Leaves({ paused = false }: { paused?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`falling-leaves ${paused ? "motion-paused" : ""}`}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <i
          key={i}
          style={{
            left: `${8 + i * 11}%`,
            animationDelay: `${-i * 2.8}s`,
            animationDuration: `${14 + i}s`,
          }}
        />
      ))}
    </span>
  );
}
export function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
export function number(
  value: number | null | undefined,
  maximumFractionDigits = 4,
) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value > 0 && value < 0.0001) return value.toPrecision(3);
  return Intl.NumberFormat("en", {
    maximumFractionDigits,
    notation: value >= 1000000 ? "compact" : "standard",
  }).format(value);
}
