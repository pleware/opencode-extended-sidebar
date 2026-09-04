# Constraints

Last reviewed: 2026-09-04 by @pleware

Quality bar for `opencode-extended-sidebar`. Read this file before writing
code. Do not weaken it to make a change pass.

## Floor (always enforced, no setup required)

- No new suppression comments: `@ts-ignore`, `@ts-expect-error`, `eslint-disable`
- No unimplemented stubs: `throw new Error("Not implemented")`, empty `catch {}`
- No skipped or deleted tests without a reason in the commit message
- No secrets in source (see `.githooks/` and existing CI checks)
- No coverage-ignore carve-outs beyond the fixed list in `bunfig.toml`
- This file does not get weakened to make a change pass

## Enforced with numbers

| Dimension | Rule | Checked by | Runs at |
|-----------|------|-----------|---------|
| Types | Zero type errors | `bun run typecheck` (`tsc --noEmit`) | CI, before merge |
| Tests | Zero failures in unit + snapshot | `bun test test/unit test/snapshot` | CI, before merge |
| Coverage: project | ≥ 95% lines overall | Codecov project status (`codecov.yml`) | CI, on push/PR |
| Coverage: patch | ≥ 95% lines on changed code | Codecov patch status (`codecov.yml`) | CI, on PR |
| Bench | No loosened scan budgets | `bun run bench` (informational) | CI, on push/PR |

Coverage is measured on the `coverage/lcov.info` that `bun test --coverage
--coverage-reporter=lcov` writes, excluding the intentional list in
`bunfig.toml` (thin TUI wrappers tested via snapshot fixtures, runtime
monitor/source/worker glue). The upload uses Codecov OIDC
(`use_oidc: true` in `.github/workflows/ci.yml`) — no repository secret.

## Measured, en route to the bar

| Metric | Today | Bar | Direction |
|--------|-------|-----|-----------|
| Project coverage | 86.29% | 95% | must rise |

The gate is already set to the bar: the Codecov project status will report
failure until project coverage reaches 95%. Closing the ~9-point gap is
working coverage, not a reason to lower the bar.

## Exceptions

| ID | Rule | Path | Reason | Owner | Expires |
|----|------|------|--------|-------|---------|
| X1 | coverage ignore | `src/pware.oc.ui.tsx`, `src/pware.oc.ui/**`, `src/pware.oc.perf/pware.oc.perf.view.tsx`, `src/pware.oc.runtime/pware.oc.runtime.{monitor,source,worker}.ts` | Thin TUI / glue layers tested via snapshot fixtures, not mounted (see `.cursor/rules/try-testable.mdc` + `tests-sync.mdc`) | @pleware | never (design rule) |
