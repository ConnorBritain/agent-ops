import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  containsPrivateDenylistValue,
  findCredentialSignals,
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

  it("detects every GitHub bearer-token prefix, including refresh tokens", () => {
    for (const prefix of ["ghp", "gho", "ghu", "ghs", "ghr"]) {
      const token = [prefix, "_", "a".repeat(20)].join("");
      assert.equal(findCredentialSignals(Buffer.from(token)).length, 1);
    }
  });

  it("matches exact private values without publishing their shape", () => {
    const fixtures = [
      "Worker-Host-A",
      "2001:db8::42",
      "https://worker.example.test:8443/api",
      "Acme Very Private Worker Organization"
    ];
    const content = `inventory: ${fixtures.join("\n")}`;
    for (const value of fixtures) {
      assert.equal(
        containsPrivateDenylistValue(content, [value]),
        true
      );
    }
  });

  it("matches private values case-insensitively", () => {
    assert.equal(
      containsPrivateDenylistValue(
        "approved host: worker-host-a",
        ["Worker-Host-A"]
      ),
      true
    );
  });
});
