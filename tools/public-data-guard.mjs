import { spawn } from "node:child_process";
import {
  lstat,
  readFile,
  readlink
} from "node:fs/promises";

export const credentialSignals = [
  /(xox[baprs]-[A-Za-z0-9-]{20,}|xapp-[A-Za-z0-9-]{20,}|gh[oprsu]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sb_(?:secret|publishable)_[A-Za-z0-9_-]{20,}|(?:AKIA|ASIA)[A-Z0-9]{16}|sk-(?:proj-)?[A-Za-z0-9_-]{20,})/,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/
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
