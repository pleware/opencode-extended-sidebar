# Media

Demo assets that can sit next to the root `README.md`. Product marks live in
`assets/` and load from raw on `main`.

| File | Purpose |
| --- | --- |
| `../../assets/branding.png` | project logo — README hero |

The README License footer does not use a pware company mark, and there is no
demo GIF (or GIF placeholder) in `README.md`.

## Recording a demo

1. Size the terminal to roughly `120x30` with the sidebar visible.
2. Use a theme with clear diff colours so `+N −M` reads well.
3. Capture 10–20 seconds covering, in order:
   - clicking a session row under the **My work** tab to switch session,
   - a tool starting and finishing (spinner, then duration),
   - the **Files** header total rising as edits land,
   - the **Perf** tab with its phase bars and per-model timings.
4. Export as GIF, target under 5 MB so GitHub renders it inline.
5. If you add a demo later, a typical README embed is:

```markdown
![OpenCode Extended Sidebar in action](docs/media/demo.gif)
```
