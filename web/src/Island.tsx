import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { MarketData } from "./chain/types";
import { formatAmount } from "./chain/utils";
import "./island.css";

type Point = { x: number; y: number };
type StopId = "jobs" | "pool" | "fees" | "basket" | "hq" | "classified";
type Stop = Point & {
  id: StopId;
  title: string;
  number: string;
  pages: string[];
};
const STOPS: Stop[] = [
  {
    id: "jobs",
    number: "01",
    title: "Jobs",
    x: 3,
    y: 5,
    pages: [
      "Launch a token for an eligible IMD job.",
      "The launch gate confirms who may launch.",
      "A signed permit connects your job to Keel.",
    ],
  },
  {
    id: "pool",
    number: "02",
    title: "Pool",
    x: 11,
    y: 5,
    pages: [
      "Every launch starts an IMD trading pool.",
      "Liquidity is locked by the protocol.",
      "Buy and sell through the Keel router.",
    ],
  },
  {
    id: "fees",
    number: "03",
    title: "Fees",
    x: 3,
    y: 10,
    pages: [
      "Every trade pays a 1% fee in IMD.",
      "The team gets 10% of that fee.",
      "The creator gets up to 80%; the basket gets the rest.",
    ],
  },
  {
    id: "basket",
    number: "04",
    title: "Basket",
    x: 11,
    y: 10,
    pages: [
      "The creator pays for each IMD continuation.",
      "After verification, the basket repays its real price up to the run price.",
      "Every verified run adds a build pulse that halves in seven days.",
      "Only the team can close, after a seven-day notice and 30 days from launch.",
      "Holders claim against the smaller balance at notice and just before close.",
    ],
  },
  {
    id: "hq",
    number: "05",
    title: "Keel HQ",
    x: 7,
    y: 1,
    pages: ["You have met the protocol.", "Enter Keel →"],
  },
  {
    id: "classified",
    number: "",
    title: "[ CLASSIFIED ]",
    x: 18,
    y: 7,
    pages: ["Come back later."],
  },
];
const TREES = [
  { x: 0.4, y: 1.1, s: 1.15 },
  { x: 2.4, y: 0.4, s: 1.05 },
  { x: 4.4, y: 0.4, s: 0.8 },
  { x: 10, y: 0.35, s: 0.95 },
  { x: 12, y: 0.3, s: 1.18 },
  { x: 14.3, y: 1.3, s: 1.12 },
  { x: 0.2, y: 4.3, s: 0.82 },
  { x: 14.6, y: 4, s: 0.88 },
  { x: 0.25, y: 8, s: 1.15 },
  { x: 0.4, y: 11.2, s: 0.86 },
  { x: 14.4, y: 10.2, s: 1.1 },
  { x: 1.8, y: 13.4, s: 1 },
  { x: 4.3, y: 14.2, s: 0.75 },
  { x: 10.8, y: 14.1, s: 0.95 },
  { x: 13.5, y: 13.4, s: 1.12 },
];
const LEAF_CLUSTER = [
  [-5, -113, -35],
  [8, -113, 24],
  [-20, -106, -48],
  [22, -105, 45],
  [-31, -94, -54],
  [34, -91, 56],
  [-12, -95, -16],
  [12, -91, 26],
  [-41, -79, -65],
  [42, -75, 67],
  [-24, -76, -44],
  [26, -71, 42],
  [-4, -77, -10],
  [8, -67, 13],
  [-35, -58, -58],
  [34, -53, 53],
  [-18, -54, -30],
  [18, -44, 34],
  [-3, -51, -10],
  [-13, -35, -42],
  [13, -32, 44],
];
const START: Point = { x: 7, y: 12 };
const distance = (a: Point, b: Point) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const walkable = (p: Point) =>
  p.x >= 1 &&
  p.x <= 14 &&
  p.y >= 2 &&
  p.y <= 13 &&
  !(p.x === 7 && p.y === 7) &&
  !STOPS.some((s) => s.x === p.x && s.y === p.y) &&
  !TREES.some((t) => Math.abs(t.x - p.x) < 0.7 && Math.abs(t.y - p.y) < 0.7);

export default function Island({
  onEnter,
  data,
  loading,
  error,
  refresh,
}: {
  onEnter: () => void;
  data: MarketData | null;
  loading: boolean;
  error: string;
  refresh: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const elapsed =
    data?.lastRunAt == null
      ? null
      : Math.max(0, Math.floor(now / 1000 - data.lastRunAt));
  const ago =
    elapsed == null
      ? "No verified runs yet"
      : elapsed < 60
        ? `${elapsed}s since the last run`
        : elapsed < 3600
          ? `${Math.floor(elapsed / 60)}m since the last run`
          : elapsed < 86400
            ? `${Math.floor(elapsed / 3600)}h since the last run`
            : `${Math.floor(elapsed / 86400)}d since the last run`;
  const figures: Record<string, { main: string; details: string }> = data
    ? {
        jobs: {
          main: `${data.buildsShipped} runs`,
          details: `${data.buildsShipped} verified runs. ${ago}.`,
        },
        pool: {
          main: `${data.livePools} live pools`,
          details: `${data.livePools} live pools. ${data.imdInPools === null ? "Pool data unavailable · Retry" : `${formatAmount(data.imdInPools)} IMD held in Keel pools (locked liquidity and position fees).`}`,
        },
        fees: {
          main: `${formatAmount(data.fees.total)} IMD`,
          details: `${formatAmount(data.fees.total)} IMD in total fees. Team ${formatAmount(data.fees.team)} · Creators ${formatAmount(data.fees.creators)} · Baskets ${formatAmount(data.fees.baskets)} IMD.`,
        },
        basket: {
          main: `${formatAmount(data.imdInBaskets)} IMD`,
          details: `${formatAmount(data.imdInBaskets)} IMD in baskets now. ${formatAmount(data.repaid)} IMD repaid to builders.`,
        },
        hq: {
          main: data.paused ? "Launches paused" : "Launches open",
          details: `${data.paused ? "Launches paused" : "Launches open"}. ${data.launches} total launches.`,
        },
      }
    : {};
  const unavailable = (id: StopId) =>
    !!error || (id === "pool" && !!data && data.imdInPools === null);
  const summary = (id: StopId, detail = false) =>
    loading
      ? "Reading Ethereum…"
      : unavailable(id)
        ? "Data unavailable · Retry"
        : data
          ? detail
            ? figures[id]?.details
            : figures[id]?.main
          : "Reading Ethereum…";
  const pages = (stop: Stop) =>
    stop.pages.length + (stop.id === "classified" ? 0 : 1);
  const line = (stop: Stop, page: number) =>
    stop.id === "classified"
      ? stop.pages[page]
      : page === 0
        ? summary(stop.id, true)
        : stop.pages[page - 1];
  const [mobile, setMobile] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 700px)").matches,
  );
  const [player, setPlayer] = useState<Point>(START);
  const [facing, setFacing] = useState(1);
  const [walking, setWalking] = useState(false);
  const [visited, setVisited] = useState<Set<StopId>>(new Set());
  const [dialog, setDialog] = useState<{ stop: Stop; page: number } | null>(
    null,
  );
  const [menu, setMenu] = useState(false);
  const [paused, setPaused] = useState(false);
  const [announcement, setAnnouncement] = useState(
    "Use arrow keys or W A S D to walk. Press Enter or the A button to talk.",
  );
  const routeRef = useRef<Point[]>([]);
  const destinationRef = useRef<Stop | null>(null);
  const playerRef = useRef(player);
  const sceneRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const tourRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const stepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastStep = useRef(0);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 700px)");
    const update = () => setMobile(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    playerRef.current = player;
  }, [player]);
  useEffect(
    () => () => {
      if (stepTimer.current) clearTimeout(stepTimer.current);
    },
    [],
  );

  const closeDialog = useCallback(() => {
    setDialog(null);
    const previous = previousFocusRef.current;
    if (previous?.isConnected) previous.focus();
    else menuRef.current?.focus();
  }, []);

  const openStop = useCallback((stop: Stop) => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLButtonElement
        ? document.activeElement
        : menuRef.current;
    setDialog({ stop, page: 0 });
    if (stop.id === "hq")
      setVisited((previous) => new Set([...previous, stop.id]));
    setAnnouncement(`${stop.title}. Reading its Ethereum figures.`);
    routeRef.current = [];
    destinationRef.current = null;
  }, []);
  const nearest = STOPS.filter((s) => s.id !== "classified").find(
    (s) => distance(s, player) <= 1.1,
  );
  const move = useCallback(
    (dx: number, dy: number) => {
      if (dialog || menu) return;
      const now = Date.now();
      if (now - lastStep.current < 115) return;
      lastStep.current = now;
      routeRef.current = [];
      destinationRef.current = null;
      if (dx) setFacing(dx);
      const next = { x: playerRef.current.x + dx, y: playerRef.current.y + dy };
      if (walkable(next)) {
        playerRef.current = next;
        setPlayer(next);
        setWalking(true);
        if (stepTimer.current) clearTimeout(stepTimer.current);
        stepTimer.current = setTimeout(() => setWalking(false), 150);
      }
    },
    [dialog, menu],
  );

  const advance = () => {
    if (menu) return;
    if (!dialog) {
      if (nearest) openStop(nearest);
      else if (player.x === 14 && player.y >= 6 && player.y <= 8)
        openStop(STOPS[5]);
      else setAnnouncement("Walk beside a robot or select a stop to talk.");
      return;
    }
    const { stop, page } = dialog;
    if (page < pages(stop) - 1) {
      setDialog({ stop, page: page + 1 });
      setAnnouncement(`${stop.title}. ${line(stop, page + 1)}`);
    } else {
      if (stop.id !== "classified")
        setVisited((previous) => new Set([...previous, stop.id]));
      closeDialog();
      if (stop.id === "hq") onEnter();
      else
        setAnnouncement(
          stop.id === "classified"
            ? "[ CLASSIFIED ] Come back later."
            : `${stop.title} visited.`,
        );
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key === "Escape") {
        if (dialog) closeDialog();
        if (menu) {
          setMenu(false);
          menuRef.current?.focus();
        }
        return;
      }
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        target.matches("input,textarea,select")
      )
        return;
      const key = event.key.toLowerCase();
      const dirs: Record<string, [number, number]> = {
        arrowup: [0, -1],
        w: [0, -1],
        arrowdown: [0, 1],
        s: [0, 1],
        arrowleft: [-1, 0],
        a: [-1, 0],
        arrowright: [1, 0],
        d: [1, 0],
      };
      if (dirs[key] && !menu) {
        event.preventDefault();
        move(...dirs[key]);
      }
      if (
        (key === "enter" || key === " ") &&
        !menu &&
        (dialog ||
          target.closest(".island-scene,.island-dpad,.island-action-wrap") ||
          !target.closest("button,a,summary"))
      ) {
        event.preventDefault();
        advance();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move, advance, dialog, menu, closeDialog]);

  const goTo = useCallback(
    (stop: Stop) => {
      setMenu(false);
      setDialog(null);
      if (stop.id === "classified") {
        openStop(stop);
        return;
      }
      const start = playerRef.current;
      const queue: Point[][] = [[start]];
      const checked = new Set([`${start.x},${start.y}`]);
      let found: Point[] = [];
      while (queue.length) {
        const path = queue.shift()!;
        const p = path[path.length - 1];
        if (distance(p, stop) <= 1) {
          found = path.slice(1);
          break;
        }
        for (const [dx, dy] of [
          [0, -1],
          [1, 0],
          [0, 1],
          [-1, 0],
        ]) {
          const next = { x: p.x + dx, y: p.y + dy };
          const key = `${next.x},${next.y}`;
          if (walkable(next) && !checked.has(key)) {
            checked.add(key);
            queue.push([...path, next]);
          }
        }
      }
      if (!found.length) {
        openStop(stop);
        return;
      }
      routeRef.current = found;
      destinationRef.current = stop;
      setAnnouncement(`Walking to ${stop.title}.`);
    },
    [openStop],
  );

  useEffect(() => {
    const timer = setInterval(() => {
      const next = routeRef.current.shift();
      if (!next) return;
      setFacing(next.x >= playerRef.current.x ? 1 : -1);
      playerRef.current = next;
      setPlayer(next);
      setWalking(true);
      if (stepTimer.current) clearTimeout(stepTimer.current);
      stepTimer.current = setTimeout(() => setWalking(false), 170);
      if (!routeRef.current.length && destinationRef.current)
        openStop(destinationRef.current);
    }, 180);
    return () => clearInterval(timer);
  }, [openStop]);

  useEffect(() => {
    if (menu)
      tourRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    if (dialog) dialogRef.current?.focus();
  }, [menu, !!dialog]);

  const view = mobile ? { w: 760, h: 1000 } : { w: 1200, h: 850 };
  const project = (p: Point): Point =>
    mobile
      ? {
          x: p.x > 15 ? 650 + (p.x - 15) * 20 : 80 + p.x * 38,
          y: 230 + p.y * 43,
        }
      : { x: 250 + p.x * 50 - p.y * 10, y: 280 + p.y * 27 + p.x * 2 };
  const polygon = (points: Point[]) =>
    points
      .map((p) => {
        const q = project(p);
        return `${q.x},${q.y}`;
      })
      .join(" ");
  const rim = [
    { x: 1, y: 0 },
    { x: 14, y: 0 },
    { x: 15, y: 1 },
    { x: 15, y: 13 },
    { x: 14, y: 14 },
    { x: 2, y: 14 },
    { x: 0, y: 12 },
    { x: 0, y: 1 },
  ];
  const scale = mobile ? 1.6 : 1;
  const playerPosition = project(player);
  const sprites: { key: string; depth: number; node: React.ReactNode }[] = [];
  TREES.filter(
    (tree) =>
      !mobile || tree.y < 2 || ((tree.x < 1 || tree.x > 14) && tree.y < 10),
  ).forEach((tree, i) => {
    const p = project(tree);
    sprites.push({
      key: `tree${i}`,
      depth: -1000 + p.y,
      node: (
        <use
          href="#island-tree"
          x={p.x}
          y={p.y}
          transform={`translate(${p.x} ${p.y}) scale(${tree.s * (mobile ? 1.6 : 1)}) translate(${-p.x} ${-p.y})`}
        />
      ),
    });
  });
  STOPS.filter((s) => s.id !== "classified").forEach((stop) => {
    const p = project(stop);
    sprites.push({
      key: stop.id,
      depth: 1000 + p.y,
      node: (
        <g
          transform={`translate(${p.x} ${p.y}) scale(${stop.id === "hq" ? (mobile ? 1.6 : 1) : scale})`}
        >
          <use href={stop.id === "hq" ? "#island-hq" : "#island-stall"} />
          {stop.id === "hq" && nearest?.id === "hq" && (
            <rect
              x="-15"
              y="-53"
              width="30"
              height="48"
              fill="url(#island-door-glow)"
              className="island-door"
            />
          )}
        </g>
      ),
    });
  });
  const center = project({ x: 7, y: 7 });
  sprites.push({
    key: "obelisk",
    depth: center.y,
    node: (
      <g
        transform={`translate(${center.x} ${center.y}) scale(${mobile ? 1.25 : 1})`}
      >
        <ellipse cy="4" rx="46" ry="15" fill="#050505" opacity=".8" />
        <ellipse
          cy="0"
          rx="42"
          ry="13"
          fill="url(#island-metal)"
          stroke="#a8a8aa"
        />
        <path
          d="M-18 -8V-111L0-133 18-111V-8L0 1Z"
          fill="url(#island-metal)"
          stroke="#b9b9bd"
        />
        <path d="M0-133V1L18-8V-111Z" fill="#18181b" />
        <path d="M2-124V-8" stroke="#fafafa" opacity=".8" />
        <ellipse
          cy="-58"
          rx="47"
          ry="14"
          fill="none"
          stroke="#dadade"
          strokeOpacity=".25"
          transform="rotate(-18)"
        />
        <g className="island-orbit">
          <circle cx="-40" cy="-34" r="3" fill="white" />
          <circle cx="37" cy="-79" r="2.8" fill="white" />
          <circle cx="25" cy="-44" r="1.8" fill="white" />
          <circle cx="-23" cy="-69" r="2" fill="#c5c5cb" />
        </g>
        <text
          y="29"
          fill="#b8b8bf"
          fontSize="10"
          textAnchor="middle"
          letterSpacing="4"
        >
          IMD SWARM
        </text>
      </g>
    ),
  });
  sprites.push({
    key: "player",
    depth: 1000 + playerPosition.y + 1,
    node: (
      <g
        className={walking ? "island-player is-walking" : "island-player"}
        transform={`translate(${playerPosition.x} ${playerPosition.y}) scale(${scale})`}
      >
        <g transform={`scale(${facing} 1)`}>
          <ellipse cy="4" rx="15" ry="5" fill="#000" opacity=".7" />
          <g className="island-player-body">
            <path
              d="M-10-12-11 1-3 2 0-12M3-12 3 2 11 1 10-13"
              fill="#74747b"
              stroke="#ccc"
              strokeWidth="1.4"
            />
            <path
              d="M-12-30Q-19-21-15-11L-10-13V-8Q0-3 10-8V-14L15-12Q18-21 11-30Z"
              fill="url(#island-hoodie)"
              stroke="#efeff3"
            />
            <path
              d="M-10-12Q0-16 10-12M-7-18H6"
              fill="none"
              stroke="#a0a0a7"
              strokeWidth="1.1"
            />
            <ellipse
              cx="0"
              cy="-38"
              rx="16"
              ry="17"
              fill="url(#island-hoodie)"
              stroke="#fff"
            />
            <path d="M-11-41Q0-54 12-42L10-30Q0-24-10-31Z" fill="#39393f" />
            <path d="M-8-41Q1-49 10-40V-32Q0-27-8-33Z" fill="#c4c4cb" />
            <path d="M-6-42Q2-52 10-40L7-36 3-42-1-38-4-42Z" fill="#222227" />
            <path d="M-4-34H-2M5-34H7" stroke="#101014" strokeWidth="2" />
            <path d="M-5-24-1-18M6-24 3-18" stroke="#fff" strokeWidth="1.6" />
          </g>
        </g>
        <path
          d="M-3-69 0-65 3-69"
          fill="none"
          stroke="white"
          strokeWidth="1.5"
        />
      </g>
    ),
  });
  sprites.sort((a, b) => a.depth - b.depth);

  return (
    <main className={`island-root ${paused ? "island-paused" : ""}`}>
      <header className="island-topbar">
        <button
          className="island-wordmark"
          type="button"
          aria-label="Keel — enter launchpad"
          onClick={onEnter}
        >
          <img src="./keel-mark.svg" alt="" aria-hidden="true" />
          <span>KEEL</span>
        </button>
        <div
          className="island-progress"
          role="group"
          aria-label={`${visited.size} of 5 stalls visited`}
        >
          <span>
            Stalls <b>{visited.size}/5</b>
          </span>
          <div aria-hidden="true">
            {STOPS.slice(0, 5).map((s) => (
              <i key={s.id} className={visited.has(s.id) ? "filled" : ""} />
            ))}
          </div>
        </div>
        <div className="island-header-actions">
          <button type="button" className="island-skip" onClick={onEnter}>
            Skip <span aria-hidden="true">↗</span>
          </button>
          <button
            ref={menuRef}
            type="button"
            className="island-menu-button"
            aria-expanded={menu}
            aria-controls="island-menu"
            aria-label={menu ? "Close island menu" : "Open island menu"}
            onClick={() => {
              setMenu(!menu);
              setDialog(null);
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
              <path
                d={menu ? "M5 5 15 15M15 5 5 15" : "M3 6H17M3 13H17"}
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
          </button>
        </div>
      </header>

      <div className="island-stars" aria-hidden="true">
        {Array.from({ length: 39 }, (_, i) => (
          <i
            key={i}
            style={{
              left: `${(i * 37 + 11) % 99}%`,
              top: `${(i * 23 + 7) % 94}%`,
              opacity: 0.15 + (i % 5) * 0.13,
              width: i % 6 === 0 ? 3 : 2,
              height: i % 6 === 0 ? 3 : 2,
            }}
          />
        ))}
      </div>
      <div className="island-intro">
        <span className="island-eyebrow">WELCOME TO THE ISLAND</span>
        <h1>
          A little world.
          <br className="island-mobile-break" /> Built to build.
        </h1>
        <p>Meet the protocol. Find your next beginning.</p>
      </div>

      <div
        ref={sceneRef}
        tabIndex={0}
        role="group"
        aria-label="Island scene. Arrow keys to walk; Enter or Space to talk."
        className="island-scene"
        style={{ "--scene-ratio": `${view.w} / ${view.h}` } as CSSProperties}
      >
        <svg
          className="island-map"
          viewBox={`0 0 ${view.w} ${view.h}`}
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="island-metal" x1="0" y1="0" x2="1" y2=".3">
              <stop stopColor="#333339" />
              <stop offset=".2" stopColor="#e1e1e5" />
              <stop offset=".33" stopColor="#88888e" />
              <stop offset=".49" stopColor="#fafafa" />
              <stop offset=".56" stopColor="#6b6b73" />
              <stop offset=".78" stopColor="#dddde1" />
              <stop offset="1" stopColor="#333339" />
            </linearGradient>
            <linearGradient id="island-leaf" x1="0" y1="0" x2="1" y2="1">
              <stop stopColor="#fdfdfd" />
              <stop offset=".28" stopColor="#b8b8bf" />
              <stop offset=".48" stopColor="#f8f8fb" />
              <stop offset=".51" stopColor="#73737d" />
              <stop offset="1" stopColor="#24242a" />
            </linearGradient>
            <linearGradient id="island-ground" x1="0" y1="0" x2=".8" y2="1">
              <stop stopColor="#18181b" />
              <stop offset=".6" stopColor="#252528" />
              <stop offset="1" stopColor="#101013" />
            </linearGradient>
            <linearGradient id="island-slab" x1="0" y1="0" x2="0" y2="1">
              <stop stopColor="#f5f5f6" />
              <stop offset=".09" stopColor="#8b8b92" />
              <stop offset=".25" stopColor="#202024" />
              <stop offset=".6" stopColor="#66666c" />
              <stop offset="1" stopColor="#101012" />
            </linearGradient>
            <linearGradient id="island-hoodie" x1="0" x2="1">
              <stop stopColor="#a6a6af" />
              <stop offset=".42" stopColor="#fff" />
              <stop offset="1" stopColor="#d2d2da" />
            </linearGradient>
            <linearGradient id="island-beam" x1="0" y1="0" x2="0" y2="1">
              <stop stopColor="#fff" stopOpacity="0" />
              <stop offset=".7" stopColor="#fff" stopOpacity=".09" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <radialGradient id="island-aura">
              <stop stopColor="#a8a8b8" stopOpacity=".14" />
              <stop offset="1" stopColor="#ddd" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="island-door-glow" x1="0" y1="0" x2="0" y2="1">
              <stop stopColor="#fff" stopOpacity=".2" />
              <stop offset="1" stopColor="#fff" stopOpacity=".8" />
            </linearGradient>
            <filter id="island-fog">
              <feGaussianBlur stdDeviation="13" />
            </filter>
            <clipPath id="island-floor-clip">
              <polygon points={polygon(rim)} />
            </clipPath>
            <g id="island-tree">
              <ellipse rx="28" ry="8" cy="2" fill="#000" opacity=".4" />
              <path d="M-6 0-3-97 3-100 5 0Z" fill="url(#island-metal)" />
              <path
                d="M-1-35-25-62M1-54 27-80M0-77-20-94"
                fill="none"
                stroke="#a5a5af"
                strokeWidth="3"
              />
              {LEAF_CLUSTER.map(([x, y, r], i) => (
                <g key={i} transform={`translate(${x} ${y}) rotate(${r})`}>
                  <path
                    d="M0 12Q-16-5 0-22Q15-4 0 12Z"
                    fill="url(#island-leaf)"
                    stroke="#d6d6dc"
                    strokeWidth=".5"
                  />
                  <path
                    d="M0 10V-19"
                    stroke="#f5f5fa"
                    strokeWidth=".6"
                    opacity=".65"
                  />
                </g>
              ))}
            </g>
            <g id="island-robot">
              <ellipse cy="0" rx="10" ry="3" fill="#050505" />
              <path d="M-6-6-7 0M5-6 6 0" stroke="#bbb" strokeWidth="3" />
              <rect
                x="-8"
                y="-19"
                width="16"
                height="13"
                rx="4"
                fill="url(#island-metal)"
                stroke="#d8d8df"
              />
              <rect
                x="-11"
                y="-36"
                width="22"
                height="18"
                rx="6"
                fill="url(#island-metal)"
                stroke="#eee"
              />
              <rect
                x="-8"
                y="-31"
                width="16"
                height="8"
                rx="3"
                fill="#0e0e13"
              />
              <path d="M-5-27H-2M3-27H6" stroke="#f9f9fc" strokeWidth="2" />
              <path d="M0-36V-42" stroke="#ddd" />
              <circle cy="-43" r="2" fill="#fff" />
              <path
                d="M-10-16-14-8M10-16 14-9"
                stroke="#9999a1"
                strokeWidth="3"
              />
            </g>
            <g id="island-stall">
              <ellipse cy="8" rx="46" ry="10" fill="#000" opacity=".5" />
              <path
                d="M-36-42V0M36-42V0"
                stroke="url(#island-metal)"
                strokeWidth="5"
              />
              <path
                d="M-46-42-28-67H28L46-42Z"
                fill="url(#island-metal)"
                stroke="#b8b8c0"
              />
              <path d="M-46-42H46V-36H-46Z" fill="#d7d7dc" />
              <path d="M-35-1H35L40 7H-40Z" fill="url(#island-metal)" />
              <path d="M-19-61H19" stroke="#fff" opacity=".65" />
              <use href="#island-robot" y="6" />
            </g>
            <g id="island-hq">
              <ellipse cy="8" rx="76" ry="15" fill="#000" opacity=".65" />
              <path
                d="M-68-7V-100L-52-123H53L68-100V-7Z"
                fill="#09090b"
                stroke="#a6a6ac"
                strokeWidth="2"
              />
              <path d="M-68-100H68L53-123H-52Z" fill="url(#island-metal)" />
              <path d="M-62-95H62V-13H-62Z" fill="#101013" stroke="#4a4a50" />
              <path d="M-70-7H70L80 5H-80Z" fill="url(#island-metal)" />
              <path d="M-61-95H61M-63-11H63" stroke="#e8e8ed" strokeWidth="2" />
              <path d="M-17-55H17V-7H-17Z" fill="#030304" stroke="#a6a6b0" />
              <path
                d="M-14-51H14V-8H-14Z"
                fill="url(#island-door-glow)"
                opacity=".25"
              />
              <image
                href="./keel-mark.svg"
                x="-13"
                y="-89"
                width="26"
                height="28"
              />
              <path d="M-51-76H-31M31-76H51" stroke="#a2a2aa" />
              <path
                d="M-56-47H-33V-30H-56ZM33-47H56V-30H33Z"
                fill="#27272e"
                stroke="#707078"
              />
              <path d="M-49-46-38-31M40-46 51-31" stroke="#fff" opacity=".15" />
            </g>
          </defs>
          <ellipse
            cx={mobile ? 420 : 605}
            cy={mobile ? 645 : 570}
            rx={mobile ? 400 : 540}
            ry={mobile ? 390 : 280}
            fill="url(#island-aura)"
          />
          {!mobile && (
            <g>
              <path
                d="M318 100 462 626 525 622 406 100Z"
                fill="url(#island-beam)"
              />
              <path
                d="M731 80 861 600 888 600 777 80Z"
                fill="url(#island-beam)"
              />
            </g>
          )}
          <g className="island-shards">
            {[2, 4, 7, 10, 12, 14].map((x, i) => {
              const p = project({ x, y: 14 });
              return (
                <path
                  key={x}
                  d={`M${p.x - 19} ${p.y + 28}l42 4-18 ${46 + (i % 3) * 19}Z`}
                  fill={i % 2 ? "#151518" : "#25252a"}
                  stroke="#39393f"
                  strokeWidth=".7"
                />
              );
            })}
          </g>
          <polygon
            points={polygon(rim)}
            transform={`translate(0 ${mobile ? 29 : 37})`}
            fill="url(#island-slab)"
            stroke="#55555d"
          />
          {rim.map((p, i) => {
            const next = rim[(i + 1) % rim.length];
            const a = project(p),
              b = project(next);
            return (
              <path
                key={i}
                d={`M${a.x} ${a.y}L${b.x} ${b.y}v${mobile ? 29 : 37}L${a.x} ${a.y + (mobile ? 29 : 37)}Z`}
                fill="url(#island-slab)"
                stroke="#3b3b41"
                strokeWidth=".6"
              />
            );
          })}
          <polygon
            points={polygon(rim)}
            fill="url(#island-ground)"
            stroke="#b4b4ba"
            strokeWidth="1.5"
          />
          <g clipPath="url(#island-floor-clip)" opacity=".16">
            {Array.from({ length: 16 }, (_, i) => (
              <g key={i}>
                <polyline
                  points={polygon([
                    { x: i, y: 0 },
                    { x: i, y: 15 },
                  ])}
                  stroke="#c5c5ce"
                  strokeWidth=".7"
                />
                <polyline
                  points={polygon([
                    { x: 0, y: i },
                    { x: 15, y: i },
                  ])}
                  stroke="#c5c5ce"
                  strokeWidth=".7"
                />
              </g>
            ))}
          </g>
          <g
            fill="none"
            stroke="#6e6e77"
            strokeWidth={mobile ? 19 : 15}
            strokeOpacity=".2"
            strokeLinejoin="round"
          >
            <polyline
              points={polygon([
                { x: 7, y: 13 },
                { x: 7, y: 2 },
              ])}
            />
            <polyline
              points={polygon([
                { x: 3, y: 5 },
                { x: 11, y: 5 },
              ])}
            />
            <polyline
              points={polygon([
                { x: 3, y: 10 },
                { x: 11, y: 10 },
              ])}
            />
            <polyline
              points={polygon([
                { x: 7, y: 7 },
                { x: 14, y: 7 },
              ])}
            />
          </g>
          <g fill="#94949d" opacity=".27">
            {Array.from({ length: 11 }, (_, i) => {
              const p = project({ x: 7, y: 2 + i });
              return (
                <ellipse
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  rx={mobile ? 8 : 11}
                  ry="2"
                />
              );
            })}
          </g>
          <g>
            {[15.5, 16.25].map((x, i) => {
              const p = project({ x, y: 7 });
              return (
                <path
                  key={x}
                  d={`M${p.x - 12} ${p.y - 6}h23l5 9-22 5-9-6Z`}
                  fill="url(#island-metal)"
                  opacity={0.7 - i * 0.15}
                />
              );
            })}
            {(() => {
              const p = project({ x: 18, y: 7 });
              return (
                <g
                  transform={`translate(${p.x} ${p.y}) scale(${mobile ? 1.15 : 1})`}
                >
                  <path
                    d="M-49-3-30-21 33-18 56 3 40 18-35 20Z"
                    fill="#202025"
                    stroke="#777780"
                  />
                  <path
                    d="M-49-3-35 20 40 18 56 3 39 39-15 45-35 27Z"
                    fill="#111115"
                    stroke="#35353b"
                  />
                  <path
                    d="M-22-9V-69H22V-9M-27-70H27"
                    fill="none"
                    stroke="url(#island-metal)"
                    strokeWidth="6"
                  />
                  <path
                    d="M-14-11V-60M0-11V-60M14-11V-60M-18-47H18M-18-23H18"
                    stroke="#666670"
                    strokeWidth="3"
                  />
                  <path
                    d="M-27-55 27-24M27-55-27-24"
                    stroke="#babac2"
                    strokeWidth="2"
                  />
                  <text
                    className="island-question"
                    y="-88"
                    fill="#fff"
                    fontSize="28"
                    textAnchor="middle"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    ?
                  </text>
                </g>
              );
            })()}
          </g>
          <g
            className="island-fog"
            filter="url(#island-fog)"
            fill="#aaaab8"
            opacity=".1"
          >
            {[0, 1, 2].map((i) => {
              const p = project({ x: 16 + i, y: 7 + i * 0.3 });
              return <ellipse key={i} cx={p.x} cy={p.y - 8} rx="57" ry="14" />;
            })}
          </g>
          {sprites.map((sprite) => (
            <g key={sprite.key} data-sprite={sprite.key}>
              {sprite.node}
            </g>
          ))}
          <g className="island-falling-leaves">
            {Array.from({ length: 13 }, (_, i) => (
              <path
                key={i}
                d="M0 0Q-7-10 0-14Q8-7 0 0Z"
                fill="url(#island-leaf)"
                style={
                  {
                    "--leaf-x": `${(i * 137 + 193) % (view.w - 120)}px`,
                    "--leaf-y": `${(i * 79 + 90) % (view.h - 250)}px`,
                    animationDelay: `-${i * 1.7}s`,
                    animationDuration: `${10 + (i % 4) * 2}s`,
                  } as CSSProperties
                }
              />
            ))}
          </g>
        </svg>
        {STOPS.map((stop) => {
          const p = project(stop);
          const isHq = stop.id === "hq";
          const sy =
            p.y -
            (isHq
              ? mobile
                ? 212
                : 142
              : stop.id === "classified"
                ? mobile
                  ? 103
                  : 92
                : mobile
                  ? 122
                  : 91);
          return (
            <div key={stop.id}>
              {stop.id !== "classified" && (
                <button
                  type="button"
                  className={`island-sprite-target ${nearest?.id === stop.id ? "is-near" : ""}`}
                  style={{
                    left: `${(p.x / view.w) * 100}%`,
                    top: `${((p.y - (isHq ? 60 : 28) * scale) / view.h) * 100}%`,
                    width: `${(((isHq ? 140 : 94) * scale) / view.w) * 100}%`,
                    height: `${(((isHq ? 125 : 78) * scale) / view.h) * 100}%`,
                  }}
                  aria-label={`Talk to ${stop.title} ${isHq ? "headquarters" : "robot"}`}
                  onClick={() => goTo(stop)}
                />
              )}
              <button
                type="button"
                className={`island-stop ${nearest?.id === stop.id ? "is-near" : ""} ${visited.has(stop.id) ? "is-visited" : ""} ${isHq ? "is-hq" : ""} ${stop.id === "classified" ? "is-classified" : ""}`}
                style={{
                  left: `${(p.x / view.w) * 100}%`,
                  top: `${(sy / view.h) * 100}%`,
                }}
                aria-label={
                  stop.id === "classified"
                    ? "[ CLASSIFIED ]"
                    : `${stop.number} ${stop.title}${visited.has(stop.id) ? ", visited" : ""}. Walk here and talk.`
                }
                onClick={() => goTo(stop)}
              >
                {stop.id === "classified" ? (
                  "?"
                ) : (
                  <>
                    <span className="island-sign-title">
                      <span>{stop.number}</span> {stop.title}
                      {visited.has(stop.id) && (
                        <span aria-hidden="true"> ✓</span>
                      )}
                    </span>
                    <span className="island-sign-figure">
                      {summary(stop.id)}
                    </span>
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      <div className="island-bottom-note">
        <span className="island-coordinate">EST. ON ETHEREUM</span>
        <p>
          {nearest
            ? `Press Enter or A to talk to ${nearest.title}`
            : "Four stalls. One headquarters. Your next chapter."}
        </p>
      </div>
      <div
        className="island-dpad"
        role="group"
        aria-label="Move around the island"
      >
        <button
          type="button"
          aria-label="Move north"
          className="up"
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => {
            move(0, -1);
            sceneRef.current?.focus({ preventScroll: true });
          }}
        >
          ↑
        </button>
        <button
          type="button"
          aria-label="Move west"
          className="left"
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => {
            move(-1, 0);
            sceneRef.current?.focus({ preventScroll: true });
          }}
        >
          ←
        </button>
        <span aria-hidden="true" />
        <button
          type="button"
          aria-label="Move east"
          className="right"
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => {
            move(1, 0);
            sceneRef.current?.focus({ preventScroll: true });
          }}
        >
          →
        </button>
        <button
          type="button"
          aria-label="Move south"
          className="down"
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => {
            move(0, 1);
            sceneRef.current?.focus({ preventScroll: true });
          }}
        >
          ↓
        </button>
        <small>MOVE</small>
      </div>
      <div className="island-action-wrap">
        <button
          className={`island-action ${nearest || dialog ? "is-ready" : ""}`}
          type="button"
          aria-label={dialog ? "A — next dialog page" : "A — talk"}
          onClick={advance}
        >
          A
        </button>
        <small>{dialog ? "NEXT" : "TALK"}</small>
      </div>
      <p className="island-keyboard-hint">
        W A S D / arrows <span>to move</span>
        <i /> Enter <span>to talk</span>
      </p>

      {dialog && (
        <div
          ref={dialogRef}
          tabIndex={-1}
          className={`island-dialog ${mobile && player.y >= 8 ? "is-top" : ""}`}
          role="region"
          aria-label={`${dialog.stop.title} dialog`}
        >
          <div className="island-dialog-top">
            <strong>{dialog.stop.title}</strong>
            <span>
              {dialog.page + 1} / {pages(dialog.stop)}
            </span>
            <button
              type="button"
              aria-label="Close dialog"
              onClick={closeDialog}
            >
              ×
            </button>
          </div>
          <p aria-live="polite">{line(dialog.stop, dialog.page)}</p>
          {dialog.page === 0 && unavailable(dialog.stop.id) && (
            <button
              className="island-retry"
              onClick={refresh}
              disabled={loading}
            >
              Retry Ethereum reads
            </button>
          )}
          <button
            type="button"
            className="island-dialog-next"
            onClick={advance}
          >
            {dialog.stop.id === "hq" && dialog.page === pages(dialog.stop) - 1
              ? "Enter Keel →"
              : dialog.page === pages(dialog.stop) - 1
                ? "Done"
                : "Next"}
            <kbd>A</kbd>
          </button>
        </div>
      )}
      {menu && (
        <div id="island-menu" ref={tourRef} className="island-tour">
          <div className="island-tour-heading">
            <h2>Your island guide</h2>
            <span>{visited.size}/5</span>
          </div>
          <p>Select a stop to walk there.</p>
          {STOPS.slice(0, 5).map((stop) => (
            <button key={stop.id} type="button" onClick={() => goTo(stop)}>
              <span>{stop.number}</span>
              {stop.title}
              <span>{visited.has(stop.id) ? "Visited" : "→"}</span>
            </button>
          ))}
          <button
            type="button"
            className="island-motion"
            aria-pressed={paused}
            onClick={() => setPaused(!paused)}
          >
            {paused ? "Resume ambient motion" : "Pause ambient motion"}
          </button>
          <button type="button" className="island-tour-enter" onClick={onEnter}>
            Enter Keel →
          </button>
        </div>
      )}
      <span className="island-disclaimer">not operated by IMD</span>
      <div className="island-sr" role="status" aria-live="polite">
        {announcement}
      </div>
    </main>
  );
}
