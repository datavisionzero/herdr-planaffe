import test from "node:test";
import assert from "node:assert/strict";
import { mapping, profile, page, issue, filtered, demoIssues, repositoryLabels, inRepository } from "../mods/planaffe/core.js";

export const summary = (overrides = {}) => ({ key: "PLAN-1", project: "PLAN", title: "First issue", status: "todo", labels: [], assignee: null, claim: null, ...overrides });

test("project file uses canonical names, comments and optional repo", () => {
  assert.deepEqual(mapping("# comment\nproject = plan # project\nrepo = repo/client\n"), { project: "PLAN", repo: "repo/client" });
  assert.deepEqual(mapping("project = PLAN"), { project: "PLAN", repo: "" });
  for (const text of ["", "projectId = PLAN", "project = PLAN\nurl = https://example.test", "project = PLAN\ntoken = placeholder", "project PLAN"]) assert.throws(() => mapping(text));
});

test("credentials and origin come from a local profile only", () => {
  const local = url => JSON.stringify({ profiles: { default: { url, token: "test-only" } } });
  assert.equal(profile(local("https://planaffe.example/" )).url, "https://planaffe.example");
  assert.equal(profile(local("http://127.0.0.1:8080")).url, "http://127.0.0.1:8080");
  for (const url of ["http://remote.example", "https://user:pass@host.example", "https://example.test/path", "https://example.test?other", "https://example.test\n"]) assert.throws(() => profile(local(url)));
  assert.throws(() => profile(local("https://example.test"), "missing"));
  assert.throws(() => profile('{"profiles":{"default":{"url":"https://example.test","token":""}}}'));
});

test("slim page and full detail remain distinct, including claim and assignee", () => {
  const row = summary({ assignee: { id: "unused", kind: "user", name: "maintainer" }, claim: { holder: { name: "build-agent" } } });
  assert.equal(page({ items: [row], total: 201, has_more: true, next_cursor: "opaque" }).cursor, "opaque");
  assert.equal(issue(row).assignee, "maintainer");
  assert.equal(issue(row).holder, "build-agent");
  assert.equal(issue(row).description, null);
  assert.equal(issue({ ...row, labels: [{ name: "bug", group: "kind" }], description: "# Markdown", result: "Delivered" }, true).result, "Delivered");
  for (const value of [[row], { items: [row, row], total: 2, has_more: false, next_cursor: null }, { items: [], total: 0, has_more: true, next_cursor: null }]) assert.throws(() => page(value));
  assert.throws(() => issue(summary({ status: "Open" })));
  assert.throws(() => issue(summary({ assignee: "maintainer" })));
  assert.throws(() => issue(row, true));
});

test("repo filter includes shared work and excludes other repositories", () => {
  const labels = repositoryLabels([{ name: "repo/a", group: "repo" }, { name: "repo/b", group: "repo" }, { name: "bug", group: "kind" }], "repo/a");
  assert.ok(inRepository(summary({ labels: ["repo/a"] }), "repo/a", labels));
  assert.ok(inRepository(summary({ labels: ["bug"] }), "repo/a", labels));
  assert.ok(!inRepository(summary({ labels: ["repo/b"] }), "repo/a", labels));
  assert.throws(() => repositoryLabels([], "repo/missing"));
});

test("search combines with canonical status across loaded issues", () => {
  assert.equal(filtered(demoIssues, "maintainer", "all").length, 2);
  assert.equal(filtered(demoIssues, "build-agent", "in_progress").length, 1);
  assert.equal(filtered(demoIssues, "plan-103", "review").length, 0);
});
