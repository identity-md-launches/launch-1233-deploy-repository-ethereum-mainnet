import { useEffect, useRef, useState } from "react";
import { config } from "./config";
import { Avatar, Icon } from "./components";
import { errorMessage, safeUrl } from "./chain/utils";

export async function prepareImage(file: File): Promise<File> {
  if (
    !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)
  )
    throw new Error("Choose a PNG, JPG, WEBP or GIF image.");
  if (file.size > 2 * 1024 * 1024)
    throw new Error("Choose an image up to 2 MB.");
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("This image could not be read. Choose another file.");
  });
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    if (!side) throw new Error("This image is empty. Choose another file.");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error(
        "Image processing is unavailable in this browser. Use an image link instead.",
      );
    context.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      512,
      512,
    );
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value
            ? resolve(value)
            : reject(new Error("Unable to process this image.")),
        "image/webp",
        0.86,
      ),
    );
    if (blob.type !== "image/webp")
      throw new Error(
        "WEBP encoding is unavailable in this browser. Use an image link instead.",
      );
    return new File([blob], "keel-image.webp", { type: "image/webp" });
  } finally {
    bitmap.close();
  }
}

export async function uploadImage(file: File): Promise<string> {
  if (!config.uploadUrl)
    throw new Error("Image upload opens together with launches");
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(config.uploadUrl, {
    method: "POST",
    body,
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error("Image upload failed. Try again.");
  const result = (await response.json()) as { cid?: unknown };
  // Accept CIDv0 or base32/base58btc CIDv1, never a URL supplied by the server.
  if (
    typeof result.cid !== "string" ||
    !/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{20,}|z[1-9A-HJ-NP-Za-km-z]{20,})$/.test(
      result.cid,
    )
  )
    throw new Error("The upload server did not return an IPFS CID. Try again.");
  return `ipfs://${result.cid}`;
}

export function ImagePicker({
  image,
  preview,
  symbol,
  disabled,
  onImage,
  onFile,
  onProcessing,
}: {
  image: string;
  preview: string;
  symbol: string;
  disabled: boolean;
  onImage: (url: string) => void;
  onFile: (file: File | null, preview: string) => void;
  onProcessing: (processing: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [linkMode, setLinkMode] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const generation = useRef(0);
  const localUrl = useRef("");
  useEffect(
    () => () => {
      generation.current++;
      URL.revokeObjectURL(localUrl.current);
    },
    [],
  );
  function clear() {
    generation.current++;
    URL.revokeObjectURL(localUrl.current);
    localUrl.current = "";
    onFile(null, "");
    onImage("");
    setError("");
    setProcessing(false);
    onProcessing(false);
    if (input.current) input.current.value = "";
  }
  async function pick(file?: File) {
    if (!file || disabled) return;
    const request = ++generation.current;
    setError("");
    setProcessing(true);
    onProcessing(true);
    try {
      const processed = await prepareImage(file);
      if (request !== generation.current) return;
      URL.revokeObjectURL(localUrl.current);
      localUrl.current = URL.createObjectURL(processed);
      onImage("");
      onFile(processed, localUrl.current);
      setLinkMode(false);
    } catch (err) {
      if (request === generation.current) setError(errorMessage(err));
    } finally {
      if (request === generation.current) {
        setProcessing(false);
        onProcessing(false);
      }
    }
  }
  return (
    <fieldset
      className="image-field"
      disabled={disabled}
      aria-describedby="image-help"
    >
      <legend>Token image</legend>
      <div
        className={`image-drop ${dragging ? "is-dragging" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void pick(event.dataTransfer.files[0]);
        }}
      >
        {preview || image ? (
          <Avatar
            image={preview || image}
            symbol={symbol}
            localPreview={!!preview}
            size="avatar-large"
          />
        ) : (
          <Icon name="upload" size={28} />
        )}
        <div className="image-drop-content">
          <strong>
            {processing
              ? "Preparing image…"
              : preview || image
                ? "Your token image"
                : "Drop an image here"}
          </strong>
          <span className="field-hint">PNG, JPG, WEBP or GIF · up to 2 MB</span>
          <span className="field-hint">
            Center-cropped to 512 × 512 WEBP. GIFs use a still frame.
          </span>
          <div className="image-actions">
            <button
              type="button"
              className="button"
              onClick={() => input.current?.click()}
              disabled={processing || disabled}
            >
              {preview || image ? "Replace" : "Choose image"}
            </button>
            {(preview || image) && (
              <button type="button" className="text-button" onClick={clear}>
                Remove
              </button>
            )}
          </div>
        </div>
        <input
          ref={input}
          type="file"
          name="imageFile"
          className="sr-only"
          tabIndex={-1}
          aria-label="Choose token image"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(event) => {
            void pick(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>
      <p id="image-help" className="field-hint">
        {config.uploadUrl
          ? "Your processed image is uploaded to IPFS when you launch."
          : "Image upload opens together with launches"}
      </p>
      <button
        type="button"
        className="text-button image-link-toggle"
        aria-expanded={linkMode}
        aria-controls="image-link-field"
        onClick={() => setLinkMode(!linkMode)}
      >
        Use an image link instead <Icon name="link" size={14} />
      </button>
      {linkMode && (
        <label id="image-link-field">
          Image link
          <input
            name="image"
            type="url"
            value={image}
            placeholder="https:// or ipfs://"
            aria-invalid={!!image && !safeUrl(image)}
            onChange={(event) => {
              clear();
              onImage(event.target.value);
            }}
            onBlur={() => {
              if (image && !safeUrl(image))
                setError("Use an HTTPS or IPFS image link.");
            }}
          />
        </label>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
