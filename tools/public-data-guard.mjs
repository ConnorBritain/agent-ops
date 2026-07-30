import { spawn } from "node:child_process";
import {
  lstat,
  readFile,
  readlink
} from "node:fs/promises";
import { createInterface } from "node:readline";
import { TextDecoder } from "node:util";

const windows1252Decoder = new TextDecoder("windows-1252");
const utf16leDecoder = new TextDecoder("utf-16le");
const utf16beDecoder = new TextDecoder("utf-16be");

export const credentialSignals = [
  /(xox[baprs]-[A-Za-z0-9-]{20,}|xapp-[A-Za-z0-9-]{20,}|gh[oprsu]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sb_(?:secret|publishable)_[A-Za-z0-9_-]{20,}|(?:AKIA|ASIA)[A-Z0-9]{16}|sk-(?:proj-)?[A-Za-z0-9_-]{20,})/,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
  /-----BEGIN (?:(?:RSA|DSA|EC|OPENSSH|ENCRYPTED) PRIVATE KEY|PGP PRIVATE KEY BLOCK|PRIVATE KEY)-----/
];

export const decodeForGuard = (content) => {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
  const shifted = buffer.subarray(1);
  const representations = [
    buffer.toString("utf8"),
    buffer.toString("latin1"),
    windows1252Decoder.decode(buffer),
    utf16leDecoder.decode(buffer),
    utf16beDecoder.decode(buffer),
    utf16leDecoder.decode(shifted),
    utf16beDecoder.decode(shifted)
  ];
  if (buffer.includes(0)) {
    representations.push(
      ...representations.map((value) => value.replaceAll("\0", ""))
    );
  }
  return [...new Set(representations)];
};

export const findCredentialSignals = (content) => {
  const matches = new Set();
  for (const representation of decodeForGuard(content)) {
    for (const pattern of credentialSignals) {
      if (pattern.test(representation)) matches.add(pattern.toString());
    }
  }
  return [...matches];
};

const canonicalizeGuardText = (value) =>
  value.normalize("NFC");

const canonicalCaseFold = (value) =>
  value
    .normalize("NFD")
    .toLowerCase()
    .toUpperCase()
    .toLowerCase()
    .normalize("NFD");

const escapeRegExp = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const literalPattern = (value) =>
  new RegExp(escapeRegExp(value), "iu");

const codePointLength = (value) => [...value].length;
const complexCodePointCache = new Map();
const isolatedFoldSignatureCache = new Map();
const combiningMarkPattern = /\p{M}/u;
const canonicalSigma = "\u03c3";
const finalSigma = "\u03c2";

const mixCodePoint = (codePoint, seed) => {
  let value = (codePoint ^ seed) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
};

const foldSignature = (foldedValue) => {
  let length = 0;
  let hashA = 0;
  let hashB = 0;
  for (const character of foldedValue) {
    // Canonical ordering preserves this additive signature. Collapsing the
    // context-sensitive final sigma makes isolated and whole-string folds
    // comparable; a signature hit is still verified by an exact span fold.
    const codePoint = (
      character === finalSigma ? canonicalSigma : character
    ).codePointAt(0);
    length += 1;
    hashA = (hashA + mixCodePoint(codePoint, 0x9e3779b9)) >>> 0;
    hashB = (hashB + mixCodePoint(codePoint, 0x85ebca6b)) >>> 0;
  }
  return { length, hashA, hashB };
};

const isolatedFoldSignature = (codePoint) => {
  if (isolatedFoldSignatureCache.has(codePoint)) {
    return isolatedFoldSignatureCache.get(codePoint);
  }
  const signature = foldSignature(canonicalCaseFold(codePoint));
  isolatedFoldSignatureCache.set(codePoint, signature);
  return signature;
};

const signatureKey = ({ hashA, hashB }) => `${hashA}:${hashB}`;

const isComplexCodePoint = (codePoint) => {
  if (complexCodePointCache.has(codePoint)) {
    return complexCodePointCache.get(codePoint);
  }
  const complex =
    codePoint.codePointAt(0) > 0x7f &&
    (
      combiningMarkPattern.test(codePoint) ||
      codePoint.normalize("NFD") !== codePoint ||
      codePointLength(canonicalCaseFold(codePoint)) !== 1
    );
  complexCodePointCache.set(codePoint, complex);
  return complex;
};

const candidateStartIntervals = (complexPositions, maximumLength) => {
  const intervals = [];
  for (const position of complexPositions) {
    const start = Math.max(0, position - maximumLength + 1);
    const end = position;
    const previous = intervals.at(-1);
    if (previous && start <= previous.end + 1) {
      previous.end = Math.max(previous.end, end);
    } else {
      intervals.push({ start, end });
    }
  }
  return intervals;
};

const hasBoundarySafeCanonicalMatch = (
  representation,
  foldedDenylist,
  foldedDenylistSignatures,
  maximumCandidateCodePoints
) => {
  const codePoints = [...representation];
  const complexPositions = [];
  const prefixLengths = [0];
  const prefixHashA = [0];
  const prefixHashB = [0];
  const prefixComplexCounts = [0];
  for (let index = 0; index < codePoints.length; index += 1) {
    const complex = isComplexCodePoint(codePoints[index]);
    if (complex) complexPositions.push(index);
    const signature = isolatedFoldSignature(codePoints[index]);
    prefixLengths.push(prefixLengths[index] + signature.length);
    prefixHashA.push((prefixHashA[index] + signature.hashA) >>> 0);
    prefixHashB.push((prefixHashB[index] + signature.hashB) >>> 0);
    prefixComplexCounts.push(prefixComplexCounts[index] + (complex ? 1 : 0));
  }
  if (!complexPositions.length) return false;

  const maximumLength = Math.min(
    codePoints.length,
    maximumCandidateCodePoints
  );
  const intervals = candidateStartIntervals(complexPositions, maximumLength);
  // Each isolated fold contributes at least one code point, so its prefix
  // length is strictly increasing. For each denylist length, a start has at
  // most one possible end and the end cursor only moves forward.
  for (const [foldedLength, denylistSignatureKeys] of (
    foldedDenylistSignatures
  )) {
    for (const interval of intervals) {
      let endExclusive = interval.start + 1;
      for (let start = interval.start; start <= interval.end; start += 1) {
        if (endExclusive <= start) endExclusive = start + 1;
        const targetLength = prefixLengths[start] + foldedLength;
        const maximumEndExclusive = Math.min(
          codePoints.length,
          start + maximumLength
        );
        while (
          endExclusive <= maximumEndExclusive &&
          prefixLengths[endExclusive] < targetLength
        ) {
          endExclusive += 1;
        }
        if (
          endExclusive > maximumEndExclusive ||
          prefixLengths[endExclusive] !== targetLength ||
          prefixComplexCounts[endExclusive] === prefixComplexCounts[start]
        ) {
          continue;
        }
        const candidateSignatureKey = signatureKey({
          hashA: (prefixHashA[endExclusive] - prefixHashA[start]) >>> 0,
          hashB: (prefixHashB[endExclusive] - prefixHashB[start]) >>> 0
        });
        if (!denylistSignatureKeys.has(candidateSignatureKey)) continue;
        const candidate = codePoints.slice(start, endExclusive).join("");
        if (foldedDenylist.has(canonicalCaseFold(candidate))) return true;
      }
    }
  }
  return false;
};

export const containsPrivateDenylistValue = (content, denylist) => {
  if (!denylist.length) return false;
  const matchers = denylist.map((value) => {
    const canonicalCaseFolded = canonicalCaseFold(value);
    const decomposedValue = value.normalize("NFD");
    return {
      raw: value,
      caseInsensitive: literalPattern(value),
      canonicalCaseInsensitive: literalPattern(canonicalizeGuardText(value)),
      canonicalCaseFolded,
      maximumCandidateCodePoints: Math.max(
        codePointLength(decomposedValue),
        codePointLength(canonicalCaseFolded.normalize("NFD"))
      )
    };
  });
  const foldedDenylist = new Set(
    matchers.map(({ canonicalCaseFolded }) => canonicalCaseFolded)
  );
  const foldedDenylistSignatures = new Map();
  for (const canonicalCaseFolded of foldedDenylist) {
    const signature = foldSignature(canonicalCaseFolded);
    const signaturesAtLength =
      foldedDenylistSignatures.get(signature.length) ?? new Set();
    signaturesAtLength.add(signatureKey(signature));
    foldedDenylistSignatures.set(signature.length, signaturesAtLength);
  }
  const foldedDenylistPattern = new RegExp(
    `(?:${[...foldedDenylist].map(escapeRegExp).join("|")})`,
    "u"
  );
  const maximumCandidateCodePoints = Math.max(
    ...matchers.map(({ maximumCandidateCodePoints }) =>
      maximumCandidateCodePoints
    )
  );
  for (const representation of decodeForGuard(content)) {
    const canonicalRepresentation = canonicalizeGuardText(representation);
    if (matchers.some(({
      raw,
      caseInsensitive,
      canonicalCaseInsensitive
    }) =>
      representation.includes(raw) ||
      caseInsensitive.test(representation) ||
      canonicalCaseInsensitive.test(canonicalRepresentation)
    )) {
      return true;
    }
    if (foldedDenylistPattern.test(canonicalCaseFold(representation))) {
      return true;
    }
    if (hasBoundarySafeCanonicalMatch(
      representation,
      foldedDenylist,
      foldedDenylistSignatures,
      maximumCandidateCodePoints
    )) return true;
  }
  return false;
};

export const createIncrementalGuardScanner = (denylist) => {
  const overlapBytes = Math.max(
    256,
    ...denylist.map((value) => (Buffer.byteLength(value, "utf8") * 4) + 16)
  );
  let tail = Buffer.alloc(0);
  let privateValue = false;
  const signals = new Set();

  return {
    write(chunk) {
      const content = tail.length
        ? Buffer.concat([tail, chunk])
        : chunk;
      if (!privateValue && containsPrivateDenylistValue(content, denylist)) {
        privateValue = true;
      }
      for (const signal of findCredentialSignals(content)) {
        signals.add(signal);
      }
      tail = Buffer.from(
        content.subarray(Math.max(0, content.length - overlapBytes))
      );
    },
    finish() {
      return {
        privateValue,
        credentialSignals: [...signals]
      };
    },
    get retainedByteLength() {
      return tail.length;
    },
    overlapBytes
  };
};

export const readRepositoryEntry = async (absolutePath) => {
  const metadata = await lstat(absolutePath);
  if (metadata.isSymbolicLink()) {
    return Buffer.from(await readlink(absolutePath));
  }
  return readFile(absolutePath);
};

export const parseHistoricalObjectLine = (line) => {
  const firstSpace = line.indexOf(" ");
  if (firstSpace < 0) {
    return { objectId: line, historicalPath: undefined };
  }
  return {
    objectId: line.slice(0, firstSpace),
    historicalPath: line.slice(firstSpace + 1)
  };
};

export const historicalObjectNeedsContentScan = (type) =>
  type === "blob" || type === "commit" || type === "tag";

const signatureTextForScan = (value) => {
  const retained = [];
  let inSignature = false;
  let acceptingArmorHeaders = false;
  for (const line of value.split("\n")) {
    if (/^-----BEGIN [A-Z0-9 ]*SIGNATURE-----$/.test(line)) {
      retained.push(line);
      inSignature = true;
      acceptingArmorHeaders = true;
      continue;
    }
    if (!inSignature) {
      retained.push(line);
      continue;
    }
    if (/^-----END [A-Z0-9 ]*SIGNATURE-----$/.test(line)) {
      retained.push(line);
      inSignature = false;
      acceptingArmorHeaders = false;
      continue;
    }
    if (!acceptingArmorHeaders) continue;
    if (!line.trim()) {
      acceptingArmorHeaders = false;
      continue;
    }
    if (/^[A-Za-z][A-Za-z0-9-]*:\s*/.test(line)) {
      retained.push(line);
    } else {
      acceptingArmorHeaders = false;
    }
  }
  return retained.join("\n");
};

const identityWithoutTimestamp = (line) => {
  const match = /^(author|committer|tagger) (.+?) -?\d+ [+-]\d{4}$/.exec(line);
  return match ? `${match[1]} ${match[2]}` : line;
};

const historicalObjectTextForScan = (value, type) => {
  const lines = value.split("\n");
  const separator = lines.indexOf("");
  const headers = separator < 0 ? lines : lines.slice(0, separator);
  const message = separator < 0 ? "" : lines.slice(separator + 1).join("\n");
  const textualHeaders = [];
  const embeddedTagText = [];
  const commitSignatureText = [];
  const structuralHeaders = type === "commit"
    ? new Set(["tree", "parent"])
    : new Set(["object"]);
  for (let index = 0; index < headers.length; index += 1) {
    const line = headers[index];
    const firstSpace = line.indexOf(" ");
    const key = firstSpace < 0 ? line : line.slice(0, firstSpace);
    const continued = [];
    while (headers[index + 1]?.startsWith(" ")) {
      index += 1;
      continued.push(headers[index].slice(1));
    }
    if (type === "commit" && key === "mergetag") {
      const embeddedTag = [
        firstSpace < 0 ? "" : line.slice(firstSpace + 1),
        ...continued
      ];
      embeddedTagText.push(
        historicalObjectTextForScan(embeddedTag.join("\n"), "tag")
      );
      continue;
    }
    if (
      type === "commit" &&
      (key === "gpgsig" || key === "gpgsig-sha256")
    ) {
      const signature = [
        firstSpace < 0 ? "" : line.slice(firstSpace + 1),
        ...continued
      ];
      commitSignatureText.push(
        signatureTextForScan(signature.join("\n"))
      );
      continue;
    }
    if (structuralHeaders.has(key)) continue;
    textualHeaders.push(identityWithoutTimestamp(line), ...continued);
  }

  return [
    ...textualHeaders,
    ...embeddedTagText,
    ...commitSignatureText,
    signatureTextForScan(message)
  ].join("\n");
};

const declaredCommitText = (content) => {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
  const separator = buffer.indexOf(Buffer.from("\n\n"));
  const headers = buffer
    .subarray(0, separator < 0 ? buffer.length : separator)
    .toString("latin1");
  const match = /^encoding ([^\r\n]+)$/m.exec(headers);
  if (!match) return undefined;
  const encoding = match[1].trim();
  try {
    return new TextDecoder(encoding).decode(buffer);
  } catch (error) {
    throw new Error(
      `Unsupported declared Git commit encoding ${JSON.stringify(encoding)}: ${error.message}`
    );
  }
};

export const historicalObjectContentForScan = (content, type) => {
  if (type === "blob") return content;
  if (type !== "commit" && type !== "tag") return Buffer.alloc(0);
  const declaredText = type === "commit"
    ? declaredCommitText(content)
    : undefined;
  return Buffer.from(
    [...new Set(
      [
        ...decodeForGuard(content),
        ...(declaredText === undefined ? [] : [declaredText])
      ]
        .map((value) => historicalObjectTextForScan(value, type))
    )].join("\n")
  );
};

const addRawPath = (paths, value) => {
  const owned = Buffer.from(value);
  paths.set(owned.toString("hex"), owned);
};

const collectRefObjectIds = async (repositoryRoot) => {
  const child = spawn("git", ["for-each-ref", "--format=%(objectname)"], {
    cwd: repositoryRoot,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const completion = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  const objectIds = new Set();
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  for await (const line of lines) {
    if (line) objectIds.add(line);
  }
  const exitCode = await completion;
  if (exitCode !== 0) {
    throw new Error(
      stderr.trim() || `git for-each-ref exited with code ${exitCode}`
    );
  }
  return objectIds;
};

const collectRefTreePaths = async (repositoryRoot) => {
  const paths = new Map();
  for (const objectId of await collectRefObjectIds(repositoryRoot)) {
    const child = spawn(
      "git",
      ["ls-tree", "-r", "-z", "--name-only", `${objectId}^{tree}`],
      {
        cwd: repositoryRoot,
        stdio: ["ignore", "pipe", "pipe"]
      }
    );
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    const completion = new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    let remainder = Buffer.alloc(0);
    for await (const chunk of child.stdout) {
      const content = remainder.length
        ? Buffer.concat([remainder, chunk])
        : chunk;
      let offset = 0;
      while (true) {
        const separator = content.indexOf(0, offset);
        if (separator < 0) break;
        if (separator > offset) {
          addRawPath(paths, content.subarray(offset, separator));
        }
        offset = separator + 1;
      }
      remainder = Buffer.from(content.subarray(offset));
    }
    if (remainder.length) {
      throw new Error(`Incomplete git ls-tree output for ${objectId}`);
    }
    const exitCode = await completion;
    if (exitCode === 0) continue;
    if (/(?:not a tree object|expected tree type)/i.test(stderr)) continue;
    throw new Error(
      stderr.trim() || `git ls-tree exited with code ${exitCode} for ${objectId}`
    );
  }
  return [...paths.values()];
};

export const collectHistoricalPaths = async (repositoryRoot) => {
  const child = spawn(
    "git",
    [
      "log",
      "--all",
      "-m",
      "--format=",
      "--name-only",
      "--no-renames",
      "-z",
      "--root"
    ],
    {
      cwd: repositoryRoot,
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const completion = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  const paths = new Map();
  let remainder = Buffer.alloc(0);
  for await (const chunk of child.stdout) {
    const content = remainder.length
      ? Buffer.concat([remainder, chunk])
      : chunk;
    let offset = 0;
    while (true) {
      const separator = content.indexOf(0, offset);
      if (separator < 0) break;
      if (separator > offset) {
        addRawPath(paths, content.subarray(offset, separator));
      }
      offset = separator + 1;
    }
    remainder = Buffer.from(content.subarray(offset));
  }
  if (remainder.length) addRawPath(paths, remainder);
  const exitCode = await completion;
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || `git log exited with code ${exitCode}`);
  }
  for (const refTreePath of await collectRefTreePaths(repositoryRoot)) {
    addRawPath(paths, refTreePath);
  }
  return [...paths.values()];
};

export const collectRefNames = async (repositoryRoot) => {
  const child = spawn("git", ["for-each-ref", "--format=%(refname)"], {
    cwd: repositoryRoot,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const completion = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  const refNames = new Map();
  let remainder = Buffer.alloc(0);
  for await (const chunk of child.stdout) {
    const content = remainder.length
      ? Buffer.concat([remainder, chunk])
      : chunk;
    let offset = 0;
    while (true) {
      const newline = content.indexOf(0x0a, offset);
      if (newline < 0) break;
      if (newline > offset) {
        addRawPath(refNames, content.subarray(offset, newline));
      }
      offset = newline + 1;
    }
    remainder = Buffer.from(content.subarray(offset));
  }
  if (remainder.length) addRawPath(refNames, remainder);
  const exitCode = await completion;
  if (exitCode !== 0) {
    throw new Error(
      stderr.trim() || `git for-each-ref exited with code ${exitCode}`
    );
  }
  return [...refNames.values()];
};
