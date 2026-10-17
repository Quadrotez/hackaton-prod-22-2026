#!/usr/bin/env bash
# Review team branches and merge them into dev, then push dev.
#
# For every team branch: shows what is new (commits + diffstat), merges it into
# dev (--no-edit) and aborts with instructions if a conflict needs manual work.
# Re-running the script resumes from where it stopped (already-merged branches
# are skipped automatically).
#
# Usage: sync-dev.sh [branch ...]   (default: all team branches listed below)
set -eo pipefail

TEAM_BRANCHES=(
  frontend-ivan
  frontend-maga
  tiver211-backend
  v1tush-backend
)
DEV_BRANCH="${DEV_BRANCH:-dev}"
REMOTE="${REMOTE:-origin}"

cd "$(git rev-parse --show-toplevel)"

branches=("$@")
[ ${#branches[@]} -eq 0 ] && branches=("${TEAM_BRANCHES[@]}")

echo "== fetch =="
git fetch "$REMOTE" --prune

if [ "$(git rev-parse --abbrev-ref HEAD)" != "$DEV_BRANCH" ]; then
  echo "== switch to $DEV_BRANCH =="
  git checkout "$DEV_BRANCH"
fi

if ! git merge-base --is-ancestor "$DEV_BRANCH" "$REMOTE/$DEV_BRANCH"; then
  echo "!! local $DEV_BRANCH has commits not pushed to $REMOTE/$DEV_BRANCH (or diverged)." >&2
  echo "   Push or rebase onto $REMOTE/$DEV_BRANCH first." >&2
  exit 1
fi
git merge --ff-only "$REMOTE/$DEV_BRANCH" || true

for branch in "${branches[@]}"; do
  remote_ref="$REMOTE/$branch"
  if ! git show-ref --verify --quiet "refs/remotes/$remote_ref"; then
    echo "== $branch: нет на $REMOTE, пропускаю =="
    continue
  fi

  if git merge-base --is-ancestor "$remote_ref" "$DEV_BRANCH"; then
    echo "== $branch: уже в $DEV_BRANCH, пропускаю =="
    continue
  fi

  echo
  echo "== $branch: новые коммиты =="
  git log --oneline --no-decorate "$DEV_BRANCH..$remote_ref"

  echo "-- сводка изменений --"
  git diff --stat "$(git merge-base "$DEV_BRANCH" "$remote_ref")" "$remote_ref"

  echo "-- merge $branch -> $DEV_BRANCH --"
  if ! git merge --no-edit "$remote_ref" \
      -m "Merge branch '$branch' into $DEV_BRANCH"; then
    echo
    echo "!! Конфликт при слиянии '$branch'." >&2
    echo "   1) Разреши конфликты: git status" >&2
    echo "   2) git add <файлы> && git commit --no-edit" >&2
    echo "   3) Запусти скрипт снова — он продолжит с этой ветки." >&2
    exit 1
  fi
done

echo
echo "== push $DEV_BRANCH =="
git push "$REMOTE" "$DEV_BRANCH"
echo "== done: $(git log --oneline -1) =="
