import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { keccak256, toUtf8Bytes } from "ethers";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const artifactRoot = resolve(root, process.argv[2] ?? "test/scratch/forge-out");
const output = resolve(root, "web/src/abi");
const configText = await readFile(resolve(root, "web/src/config.ts"), "utf8");
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
const fingerprints = {};
await mkdir(output, { recursive: true });
for (const name of [
  "KeelToken",
  "KeelVault",
  "KeelFactory",
  "KeelRouter",
  "KeelHook",
]) {
  const artifact = JSON.parse(
    await readFile(resolve(artifactRoot, `${name}.sol/${name}.json`), "utf8"),
  );
  const abiHash = keccak256(
    toUtf8Bytes(JSON.stringify(canonical(artifact.abi))),
  ).slice(2);
  const abiPins = configText
    .split("abiHashes:")[1]
    .split("creationCodeHashes:")[0];
  const creationPins = configText.split("creationCodeHashes:")[1];
  const expected = abiPins.match(
    new RegExp(`${name}:\\s*['"]([a-f0-9]{64})['"]`),
  )?.[1];
  if (expected && abiHash !== expected)
    throw new Error(`${name}: ABI hash mismatch: ${abiHash}`);
  if (!expected && name !== "KeelHook")
    throw new Error(`${name}: missing pinned hash`);
  const expectedCreation = creationPins.match(
    new RegExp(`${name}:\\s*['"]([a-f0-9]{64})['"]`),
  )?.[1];
  if (
    expectedCreation &&
    keccak256(artifact.bytecode.object).slice(2) !== expectedCreation
  )
    throw new Error(`${name}: creation bytecode mismatch`);
  const code = artifact.deployedBytecode.object;
  const immutableReferences = Object.values(
    artifact.deployedBytecode.immutableReferences ?? {},
  )
    .flat()
    .sort((a, b) => a.start - b.start);
  let normalized = code.slice(2);
  for (const slot of immutableReferences)
    normalized =
      normalized.slice(0, slot.start * 2) +
      "0".repeat(slot.length * 2) +
      normalized.slice((slot.start + slot.length) * 2);
  fingerprints[name] = {
    bytes: normalized.length / 2,
    normalizedKeccak: keccak256(`0x${normalized}`),
    immutableReferences,
  };
  await writeFile(
    resolve(output, `${name}.json`),
    JSON.stringify(artifact.abi) + "\n",
  );
  console.log(
    `${name}: canonicalKeccak(abi)=${abiHash}; pinned=${Boolean(expected)}; creationKeccak=${keccak256(artifact.bytecode.object)}`,
  );
}
await writeFile(
  resolve(output, "runtime-fingerprints.json"),
  JSON.stringify(fingerprints, null, 2) + "\n",
);
