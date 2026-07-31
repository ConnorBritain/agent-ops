import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runProviderConformance } from "@agent-ops/provider-sdk";
import { buildProviderInvocation } from "@agent-ops/test-kit";
import { PrintProvider } from "../src/index.ts";

describe("PrintProvider", () => {
  it("renders every lifecycle operation without starting a process", async () => {
    const provider = new PrintProvider();
    const result = await runProviderConformance(provider, {
      invocation: buildProviderInvocation(),
      ingestedAt: "2026-07-30T04:00:02Z",
    });

    assert.equal(result.manifest.executionMode, "no-execution");
    assert.equal(result.observations.length, 6);
    assert.equal(result.normalizedEvents.length, 6);
    assert.equal(result.artifacts.length, 1);
    assert.equal(provider.plans.length, 8);
    for (const plan of provider.plans) {
      assert.equal(plan.execution, "not-started");
      assert.match(plan.envelopeDigest, /^sha256:[a-f0-9]{64}$/);
    }
  });

  it("does not render callback, signature, or job body material", async () => {
    const provider = new PrintProvider();
    const invocation = buildProviderInvocation({
      operation: "start",
      envelope: {
        ...buildProviderInvocation().envelope,
        body: { objective: "private-but-secret-safe fixture content" },
        callbackIdentityRef: "secret://agentops/callback/private",
        signature: {
          algorithm: "ed25519",
          keyRef: "secret://agentops/signing/private",
          value: "b".repeat(64),
        },
      },
    });
    await provider.start(invocation);
    const rendered = JSON.stringify(provider.plans[0]);
    assert.doesNotMatch(rendered, /private-but-secret-safe|callback\/private|signing\/private|b{64}/);
  });

  it("rejects an invocation sent to the wrong lifecycle method", async () => {
    const provider = new PrintProvider();
    await assert.rejects(
      provider.cancel(buildProviderInvocation({ operation: "start" })),
      /expected cancel, received start/,
    );
  });
});
