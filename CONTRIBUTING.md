# Team workflow — TF-01 / KF-01

Repository: `https://github.com/NasserAltamimi/RosterLink`. Board: https://trello.com/b/Fx89828x/rosterlink-swe444.

Keep this implementation local until the owner requests a push. PRs, merges, deployment, and repository visibility changes require explicit instructions. Preserve project-local identity/credentials and work-account settings.

## Start work

1. Inspect `git status --short --branch`, project instructions, and the relevant Trello card. Preserve existing work.
2. Clone if needed. When synchronization is authorized, `git fetch origin`, switch to `main`, then `git pull --ff-only` from a clean worktree. Do not reset someone else's work.
3. Create a focused branch such as `feature/SF-04-player-profile`, or reuse a suitable branch.
4. Move the existing selected card from Sprint Backlog to Ongoing. Record real blockers and real progress only.

## Implement and verify

Follow the README and write focused behavior/authorization tests. Review before staging:

```powershell
git status --short
git diff --check
git diff
npm run check
npm run test:e2e
git add <specific-files>
git diff --cached --stat
git diff --cached
git commit -m "feat(SF-04): persist the player's own profile"
```

Never stage `.env`, uploaded images, local database files, dependencies, or personal editor configuration. `git check-ignore -v .env` should identify an ignore rule; `git ls-files .env` should return nothing. Stage specific files instead of an indiscriminate `git add .`.

## Share and review after authorization

1. Push with the configured personal credential (`git push -u origin <branch>`) only when requested.
2. Open a PR to `main` describing the problem, resulting behavior, story IDs, test evidence, and limitations. Link the cards.
3. A teammate reviews the diff and runs the flow, including authorization/error handling. Record a reviewer only after review occurs.
4. Resolve conflicts by preserving both changes' intent, rerun checks, and commit the resolution. Avoid force pushes/history rewriting.
5. Merge only when authorized and reviews/checks pass. Deployment is separate.

Trello: **Product Backlog → Sprint Backlog → Ongoing → Under Testing → Done → Deployed**. Under Testing means implementation is ready for acceptance. Done requires actual acceptance evidence; Deployed requires a deployment.

## KF-01 team exercise

After sharing is authorized, have a teammate follow this guide on a real small change and PR review. Record branch/commit/PR, reviewer, outcomes, and any actual conflict-resolution observations. Local setup and documentation alone do not prove team learning. This exercise has not yet been performed.
