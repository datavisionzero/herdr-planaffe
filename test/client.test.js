import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { Client } from "../mods/planaffe/client.js";

const row = { key: "PLAN-1", project: "PLAN", title: "First", status: "todo", labels: [], assignee: null, claim: null };
test("HTTP client uses real paths, bearer auth, cursor encoding and separate detail", async () => {
  const requests = [];
  const server = createServer((req, res) => {
    requests.push(req.url);
    assert.equal(req.headers.authorization, "Bearer test-only");
    assert.equal(req.method, "GET");
    const url = new URL(req.url, "http://localhost");
    res.setHeader("Content-Type", "application/json");
    if (url.pathname === "/issues") {
      assert.equal(url.searchParams.get("project"), "PLAN");
      assert.equal(url.searchParams.get("limit"), "100");
      const second = url.searchParams.has("cursor");
      if (second) assert.equal(url.searchParams.get("cursor"), "opaque+/= &");
      res.end(JSON.stringify({ items: second ? [] : [row], total: 1, has_more: !second, next_cursor: second ? null : "opaque+/= &" }));
    } else if (url.pathname === "/issues/PLAN-1") res.end(JSON.stringify({ ...row, description: "# Description", result: null }));
    else if (url.pathname === "/projects/PLAN/labels") res.end('[{"name":"repo/client","group":"repo","description":null}]');
    else { res.statusCode = 404; res.end('{}'); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const client = new Client({ url: `http://127.0.0.1:${server.address().port}`, token: "test-only" });
    const first = await client.list("PLAN");
    assert.equal(first.items[0].description, null);
    assert.equal((await client.list("PLAN", first.cursor)).cursor, null);
    assert.equal((await client.detail("PLAN-1", "PLAN")).description, "# Description");
    assert.deepEqual(await client.labels("PLAN", "repo/client"), ["repo/client"]);
    assert.equal(requests.length, 4);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test("network errors and server bodies cannot disclose credentials", async () => {
  const client = new Client({ url: "https://example.test", token: "test-only" }, async () => { throw new Error("private response"); });
  await assert.rejects(client.list("PLAN"), error => !error.message.includes("private response"));
  client.fetcher = async () => ({ ok: false, status: 401, json() { throw new Error("must not read body"); } });
  await assert.rejects(client.list("PLAN"), /HTTP 401/);
  client.fetcher = async () => ({ ok: true, json() { throw new Error("private JSON content"); } });
  await assert.rejects(client.list("PLAN"), /invalid JSON/);
});

test("wrong project, wrong detail and repeated cursor are refused", async () => {
  let body;
  const client = new Client({ url: "https://example.test", token: "test-only" }, async () => ({ ok: true, json: async () => body }));
  body = { items: [{ ...row, project: "OTHER" }], total: 1, has_more: false, next_cursor: null };
  await assert.rejects(client.list("PLAN"), /another project/);
  body = { items: [], total: 1, has_more: true, next_cursor: "repeat" };
  await assert.rejects(client.list("PLAN", "repeat"), /repeated/);
  body = { ...row, description: "text" };
  await assert.rejects(client.detail("PLAN-2", "PLAN"), /selected issue/);
});

test("answers use the dedicated endpoint once and validate the response", async () => {
  const id = "11111111-1111-1111-1111-111111111111";
  const calls = [];
  const client = new Client({ url: "https://example.test", token: "test-only" }, async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ id, question: "Which option?", answer: "Option A" }) };
  });
  await assert.rejects(client.answer(id, "  "));
  assert.equal(calls.length, 0);
  assert.equal((await client.answer(id, " Option A ")).answer, "Option A");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `https://example.test/questions/${id}/answer`);
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].options.body), { answer: "Option A" });
  client.fetcher = async () => ({ ok: false, status: 422 });
  await assert.rejects(client.answer(id, "Duplicate"), /HTTP 422/);
});
