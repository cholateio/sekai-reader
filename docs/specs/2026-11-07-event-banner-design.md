# 活動橫幅圖

2026-11-07，owner 同意（「同意」，回覆「橫幅圖能不能拿到並顯示在列表或入口背景」的提案，含補抓已完成活動的例外）。

## 目的

首頁列表與活動頁只有色條和文字，略顯單調。加上遊戲內的活動橫幅圖，讓讀者一眼認出是哪一期。

## 來源

- Sekai-World 台服素材的首頁橫幅：`storage.sekai.best/sekai-tc-assets/home/banner/{bundle}/{bundle}.webp`，`bundle` 是索引裡的 `bundle`（例：`event_colors_2025`）。路徑出自 sekai-viewer 原始碼 `EventDetail.tsx`，以 `tw` 區域對應 `sekai-tc-assets`。
- 只抓這一張，不抓 logo 或活動背景。

## 抓取（橫幅通道）

- 每小時一輪的 fetch 階段結束後，另跑一次「橫幅通道」：`fetch_episode.py --banners ID,...`。
- 名單只取自已提交的索引與流水線狀態：`assets` 為 `done` 且還沒有橫幅紀錄的活動，新到舊，**每輪至多 4 期**，一期一個請求，請求間隔至少 5 秒；若前面的佇列或劇本通道已發過請求，先等 5 秒。
- 一般抓圖流程（`--event`）不變：活動抓完圖的下一輪，就由橫幅通道補上它的橫幅。
- 回應不是 WebP（檔頭不是 `RIFF....WEBP`）視為錯誤，不留檔；404 記為 `missing`，之後不再要；網路等其他錯誤不記狀態，下一輪再試。
- 狀態記在 `pipeline-state.json` 各活動的 `banner: 'done' | 'missing'`。`fetch_episode.py --banners` 自己讀狀態檔核對，只接受 `assets` 為 `done` 且沒有橫幅紀錄的活動，所以流水線呼叫前先把本輪狀態寫回檔案。
- 轉檔時解不開的檔案（即使檔頭像 WebP）連同半成品一起刪除，並清掉該期的 `done` 紀錄，下一輪重抓。
- 有新轉好的橫幅，或 `manifest.json` 內容有變（例如上一輪中途中斷），就觸發部署；manifest 以暫存檔改名的方式寫入。
- 原檔存 `assets/raw/banner/{bundle}.webp`（同步到私有 R2，不進 git）。

## 產出

- `scripts/build_banners.ts` 把原檔轉成兩個尺寸：`assets/public/banner/{bundle}.webp`（寬 720）與 `assets/public/banner/s/{bundle}.webp`（寬 200，列表縮圖），並重寫 `manifest.json`。
- `manifest.json` 新增 `banners: string[]`（有橫幅的 bundle）。manifest 由 `build_episode.ts` 與 `build_banners.ts` 共用同一個函式產生。

## 顯示

- **活動頁**：頂部標題區以橫幅為背景，偏右放置、向左淡出、壓低不透明度，文字維持清楚。沒有橫幅的活動維持原樣。
- **首頁列表**：每列在色條後放一格固定大小的縮圖；沒有橫幅時這格用活動色淡色填滿，讓各列標題對齊。縮圖延遲載入。
- 圖片都是裝飾，`alt` 為空。

## 不做

- 不抓 logo、活動背景、卡面。
- 不在執行時連 Sekai-World；頁面只引用本站部署的檔案。
