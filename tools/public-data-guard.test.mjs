import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import {
  findCredentialSignals,
  matchesPrivateGuardHmac
} from "./public-data-guard.mjs";

const fixtureToken = () => ["ghp", "_", "a".repeat(20)].join("");

describe("public data guard", () => {
  it("detects a credential in ordinary text", () => {
    assert.equal(
      findCredentialSignals(Buffer.from(`token=${fixtureToken()}`)).length,
      1
    );
  });

  it("does not skip a credential because the blob also contains a NUL byte", () => {
    assert.equal(
      findCredentialSignals(Buffer.concat([
        Buffer.from(`token=${fixtureToken()}`),
        Buffer.from([0, 1, 2])
      ])).length,
      1
    );
  });

  it("detects an ASCII credential encoded as UTF-16LE", () => {
    assert.equal(
      findCredentialSignals(Buffer.from(`token=${fixtureToken()}`, "utf16le")).length,
      1
    );
  });

  it("matches a keyed digest of an exact mixed-case deployment identifier", () => {
    const key = "private-ci-fixture-key";
    const identifier = "Worker-Host-A";
    const digest = createHmac("sha256", key).update(identifier).digest("hex");
    assert.equal(
      matchesPrivateGuardHmac(
        `approved host: ${identifier}`,
        key,
        new Set([digest])
      ),
      true
    );
  });

  it("matches exact endpoint identifiers containing punctuation", () => {
    const key = "private-ci-fixture-key";
    for (const identifier of [
      "2001:db8::42",
      "https://worker.example.test:8443/api"
    ]) {
      const digest = createHmac("sha256", key).update(identifier).digest("hex");
      assert.equal(
        matchesPrivateGuardHmac(
          `endpoint=${identifier}`,
          key,
          new Set([digest])
        ),
        true
      );
    }
  });
});
