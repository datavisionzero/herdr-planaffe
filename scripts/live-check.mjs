// An isolated live check; never point this at an existing database.
// Usage: node scripts/live-check.mjs /path/to/planaffe.dll
// Start an empty Postgres on loopback port 55439, database herdr_mod_test,
// user postgres (trust auth), set PLANAFFE_TEST_POSTGRES, then run this script.
// No credentials are persisted.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { Client } from "../mods/planaffe/client.js";
import { inRepository } from "../mods/planaffe/core.js";

if (!process.argv[2]) throw new Error("Pass the path to a built planaffe.dll.");
const postgres = process.env.PLANAFFE_TEST_POSTGRES;
if (!postgres) throw new Error("Set PLANAFFE_TEST_POSTGRES to the disposable database connection string.");
const url = "http://127.0.0.1:58039", token = randomUUID().replaceAll("-", "");
const child = spawn("dotnet", [resolve(process.argv[2])], { windowsHide: true, cwd: import.meta.dirname, env: {
  ...process.env, ASPNETCORE_ENVIRONMENT: "Production", ASPNETCORE_URLS: url,
  ConnectionStrings__Postgres: postgres,
  PLANAFFE_BOOTSTRAP_ADMIN: "maintainer", PLANAFFE_BOOTSTRAP_EMAIL: "maintainer@example.test",
  PLANAFFE_BOOTSTRAP_TOKEN: token, PLANAFFE_LOG_LEVEL: "Warning",
  PLANAFFE_LOG_URL: "", PLANAFFE_LOG_TOKEN: "", PLANAFFE_SMTP_HOST: ""
}, stdio: ["ignore", "pipe", "pipe"] });
let log = "";
child.stdout.on("data", chunk => { log = (log + chunk).slice(-16000); });
child.stderr.on("data", chunk => { log = (log + chunk).slice(-16000); });
let startupError;
child.on("error", error => { startupError = error; });
const guard = setTimeout(() => child.kill(), 90000);
try {
  let ready = false;
  for (let n = 0; n < 100; n++) {
    if (startupError || child.exitCode !== null) throw new Error("The isolated server could not start: " + log.replaceAll(token, "[redacted]"));
    try { ready = (await fetch(url + "/version", { signal: AbortSignal.timeout(500) })).ok; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(ready, "server must start within 20 seconds");
  const write = async (path, body) => {
    const response = await fetch(url + path, { method: "POST", headers: {
      Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Idempotency-Key": randomUUID()
    }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    assert.ok(response.ok, `fixture write ${path}: HTTP ${response.status}`);
    return response.status === 204 ? null : response.json();
  };
  await write("/projects", { key: "MOD", name: "Mod integration test" });
  for (const name of ["repo/client", "repo/server"]) await write("/projects/MOD/labels", { name, group: "repo" });
  for (const count of [100, 2]) await write("/issues", { project: "MOD", issues: Array.from({ length: count }, (_, n) => ({ title: `Issue ${count}-${n}`, description: "# Live description\n\nFrom the actual planaffe server.", labels: n % 3 === 0 ? ["repo/client"] : n % 3 === 1 ? ["repo/server"] : [] })) });
  const client = new Client({ url, token });
  const labels = await client.labels("MOD", "repo/client");
  const first = await client.list("MOD");
  assert.equal(first.items.length, 100); assert.equal(first.total, 102); assert.ok(first.cursor);
  const second = await client.list("MOD", first.cursor);
  assert.equal(second.items.length, 2); assert.equal(second.cursor, null);
  const rows = [...first.items, ...second.items];
  assert.equal(new Set(rows.map(row => row.key)).size, 102);
  assert.equal(rows.filter(row => inRepository(row, "repo/client", labels)).length, 68);
  assert.equal(first.items[0].description, null);
  const key = first.items[0].key;
  assert.match((await client.detail(key, "MOD")).description, /Live description/);
  await write(`/issues/${key}/claim`, {});
  assert.equal((await client.detail(key, "MOD")).holder, "maintainer");
  const denied = new Client({ url, token: "invalid-test-token" });
  await assert.rejects(denied.list("MOD"), /HTTP 401/);
  console.log("Live planaffe check passed: 102 issues, cursor pagination, repo/shared filtering, detail, claim identity, denied token.");
} finally {
  clearTimeout(guard);
  if (child.exitCode === null && !startupError) { child.kill(); await once(child, "exit"); }
}
