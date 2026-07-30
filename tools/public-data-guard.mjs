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
import {
  lstat,
  readFile,
  readlink
} from "node:fs/promises";
