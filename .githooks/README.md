# Git hooks (versioned)

`git clone` does **not** install hooks on its own (Git never runs code from the repo).

They install automatically on `npm install` / `npm ci` (`prepare` → `scripts/install-git-hooks.mjs`), or by hand:

```bash
git config core.hooksPath .githooks
```

The script sets `hooksPath` only when the package directory is the clone root (it does not overwrite hooks when this package is installed as a dependency).

- `commit-msg` — strips AI / agent attribution trailers
  (`Co-authored-by: Cursor|Claude|Copilot|…`, `Assisted-by`, `Generated with …`, 🤖, and similar).
  Real human `Co-authored-by` lines are left alone.
  Then `scripts/note-commit.mjs`: patch +1 in `package.json` and one line in `CHANGELOG.md`
  from the first sentence of the commit. Merge / `SKIP_OES_BUMP=1` / version already bumped — skip.
- `post-commit` — `amend --no-verify` so the bump lands in the same commit (flag `.git/OES_AMEND`).
