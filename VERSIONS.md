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
| 3.3.0 | `v3.3.0` | Lock + 趕這一班 on Arrivals; catch-up not limited to 3 minutes |
| 3.4.0 | `v3.4.0` | Lock is 趕車; 錯過了 shows next / faster, no walk chase |
| 3.5.0 | `v3.5.0` | Transfer Buddy is from/to like a map |
| 3.5.1 | `v3.5.1` | 轉乘助手 renamed 路線規劃 / Route planner |
| 3.5.2 | `v3.5.2` | GMB 811 search waits for etagmb on a cold directory |
| 3.5.3 | `v3.5.3` | Persist GMB lookups so CI smoke still sees 811 (current) |

```bash
git fetch origin --tags
git checkout v1.0.0
git checkout v3.0.0
git checkout main
```
