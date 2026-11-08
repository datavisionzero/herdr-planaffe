import test from "node:test";
import assert from "node:assert/strict";
import { context, openAction } from "../mods/planaffe-launcher/navigation.js";

test("launcher focuses the current tab panel and otherwise splits its terminal", () => {
  const terminal = { pane: "terminal", terminal: "t1", tab: "tab", cwd: "/repo" };
  const ctx = context([{ active: true, tabs: [{ active: true, id: "tab" }] }], [terminal], {});
  assert.equal(ctx.cwd, "/repo");
  assert.equal(openAction(ctx, [terminal, { pane: "other", mod: "planaffe", tab: "other-tab" }]).name, "pane.split");
  assert.deepEqual(openAction(ctx, [{ pane: "panel", mod: "planaffe", tab: "tab" }]), { name: "pane.focus", args: { pane: "panel" } });
  assert.equal(openAction({ ...ctx, remote: true }, []), null);
  assert.equal(openAction({}, []), null);
});
