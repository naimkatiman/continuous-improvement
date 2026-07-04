# Portfolio health report

Generated at: 2026-07-04T04:23:20.470Z

Scored 11 repo(s) from local signals; 0 without a local checkout. Worst score first.

| Repo | Score | Top Risk | Next Action |
|---|---|---|---|
| naimkatiman/SprintBo | 10 | No CI configured (.github/workflows is empty or missing) | Add a CI workflow that runs the test suite on push |
| naimkatiman/uitm_comm_skills | 10 | No CI configured (.github/workflows is empty or missing) | Add a CI workflow that runs the test suite on push |
| naimkatiman/DrSaid | 20 | No CI configured (.github/workflows is empty or missing) | Add a CI workflow that runs the test suite on push |
| naimkatiman/quran-gpt-worker | 20 | No CI configured (.github/workflows is empty or missing) | Add a CI workflow that runs the test suite on push |
| naimkatiman/QuranGPT | 20 | No CI configured (.github/workflows is empty or missing) | Add a CI workflow that runs the test suite on push |
| naimkatiman/MobileIB0TelegramApp | 45 | Only 0 release receipt(s) on record | Write a .releases/ receipt for the next ship (template in continuous-improvement) |
| naimkatiman/tradeclaw | 45 | 5 high-severity Actions finding(s) | Run ci-audit-actions --strict and fix the high findings |
| naimkatiman/MiniTelegramApp | 50 | Only 0 release receipt(s) on record | Write a .releases/ receipt for the next ship (template in continuous-improvement) |
| naimkatiman/Roboforex | 50 | Only 0 release receipt(s) on record | Write a .releases/ receipt for the next ship (template in continuous-improvement) |
| naimkatiman/continuous-improvement | 55 | Only 0 release receipt(s) on record | Write a .releases/ receipt for the next ship (template in continuous-improvement) |
| naimkatiman/mosrev | 65 | Only 0 release receipt(s) on record | Write a .releases/ receipt for the next ship (template in continuous-improvement) |

## How scores are computed

v0 scores use LOCAL static signals only — no network calls. Weights (sum 100):

| Signal | Weight | Full credit |
|---|---|---|
| CI configured (.github/workflows with >=1 yml/yaml) | 25 | present |
| Release receipts (.releases/ or docs/releases/, templates excluded) | 20 | 3+ receipts |
| Experiment records (.experiments/ or docs/experiments/, templates excluded) | 15 | 2+ records |
| Commit freshness (git log -1 --format=%ct, guarded) | 20 | <=7 days; half <=30 days |
| Actions security (high findings from audit-actions) | 20 | 0 high findings; -5/finding; requires CI |

Repos without a local checkout are reported as n/a rather than guessed at.
