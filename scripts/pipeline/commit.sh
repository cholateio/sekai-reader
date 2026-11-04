#!/usr/bin/env bash
# Commits the pipeline's own files back to main. Only the pipeline edits these paths, so a rebase
# onto a human push does not conflict in practice; three attempts cover a push race.
set -euo pipefail
msg="${1:?commit message}"
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git add data/pipeline-state.json data/tc-event-index.json storyboards/
if git diff --cached --quiet; then echo 'nothing to commit'; exit 0; fi
git commit -q -m "$msg"
for _ in 1 2 3; do
  if git fetch -q origin main && git rebase -q origin/main && git push -q origin HEAD:main; then exit 0; fi
  git rebase --abort 2>/dev/null || true
  sleep 10
done
echo 'push failed after 3 attempts' >&2
exit 1
