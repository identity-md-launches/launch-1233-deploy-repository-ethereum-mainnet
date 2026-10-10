import { useEffect, useRef, useState } from "react";
import {
  connectWallet,
  disconnectWallet,
  discoverWallets,
  getWalletChoices,
  lastWalletChoice,
  selectedWallet,
  subscribeDiscovery,
} from "./chain/wallet";
import { errorMessage } from "./chain/utils";
import { Icon, shortAddress } from "./components";

export function WalletChooser({
  open,
  close,
  address,
}: {
  open: boolean;
  close: () => void;
  address: string | null;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [choices, setChoices] = useState(getWalletChoices);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const copyInput = useRef<HTMLInputElement>(null);
  useEffect(() => subscribeDiscovery(() => setChoices(getWalletChoices())), []);
  useEffect(() => {
    if (open) {
      setError("");
      setCopied(false);
      discoverWallets();
      dialog.current?.showModal();
    } else dialog.current?.close();
  }, [open]);
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      copyInput.current?.focus();
      copyInput.current?.select();
      setError("Copy the selected link and open it in your wallet app.");
    }
  }
  return (
    <dialog
      className="wallet-dialog card"
      ref={dialog}
      aria-labelledby="wallet-title"
      onCancel={close}
      onClose={close}
    >
      <div className="panel-heading">
        <h2 id="wallet-title">
          {address ? "Your wallet" : "Connect a wallet"}
        </h2>
        <button
          className="icon-button"
          aria-label="Close wallet chooser"
          onClick={close}
        >
          <Icon name="close" />
        </button>
      </div>
      {address && (
        <div className="wallet-connected">
          <span>{selectedWallet()?.info.name}</span>
          <span className="mono" title={address}>
            {shortAddress(address)}
          </span>
          <button
            className="button"
            disabled={!!busy}
            onClick={() => {
              disconnectWallet();
              close();
            }}
          >
            Disconnect
          </button>
        </div>
      )}
      {choices.length ? (
        <>
          <p className="muted small">
            Choose an installed wallet. Transactions use Ethereum.
          </p>
          <div className="wallet-list">
            {choices.map((choice) => (
              <button
                className="wallet-choice"
                key={choice.info.uuid}
                disabled={!!busy}
                onClick={async () => {
                  setBusy(choice.info.uuid);
                  setError("");
                  try {
                    await connectWallet(choice);
                    close();
                  } catch (err) {
                    setError(errorMessage(err));
                  } finally {
                    setBusy("");
                  }
                }}
              >
                {/^data:image\//i.test(choice.info.icon) ? (
                  <img src={choice.info.icon} alt="" width="32" height="32" />
                ) : (
                  <Icon name="wallet" size={28} />
                )}
                <span>
                  {choice.info.name}
                  <small>
                    {busy === choice.info.uuid
                      ? "Confirm in your wallet…"
                      : lastWalletChoice() === choice.info.rdns
                        ? "Last used"
                        : "Installed"}
                  </small>
                </span>
                <Icon name="arrow" />
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="wallet-empty">
          <Icon name="wallet" size={32} />
          <p>Open this site in your wallet app's browser</p>
          <label className="sr-only" htmlFor="wallet-site-link">
            Site link
          </label>
          <input
            ref={copyInput}
            id="wallet-site-link"
            className="mono"
            readOnly
            value={window.location.href}
          />
          <button className="button primary" onClick={copyLink}>
            {copied ? "Link copied" : "Copy link"}
            <Icon name={copied ? "check" : "link"} />
          </button>
          <p className="field-hint">
            On desktop, install an Ethereum wallet extension, then reopen this
            chooser.
          </p>
        </div>
      )}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
    </dialog>
  );
}
