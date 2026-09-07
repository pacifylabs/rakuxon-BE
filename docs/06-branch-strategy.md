# Branch Strategy — Rakuxon (BE)
**Applies to `rakuxon-BE`. The FE repo mirrors this independently.**

> You deploy each stage on its own branch, verify it, then merge. This keeps a solo build shippable at every step and lets you deploy branches independently.

## Branches

- **`main`** — always green, always deployable → production.
- **`stage/<n>-<name>`** — one per implementation-plan stage (e.g. `stage/2-isolation`). Gets a preview environment.
- **`feature/<slug>`** (optional) — short-lived, off the current stage branch, for a single feature within a stage.
- **`fix/<slug>`** — bug fixes (start with a failing test).

## Flow

```
main
 └─ stage/2-isolation        ← work the whole stage here (TDD)
     └─ feature/rls-policies  ← optional, one feature
     └─ feature/orm-guard
   → open PR stage/2 → main when the stage GATE is green
   → merge → tag → deploy to production
 └─ stage/3-core-slice       ← branch from updated main, repeat
```

## Rules

1. **A branch merges to `main` only when its stage gate is green in CI** — including the **isolation gate** for the BE.
2. Never commit on red. TDD: commit on green.
3. Keep stage branches short-lived; rebase on `main` before the merge PR.
4. Tag `main` after each stage merge (`be-stage-2`, …) so you can roll back to a known-good.
5. Preview environments (Railway/Render) are per `stage/*` branch — smoke-test there before merging.

## PR checklist (paste into each PR)

- [ ] Tests written first; all green
- [ ] Isolation suite extended for new endpoints; **gate green**
- [ ] Tenant-scoped access via `runInTenantContext`
- [ ] External deps behind interfaces; async on BullMQ
- [ ] Configurable numbers in config/admin (no hard-coded prices/splits)
- [ ] Migrations included (incl. RLS where relevant)
- [ ] `.env.example` updated if new env added
