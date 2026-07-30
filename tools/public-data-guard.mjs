import { createHmac } from "node:crypto";

export const credentialSignals = [
  /(xox[baprs]-[A-Za-z0-9-]{20,}|xapp-[A-Za-z0-9-]{20,}|gh[opsu]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sb_(?:secret|publishable)_[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16}|sk-(?:proj-)?[A-Za-z0-9_-]{20,})/,
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

export const matchesPrivateGuardHmac = (content, key, digests) => {
  if (!key || !digests.size) return false;
  const tokens = content.match(/[A-Za-z0-9][A-Za-z0-9@._-]*/g) ?? [];
  const candidates = new Set();
  const addCandidate = (candidate) => {
    if (!candidate) return;
    candidates.add(candidate);
    candidates.add(candidate.toLowerCase());
  };
  for (const token of tokens) addCandidate(token);
  for (let width = 2; width <= 4; width += 1) {
    for (let index = 0; index + width <= tokens.length; index += 1) {
      addCandidate(tokens.slice(index, index + width).join(" "));
    }
  }
  const endpointCandidates = content.match(/[^\s"'`<>{}[\](),;]+/g) ?? [];
  for (const candidate of endpointCandidates) {
    addCandidate(candidate);
    addCandidate(candidate.replace(/[.!?]+$/, ""));
    for (const assignedValue of candidate.split("=")) {
      addCandidate(assignedValue);
      addCandidate(assignedValue.replace(/[.!?]+$/, ""));
    }
  }
  return [...candidates].some((candidate) => digests.has(
    createHmac("sha256", key).update(candidate).digest("hex")
  ));
};
