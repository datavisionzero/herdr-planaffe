# Working on herdr-planaffe

Write code, documentation and commit messages in English. This is an independent,
read-only Herdr client of planaffe's public HTTP API. Do not add backend rules or
write actions in passing.

- Read README.md for the source layout, configuration and compatibility target.
- Keep canonical planaffe terms and wire fields: issue key, project, repo, claim.
- Use Herdr's installed declarations for native APIs; browser and Node APIs are
  not available in the mod. Node APIs belong only in scripts and tests.
- New dependencies need human approval before they are added, with purpose,
  transitive dependencies and license. None are currently needed.
- Run npm test, npm run test:contract and npm run check after relevant changes.
  Native layout or interaction changes also need an actual Herdr window check.
- Keep credentials, personal paths, private endpoints and screenshots out of Git.
  Runtime-generated declarations are ignored. Use artifacts/ for local checks.
- Commit and push only when requested. Review the complete staged diff and any
  unpushed history for secrets and personal information before pushing.
