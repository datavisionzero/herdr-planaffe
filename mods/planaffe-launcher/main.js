import { View, div } from "gpui-kit";
import { spaces, panes, focused, exec, readTextFile, theme, run, nextCommand } from "herdr";
import { context, openAction } from "./navigation.js";

export default class Launcher extends View {
  init(_props, cx) {
    this.label = "Checking project…";
    this.refresh(cx);
    cx.timer.every(3000, cx => this.refresh(cx));
    cx.spawn(async cx => {
      for (;;) {
        const command = await nextCommand();
        if (command === "open") this.open();
        cx.notify();
      }
    });
  }
  context() { return context(spaces(), panes(), focused()); }
  open() {
    const action = openAction(this.context(), panes());
    if (action) run(action.name, action.args);
  }
  refresh(cx) {
    const ctx = this.context(), key = JSON.stringify(ctx);
    if (this.busy === key) return;
    this.busy = key;
    cx.spawn(async cx => {
      let label = "Select a local repository";
      try {
        if (ctx.remote) label = "Local repositories only";
        else if (ctx.cwd) {
          const result = await exec("git", ["rev-parse", "--show-toplevel"], { cwd: ctx.cwd });
          const text = result.code === 0 ? await readTextFile(`${result.stdout.trim()}/.planaffe`) : null;
          const project = text?.split(/\r?\n/).map(line => line.split("#")[0].trim()).find(line => /^project\s*=/.test(line))?.split("=").slice(1).join("=").trim();
          label = project ? `${project.toUpperCase()} · Project configured` : "Set up project mapping";
        }
      } catch { label = "Project mapping unavailable"; }
      if (JSON.stringify(this.context()) === key) { this.label = label; cx.notify(); }
      if (this.busy === key) this.busy = null;
    });
  }
  render() {
    const t = theme();
    return div().id("planaffe-open").size_full().px(12).py(6).bg(t.chrome).text_color(t.accent).text_size(12)
      .hover(s => s.bg(t.hover)).on_click(() => this.open())
      .child(`◉ planaffe: Open issues · ${this.label}`);
  }
}
