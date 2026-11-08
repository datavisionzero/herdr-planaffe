# herdr-planaffe

A native, read-only [planaffe](https://github.com/datavisionzero/planaffe) issue panel for [Herdr](https://github.com/herdrdev/herdr-app). MIT licensed. No webview, npm dependencies, adapter service or build step.

**Early integration:** tested against planaffe commit `8280064a515499f00594e706cfdc3c299b81ea00` and Herdr's installed gpui-shell 0.7.1 interfaces. See [VERIFICATION.md](VERIFICATION.md) for the checks and their limits. Compatibility with other versions is not yet guaranteed.

## Install

1. Copy `mods/planaffe` into Herdr's `mods` directory: `$HERDR_APP_HOME/mods/planaffe`, or `~/.config/herdr-app/mods/planaffe` by default.
2. Run `herdr-app check <path-to-installed-mod>`.
3. With a local repository terminal focused, open the panel:

```sh
herdr-app do pane.split '{"direction":"right","mod":"planaffe"}'
```

For a demo without a server or repository mapping:

```sh
herdr-app do pane.split '{"direction":"right","mod":"planaffe","props":{"demo":true}}'
```

These commands work with PowerShell 7's native argument passing and POSIX shells. Older Windows shells may require additional JSON quoting. Check `herdr-app commands` for the command surface of your installed version. Opening a panel changes the current pane layout; close its pane normally when finished.

## Connect planaffe

Use the existing `.planaffe` at the Git repository root:

```ini
project = PLAN
# Optional: the label of this repository, in the project's repo group.
repo = repo/client
```

A repository points to one project. A project can span several repositories. When `repo` is set, the panel shows that repository's issues and shared issues carrying no label from the `repo` group. The label must exist in that group. Each Git worktree reads its own root file; commit the non-secret `.planaffe` to share the mapping. Nested terminal directories resolve to the Git root.

Create `planaffe.local.json` in Herdr's home, **outside the repository**:

```json
{
  "profiles": {
    "default": {
      "url": "https://planaffe.example",
      "token": "REPLACE_WITH_YOUR_LOCAL_USER_TOKEN"
    }
  }
}
```

Use a user token for a human's panel. A valid agent token also works within that identity's project access. The panel makes only GET requests; the token itself is not necessarily read-only. Tokens are stored in this local plaintext file, not an OS keychain. This version does not read `pa login` credentials or shell token variables.

The URL is an origin, without a path, query or embedded credentials. HTTPS is required except for loopback development servers. Use the final trusted instance address without redirects; the Herdr fetch API does not expose a redirect policy. Never send a token intended for one instance to another service.

For multiple instances, add named local profiles and select one in pane props:

```sh
herdr-app do pane.split '{"direction":"right","mod":"planaffe","props":{"profile":"work"}}'
```

Repository files cannot choose an endpoint or token. Optional `folder` in pane props pins a local working directory. Otherwise the panel follows the focused terminal and remembers it while the panel has focus. Remote SSH spaces are rejected in this version.

## Behavior

- Lists issue key, title, canonical status, assignee and current claim holder.
- Loads 100 project issues per page. **Load more** follows the opaque cursor; the counter distinguishes loaded project issues from visible matches.
- Search and status filters apply to **loaded issues only**. Search matches key, title, assignee and claim holder. With a repository filter, an early page may contain no visible matches; load more to continue.
- Selecting an issue fetches its full description and result. Markdown is displayed as source text; no rendered Markdown or HTML.
- Refresh reloads the mapping, local profile and first page. Repository changes hide old content immediately and reload within one second. Late list/detail responses cannot replace the current selection or repository.
- After 30 seconds a stalled operation can be retried. Its late response is ignored; the underlying native fetch cannot be canceled through the supported host API.
- Issue content and tokens are not written to mod state, logs or caches. There are no write actions, automatic issue polling, notifications or agent execution.

## Architecture

`main.js` owns native GPUI rendering and the controller. `core.js` parses the project file and local profile, validates responses and filters rows. `client.js` is the small HTTP boundary:

- `GET /issues?project=KEY&limit=100&sort=created&order=asc[&cursor=...]`
- `GET /issues/{key}` on selection
- `GET /projects/{key}/labels` when a repository filter is configured

planaffe remains independent of Herdr. This external client uses its public API, not backend internals. The runtime decoder is deliberately handwritten to keep the mod installable without a build; the contract check verifies its consumed fields against a pinned upstream OpenAPI document. This differs from planaffe's generated in-repository clients (ADR 0005). Upgrade the pinned contract and validate the live integration together.

## Development

Node 24 is used for tests only; Herdr supplies the JavaScript runtime and native modules in production.

```sh
npm test
npm run test:contract
npm run check   # requires Herdr installed
```

`test:contract` downloads the public contract at the pinned planaffe commit. An offline alternative is `node scripts/check-contract.mjs /path/to/planaffe/docs/api/openapi.json`.

`npm test` covers the actual controller with injected host capabilities, HTTP transport against a local server, response validation, pagination, repository filtering, errors and stale responses. GitHub Actions runs these tests on Linux and Windows and checks the pinned contract. Herdr native checks and interactive UI checks remain local.

For the optional live integration check, build planaffe, start an **empty disposable** Postgres database on loopback port 55439 (`herdr_mod_test`, user `postgres`, trust authentication), set `PLANAFFE_TEST_POSTGRES` to its connection string in your local environment, then run:

```sh
node scripts/live-check.mjs /path/to/planaffe.dll
```

The script starts a server on loopback port 58039, creates only synthetic fixtures in that database, keeps a random bootstrap token in memory, tests 102 issues and shuts the server down. Remove the disposable database afterwards. Never use an existing database.

## Contributing and license

English source and documentation; small pull requests welcome. Run the tests before submitting. Propose new dependencies before adding them. Do not commit tokens, private endpoints, generated runtime declarations or personal screenshots. Report mod issues here and planaffe server issues in the upstream project.

The mod's code is [MIT licensed](LICENSE). Herdr is a separately installed Apache-2.0 application, not bundled here. The runtime's generated `gpui-kit.d.ts` and `herdr.d.ts` stay ignored and are regenerated by Herdr. API references are the installed declarations and [Herdr's mod guide](https://github.com/herdrdev/herdr-app/blob/master/defaults/AGENTS.md).
