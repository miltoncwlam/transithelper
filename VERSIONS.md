# Versions

Canonical log: **[`CHANGELOG.md`](CHANGELOG.md)** (every user-visible change from the original paste through today).

Scheme: **x.y.z** — major / minor / patch. Git tags are `vX.Y.Z`.

| Version | Tag | What |
|---|---|---|
| 1.0.0 | `v1.0.0` | Original HTML paste |
| 2.0.0 | `v2.0.0` | Next.js app |
| 2.1.0 … 2.9.1 | `v2.y.z` | Transfer hop math, GMB, maps, Light Rail, then drop LRT/playground |
| 3.0.0 | `v3.0.0` | Journey planner, 趕車助手, 出門規劃 |
| 3.0.2 | `v3.0.2` | This changelog scheme |
| 3.0.3 | `v3.0.3` | Clock vs countdown, MTR Bus ETAs, nearby-board honesty |
| 3.1.0 | `v3.1.0` | Home / work nearby as live boards you reopen |
| 3.2.0 | `v3.2.0` | Nearby board auto-loads when there is no last bus |
| 3.3.0 | `v3.3.0` | Lock + 趕這一班 on Arrivals; catch-up not limited to 3 minutes (current) |

```bash
git fetch origin --tags
git checkout v1.0.0
git checkout v3.0.0
git checkout main
```
