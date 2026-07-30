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
  createIncrementalGuardScanner,
  findCredentialSignals,
  historicalObjectContentForScan,
  historicalObjectNeedsContentScan,
  parseHistoricalObjectLine,
  readRepositoryEntry
} from "./public-data-guard.mjs";

const fixtureToken = () => ["ghp", "_", "a".repeat(20)].join("");
const execFileAsync = promisify(execFile);
const hasHistoricalPath = (paths, expected) =>
  paths.some((value) => value.equals(Buffer.from(expected)));

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

  it("matches non-ASCII UTF-16 text that contains no NUL bytes", () => {
    for (const privateIdentifier of ["ПриватРабочий", "秘密作業者"]) {
      const content = Buffer.from(privateIdentifier, "utf16le");
      assert.equal(content.includes(0), false);
      assert.equal(
        containsPrivateDenylistValue(content, [privateIdentifier]),
        true
      );
    }
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

  it("matches canonically equivalent Unicode in content and repository paths", () => {
    const composed = "Privaté-Worker";
    const decomposed = composed.normalize("NFD");
    assert.notEqual(composed, decomposed);

    for (const [content, denylistValue] of [
      [`host=${decomposed}`, composed],
      [`host=${composed}`, decomposed],
      [`inventory/${decomposed}.yaml`, composed]
    ]) {
      assert.equal(
        containsPrivateDenylistValue(Buffer.from(content), [denylistValue]),
        true
      );
    }
  });

  it("preserves a literal match before a trailing combining mark", () => {
    const privateIdentifier = "Privaté";
    const content = `${privateIdentifier}\u0327`;
    assert.equal(content.includes(privateIdentifier), true);
    assert.equal(
      content.normalize("NFC").includes(privateIdentifier.normalize("NFC")),
      false
    );
    assert.equal(
      containsPrivateDenylistValue(content, [privateIdentifier]),
      true
    );
  });

  it("preserves literal and case-insensitive matches across Greek sigma context", () => {
    assert.equal(
      containsPrivateDenylistValue("ΟΣΑ", ["ΟΣ"]),
      true
    );
    assert.equal(
      containsPrivateDenylistValue("ΟΣΑ", ["ος"]),
      true
    );
    assert.equal(
      containsPrivateDenylistValue("οςα", ["ΟΣ"]),
      true
    );
  });

  it("matches expanding Unicode lowercase mappings in candidate spans", () => {
    assert.equal(
      containsPrivateDenylistValue("i\u0307st", ["İST"]),
      true
    );
    assert.equal(
      containsPrivateDenylistValue("İST", ["i\u0307st"]),
      true
    );
  });

  it("isolates canonical case matching from trailing combining context", () => {
    assert.equal(
      containsPrivateDenylistValue("E\u0301\u0327", ["é"]),
      true
    );
    assert.equal(
      containsPrivateDenylistValue("Éo\u0308\u0327", ["éö"]),
      true
    );
  });

  it("canonicalizes nonpreferred precomposed candidate starts", () => {
    assert.equal(
      containsPrivateDenylistValue("\u1F71\u0345", ["\u0386"]),
      true
    );
  });

  it("applies expansion-aware Unicode folding to isolated candidate spans", () => {
    assert.equal(
      containsPrivateDenylistValue("ſ\u0301\u0327", ["Ś"]),
      true
    );
    assert.equal(
      containsPrivateDenylistValue("private-strasse", ["PRIVATE-STRAẞE"]),
      true
    );
  });

  it("incrementally matches a decomposed private value across chunks", () => {
    const scanner = createIncrementalGuardScanner(["Privaté-Worker"]);
    scanner.write(Buffer.from("host=Privat"));
    scanner.write(Buffer.from("e"));
    scanner.write(Buffer.from("\u0301-Worker"));
    assert.equal(scanner.finish().privateValue, true);
  });

  it("matches a non-ASCII private value in Latin-1 text", () => {
    const privateIdentifier = "Privaté-Worker";
    assert.equal(
      containsPrivateDenylistValue(
        Buffer.from(`host=${privateIdentifier}`, "latin1"),
        [privateIdentifier]
      ),
      true
    );
  });

  it("matches a non-ASCII private value in Windows-1252 text", () => {
    const privateIdentifier = "Private–Worker";
    assert.equal(
      containsPrivateDenylistValue(
        Buffer.concat([
          Buffer.from("host=Private"),
          Buffer.from([0x96]),
          Buffer.from("Worker")
        ]),
        [privateIdentifier]
      ),
      true
    );
  });

  it("incrementally detects findings across chunks with bounded retention", () => {
    const privateIdentifier = "private-host-zephyr";
    const token = fixtureToken();
    const scanner = createIncrementalGuardScanner([privateIdentifier]);
    scanner.write(Buffer.alloc(1024 * 1024));
    assert.ok(scanner.retainedByteLength <= scanner.overlapBytes);
    scanner.write(Buffer.from("private-host-"));
    scanner.write(Buffer.from(`zephyr token=${token.slice(0, 9)}`));
    scanner.write(Buffer.from(token.slice(9)));

    const findings = scanner.finish();
    assert.equal(findings.privateValue, true);
    assert.equal(findings.credentialSignals.length, 1);
    assert.ok(scanner.retainedByteLength <= scanner.overlapBytes);
  });

  it("preserves UTF-16 alignment across streamed chunks", () => {
    const privateIdentifier = "Приват-Worker";
    const content = Buffer.concat([
      Buffer.alloc(480),
      Buffer.from(`host=${privateIdentifier}`, "utf16le")
    ]);
    assert.equal(
      containsPrivateDenylistValue(content, [privateIdentifier]),
      true
    );

    const scanner = createIncrementalGuardScanner([privateIdentifier]);
    scanner.write(content.subarray(0, 501));
    scanner.write(content.subarray(501));
    assert.equal(scanner.finish().privateValue, true);
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

  it("scans commit and tag text without structural object hashes", () => {
    const privateIdentifier = "cff19";
    const commit = Buffer.from([
      `tree ${privateIdentifier}${"a".repeat(35)}`,
      `parent ${privateIdentifier}${"b".repeat(35)}`,
      "author Example Operator <operator@example.invalid> 1 +0000",
      "committer Example Operator <operator@example.invalid> 1 +0000",
      "",
      "Safe commit message"
    ].join("\n"));
    assert.equal(
      containsPrivateDenylistValue(
        historicalObjectContentForScan(commit, "commit"),
        [privateIdentifier]
      ),
      false
    );

    const tag = Buffer.from([
      `object ${privateIdentifier}${"c".repeat(35)}`,
      "type commit",
      `tag release-${privateIdentifier}`,
      "tagger Example Operator <operator@example.invalid> 1 +0000",
      "",
      `Release for ${privateIdentifier}`
    ].join("\n"));
    assert.equal(
      containsPrivateDenylistValue(
        historicalObjectContentForScan(tag, "tag"),
        [privateIdentifier]
      ),
      true
    );
  });

  it("scans custom textual commit and tag headers", () => {
    const privateIdentifier = "private-host-zephyr";
    const commit = Buffer.from([
      `tree ${"a".repeat(40)}`,
      "author Example Operator <operator@example.invalid> 1 +0000",
      "committer Example Operator <operator@example.invalid> 1 +0000",
      `x-deployment ${privateIdentifier}`,
      "",
      "Safe commit message"
    ].join("\n"));
    const tag = Buffer.from([
      `object ${"b".repeat(40)}`,
      "type commit",
      "tag release-safe",
      "tagger Example Operator <operator@example.invalid> 1 +0000",
      `x-deployment ${privateIdentifier}`,
      "",
      "Safe tag message"
    ].join("\n"));

    for (const [content, type] of [
      [commit, "commit"],
      [tag, "tag"]
    ]) {
      assert.equal(
        containsPrivateDenylistValue(
          historicalObjectContentForScan(content, type),
          [privateIdentifier]
        ),
        true
      );
    }
  });

  it("scans a non-ASCII private value in a legacy-encoded commit", () => {
    const privateIdentifier = "Privaté-Worker";
    const commit = Buffer.from([
      `tree ${"a".repeat(40)}`,
      "author Example Operator <operator@example.invalid> 1 +0000",
      "committer Example Operator <operator@example.invalid> 1 +0000",
      "encoding ISO-8859-1",
      "",
      `Deploy ${privateIdentifier}`
    ].join("\n"), "latin1");

    assert.equal(
      containsPrivateDenylistValue(
        historicalObjectContentForScan(commit, "commit"),
        [privateIdentifier]
      ),
      true
    );
  });

  it("uses a commit's declared Shift_JIS encoding", () => {
    const privateIdentifier = "秘密作業者";
    const commit = Buffer.concat([
      Buffer.from([
        `tree ${"a".repeat(40)}`,
        "author Example Operator <operator@example.invalid> 1 +0000",
        "committer Example Operator <operator@example.invalid> 1 +0000",
        "encoding Shift_JIS",
        "",
        "Deploy "
      ].join("\n")),
      Buffer.from("94e996a78dec8bc68ed2", "hex")
    ]);

    assert.equal(
      containsPrivateDenylistValue(
        historicalObjectContentForScan(commit, "commit"),
        [privateIdentifier]
      ),
      true
    );
  });

  it("scans tag text embedded in a commit mergetag header", () => {
    const privateIdentifier = "private-host-zephyr";
    const commit = Buffer.from([
      `tree ${"a".repeat(40)}`,
      "author Example Operator <operator@example.invalid> 1 +0000",
      "committer Example Operator <operator@example.invalid> 1 +0000",
      `mergetag object ${"b".repeat(40)}`,
      " type commit",
      " tag release-safe",
      " tagger Example Operator <operator@example.invalid> 1 +0000",
      " ",
      " Release notes",
      " -----BEGIN PGP SIGNATURE-----",
      ` Comment: ${privateIdentifier}`,
      " ",
      " structural-signature-payload",
      " -----END PGP SIGNATURE-----",
      "",
      "Merge tagged release"
    ].join("\n"));

    assert.equal(
      containsPrivateDenylistValue(
        historicalObjectContentForScan(commit, "commit"),
        [privateIdentifier]
      ),
      true
    );
  });

  it("scans armor metadata in signed-commit headers", () => {
    const privateIdentifier = "private-host-zephyr";
    for (const signatureHeader of ["gpgsig", "gpgsig-sha256"]) {
      const commit = Buffer.from([
        `tree ${"a".repeat(40)}`,
        "author Example Operator <operator@example.invalid> 1 +0000",
        "committer Example Operator <operator@example.invalid> 1 +0000",
        `${signatureHeader} -----BEGIN PGP SIGNATURE-----`,
        ` Comment: ${privateIdentifier}`,
        " ",
        " structural-signature-payload",
        " -----END PGP SIGNATURE-----",
        "",
        "Signed commit"
      ].join("\n"));

      assert.equal(
        containsPrivateDenylistValue(
          historicalObjectContentForScan(commit, "commit"),
          [privateIdentifier]
        ),
        true
      );
    }
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
      assert.equal(hasHistoricalPath(historicalPaths, ".env"), true);
      assert.equal(hasHistoricalPath(historicalPaths, ".env.example"), true);
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
      assert.equal(hasHistoricalPath(historicalPaths, ".env"), true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("retains a path reachable only from a tree tag", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "agentops-tree-history-"));
    const runGit = (...arguments_) =>
      execFileAsync("git", arguments_, { cwd: directory });
    try {
      await runGit("init", "--quiet");
      await writeFile(path.join(directory, "base.txt"), "shared fixture\n");
      await runGit("add", "base.txt");
      await runGit(
        "-c",
        "user.name=AgentOps Guard",
        "-c",
        "user.email=guard@example.invalid",
        "commit",
        "--quiet",
        "-m",
        "Add base"
      );
      await writeFile(path.join(directory, ".env"), "shared fixture\n");
      await runGit("add", "--force", ".env");
      const { stdout } = await runGit("write-tree");
      await runGit("tag", "tree-fixture", stdout.trim());
      const { stdout: blobOutput } = await runGit(
        "hash-object",
        "base.txt"
      );
      await runGit("tag", "blob-fixture", blobOutput.trim());

      const historicalPaths = await collectHistoricalPaths(directory);
      assert.equal(hasHistoricalPath(historicalPaths, ".env"), true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("preserves raw bytes in a deleted historical path", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "agentops-raw-path-"));
    const runGit = (...arguments_) =>
      execFileAsync("git", arguments_, { cwd: directory });
    const commitTree = (tree, message, parent) =>
      runGit(
        "-c",
        "user.name=AgentOps Guard",
        "-c",
        "user.email=guard@example.invalid",
        "commit-tree",
        tree,
        ...(parent ? ["-p", parent] : []),
        "-m",
        message
      );
    const privateIdentifier = "Privaté-Worker";
    try {
      await runGit("init", "--quiet");
      await writeFile(path.join(directory, "fixture.txt"), "fixture\n");
      const { stdout: blobOutput } = await runGit(
        "hash-object",
        "-w",
        "fixture.txt"
      );
      const treeContent = Buffer.concat([
        Buffer.from("100644 Privat"),
        Buffer.from([0xe9]),
        Buffer.from("-Worker.txt\0"),
        Buffer.from(blobOutput.trim(), "hex")
      ]);
      await writeFile(path.join(directory, "legacy-tree.bin"), treeContent);
      const { stdout: legacyTreeOutput } = await runGit(
        "hash-object",
        "-t",
        "tree",
        "-w",
        "legacy-tree.bin"
      );
      const { stdout: firstCommitOutput } = await commitTree(
        legacyTreeOutput.trim(),
        "Add legacy path"
      );
      await writeFile(path.join(directory, "empty-tree.bin"), Buffer.alloc(0));
      const { stdout: emptyTreeOutput } = await runGit(
        "hash-object",
        "-t",
        "tree",
        "-w",
        "empty-tree.bin"
      );
      const { stdout: secondCommitOutput } = await commitTree(
        emptyTreeOutput.trim(),
        "Delete legacy path",
        firstCommitOutput.trim()
      );
      await runGit(
        "update-ref",
        "refs/heads/main",
        secondCommitOutput.trim()
      );

      const historicalPaths = await collectHistoricalPaths(directory);
      assert.equal(
        historicalPaths.some((value) =>
          containsPrivateDenylistValue(value, [privateIdentifier])
        ),
        true
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("matches a canonically equivalent deleted historical path", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "agentops-unicode-path-"));
    const runGit = (...arguments_) =>
      execFileAsync("git", arguments_, { cwd: directory });
    const commitTree = (tree, message, parent) =>
      runGit(
        "-c",
        "user.name=AgentOps Guard",
        "-c",
        "user.email=guard@example.invalid",
        "commit-tree",
        tree,
        ...(parent ? ["-p", parent] : []),
        "-m",
        message
      );
    const privateIdentifier = "Privaté-Worker";
    const decomposedPath = `${privateIdentifier.normalize("NFD")}.txt`;
    try {
      await runGit("init", "--quiet");
      await writeFile(path.join(directory, "fixture.txt"), "fixture\n");
      const { stdout: blobOutput } = await runGit(
        "hash-object",
        "-w",
        "fixture.txt"
      );
      const treeContent = Buffer.concat([
        Buffer.from(`100644 ${decomposedPath}\0`),
        Buffer.from(blobOutput.trim(), "hex")
      ]);
      await writeFile(path.join(directory, "unicode-tree.bin"), treeContent);
      const { stdout: unicodeTreeOutput } = await runGit(
        "hash-object",
        "-t",
        "tree",
        "-w",
        "unicode-tree.bin"
      );
      const { stdout: firstCommitOutput } = await commitTree(
        unicodeTreeOutput.trim(),
        "Add decomposed path"
      );
      await writeFile(path.join(directory, "empty-tree.bin"), Buffer.alloc(0));
      const { stdout: emptyTreeOutput } = await runGit(
        "hash-object",
        "-t",
        "tree",
        "-w",
        "empty-tree.bin"
      );
      const { stdout: secondCommitOutput } = await commitTree(
        emptyTreeOutput.trim(),
        "Delete decomposed path",
        firstCommitOutput.trim()
      );
      await runGit(
        "update-ref",
        "refs/heads/main",
        secondCommitOutput.trim()
      );

      const historicalPaths = await collectHistoricalPaths(directory);
      assert.equal(
        historicalPaths.some((value) =>
          containsPrivateDenylistValue(value, [privateIdentifier])
        ),
        true
      );
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
      assert.equal(hasHistoricalPath(refNames, tagName), true);
      assert.equal(
        refNames.some((value) =>
          containsPrivateDenylistValue(value, ["private-host-zephyr"])
        ),
        true
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("preserves raw bytes in a packed ref name", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "agentops-raw-ref-"));
    const runGit = (...arguments_) =>
      execFileAsync("git", arguments_, { cwd: directory });
    const privateIdentifier = "Privaté-Worker";
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
      const { stdout } = await runGit("rev-parse", "HEAD");
      const packedRefs = Buffer.concat([
        Buffer.from("# pack-refs with: peeled fully-peeled sorted\n"),
        Buffer.from(`${stdout.trim()} refs/tags/Privat`),
        Buffer.from([0xe9]),
        Buffer.from("-Worker\n")
      ]);
      await writeFile(path.join(directory, ".git/packed-refs"), packedRefs);

      const refNames = await collectRefNames(directory);
      assert.equal(
        refNames.some((value) =>
          containsPrivateDenylistValue(value, [privateIdentifier])
        ),
        true
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
