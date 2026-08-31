# Changelog

- **0.2.19** (2026-08-31) Show the planner session state on pending-approval rows in My work (working/waiting/idle/archived/unknown) by enriching each approval via a new approvalState re.
- **0.2.18** (2026-08-31) Make My work questions project-wide so a restart or session switch can no longer hide an open question, and widen the Sessions list with a sessionFetch revealer.
- **0.2.17** (2026-08-31) Rename the pending-approval Continue row to Navigate to session and add an Approve row in its own category that sends an ok reply to the plan's writer session v.
- **0.2.16** (2026-08-31) Extract every status-to-character mapping into a single pware.oc.ui.glyphs module (workStatusGlyph, markGlyph with queued rendering as the ◷ clock instead of th.
- **0.2.15** (2026-08-31) Extract the resolution layer into src/resolvers: per-entity opencode (session/tool/file/question/todo) and omo (boulder/plan/approval/doc/config) resolver modul.
- **0.2.14** (2026-08-31) Add a Project tab rolling up tools and files across recent sessions (tab bar is now OES | Project | Session | Perf, old Current renamed to Session), show the wi.
- **0.2.13** (2026-08-31) Filter Files through `.oesignore` and `.gitignore` with the `ignore` package, exclude `question` from Perf timing, and add a `… N more` Files expander.
- **0.2.12** (2026-08-31) Add perf timing log feature and update project files.
- **0.2.11** (2026-08-31) Open a dated Perf timing log when you click a Time phase, Models header, or slow-tool row.
- **0.2.10** (2026-08-30) Show a success toast when the sidebar plugin loads.
- **0.2.9** (2026-08-30) Split OES and OMO into stacked groups with Works, Boulder, and Docs tabs plus height-aware row trimming.
- **0.2.8** (2026-08-30) Open OMO plan rows as a headed markdown preview and mark plan status with check glyphs.
- **0.2.7** (2026-08-30) Keep file previews inside a terminal-sized scrollbox so Copy and Close stay on screen.
- **0.2.6** (2026-08-30) Use a down-triangle glyph on Delegate group headers so they no longer look like rows.
- **0.2.5** (2026-08-30) Add click-for-detail dialogs with formatted Markdown preview and group Delegates by agent name.
- **0.2.4** (2026-08-30) Stop leftover Delegates spinners once the OpenCode session is idle, extract tool and file metadata in SQLite, and spawn git status off the TUI thread.
- **0.2.3** (2026-08-30) Add an OMO Plans tab, underline clickable chrome, and label task tools by their short description.
- **0.2.2** (2026-08-30) Speed up large-tree refresh and mark thinking with a therefore sign instead of a star.
- **0.2.1** (2026-08-30) Initial public release of the OpenCode Extended Sidebar TUI plugin.
One sentence per commit. The `commit-msg` hook bumps the patch in `package.json` and prepends a line here.

- **0.2.0** (2026-08-30) Session switcher, live tools, file diffs, and oes.json display options.
