import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { promisify } from "node:util";
import {
  collectHistoricalPaths,
  collectRefNames,
  containsPrivateDenylistValue,
  findCredentialSignals,
  historicalObjectNeedsContentScan,
  parseHistoricalObjectLine,
  readRepositoryEntry
} from "./public-data-guard.mjs";

const fixtureToken = () => ["ghp", "_", "a".repeat(20)].join("");
const execFileAsync = promisify(execFile);

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

  it("detects long-lived and temporary AWS access-key IDs", () => {
    for (const prefix of ["AKIA", "ASIA"]) {
      const accessKeyId = [prefix, "A".repeat(16)].join("");
      assert.equal(findCredentialSignals(Buffer.from(accessKeyId)).length, 1);
    }
  });

  it("detects standard private-key block headers", () => {
    for (const type of [
      "",
      "RSA ",
      "DSA ",
      "EC ",
      "OPENSSH ",
      "ENCRYPTED "
    ]) {
      const header = `-----BEGIN ${type}PRIVATE KEY-----`;
      assert.equal(findCredentialSignals(Buffer.from(header)).length, 1);
    }
    assert.equal(
      findCredentialSignals(
        Buffer.from(["-----BEGIN PGP ", "PRIVATE KEY BLOCK-----"].join(""))
      ).length,
      1
    );
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

  it("scans symlink text without following missing, file, or directory targets", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "agentops-guard-"));
    try {
      await writeFile(path.join(directory, "target.txt"), "outside target");
      await mkdir(path.join(directory, "target-directory"));
      for (const [name, target] of [
        ["missing-link", "missing-target"],
        ["file-link", "target.txt"],
        ["directory-link", "target-directory"]
      ]) {
        const link = path.join(directory, name);
        await symlink(target, link);
        assert.equal((await readRepositoryEntry(link)).toString("utf8"), target);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("retains pathless commit and tag objects for content scanning", () => {
    const objectId = "a".repeat(40);
    assert.deepEqual(parseHistoricalObjectLine(objectId), {
      objectId,
      historicalPath: undefined
    });
    assert.deepEqual(parseHistoricalObjectLine(`${objectId} deploy.sh`), {
      objectId,
      historicalPath: "deploy.sh"
    });
    assert.equal(historicalObjectNeedsContentScan("blob"), true);
    assert.equal(historicalObjectNeedsContentScan("commit"), true);
    assert.equal(historicalObjectNeedsContentScan("tag"), true);
    assert.equal(historicalObjectNeedsContentScan("tree"), false);
  });

  it("retains a sensitive historical path after an unchanged rename", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "agentops-history-"));
    const runGit = (...arguments_) =>
      execFileAsync("git", arguments_, { cwd: directory });
    try {
      await runGit("init", "--quiet");
      await writeFile(path.join(directory, ".env"), "placeholder=true\n");
      await runGit("add", "--force", ".env");
      await runGit(
        "-c",
        "user.name=AgentOps Guard",
        "-c",
        "user.email=guard@example.invalid",
        "commit",
        "--quiet",
        "-m",
        "Add fixture"
      );
      await runGit("mv", ".env", ".env.example");
      await runGit(
        "-c",
        "user.name=AgentOps Guard",
        "-c",
        "user.email=guard@example.invalid",
        "commit",
        "--quiet",
        "-m",
        "Rename fixture"
      );

      const historicalPaths = await collectHistoricalPaths(directory);
      assert.equal(historicalPaths.has(".env"), true);
      assert.equal(historicalPaths.has(".env.example"), true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("retains a sensitive path introduced while creating a merge commit", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "agentops-merge-history-"));
    const runGit = (...arguments_) =>
      execFileAsync("git", arguments_, { cwd: directory });
    const commit = (message) =>
      runGit(
        "-c",
        "user.name=AgentOps Guard",
        "-c",
        "user.email=guard@example.invalid",
        "commit",
        "--quiet",
        "-m",
        message
      );
    try {
      await runGit("init", "--quiet", "--initial-branch=main");
      await writeFile(path.join(directory, "base.txt"), "base\n");
      await runGit("add", "base.txt");
      await commit("Add base");

      await runGit("switch", "--quiet", "-c", "side");
      await writeFile(path.join(directory, "side.txt"), "side\n");
      await runGit("add", "side.txt");
      await commit("Add side");

      await runGit("switch", "--quiet", "main");
      await writeFile(path.join(directory, "main.txt"), "main\n");
      await runGit("add", "main.txt");
      await commit("Add main");
      await runGit(
        "-c",
        "user.name=AgentOps Guard",
        "-c",
        "user.email=guard@example.invalid",
        "merge",
        "--quiet",
        "--no-ff",
        "--no-commit",
        "side"
      );
      await writeFile(path.join(directory, ".env"), "placeholder=true\n");
      await runGit("add", "--force", ".env");
      await commit("Merge side with fixture");

      const historicalPaths = await collectHistoricalPaths(directory);
      assert.equal(historicalPaths.has(".env"), true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("enumerates lightweight ref names for private-value scanning", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "agentops-ref-history-"));
    const runGit = (...arguments_) =>
      execFileAsync("git", arguments_, { cwd: directory });
    try {
      await runGit("init", "--quiet");
      await writeFile(path.join(directory, "fixture.txt"), "fixture\n");
      await runGit("add", "fixture.txt");
      await runGit(
        "-c",
        "user.name=AgentOps Guard",
        "-c",
        "user.email=guard@example.invalid",
        "commit",
        "--quiet",
        "-m",
        "Add fixture"
      );
      await runGit("tag", "private-host-zephyr");

      const refNames = await collectRefNames(directory);
      const tagName = "refs/tags/private-host-zephyr";
      assert.equal(refNames.has(tagName), true);
      assert.equal(
        containsPrivateDenylistValue([...refNames].join("\n"), [
          "private-host-zephyr"
        ]),
        true
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
