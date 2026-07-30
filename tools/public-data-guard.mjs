import { spawn } from "node:child_process";
import {
  lstat,
  readFile,
  readlink
} from "node:fs/promises";
import { createInterface } from "node:readline";

export const credentialSignals = [
  /(xox[baprs]-[A-Za-z0-9-]{20,}|xapp-[A-Za-z0-9-]{20,}|gh[oprsu]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sb_(?:secret|publishable)_[A-Za-z0-9_-]{20,}|(?:AKIA|ASIA)[A-Z0-9]{16}|sk-(?:proj-)?[A-Za-z0-9_-]{20,})/,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
  /-----BEGIN (?:(?:RSA|DSA|EC|OPENSSH|ENCRYPTED) PRIVATE KEY|PGP PRIVATE KEY BLOCK|PRIVATE KEY)-----/
];

export const decodeForGuard = (content) => {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
  const representations = [buffer.toString("utf8")];
  if (buffer.includes(0)) {
    representations.push(buffer.toString("latin1").replaceAll("\0", ""));
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

export const containsPrivateDenylistValue = (content, denylist) => {
  if (!denylist.length) return false;
  for (const representation of decodeForGuard(content)) {
    const normalized = representation.toLowerCase();
    if (denylist.some((value) => normalized.includes(value.toLowerCase()))) {
      return true;
    }
  }
  return false;
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

export const historicalObjectContentForScan = (content, type) => {
  if (type === "blob") return content;
  if (type !== "commit" && type !== "tag") return Buffer.alloc(0);

  const lines = Buffer.from(content).toString("utf8").split("\n");
  const separator = lines.indexOf("");
  const headers = separator < 0 ? lines : lines.slice(0, separator);
  const message = separator < 0 ? "" : lines.slice(separator + 1).join("\n");
  const textualHeaders = headers
    .filter((line) => (
      type === "commit"
        ? /^(?:author|committer|encoding) /.test(line)
        : /^(?:type|tag|tagger) /.test(line)
    ))
    .map(identityWithoutTimestamp);
  const embeddedTagText = [];
  if (type === "commit") {
    for (let index = 0; index < headers.length; index += 1) {
      const line = headers[index];
      if (!line.startsWith("mergetag ")) continue;
      const embeddedTag = [line.slice("mergetag ".length)];
      while (headers[index + 1]?.startsWith(" ")) {
        index += 1;
        embeddedTag.push(headers[index].slice(1));
      }
      embeddedTagText.push(
        historicalObjectContentForScan(
          Buffer.from(embeddedTag.join("\n")),
          "tag"
        ).toString("utf8")
      );
    }
  }

  return Buffer.from(
    [
      ...textualHeaders,
      ...embeddedTagText,
      signatureTextForScan(message)
    ].join("\n")
  );
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
  const paths = new Set();
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
        paths.add(content.subarray(offset, separator).toString("utf8"));
      }
      offset = separator + 1;
    }
    remainder = content.subarray(offset);
  }
  if (remainder.length) paths.add(remainder.toString("utf8"));
  const exitCode = await completion;
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || `git log exited with code ${exitCode}`);
  }
  return paths;
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
  const refNames = new Set();
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  for await (const line of lines) {
    if (line) refNames.add(line);
  }
  const exitCode = await completion;
  if (exitCode !== 0) {
    throw new Error(
      stderr.trim() || `git for-each-ref exited with code ${exitCode}`
    );
  }
  return refNames;
};
