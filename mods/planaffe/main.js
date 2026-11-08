import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { spaces, panes, focused, exec, readTextFile, appHome, theme, settings, props as hostProps } from "herdr";
import { mapping, profile, filtered, demoIssues, statuses, inRepository, workOverview } from "./core.js";
import { Client } from "./client.js";

export default class Planaffe extends View {
  location() {
    const s = spaces().find(space => space.active), f = focused(), all = panes();
    const tab = f?.tab || s?.tabs?.find(tab => tab.active)?.id;
    let pane = all.find(pane => pane.pane === f?.pane && pane.terminal);
    if (pane) this.terminal = pane.pane;
    else pane = all.find(pane => pane.pane === this.terminal && pane.tab === tab && pane.terminal)
      || all.find(pane => pane.tab === tab && pane.terminal);
    const detached = f?.pane === null && f.terminal;
    return { cwd: this.folder || (detached ? f.cwd : pane?.cwd) || s?.folder || null,
      on: detached ? (f.terminal.includes("/") ? f.terminal.split("/")[0] : null) : s?.machine ?? null, tab };
  }

  key() { return this.demo ? "demo" : JSON.stringify(this.location()); }
  current(serial) { return this.serial === serial && this.context === this.key(); }

  init(_props, cx) {
    const props = hostProps() ?? {};
    this.demo = props?.demo === true;
    this.folder = typeof props?.folder === "string" ? props.folder : null;
    this.profileName = typeof props?.profile === "string" ? props.profile : "default";
    this.replyInputs = {}; this.sending = new Set();
    this.serial = 0; this.detailSerial = 0; this.rows = []; this.status = "active"; this.query = "";
    this.input = InputState.new({ placeholder: "Search loaded issues" });
    this.input.on("change", (_event, cx) => { this.query = this.input.value(); cx.notify(); });
    this.refresh(cx);
    cx.timer.every(1000, cx => {
      if (this.context !== this.key()) this.refresh(cx);
      else if (this.loading && Date.now() > this.deadline) {
        this.serial++; this.loading = false; this.detailLoading = false;
        this.error = "Request timed out. Refresh to retry."; cx.notify();
      } else if (this.detailLoading && Date.now() > this.detailDeadline) {
        this.detailSerial++; this.detailLoading = false;
        this.detailError = "Detail request timed out. Select the issue to retry."; cx.notify();
      }
    });
  }

  refresh(cx) {
    this.epicFilter = "all"; this.epicFilterOpen = false;
    this.replyInputs = {}; this.answerError = null;
    const serial = ++this.serial, loc = this.demo ? null : this.location();
    this.context = this.key(); this.detailSerial++; this.rows = []; this.selection = null;
    this.detail = null; this.detailLoading = false; this.detailError = null;
    this.error = null; this.loading = true; this.deadline = Date.now() + 30000;
    this.root = ""; this.project = ""; this.cursor = null; this.total = 0; this.loaded = 0;
    this.client = null; this.config = null; this.repoLabels = []; this.cursors = new Set();
    cx.notify();
    cx.spawn(async cx => {
      try {
        if (this.demo) {
          // Herdr shares module exports across copies; own all mutable demo data.
          this.project = "PLAN · DEMO";
          this.rows = demoIssues.map(row => ({ ...row, labels: [...row.labels],
            questions: (row.questions || []).map(question => ({ ...question })) }));
          this.total = this.loaded = demoIssues.length;
        } else {
          if (loc.on) throw new Error("Only local repositories are supported. Remote space credentials are never used.");
          if (!loc.cwd) throw new Error("Select a local repository terminal, or open with demo: true.");
          let result;
          try { result = await exec("git", ["rev-parse", "--show-toplevel"], { cwd: loc.cwd }); }
          catch { throw new Error("Cannot resolve repository. Check that Git is installed."); }
          if (!this.current(serial)) return;
          if (result.code !== 0) throw new Error("Active folder is not a Git repository.");
          const root = result.stdout.trim();
          const text = await readTextFile(`${root}/.planaffe`);
          if (!this.current(serial)) return;
          if (!text) throw new Error("No .planaffe at repository root. Add project = KEY.");
          const config = mapping(text);
          const local = await readTextFile(`${appHome()}/planaffe.local.json`);
          if (!this.current(serial)) return;
          if (!local) throw new Error("Create planaffe.local.json in Herdr's home (see README).");
          let credentials;
          try { credentials = profile(local, this.profileName); }
          catch { throw new Error("Invalid or missing local profile. Check planaffe.local.json (see README)."); }
          const client = new Client(credentials);
          const labels = config.repo ? await client.labels(config.project, config.repo) : [];
          if (!this.current(serial)) return;
          const page = await client.list(config.project);
          if (!this.current(serial)) return;
          this.root = root; this.project = `${config.project}${config.repo ? ` · ${config.repo}` : ""}`;
          this.client = client; this.config = config; this.repoLabels = labels;
          this.accept(page);
        }
      } catch (error) {
        if (this.current(serial)) this.error = error.message || "Unable to load issues.";
      } finally {
        if (this.current(serial)) { this.loading = false; cx.notify(); }
      }
    });
  }

  accept(page) {
    if (page.cursor && this.cursors.has(page.cursor)) throw new Error("Repeated pagination cursor. Refresh the list.");
    if (page.cursor) this.cursors.add(page.cursor);
    const rows = page.items.filter(row => inRepository(row, this.config.repo, this.repoLabels));
    const merged = new Map(this.rows.map(row => [row.key, row]));
    for (const row of rows) merged.set(row.key, row);
    this.rows = [...merged.values()]; this.loaded += page.items.length;
    this.total = page.total; this.cursor = page.cursor;
  }

  more(cx) {
    if (this.loading || !this.cursor || this.context !== this.key()) return;
    const serial = this.serial, client = this.client, config = this.config, cursor = this.cursor;
    this.loading = true; this.error = null; this.deadline = Date.now() + 30000; cx.notify();
    cx.spawn(async cx => {
      try {
        const page = await client.list(config.project, cursor);
        if (this.current(serial)) this.accept(page);
      } catch (error) { if (this.current(serial)) this.error = error.message; }
      finally { if (this.current(serial)) { this.loading = false; cx.notify(); } }
    });
  }

  select(key, cx) {
    if (this.context !== this.key()) return;
    const serial = this.serial, detailSerial = ++this.detailSerial;
    this.replyInputs = {}; this.answerError = null;
    this.selection = key; this.detail = null; this.detailError = null;
    if (this.demo) { this.detail = this.rows.find(row => row.key === key); this.prepareAnswers(); cx.notify(); return; }
    this.detailLoading = true; this.detailDeadline = Date.now() + 30000; cx.notify();
    cx.spawn(async cx => {
      const current = () => this.current(serial) && this.detailSerial === detailSerial;
      try {
        const detail = await this.client.detail(key, this.config.project);
        if (current()) { this.detail = detail; this.prepareAnswers(); }
      } catch (error) { if (current()) this.detailError = error.message; }
      finally { if (current()) { this.detailLoading = false; cx.notify(); } }
    });
  }

  closeDetails(cx) {
    this.detailSerial++;
    this.selection = null; this.detail = null; this.detailLoading = false;
    this.detailError = null; this.answerError = null; this.replyInputs = {};
    cx.notify();
  }

  openIssue(cx) {
    if (this.demo || this.context !== this.key() || !this.client) return;
    const row = this.rows.find(row => row.key === this.selection);
    if (!row || !row.key.startsWith(row.project + "-")) return;
    const number = row.key.slice(row.project.length + 1);
    if (!/^[0-9]+$/.test(number)) return;
    cx.open_url(this.client.profile.url + "/" + encodeURIComponent(row.project) + "/issues/" + number);
  }

  prepareAnswers() {
    for (const q of this.detail?.questions || []) {
      if (q.answer === null) this.replyInputs[q.id] = InputState.new({ placeholder: "Your answer" });
    }
  }

  sendAnswer(id, cx) {
    const text = this.replyInputs[id]?.value();
    if (this.demo || !text?.trim() || this.sending.has(id) || this.context !== this.key() || !this.detail?.questions?.some(q => q.id === id && q.answer === null)) return;
    const serial = this.serial, detailSerial = this.detailSerial, client = this.client;
    this.sending.add(id); this.answerError = null; cx.notify();
    cx.spawn(async cx => {
      try {
        const answered = await client.answer(id, text);
        if (this.current(serial) && this.detailSerial === detailSerial) {
          this.detail.questions = this.detail.questions.map(q => q.id === id ? answered : q);
          const count = this.detail.questions.filter(q => q.answer === null).length;
          this.rows = this.rows.map(row => row.key === this.selection ? { ...row, open_questions: count } : row);
          delete this.replyInputs[id];
        }
      } catch {
        if (this.current(serial) && this.detailSerial === detailSerial) this.answerError = "Answer not confirmed. Reload the issue to check whether it was saved before trying again.";
      } finally { this.sending.delete(id); cx.notify(); }
    });
  }

  render(cx) {
    const t = theme(), current = this.context === this.key();
    const rows = current ? filtered(this.rows, this.query, this.status, this.epicFilter) : [];
    const epicKeys = current ? [...new Set(this.rows.map(row => row.epic).filter(Boolean))].sort() : [];
    const epicLabel = key => ({ all: "All", with: "With epic", without: "Without epic" })[key] || key;
    const symbols = { questions: "?", active: "◉", in_progress: "▶", review: "◇", todo: "○", backlog: "⋯", done: "✓", canceled: "×", all: "≡" };
    const overview = workOverview(this.rows, { current, loading: this.loading, error: this.error, cursor: this.cursor });
    const completeColor = settings().dark ? "#65c58a" : "#237744";
    const color = status => ["in_progress", "todo"].includes(status) ? t.accent : status === "review" ? (settings().dark ? "#f0a340" : "#995300") : status === "done" ? completeColor : t.muted;
    const label = status => symbols[status] + " " + (status === "questions" ? "Needs answer" : status === "active" ? "Active work" : status.replaceAll("_", " "));
    const selected = rows.find(row => row.key === this.selection);
    const detail = selected && this.detail?.key === selected.key ? this.detail : null;
    const selectedEpic = detail ? detail.epic : selected?.epic;
    const button = (id, label, action, active = false) => div().id(id).px(8).py(5).rounded(4).bg(active ? t.selected : t.raised).hover(s => s.bg(t.hover)).on_click((_e, cx) => action(cx)).child(label);
    return v_flex().id("planaffe-root").size_full().bg(t.surface).text_color(t.foreground).text_size(13).p(12).gap(10).children([
      h_flex().items_center().justify_between().children([div().font_semibold().child(current ? this.project || "planaffe" : "planaffe"), button("refresh", "Refresh", cx => this.refresh(cx))]),
      ...(!selected ? [
        div().text_color(overview.complete ? completeColor : t.muted).font_semibold().child(overview.text),
        h_flex().gap(6).flex_wrap().children(["in_progress", "todo", "review"].map(status =>
          div().id("overview-" + status).p(10).rounded(5).bg(this.status === status ? t.selected : t.raised).text_color(color(status)).hover(s => s.bg(t.hover)).on_click((_e, cx) => { this.status = status; cx.notify(); }).child(label(status) + " · " + (current ? this.rows.filter(row => row.status === status).length : 0)))),
        Input.new(this.input).h(36).px(10).py(7).rounded(5).bg(t.raised).text_color(t.foreground),
        h_flex().gap(4).flex_wrap().children(["active", "questions", ...statuses, "all"].map(status => button(`status-${status}`, label(status), cx => { this.status = status; cx.notify(); }, this.status === status))),
        button("epic-filter", `Epics: ${epicLabel(this.epicFilter)} ${this.epicFilterOpen ? "▴" : "▾"}`, cx => { this.epicFilterOpen = !this.epicFilterOpen; cx.notify(); }, this.epicFilter !== "all"),
        ...(this.epicFilterOpen ? [v_flex().id("epic-options").h(120).flex_shrink_0().overflow_y_scrollbar().child(
          v_flex().flex_shrink_0().gap(4).children(["all", "with", "without", ...epicKeys].map(key =>
            button(`epic-filter-${key}`, epicLabel(key), cx => { this.epicFilter = key; this.epicFilterOpen = false; cx.notify(); }, this.epicFilter === key))))] : []),
        div().text_color(t.muted).child(!current ? "Switching repository…" : this.loading ? "Loading…" : `${rows.length} shown · ${this.loaded} / ${this.total} project issues loaded`),
        ...(current && this.error ? [div().text_color(t.blocked).child(this.error)] : []),
        ...(!rows.length && current && !this.loading && !this.error ? [div().text_color(t.muted).child(this.cursor ? "No matches loaded. Load more to find further issues." : "No matching issues. Choose another filter or clear search.")] : []),
        v_flex().id("issue-scroll").flex_1().min_h(0).overflow_y_scrollbar().gap(6).children(rows.map(row =>
          v_flex().id(`issue-${row.key}`).p(10).gap(4).rounded(5).bg(row.key === this.selection ? t.selected : t.raised).hover(s => s.bg(t.hover)).on_click((_e, cx) => this.select(row.key, cx)).children([
            div().text_color(color(row.status)).text_size(11).child(`${label(row.status)} · ${row.key}`),
            div().font_semibold().child(row.title),
            ...(row.epic ? [div().text_color(t.accent).font_semibold().child(`◆ Epic · ${row.epic}`)] : []),
            ...(row.open_questions > 0 ? [div().text_color(color("review")).child(`? ${row.open_questions} awaiting answer`)] : []),
            ...(row.holder ? [div().text_color(t.muted).child(`Claim: ${row.holder}`)] : [])
          ]))),
        ...(current && this.cursor ? [button("more", this.loading ? "Loading…" : "Load more", cx => this.more(cx))] : []),
      ] : []),
      ...(selected ? [v_flex().id("details").flex_1().min_h(0).p(10).gap(6).bg(t.raised).rounded(5).children([
        h_flex().flex_shrink_0().items_center().justify_between().gap(8).children([
          div().font_semibold().child(selected.key),
          h_flex().items_center().gap(6).children([
            ...(!this.demo && this.client ? [button("open-issue-web", "↗ Open in planaffe", cx => this.openIssue(cx))] : []),
            button("close-details", "×", cx => this.closeDetails(cx))
          ])
        ]),
        // Keep content at its natural height so the bounded viewport can scroll.
        v_flex().id(`detail-scroll-${selected.key}`).flex_1().min_h(0).overflow_y_scrollbar().child(
          v_flex().flex_shrink_0().gap(6).children([
            div().font_semibold().child(selected.title),
            ...(selectedEpic ? [div().text_color(t.accent).font_semibold().child(
              `◆ Epic · ${selectedEpic}${detail?.epicTitle ? ` · ${detail.epicTitle} (${detail.epicStatus})` : ""}`)] : []),
            ...(selected.assignee ? [div().text_color(t.muted).child(`Assigned to: ${selected.assignee}`)] : []),
            ...(this.detailError ? [div().text_color(t.blocked).child(this.detailError)] : []),
            ...(this.answerError ? [div().text_color(t.blocked).child(this.answerError)] : []),
            ...(detail?.questions || []).map(q => {
              return v_flex().gap(6).p(8).bg(t.surface).rounded(4).children([
                div().text_color(color("review")).child("? " + q.question),
                ...(q.answer !== null ? [div().child("Answer: " + q.answer)] : [
                  Input.new(this.replyInputs[q.id]).h(36).px(10).py(7).bg(t.raised),
                  button("answer-" + q.id, this.demo ? "Demo · sending disabled" : this.sending.has(q.id) ? "Sending…" : "Send answer", cx => this.sendAnswer(q.id, cx))
                ])
              ]);
            }),
            div().child(this.detailLoading ? "Loading description…" : detail?.description || "No description"),
            ...(detail?.result ? [div().font_semibold().child("Result"), div().child(detail.result)] : [])
          ]))
      ])] : [div().text_color(t.dim).child("Select an issue to load its description.")])
    ]);
  }
}
