// Keep opening independent of project detection: the panel explains missing setup.
export function context(spaces, panes, focused) {
  const space = spaces.find(space => space.active);
  const tab = focused?.tab || space?.tabs?.find(tab => tab.active)?.id;
  const terminal = panes.find(pane => pane.pane === focused?.pane && pane.terminal)
    || panes.find(pane => pane.tab === tab && pane.terminal);
  return { tab, pane: terminal?.pane, cwd: terminal?.cwd || space?.folder,
    remote: Boolean(space?.machine) };
}

export function openAction(context, panes) {
  if (!context.tab || context.remote) return null;
  const existing = panes.find(pane => pane.tab === context.tab && pane.mod === "planaffe");
  if (existing) return { name: "pane.focus", args: { pane: existing.pane } };
  if (!context.pane) return null;
  return { name: "pane.split", args: { pane: context.pane, direction: "right", mod: "planaffe" } };
}
