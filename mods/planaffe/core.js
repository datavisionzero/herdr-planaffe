// Pure parsing and presentation. Wire names follow planaffe's OpenAPI contract.
export const statuses = ["backlog", "todo", "in_progress", "review", "done", "canceled"];

export function mapping(text) {
  const result = { project: "", repo: "" };
  for (const line of text.split(/\r?\n/)) {
    const content = line.split("#")[0].trim();
    if (!content) continue;
    const at = content.indexOf("=");
    const key = content.slice(0, at).trim(), value = content.slice(at + 1).trim();
    if (at < 0 || !["project", "repo"].includes(key)) throw new Error("Invalid .planaffe: only project and repo are supported.");
    result[key] = key === "project" ? value.toUpperCase() : value;
  }
  if (!result.project) throw new Error("The .planaffe file needs project = KEY.");
  return result;
}

export function profile(text, name = "default") {
  const profiles = JSON.parse(text)?.profiles;
  const p = profiles && Object.hasOwn(profiles, name) ? profiles[name] : null;
  const url = typeof p?.url === "string" ? p.url.replace(/\/+$/, "") : "";
  if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(url) && !/^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(url)) throw new Error("Local profile needs an HTTPS origin (HTTP is allowed only on loopback).");
  if (typeof p.token !== "string" || !p.token.trim() || /[\r\n]/.test(p.token)) throw new Error("Local profile needs a bearer token.");
  return { url, token: p.token };
}

function identity(value) {
  if (value === null) return null;
  if (!value || typeof value.name !== "string") throw new Error("Invalid identity in issue response.");
  return value.name;
}

export function issue(value, detail = false) {
  if (!value || typeof value.key !== "string" || !value.key || typeof value.title !== "string" || typeof value.project !== "string" || !statuses.includes(value.status)) throw new Error("Invalid issue response; check planaffe compatibility.");
  if (!Array.isArray(value.labels) || (!detail && value.labels.some(label => typeof label !== "string"))) throw new Error("Invalid issue labels.");
  if (detail && typeof value.description !== "string") throw new Error("Issue detail has no description.");
  return { key: value.key, project: value.project, title: value.title, status: value.status,
    assignee: identity(value.assignee), holder: value.claim === null ? null : identity(value.claim?.holder),
    labels: value.labels, description: detail ? value.description : null,
    result: detail && typeof value.result === "string" ? value.result : null };
}

export function page(value) {
  if (!value || !Array.isArray(value.items) || value.items.length > 200 || !Number.isInteger(value.total) || value.total < 0 || typeof value.has_more !== "boolean" || (value.has_more ? typeof value.next_cursor !== "string" || !value.next_cursor : value.next_cursor !== null)) throw new Error("Invalid issue page; check planaffe compatibility.");
  const items = value.items.map(row => issue(row));
  if (new Set(items.map(row => row.key)).size !== items.length) throw new Error("Duplicate issue keys in page.");
  return { items, total: value.total, cursor: value.has_more ? value.next_cursor : null };
}

export function repositoryLabels(value, repo) {
  if (!Array.isArray(value) || value.some(label => !label || typeof label.name !== "string" || (label.group !== null && typeof label.group !== "string"))) throw new Error("Invalid project labels.");
  const labels = value.filter(label => label.group === "repo").map(label => label.name);
  if (repo && !labels.includes(repo)) throw new Error("The .planaffe repo label must exist in the project's repo group.");
  return labels;
}

export function inRepository(row, repo, labels) {
  return !repo || row.labels.includes(repo) || !row.labels.some(label => labels.includes(label));
}

export function filtered(rows, query, status) {
  const q = query.toLowerCase().trim();
  return rows.filter(row => (status === "all" || (status === "active" ? !["done", "canceled"].includes(row.status) : row.status === status)) && `${row.key} ${row.title} ${row.assignee || ""} ${row.holder || ""}`.toLowerCase().includes(q)).sort((a, b) => ["in_progress", "review", "todo", "backlog", "done", "canceled"].indexOf(a.status) - ["in_progress", "review", "todo", "backlog", "done", "canceled"].indexOf(b.status));
}

export const demoIssues = [
  { key: "PLAN-101", project: "PLAN", title: "Connect the project repository", status: "in_progress", assignee: "maintainer", holder: "build-agent", labels: [], description: "A repository points to one project. A project may span several repositories.", result: null },
  { key: "PLAN-102", project: "PLAN", title: "Review issue details", status: "review", assignee: null, holder: null, labels: [], description: "Descriptions and results are Markdown, shown here as source text.", result: "The implementation is ready for human review." },
  { key: "PLAN-103", project: "PLAN", title: "Verify refresh and filters", status: "done", assignee: "maintainer", holder: null, labels: [], description: "Search the loaded issues by key, title, assignee or claim holder.", result: "Verified." }
];
