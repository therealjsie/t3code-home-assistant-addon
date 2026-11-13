import test from "node:test";
import assert from "node:assert/strict";
import { createPairingManager } from "../t3code/rootfs/opt/t3code/pairing.mjs";

const link = { id: "test-link", credential: "TEST-TOKEN", expiresAt: "2030-01-01T00:15:00Z" };
const now = Date.parse("2030-01-01T00:00:00Z");
const result = (value) => ({ ok: true, stdout: JSON.stringify(value) });

test("creates a 15-minute token with the pinned CLI contract; GET never creates one", async () => {
  const calls = [];
  const manager = createPairingManager(async (cmd, args) => {
    calls.push([cmd, args]);
    return result(args.includes("create") ? link : [{ id: link.id }]);
  }, () => now);
  assert.equal(await manager.status(), null);
  assert.equal(calls.length, 0);
  assert.deepEqual(await manager.create(), { id: link.id, token: link.credential, expiresAt: link.expiresAt });
  assert.deepEqual(calls[0], ["t3", ["auth", "pairing", "create", "--json", "--ttl", "15m", "--label", "Home Assistant LAN"]]);
  assert.equal((await manager.status()).token, link.credential);
});

test("clears consumed or revoked tokens", async () => {
  const manager = createPairingManager(async (_cmd, args) => result(args.includes("create") ? link : []), () => now);
  await manager.create();
  assert.equal(await manager.status(), null);
});

test("clears expired tokens without running the CLI", async () => {
  let clock = now;
  let calls = 0;
  const manager = createPairingManager(async () => { calls++; return result(link); }, () => clock);
  await manager.create();
  clock = Date.parse(link.expiresAt);
  assert.equal(await manager.status(), null);
  assert.equal(calls, 1);
});

test("deduplicates concurrent creation requests", async () => {
  let complete;
  let calls = 0;
  const manager = createPairingManager(() => { calls++; return new Promise((resolve) => { complete = resolve; }); }, () => now);
  const first = manager.create();
  const second = manager.create();
  complete(result(link));
  assert.deepEqual(await first, await second);
  assert.equal(calls, 1);
});

test("rejects failed, malformed, incomplete, and expired CLI responses without leaking output", async () => {
  for (const response of [
    { ok: false, stdout: "secret-token", stderr: "secret-token" },
    { ok: true, stdout: "secret-token" }, result({ credential: "secret-token" }),
    result({ ...link, expiresAt: "2000-01-01T00:00:00Z" }),
  ]) {
    const manager = createPairingManager(async () => response, () => now);
    await assert.rejects(manager.create(), (error) => !error.message.includes("secret-token"));
    assert.equal(await manager.status(), null);
  }
});

test("an in-flight status request cannot clear a newly created token", async () => {
  let finishList;
  let creations = 0;
  const manager = createPairingManager(async (_cmd, args) => {
    if (args.includes("create")) return result({ ...link, id: String(++creations) });
    return new Promise((resolve) => { finishList = resolve; });
  }, () => now);
  await manager.create();
  const checking = manager.status();
  const newer = await manager.create();
  finishList(result([{ id: "1" }]));
  assert.deepEqual(await checking, newer);
});
