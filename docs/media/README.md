# Media

Demo assets referenced by the root `README.md`. Product and company marks live in `assets/` and load from raw on `main`.

| File | Purpose |
| --- | --- |
| `../../assets/branding.png` | project logo — README hero |
| `../../assets/branding.pware.png` | pware company mark — README License / author |
| `demo.gif` | main README demo (session switching, live tools, file diffs) |

## Recording the demo

1. Size the terminal to roughly `120x30` with the sidebar visible.
2. Use a theme with clear diff colours so `+N −M` reads well.
3. Capture 10–20 seconds covering, in order:
   - clicking a row under the **Project** tab to switch session,
   - a tool starting and finishing (spinner, then duration),
   - the **Files** header total rising as edits land,
   - the **Perf** tab with its phase bars and per-model timings.
4. Export as GIF, target under 5 MB so GitHub renders it inline.
5. Swap the placeholder in `README.md` for:

```markdown
![OpenCode Extended Sidebar in action](docs/media/demo.gif)
```
