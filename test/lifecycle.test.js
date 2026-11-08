import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../mods/planaffe/main.js", import.meta.url), "utf8");
const replaced = source
  .replace('import { View, div } from "gpui-kit";', 'const {View, div} = globalThis.__planaffeHarness;')
  .replace('import { v_flex, h_flex, InputState, Input } from "gpui-base";', 'const {v_flex, h_flex, InputState, Input} = globalThis.__planaffeHarness;')
  .replace('import { spaces, panes, focused, exec, readTextFile, appHome, theme, settings, props as hostProps } from "herdr";', 'const {spaces, panes, focused, exec, readTextFile, appHome, theme, settings, hostProps} = globalThis.__planaffeHarness;')
  .replace('"./core.js"', JSON.stringify(new URL("../mods/planaffe/core.js", import.meta.url).href))
  .replace('"./client.js"', JSON.stringify(new URL("../mods/planaffe/client.js", import.meta.url).href));
const row = (project, number = 1) => ({ key: `${project}-${number}`, project, title: "Issue", status: "todo", assignee: null, claim: null, labels: [] });
const page = (project, more = false) => ({ items: [row(project)], total: more ? 2 : 1, has_more: more, next_cursor: more ? "next" : null });
const response = body => ({ ok: true, json: async () => body });
const tick = async () => { for (let n = 0; n < 15; n++) await Promise.resolve(); };

test("controller isolates repository and detail races, retries, timeout and remote contexts", async () => {
  let cwd = "/repo-a", machine = null, tasks = [], pending = [], timer, modFocused = false, props = { demo: true };
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = (url, options) => new Promise(resolve => pending.push({ url, options, resolve }));
  globalThis.__planaffeHarness = {
    hostProps: () => props, View: class {}, InputState: { new: () => ({ on() {}, value: () => "" }) },
    spaces: () => [{ active: true, folder: "/stale-space", machine, tabs: [{ id: "tab", active: true }] }],
    panes: () => [{ pane: "terminal", terminal: "t1", tab: "tab", cwd }, { pane: "mod", terminal: null, tab: "tab" }],
    focused: () => ({ pane: modFocused ? "mod" : "terminal", tab: "tab", cwd: null }),
    exec: async (_command, _args, options) => ({ code: 0, stdout: options.cwd, stderr: "" }),
    readTextFile: async path => path.endsWith(".planaffe") ? `project = ${path.includes("repo-a") ? "A" : "B"}` : '{"profiles":{"default":{"url":"https://example.test","token":"test-only"}}}',
    appHome: () => "/local", theme: () => ({}), settings: () => ({ dark: true })
  };
  try {
    const { default: Panel } = await import(`data:text/javascript;base64,${Buffer.from(replaced).toString("base64")}`);
    const cx = { notify() {}, spawn(fn) { tasks.push(fn(cx)); }, timer: { every(_ms, fn) { timer = fn; } } };
    const demo = new Panel(); demo.init({ demo: true }, cx); await Promise.all(tasks);
    assert.equal(demo.rows.length, 3);
    demo.select("PLAN-102", cx); assert.ok(demo.detail.result);
    tasks = []; props = {};
    const panel = new Panel(); panel.init({}, cx); await tick();
    const old = pending.shift(); assert.match(old.url, /project=A/);
    modFocused = true;
    assert.equal(panel.location().cwd, "/repo-a", "focusing the panel preserves its terminal context");
    cwd = "/repo-b"; panel.refresh(cx); await tick();
    pending.shift().resolve(response(page("B", true))); await tasks[1];
    old.resolve(response(page("A"))); await tasks[0];
    assert.equal(panel.project, "B"); assert.equal(panel.rows[0].key, "B-1");
    panel.select("B-1", cx); await tick(); const firstDetail = pending.shift();
    panel.select("B-2", cx); await tick();
    pending.shift().resolve(response({ ...row("B", 2), description: "new selection" })); await tasks.at(-1);
    firstDetail.resolve(response({ ...row("B"), description: "old selection" })); await tick();
    assert.equal(panel.detail.description, "new selection");
    panel.more(cx); await tick(); pending.shift().resolve({ ok: false, status: 503 }); await tasks.at(-1);
    assert.equal(panel.cursor, "next"); assert.match(panel.error, /503/);
    panel.more(cx); await tick();
    pending.shift().resolve(response({ items: [row("B", 2)], total: 2, has_more: false, next_cursor: null })); await tasks.at(-1);
    assert.equal(panel.rows.length, 2); assert.equal(panel.cursor, null);
    const questionId = "11111111-1111-1111-1111-111111111111";
    panel.detail = { key: panel.selection, questions: [{ id: questionId, question: "Proceed?", answer: null }] };
    panel.replyInputs[questionId] = { value: () => "Yes" };
    panel.sendAnswer(questionId, cx); panel.sendAnswer(questionId, cx); await tick();
    assert.equal(pending.length, 1, "double click must submit once");
    pending.shift().resolve(response({ id: questionId, question: "Proceed?", answer: "Yes" })); await tasks.at(-1);
    assert.equal(panel.detail.questions[0].answer, "Yes");
    assert.equal(panel.sending.size, 0);
    panel.refresh(cx); await tick(); const late = pending.shift();
    panel.deadline = 0; timer(cx); assert.match(panel.error, /timed out/);
    late.resolve(response(page("B"))); await tasks.at(-1);
    assert.equal(panel.rows.length, 0);
    machine = "remote"; panel.refresh(cx); await tasks.at(-1);
    assert.match(panel.error, /local repositories/); assert.equal(pending.length, 0);
  } finally { globalThis.fetch = nativeFetch; delete globalThis.__planaffeHarness; }
});
