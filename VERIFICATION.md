# Verification — 2026-11-08

Compatibility target: planaffe commit
`8280064a515499f00594e706cfdc3c299b81ea00`; Herdr 0.1.14, installed gpui-shell 0.7.1
interfaces. Node v24.11.0, Windows.

## Completed

- `npm test`: sixteen tests pass. Covers the real controller with injected host
  capabilities, HTTP transport, pagination, canonical fields, repository/shared
  filtering, identity display, malformed replies, denied access, timeouts,
  repository races and selection races.
- `npm run test:contract`: checks the fields and endpoints consumed by the mod
  against the public OpenAPI contract pinned to the revision above.
- `npm run check`: native initial load and eager element materialization pass.
- `scripts/live-check.mjs`: passed against the actual built planaffe server and
  a disposable Postgres 18 database. Created 102 synthetic issues, followed both
  cursor pages, checked 68 repository/shared matches, loaded a full description,
  checked a claimed issue's holder and rejected an invalid bearer token.
- Actual Herdr window: demo list, claim display, issue selection, description,
  result, status filter, search and combined filters visually checked. Missing
  local configuration displays an actionable error. No native errors reported.
- Detail layout follow-up: opened a long issue in a configured live panel,
  scrolled through its description to the end of its result, and returned to
  the same list filter with the close action. Details use the available panel
  height and their action header stays visible while scrolling.
- Epic follow-up: validated nullable summary keys and detail references against
  the pinned API contract; tests cover malformed references and epic filters
  combined with status, questions and search. Checked native demo markers,
  scrollable epic selection and epic title/status in ticket details.
- Fixed a host integration defect found during that check: pane options come
  from Herdr's `props()`, not the View constructor's initialization argument.
- Temporary test panel was closed and the disposable database container removed.
  No screenshots, credentials or generated runtime declarations are published.

## Herdr 0.1.14 compatibility review

Reviewed the [0.1.14 release notes](https://github.com/herdrdev/herdr-app/blob/master/CHANGELOG.md#0114---2026-11-08)
for the shared module evaluation change. Both mods initialize host-dependent
state, inputs, timers and async work inside their View instances; profiles,
clients, filters, selections and answer drafts are not module globals.
Demo rows now copy their nested labels and questions per instance too. The
controller regression test creates two copies from one module and verifies
that mutations and refreshes do not leak between them or into the demo template.
The exported status list remains shared read-only data.

The new optional `exec` timeout does not require migration: both mods use short
`git rev-parse` calls and retain the host's 30-second default. Neither mod uses
pane swapping or relies on the old idle redraw frequency; background checks
already use explicit per-instance timers. Native checks pass on 0.1.14.

## Limits

The live server check exercises the production client module through Node's HTTP
transport. Native Herdr fetch for the list and long issue details has also been
interactively checked. List scrolling with large datasets, remote repositories
(unsupported), other Herdr versions and other planaffe revisions are not covered.
Markdown is displayed as source text. Search/status filters cover loaded pages,
not the entire server result set.

The upstream backend's normal build was blocked by existing NU1902/NU1903
advisories for `System.Security.Cryptography.Pkcs` 10.0.0. For this isolated test
only, it was built with `-p:TreatWarningsAsErrors=false`, retaining the warnings.
No upstream source, package versions or CI settings were changed. This is not a
claim that the upstream backend's normal build is green.

A native `herdr-app check` alone does not exercise async data or native layout;
the checks above deliberately distinguish those layers.
