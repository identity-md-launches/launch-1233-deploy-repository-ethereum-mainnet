# Keel website design

## Overview

Keel is a static Ethereum launchpad for people launching, trading and following projects built on IMD. The implemented identity is black and chrome: a quiet interface around a small illustrated island, with metallic display text, restrained borders and short copy. The island introduces the protocol; the market and token pages prioritize actual chain state and wallet actions.

The source of truth is [web/src/styles.css](web/src/styles.css), [web/src/island.css](web/src/island.css) and the React components in [web/src/](web/src/). [web/src/config.ts](web/src/config.ts) owns network addresses. The theme is intentionally dark and monochrome. There is no light theme or alternate accent palette.

## Colors

These are the active global CSS custom properties, not a proposed palette:

| Token | Value | Role |
| --- | --- | --- |
| `--bg` | `#050505` | Page and space background |
| `--surface` | `#0d0d0f` | Default card surface |
| `--surface-raised` | `#141416` | Raised neutral surface |
| `--border` | `#252527` | Thin card structure |
| `--border-control` | `#55555d` | Control boundary role |
| `--text` | `#ededf0` | Primary content |
| `--text-muted` | `#a4a4ad` | Secondary labels and explanations |
| `--text-subtle` | `#b8b8c0` | Secondary actions |
| `--accent` | `#e7e7ed` | Selected emphasis |
| `--focus` | `#ffffff` | Keyboard perimeter |
| `--chrome` | `linear-gradient(176deg, #fff 5%, #d9d9df 35%, #9898a2 52%, #ececf0 65%, #bcbcc6 100%)` | Large brand/display text |
| `--button-metal` | `linear-gradient(115deg, #f4f4f6 0%, #babac4 53%, #eeeef2 100%)` | Primary action and selected trade direction |

The component stylesheet also uses local neutral shades for input, hover, split-bar and illustration details. Inputs have a visible `#4c4c56` boundary on `#15151a`; trading amount panels use `#565661`. Primary button labels are `#111115`. The island has its own small scoped set: `--island-bg: #050505`, `--island-border: #252527`, `--island-text: #ededf0`, and `--island-muted: #aaaab2`.

Status always has text: Building, Closed, Preview, Quiet, No notice, Notice active. Visited stalls also receive a check and an accessible visited label; the live sign stays dark chrome. Errors use a more visible neutral border and a message, not a color code. Forced-colors rules restore system text, controls and focus where chrome gradients would otherwise disappear. Measured pairs and unresolved image/gradient contrast checks are recorded in [the delivery review](README.md#delivery-checks-and-interface-review).

## Typography

All required faces are local WOFF2 assets in [web/public/fonts/](web/public/fonts/). `font-display: swap` prevents invisible content. The browser review confirmed the files loaded.

| Role | Family / available weights | Implemented use |
| --- | --- | --- |
| Display | Syncopate, sans-serif; 700 | Brand, hero, page titles and island introduction; chrome text gradient |
| Body and controls | Manrope, Arial, sans-serif; variable 400–800 | All prose, fields, navigation, cards and buttons |
| Numbers and references | JetBrains Mono, monospace; variable 400–600 | Prices, shares, counters, timestamps, addresses and eyebrow labels |

Root size is 16px, unitless line height 1.6. Short desktop UI copy is generally 11–13px; token and explanatory paragraphs are 12–13px with 1.8–1.9 line height. The dense market and game use small secondary technical captions, while primary values and actions carry the hierarchy. Mobile text-entry controls are 16px to avoid input-focus zoom. Heading sizes descend from the display hero (up to 56px, 59px at the wide breakpoint), through page titles (36px desktop, 23–30px phone), to section titles (20–26px) and card headings (15–22px). Phone hero text is 24–36px.

`.mono` and `.stat-value` use tabular numbers. Eyebrows use tracked uppercase technical text. Large headings use slightly negative tracking, `text-wrap: balance`, and a short measure. Descriptions use `text-wrap: pretty`; token names, metadata, URLs and error messages can wrap anywhere. Address abbreviations link to the complete explorer record. No emoji assets or icon fonts are used.

## Layout

The shared shell is at most 1512px wide. Desktop gutters are 56px, reduced to 32px below 1160px, then 20px below 700px and 16px below 380px. The wide layout uses 64px gutters. Cards use 20–32px insets, gaps between sections use 24–43px, and larger page/footer separation uses 40–65px. Eight pixels is the base spacing reference; compact components also use 4px steps.

- Header: inline logo, navigation and wallet controls on desktop. Below 700px, logo/wallet occupy the first row and navigation the next row. Island navigation remains a header link at phone widths and is always available in the footer.
- Market: a forest hero with three on-chain statistics, then filters/search, a three-column token grid, a short mechanics link and footer. The grid becomes two columns below 1160px and one below 700px. An empty chain has a real empty state instead of invented cards. RPC failures have their own retry state.
- Phone hero: title and one launch CTA. Supporting copy, pill, statistics and ambient leaves are hidden; no animation pause control is needed in this compact state. The market starts on the first screen.
- Launch: two columns for the form and live preview. The preview is sticky on desktop and follows the form on phone. Paused mode keeps fields editable while the final action explains its disabled state. The permit uses native `details` disclosure.
- Token: main project/basket/run/claim column and sticky trade/fee column. On phone, the trade section moves before the project details, and all cards form one column. Minimum output and deadline stay in the trade review.
- How it works: a short three-stage loop and two-column explanatory cards. One column on phone.

All scrollbars are hidden while normal scrolling remains available. Document overflow was checked at 320px, 390px and desktop widths. Native browser zoom and physical-device behavior have separate validation limits; viewport emulation is not claimed as either.

The island owns a full-viewport layout rather than the shared site shell. Its ground projection is oblique on desktop and top-down in portrait, with sprites scaled 1.6× on phone. The mobile scene now uses a 760×1,000 SVG viewBox across the available width, with a minimum 850px island height and 180px reserved for controls. Short screens scroll vertically instead of shrinking the robots or hiding the nearby-stop prompt. The complete island is 850px high at the checked 390×844 viewport; 320px reflow was also checked. Trees are restricted to back/side edges on mobile. Dialog placement moves to the top when the player is low on the map.

## Elevation & Depth

Card depth comes primarily from neutral surface changes and thin borders. Metallic buttons have a fine inset highlight. Token avatars combine a repeated fine-line texture with a silver gradient and subtle inset/drop shadows. Hero artwork includes its own dark left-side scrim so the title sits over a quiet area.

The island combines an SVG floor grid, extruded slab, dark shards, trees behind the depth-sorted stalls and player, softly lit paths and an obelisk. Live chrome signs and transparent stall/robot hit areas sit above the SVG scene. Signs are at least 46px tall, with an 11px stop title, 10px monospaced main figure, a lit border and hover/press/nearby highlighting. All stall and robot targets are at least 44px in both dimensions. The tour menu uses a dark opaque surface and a soft shadow; dialog text uses a black box with a light border. These are nonmodal regions, leaving Skip and the gameplay controls accessible.

The forest and K mark are original code-drawn local SVGs: [chrome-forest.svg](web/public/chrome-forest.svg) and [keel-mark.svg](web/public/keel-mark.svg). The mark is reused by the site header/footer, island header and HQ. Built-in art is local. Creator images use HTTPS or the configured IPFS gateway; uploads use an optional configured service.

## Shapes

`--radius: 20px` defines cards. Primary/secondary buttons use 10px corners; input fields use 9px; grouped tabs use an 11px outer and 7px selected shape. Status chips are pills. Standard token avatars are 45px squares with 13px corners; larger variants use 76px/20px and the launch preview uses 96px/25px. The island's D-pad has small rounded squares and its A action is circular.

Card borders remain 1px. Keyboard focus is a 2px white outline with a 4px offset in the main site and a 5px offset in the island. Focus styling is tied to `:focus-visible`.

## Components

| Reuse point | Source | Behavior |
| --- | --- | --- |
| `Logo` | `components.tsx` | Shared ribbon K + Syncopate KEEL; optional small size |
| `Icon` | `components.tsx` | One inline SVG stroke set; decorative and inherits text color |
| `Avatar` | `components.tsx` | HTTPS/IPFS image; explicit local blob preview support; brushed chrome ticker letter (K when empty) on missing/failed images |
| `Chip` | `components.tsx` | Text status; optional live dot |
| `Pulse` | `components.tsx` | Accessible progress bar, full at 20; Quiet below 0.5; last-build text |
| `FeeSplit` | `components.tsx` | Launch share preview; team 10%, creator 0–80%, basket remainder |
| `ErrorNotice` | `components.tsx` | Alert with recovery text and optional retry action |
| `Leaves` | `components.tsx` | Decorative silver leaves, desktop pause state and reduced-motion support |
| `.button` | `styles.css` | Neutral default, silver `.primary`, outlined `.ghost`; disabled, hover, focus and press states |
| `.card` | `styles.css` | Shared surface, border and 20px radius |
| `Market`, `TokenCard` | `Market.tsx` | Search/filter/list; loading, unavailable, empty and real-token states |
| `Launch` | `Launch.tsx` | Native fields, live preview/share split, permit disclosure, linked validation errors, focused invalid field and pending state |
| `TokenPage`, `Trade`, `RunRow`, `CreatorPanel` | `TokenPage.tsx` | Quote review with balance gating, approval/trade state, notice warning, run references, close countdown, holder and creator claims, irreversible share decrease |
| `WalletChooser` | `WalletChooser.tsx` | Native modal dialog with installed-wallet names/icons, remembered choice, Disconnect, no-wallet link copying, Escape and focus return |
| `ImagePicker` | `ImagePicker.tsx` | File picker/drop zone, local square WEBP conversion, Replace/Remove, upload availability/error text, secondary HTTPS/IPFS field |
| `Island` | `Island.tsx`, `island.css` | Tile movement, collision checks, tap-to-walk, D-pad, A/Enter, paged dialog and tour menu |

Buttons and links are native elements. The site has one main landmark and a keyboard skip link. Route changes focus the main region; token Buy links then scroll to the trade card and focus its amount input. Forms use visible labels; custom launch errors are linked to the invalid input and focus it. Pending launch fields and pending trade fields are disabled to keep the reviewed values stable. Wallet disconnects clear the displayed account and detach the selected provider listeners. Website, X and Telegram share the same icons between launch fields and token links; their validation hints stay beside each input. Image conversion disables launch until preparation finishes.

The island supports arrows/WASD, Enter/Space for interaction, on-screen D-pad/A and tap-to-walk destination labels. D-pad pointer presses do not retain button focus; they return focus to the scene. Enter and Space inside the scene talk or advance after using those controls. A visible “Press Enter or A to talk to <stop>” prompt remains on phones. Its menu provides a named stop list. Escape closes the menu or dialog and returns focus. Visit progress and dynamic messages have accessible text. Motion is enabled only with `prefers-reduced-motion: no-preference`; the island menu pauses ambient animation, and desktop hero leaves have a pause button. Press feedback uses `scale(.96)` and brief transitions; there is no autoplay audio.

## Do's and Don'ts

- Start a new site page inside `App`'s shared header/main/footer and use hash routing. Reuse `.card`, `.button`, labels and the existing token components.
- Use the silver fill for the main action, and keep adjacent actions neutral. Preserve readable focus outlines and disabled-state explanations.
- Keep chain values nullable until a successful read. A failed read is not a zero, and test fixtures never belong in the production UI.
- Keep addresses in `config.ts`; derive prices, balances, runs and statuses through the chain layer. Preserve exact bigint amounts for transaction arguments.
- Treat metadata as plain text and use the URL filtering already implemented. Preserve first-letter chrome fallback avatars.
- Keep built-in assets local and retain relative export URLs. Remote creator images and the configured upload endpoint are explicit exceptions. Never guess a launch-gate or upload endpoint.
- Preserve the intentionally sealed classified message; the island's hidden area has no explanatory lore.

This document describes the final source and rendered export. Review coverage, fixes, evidence and remaining limits are in [README.md](README.md#delivery-checks-and-interface-review). The review used the pinned Better Interface reference, with its six domains and implementation-documentation method.
