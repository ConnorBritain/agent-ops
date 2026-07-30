import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findCredentialSignals } from "./public-data-guard.mjs";

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
});
