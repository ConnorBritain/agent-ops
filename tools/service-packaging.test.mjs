import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFile(path.join(root, relative), "utf8");

const assertIncludes = (content, values) => {
  for (const value of values) {
    assert.ok(content.includes(value), `expected service definition to contain ${value}`);
  }
};

const assertSupervisorOnly = (content) => {
  assert.match(content, /supervisor-only/);
  assert.doesNotMatch(content, /--resume(?:-|=|\s)|--start-provider|rustdesk/i);
};

describe("worker service packaging", () => {
  it("keeps the systemd service boot-started, dedicated, hardened, and supervisor-only", async () => {
    const content = await read("deploy/worker-supervisor/linux/agentops-worker-supervisor.service");
    assertIncludes(content, [
      "Wants=network-online.target",
      "After=network-online.target",
      "Type=exec",
      "User=agentops",
      "Group=agentops",
      "EnvironmentFile=-/etc/agentops/worker-supervisor.env",
      "Restart=on-failure",
      "NoNewPrivileges=true",
      "ProtectSystem=strict",
      "WantedBy=multi-user.target",
    ]);
    assertSupervisorOnly(content);
  });

  it("keeps the launchd definition boot-started and restarts only a failed supervisor", async () => {
    const content = await read("deploy/worker-supervisor/macos/com.agentops.worker-supervisor.plist");
    assertIncludes(content, [
      "<string>com.agentops.worker-supervisor</string>",
      "<key>RunAtLoad</key>",
      "<key>SuccessfulExit</key>",
      "<key>UserName</key>",
      "<string>agentops</string>",
      "<string>Background</string>",
    ]);
    assert.match(content, /<key>SuccessfulExit<\/key>\s*<false\/>/);
    assertSupervisorOnly(content);
  });

  it("keeps the Windows wrapper automatic, noninteractive, and free of downloads", async () => {
    const content = await read("deploy/worker-supervisor/windows/AgentOpsWorkerSupervisor.xml");
    assertIncludes(content, [
      "<id>AgentOpsWorkerSupervisor</id>",
      "<startmode>Automatic</startmode>",
      "<interactive>false</interactive>",
      "<prompt>console</prompt>",
      "<onfailure action=\"restart\" delay=\"10 sec\" />",
    ]);
    assert.doesNotMatch(content, /<download|<password/i);
    assertSupervisorOnly(content);
  });

  it("ships read-only platform verification scripts and a secret-reference example", async () => {
    const [linux, macos, windows, environment] = await Promise.all([
      read("deploy/worker-supervisor/verify/linux-worker-supervisor.sh"),
      read("deploy/worker-supervisor/verify/macos-worker-supervisor.sh"),
      read("deploy/worker-supervisor/verify/windows-worker-supervisor.ps1"),
      read("config/worker-supervisor.env.example"),
    ]);
    assert.match(linux, /systemctl is-enabled/);
    assert.match(macos, /launchctl print/);
    assert.match(windows, /Get-CimInstance Win32_Service/);
    for (const script of [linux, macos, windows]) {
      assert.doesNotMatch(script, /\b(systemctl (enable|start|restart)|launchctl bootstrap|Start-Service|New-Service|sc\.exe create)\b/i);
    }
    assert.match(environment, /^AGENTOPS_CALLBACK_IDENTITY_REF=secret:\/\//m);
    assert.match(environment, /^AGENTOPS_SIGNING_KEY_REF=secret:\/\//m);
  });
});
