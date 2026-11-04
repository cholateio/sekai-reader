#!/usr/bin/env bash
# One-time setup on the owner's machine (WSL): fill the secrets in Notepad, upload them to GitHub,
# set the repo variables, create the Cloudflare Pages project and seed the private R2 bucket.
# Secret values are never echoed; the filled file is deleted at the end.
set -euo pipefail
set +x
cd "$(git rev-parse --show-toplevel)"

ENV_FILE="$PWD/.env.pipeline"
BUCKET="${R2_BUCKET:-sekai-reader-assets}"
KEYS=(ANTHROPIC_API_KEY CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY)

command -v gh >/dev/null || { echo '需要 GitHub CLI（gh），先執行 gh auth login'; exit 1; }
command -v rclone >/dev/null || { echo '需要 rclone 上傳種子素材：sudo apt-get install -y rclone，裝好再執行一次'; exit 1; }

if [ ! -f "$ENV_FILE" ]; then
  cp .env.pipeline.example "$ENV_FILE"
  chmod 600 "$ENV_FILE"
fi
(cd /mnt/c && cmd.exe /c start "" notepad.exe "$(wslpath -w "$ENV_FILE")")
read -r -p '在記事本填好五個值並存檔後，回到這裡按 Enter… ' _

# Notepad may save CRLF line endings and a UTF-8 BOM; both would end up inside the secret values.
sed -i -e '1s/^\xEF\xBB\xBF//' -e 's/\r$//' "$ENV_FILE"
val() { grep -E "^$1=" "$ENV_FILE" | tail -n 1 | cut -d= -f2-; }
for k in "${KEYS[@]}"; do
  [ -n "$(val "$k")" ] || { echo "$k 還沒填，檔案保留在 .env.pipeline，填好再執行一次"; exit 1; }
done
# From here the file holds five real secrets: delete it however the script ends.
cleanup() {
  local code=$?
  shred -u "$ENV_FILE" 2>/dev/null || rm -f "$ENV_FILE"
  [ "$code" -eq 0 ] || echo '中途失敗：.env.pipeline 已刪除，修正原因後重新執行（會再開記事本）'
}
trap cleanup EXIT

echo '上傳 GitHub secrets（5 個）…'
gh secret set -f "$ENV_FILE"
gh variable set R2_BUCKET --body "$BUCKET"
gh variable get BACKFILL >/dev/null 2>&1 || gh variable set BACKFILL --body off
gh variable get DIRECT_DAILY_USD >/dev/null 2>&1 || gh variable set DIRECT_DAILY_USD --body 20

echo '建立 Cloudflare Pages 專案 sekai-reader（已存在就略過）…'
if env CLOUDFLARE_API_TOKEN="$(val CLOUDFLARE_API_TOKEN)" CLOUDFLARE_ACCOUNT_ID="$(val CLOUDFLARE_ACCOUNT_ID)" \
    npx --yes wrangler@4.157.0 pages project list 2>/dev/null | grep -q 'sekai-reader'; then
  echo '已存在'
else
  env CLOUDFLARE_API_TOKEN="$(val CLOUDFLARE_API_TOKEN)" CLOUDFLARE_ACCOUNT_ID="$(val CLOUDFLARE_ACCOUNT_ID)" \
    npx --yes wrangler@4.157.0 pages project create sekai-reader --production-branch=main
fi

if [ -f assets/raw/event_173_01.asset ] && [ -d assets/public ]; then
  echo "上傳種子素材到 R2 桶 $BUCKET…"
  for pair in 'assets/raw raw' 'assets/public public'; do
    set -- $pair
    env RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare RCLONE_CONFIG_R2_REGION=auto \
      RCLONE_CONFIG_R2_ACL=private RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true \
      RCLONE_CONFIG_R2_ENDPOINT="https://$(val CLOUDFLARE_ACCOUNT_ID).r2.cloudflarestorage.com" \
      RCLONE_CONFIG_R2_ACCESS_KEY_ID="$(val R2_ACCESS_KEY_ID)" \
      RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$(val R2_SECRET_ACCESS_KEY)" \
      rclone copy "$1" "r2:$BUCKET/$2" --transfers 8 --exclude '.tmp/**'
  done
else
  echo '本機沒有 assets/raw/event_173_01.asset 或 assets/public/，略過種子上傳（workflow 第一次會因為桶是空的而失敗）'
  exit 1
fi

echo '完成：.env.pipeline 會在結束時刪除。下一步：gh workflow run pipeline.yml -f event=173'
