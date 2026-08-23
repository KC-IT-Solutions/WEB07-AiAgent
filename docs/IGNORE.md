# AI Repository Ignore Policy

Use this file to control repository inspection by implementation agents.

## Never inspect recursively

Do not recursively inspect these paths during normal repository analysis:

- `node_modules/`
- `dist/`
- `.test-dist/`
- `coverage/`
- `playwright-report/`
- `test-results/`
- `logs/`
- `data/`
- `docs/executed_tasks/`
- `docs/executed_results/`

Historical task/result files may be accessed only when explicitly required for the active task. The active task may still create and update its own tracking files.

## Forbidden repository-wide commands

Do not use unrestricted recursive repository enumeration, including:

- `ls -Recurse`
- `Get-ChildItem -Recurse`
- equivalent commands that recursively enumerate the whole repository

## Required repository discovery

All recursive or repository-wide discovery must use `scripts/inspect-repo.ps1`.

Initial discovery:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1
```

Scoped discovery:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1 -Scope <relevant-path>
```

File-type discovery:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\inspect-repo.ps1 -Scope <relevant-path> -Extensions html,css,js,ts
```

Do not use recursive filesystem enumeration for repository discovery, including:

- `ls -Recurse`
- `Get-ChildItem -Recurse`
- `dir /s`
- equivalent recursive commands

This prohibition applies both to the repository root and to subdirectories such as `src/`.

After discovery:
- inspect only paths relevant to the active task
- read known individual files directly as needed
- expand into additional directories only when required
- keep all inspection narrow and targeted

If `scripts/inspect-repo.ps1` is missing or fails, stop and report the failure. Do not fall back to recursive enumeration.

## Core rule

Keep repository inspection narrow. Do not load generated, historical, dependency, build, test-output, or unrelated files into model context unless the active task explicitly requires them.
