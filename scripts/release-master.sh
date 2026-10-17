#!/usr/bin/env bash
# Promote dev into the protected master via a GitLab merge request (direct
# pushes to master are blocked for Developers; MR merges are allowed).
#
# - fast-forwards local dev to origin/dev and pushes if needed
# - creates (or reuses) an open MR dev -> master through the API
# - merges it right away, or enables auto-merge while the pipeline runs
# - fast-forwards local master to the resulting merge commit
#
# Auth: GitLab token from $GITLAB_TOKEN or first line of the file
# $TOKEN_FILE (default: temp/api_key.txt, relative to the repo root).
#
# Usage: release-master.sh
set -eo pipefail

REMOTE="${REMOTE:-origin}"
DEV_BRANCH="${DEV_BRANCH:-dev}"
MASTER_BRANCH="${MASTER_BRANCH:-master}"
TOKEN_FILE="${TOKEN_FILE:-temp/api_key.txt}"

cd "$(git rev-parse --show-toplevel)"

GITLAB_TOKEN="${GITLAB_TOKEN:-$(head -n1 "$TOKEN_FILE" 2>/dev/null || true)}"
if [ -z "$GITLAB_TOKEN" ]; then
  echo "!! Нет GitLab-токена: задай \$GITLAB_TOKEN или \$TOKEN_FILE ($TOKEN_FILE)." >&2
  exit 1
fi

git fetch "$REMOTE" --prune
origin_url="$(git remote get-url "$REMOTE")"
project_path="$(python3 - "$origin_url" <<'PY'
import sys
u = sys.argv[1]
if "://" in u:
    u = __import__("urllib.parse", fromlist=["x"]).urlparse(u).path
else:
    u = u.split(":", 1)[-1]
print(u.removeprefix("/").removesuffix(".git"))
PY
)"
project_id="$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1], safe=''))" "$project_path")"
API="https://gitlab.t-education.com/api/v4"
api() { curl -s --fail-with-body --header "PRIVATE-TOKEN: $GITLAB_TOKEN" "$@"; }

# 1) Убедиться, что dev актуален и запушен.
git checkout "$DEV_BRANCH"
if ! git merge-base --is-ancestor "$DEV_BRANCH" "$REMOTE/$DEV_BRANCH"; then
  echo "!! локальный $DEV_BRANCH разошёлся с $REMOTE/$DEV_BRANCH — разберись вручную." >&2
  exit 1
fi
git merge --ff-only "$REMOTE/$DEV_BRANCH"
git push "$REMOTE" "$DEV_BRANCH"

# 2) Найти или создать MR dev -> master.
mr_iid="$(
  api "$API/projects/$project_id/merge_requests?state=opened&source_branch=$DEV_BRANCH&target_branch=$MASTER_BRANCH" \
    | python3 -c 'import json,sys;mrs=json.load(sys.stdin);print(mrs[0]["iid"] if mrs else "")'
)"
if [ -n "$mr_iid" ]; then
  echo "== переиспользую открытый MR !$mr_iid =="
else
  echo "== создаю MR $DEV_BRANCH -> $MASTER_BRANCH =="
  mr_iid="$(
    api -X POST "$API/projects/$project_id/merge_requests" \
      --data-urlencode "source_branch=$DEV_BRANCH" \
      --data-urlencode "target_branch=$MASTER_BRANCH" \
      --data-urlencode "title=Release: merge $DEV_BRANCH into $MASTER_BRANCH" \
      | python3 -c 'import json,sys;print(json.load(sys.stdin)["iid"])'
  )"
  echo "создан MR !$mr_iid"
fi

# 3) Дождаться, пока MR станет mergeable (GitLab проверяет конфликтность).
mr_state() {
  api "$API/projects/$project_id/merge_requests/$mr_iid" \
    | python3 -c 'import json,sys;d=json.load(sys.stdin);print(d.get("detailed_merge_status") or d.get("merge_status") or "")'
}
mr_field() {
  api "$API/projects/$project_id/merge_requests/$mr_iid" \
    | python3 -c "import json,sys;print(json.load(sys.stdin).get(sys.argv[1],''))" "$1"
}
mr_pipeline_status() {
  api "$API/projects/$project_id/merge_requests/$mr_iid" \
    | python3 -c 'import json,sys;d=json.load(sys.stdin);print((d.get("head_pipeline") or {}).get("status") or "none")'
}
# PUT .../merge с захватом HTTP-кода и тела ответа (ошибки GitLab приходят в body).
merge_put() {
  local body code
  local -a extra=()
  [ -n "${1:-}" ] && extra=(--data-urlencode "$1")
  body="$(mktemp)"
  code="$(curl -s -o "$body" -w '%{http_code}' \
    --header "PRIVATE-TOKEN: $GITLAB_TOKEN" -X PUT \
    "$API/projects/$project_id/merge_requests/$mr_iid/merge" \
    --data "should_remove_source_branch=false" "${extra[@]}")"
  if [ "$code" != "200" ]; then
    echo "HTTP $code: $(python3 -c "import json,sys;print(json.load(open('$body')).get('message',''))" 2>/dev/null || cat "$body")" >&2
    rm -f "$body"
    return 1
  fi
  rm -f "$body"
}
for _ in $(seq 1 30); do
  status="$(mr_state)"
  echo "MR !$mr_iid: $status"
  case "$status" in
    can_be_merged|ci_still_running|ci_must_pass|pipeline_blocking) break ;;
    checking|preparing|unchecked) sleep 5 ;;
    *) echo "!! MR нельзя смёрджить (статус: $status)."; exit 1 ;;
  esac
done

# 4) Смёрджить сразу или включить auto-merge на время пайплайна.
mr_web="$(mr_field web_url)"
if merge_put ""; then
  echo "== MR !$mr_iid смёрджен =="
else
  echo "== прямой merge не прошёл, включаю auto-merge =="
  if ! merge_put "merge_when_pipeline_succeeds=true"; then
    echo "!! не удалось запланировать auto-merge, смёрджи MR вручную:" >&2
    echo "   $mr_web" >&2
    exit 1
  fi
  echo "MR !$mr_iid вольётся автоматически после успешного пайплайна:"
  echo "  $mr_web"

  echo "== жду фактического мёрджа MR !$mr_iid (до 15 минут) =="
  merged=""
  for _ in $(seq 1 90); do
    state="$(mr_field state)"
    pipeline="$(mr_pipeline_status)"
    case "$state" in
      merged) merged=1; break ;;
      opened) ;;
      *) break ;;
    esac
    # Упавший/отменённый пайплайн отменяет auto-merge — дальше ждать бессмысленно.
    case "$pipeline" in
      failed|canceled|skipped)
        echo "!! пайплайн завершился со статусом '$pipeline', auto-merge отменён." >&2
        echo "   Почини пайплайн ($mr_web), затем запусти скрипт снова." >&2
        exit 1
        ;;
    esac
    sleep 10
  done
  if [ "$merged" != "1" ]; then
    echo "== MR ещё не смёрджен (state=$state, pipeline=$pipeline); локальный $MASTER_BRANCH обнови позже:" >&2
    echo "   git fetch $REMOTE && git checkout $MASTER_BRANCH && git merge --ff-only $REMOTE/$MASTER_BRANCH" >&2
    exit 0
  fi
  echo "== MR !$mr_iid смёрджен =="
fi

# 5) Обновить локальный master до merge-коммита.
git fetch "$REMOTE" "$MASTER_BRANCH"
git checkout "$MASTER_BRANCH"
if ! git merge-base --is-ancestor "$MASTER_BRANCH" "$REMOTE/$MASTER_BRANCH"; then
  echo "!! локальный $MASTER_BRANCH разошёлся с $REMOTE/$MASTER_BRANCH — обнови вручную." >&2
  exit 1
fi
git merge --ff-only "$REMOTE/$MASTER_BRANCH"
git checkout "$DEV_BRANCH"
echo "== done =="
