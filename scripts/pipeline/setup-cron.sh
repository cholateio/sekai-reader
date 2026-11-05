#!/usr/bin/env bash
# One-time setup on the owner's machine (WSL): deploy the Cloudflare Worker that starts the pipeline
# workflow every hour, and store the GitHub token as its secret. Values are never echoed; the filled file
# is deleted however the script ends.
set -euo pipefail
set +x
cd "$(git rev-parse --show-toplevel)"

ENV_FILE="$PWD/.env.cron"
REPO=cholateio/sekai-reader
KEYS=(GH_DISPATCH_TOKEN CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID)

cleanup() {
  local code=$?
  shred -u "$ENV_FILE" 2>/dev/null || rm -f "$ENV_FILE"
  [ "$code" -eq 0 ] || echo '沒有完成：.env.cron 已刪除，修正原因後重新執行（會再開記事本）'
}
# The file holds secrets as soon as the user saves it: delete it on every exit path.
trap cleanup EXIT
cp .env.cron.example "$ENV_FILE"
chmod 600 "$ENV_FILE"
(cd /mnt/c && cmd.exe /c start "" notepad.exe "$(wslpath -w "$ENV_FILE")")
read -r -p '在記事本填好三個值並存檔後，回到這裡按 Enter… ' _

sed -i -e '1s/^\xEF\xBB\xBF//' -e 's/\r$//' "$ENV_FILE"
val() { grep -E "^$1=" "$ENV_FILE" | tail -n 1 | cut -d= -f2-; }
for k in "${KEYS[@]}"; do
  [ -n "$(val "$k")" ] || { echo "$k 還沒填"; exit 1; }
done

# A real dispatch is the only proof of Actions write access; it starts one pipeline run, which is wanted.
# The header goes through stdin so the token never appears in the process list.
echo '用 GitHub token 觸發一次 pipeline（同時驗證寫入權限）…'
code=$(printf 'Authorization: Bearer %s\n' "$(val GH_DISPATCH_TOKEN)" | curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H @- -H 'Accept: application/vnd.github+json' -H 'X-GitHub-Api-Version: 2022-11-28' \
  -d '{"ref":"main"}' "https://api.github.com/repos/$REPO/actions/workflows/pipeline.yml/dispatches")
[ "$code" = 204 ] || { echo "GitHub token 無法觸發 workflow（HTTP $code）：確認只選了 $REPO、Actions 權限為 Read and write"; exit 1; }

(
  export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID
  CLOUDFLARE_API_TOKEN="$(val CLOUDFLARE_API_TOKEN)"
  CLOUDFLARE_ACCOUNT_ID="$(val CLOUDFLARE_ACCOUNT_ID)"
  cd worker
  echo '部署 Worker sekai-reader-cron（每小時 :23）…'
  npx --yes wrangler@4.157.0 deploy
  echo '存入 Worker secret GH_DISPATCH_TOKEN…'
  val GH_DISPATCH_TOKEN | tr -d '\n' | npx --yes wrangler@4.157.0 secret put GH_DISPATCH_TOKEN
)

echo '完成：Worker 每小時 :23 觸發 pipeline。GitHub 會在 token 到期前寄信提醒，到時重跑本腳本。'
