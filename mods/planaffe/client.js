import { page, issue, repositoryLabels } from "./core.js";

// The host supplies fetch; no browser or Node-only APIs are used here.
export class Client {
  constructor(profile, fetcher = fetch) { this.profile = profile; this.fetcher = fetcher; }

  async get(path) {
    let response;
    try {
      response = await this.fetcher(this.profile.url + path, { method: "GET", headers: {
        Accept: "application/json", Authorization: `Bearer ${this.profile.token}`
      } });
    } catch { throw new Error("Cannot reach planaffe. Check the local profile and connection."); }
    if (!response.ok) throw new Error(`planaffe returned HTTP ${response.status}. Check access and refresh.`);
    try { return await response.json(); }
    catch { throw new Error("planaffe returned invalid JSON. Check the instance URL and compatibility."); }
  }

  async list(project, cursor = null) {
    const result = page(await this.get(`/issues?project=${encodeURIComponent(project)}&limit=100&sort=created&order=asc${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`));
    if (result.items.some(row => row.project !== project)) throw new Error("The response contains another project's issues.");
    if (cursor && result.cursor === cursor) throw new Error("planaffe repeated a pagination cursor. Refresh the list.");
    return result;
  }

  async detail(key, project) {
    const result = issue(await this.get(`/issues/${encodeURIComponent(key)}`), true);
    if (result.key !== key || result.project !== project) throw new Error("The response does not match the selected issue.");
    return result;
  }

  async labels(project, repo) {
    return repositoryLabels(await this.get(`/projects/${encodeURIComponent(project)}/labels`), repo);
  }
}
