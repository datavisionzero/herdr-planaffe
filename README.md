# herdr-planaffe

A native [planaffe](https://github.com/datavisionzero/planaffe) issue panel for [Herdr](https://github.com/herdrdev/herdr-app). MIT licensed. No webview, npm dependencies, adapter service or build step.

**Early integration:** tested against planaffe commit `8280064a515499f00594e706cfdc3c299b81ea00` and Herdr's installed gpui-shell 0.7.1 interfaces. See [VERIFICATION.md](VERIFICATION.md) for the checks and their limits. Compatibility with other versions is not yet guaranteed.

## Set up with an AI agent

With Herdr installed and a planaffe instance available, an AI agent with local file and terminal access can handle the mod setup. Open the agent in the Git repository you want to connect, then copy these two sentences:

```text
Set up herdr-planaffe (https://github.com/datavisionzero/herdr-planaffe) for my current Git repository by following its README, validate the installed mod and open its panel in Herdr. Reuse and preserve existing configuration, ask me only for missing instance, project or optional repo label details, and help me enter the token locally in Herdr's planaffe.local.json outside Git.
```

The agent can install the mod, configure the repository mapping and local profile, and check the result. Enter your token directly in the local file rather than pasting it into the chat. For manual setup, follow the steps below.

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

Use a user token for a human's panel. A valid agent token also works within that identity's project access. The panel reads issues and can submit an explicit answer to an open question; the token itself is not necessarily read-only. Tokens are stored in this local plaintext file, not an OS keychain. This version does not read `pa login` credentials or shell token variables.

The URL is an origin, without a path, query or embedded credentials. HTTPS is required except for loopback development servers. Use the final trusted instance address without redirects; the Herdr fetch API does not expose a redirect policy. Never send a token intended for one instance to another service.

For multiple instances, add named local profiles and select one in pane props:

```sh
herdr-app do pane.split '{"direction":"right","mod":"planaffe","props":{"profile":"work"}}'
```

Repository files cannot choose an endpoint or token. Optional `folder` in pane props pins a local working directory. Otherwise the panel follows the focused terminal and remembers it while the panel has focus. Remote SSH spaces are rejected in this version.

## Behavior

- Defaults to active work, hiding done and canceled issues. In-progress issues appear first, followed by review, todo and backlog. Colored status symbols and clickable overview counts summarize loaded repository issues. All statuses remain accessible through filters.
- The compact header shows outstanding work, or a green check only after all pages have loaded successfully and no active issues remain. Search does not affect this indicator. Review is orange; error messages remain red.
- Lists issue key, title, canonical status, open-question count and current claim holder. A non-empty assignee appears in the details.
- **Needs answer** filters loaded issues with open questions. Select an issue to read its questions and type an answer, then click **Send answer**. Answers use the configured identity and its permissions. Pending submissions cannot be sent twice; there is no automatic retry. If confirmation fails, reload the issue to check the saved state before retrying. Drafts stay in memory and are cleared when selecting an issue or reloading the panel. Demo mode never sends.
- Loads 100 project issues per page. **Load more** follows the opaque cursor; the counter distinguishes loaded project issues from visible matches.
- Search and status filters apply to **loaded issues only**. Search matches key, title, assignee and claim holder. With a repository filter, an early page may contain no visible matches; load more to continue.
- Selecting an issue fetches its full description and result. Markdown is displayed as source text; no rendered Markdown or HTML.
- Refresh reloads the mapping, local profile and first page. Repository changes hide old content immediately and reload within one second. Late list/detail responses cannot replace the current selection or repository.
- After 30 seconds a stalled operation can be retried. Its late response is ignored; the underlying native fetch cannot be canceled through the supported host API.
- Issue content and tokens are not written to mod state, logs or caches. The only write action is an explicit answer to a question. There is no automatic issue polling, notification delivery or agent execution.

## Architecture

`main.js` owns native GPUI rendering and the controller. `core.js` parses the project file and local profile, validates responses and filters rows. `client.js` is the small HTTP boundary:

- `GET /issues?project=KEY&limit=100&sort=created&order=asc[&cursor=...]`
- `GET /issues/{key}` on selection
- `POST /questions/{id}/answer` only on explicit submission
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

## Reopen the panel with the launcher

Install `mods/planaffe-launcher` alongside `mods/planaffe`. Before first installation,
clone the shipped layout with `herdr-app do layout.clone '{"name":"main","as":"planaffe-workspace"}'`.
Herdr docks the newly discovered launcher at the bottom of that personal layout.
Keep this launcher visible: custom mod commands only reach shown copies.
Other layouts need their own block referencing `planaffe-launcher`.

Click **planaffe: Open issues**, or run `herdr-app do planaffe-launcher.open`.
Both focus the existing planaffe pane in the current tab, or open one on the right.
Other tabs are left alone. Local repositories only are supported.
The launcher resolves nested working directories to the Git root and shows the
project key from `.planaffe`. “Project configured” indicates a mapping, not a
successful server connection. Open the panel for profile or connection errors.
Detection refreshes every three seconds and never contacts the API.

For a keyboard shortcut, add an unused key to the `global` section of Herdr's
`keys.json`, preserving existing bindings, for example:

```json
"ctrl-shift-i": "planaffe-launcher.open"
```

The installed Herdr API does not expose registration of custom command-palette
entries. The launcher, keyboard binding and CLI command provide the supported
entry points; the built-in palette is not modified.
