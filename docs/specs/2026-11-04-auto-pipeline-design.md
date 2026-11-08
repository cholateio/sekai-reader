# 自動流水線：偵測新活動、抓素材、AI 導演分鏡、部署（設計）

日期：2026-11-04。狀態：草稿，待使用者核准。
前置規格：`2026-11-01-reader-mvp-design.md`（三層分離、閱讀器）、`2026-11-01-manga-style-design.md`（v3-manga 分鏡語彙）。

## 1. 目的

使用者對這個專案的期望是「全都不想碰」：新活動在遊戲上線後，閱讀器自己發現、自己抓素材、自己產生分鏡、自己部署，讀者重新整理就看得到。173 期剩下的 7 話是這條流水線的第一次正式執行，也是它的驗收。

現況：閱讀器完成、分鏡語彙完成、只有 173-1 一話的素材在使用者硬碟上，網站尚未部署。

## 2. 目標、非目標、反目標

目標
- 每小時一次的無人工作，涵蓋：更新活動目錄、找出未處理的活動、抓整期素材、產生分鏡、建置、部署。
- 舊活動（目前 179 期、約 1,470 話）的素材在一週內補完，之後站上每一期都可讀（AI 分鏡未到的話先用規則分鏡）。
- 舊活動的 AI 分鏡分兩個月補完（使用者決定：2026 年 11 月補一半、12 月補一半，都用 Opus 5.5）。
- 任何一步失敗，隔小時能從斷點續跑，不重抓、不重付費。

非目標
- 動畫小人（Spine）：獨立專案，只動 `CharacterArt` 介面，另開設計。
- 通知系統、後台頁面、自訂網域、讀者帳號。
- 日文搶先版：文字還是日文的活動一律不處理、不部署。

反目標（做到了也算失敗）
- 對 Sekai-World 的請求密集到像掃描器。使用者原話：「不要一分鐘瘋狂詢問」。
- 素材、對白文字進到 git 或任何公開倉庫。
- 分鏡費用失控（某天因為重試迴圈燒掉幾十美元）。

## 3. 約束

既有、不變
- 素材只存在 git 忽略的 `assets/` 與使用者自己的 Cloudflare 帳號（R2、Pages），永不進 git。
- 閱讀器執行時不連 Sekai-World；頁面不含 `sekai.best` 網址、不含檔案選擇器。
- 分鏡只含結構（編號、構圖），永不含對白文字。
- 不做全格網點、不做動畫 SVG 濾鏡。
- GitHub Actions：頂層 `permissions: contents: read`，只在需要的 job 提高；每個 `uses:` 釘 40 字 commit SHA 並附版本註解。

本設計修改的一條（使用者 2026-11-04 同意）
- 舊文：「Requests to storage.sekai.best go only through `scripts/fetch_episode.py`, one episode per run, within its 20-request budget; never write code that scans many episodes or events.」
- 新文：「Requests to storage.sekai.best go only through `scripts/fetch_episode.py`. One run fetches at most one event (its scripts, backgrounds and character images) within a 40-request budget, with at least 5 s between requests; runs are started only by the hourly pipeline (or a person, by hand), never in a loop; never write code that scans or enumerates Sekai-World.」
- 配套：`fetch_episode.py` 的文件字串、`docs/DEVELOPMENT.md`、`README.md` 同步改寫；`kit.toml [protected]` 不受影響（這條不是路徑型約束）。

新增
- 補舊活動也走同一個節奏：每小時一期、請求間隔 5 秒。使用者要求一週內補完，24 期／天、179 期約 7.5 天，平均每小時 20 個請求。
- 新活動一期只抓一次；已在 R2 的檔案不重抓（小人圖跨期共用）。
- 2026-11-07 追加（使用者同意）：每輪在佇列之後另跑「橫幅通道」，抓已完成活動的首頁橫幅，每輪至多 4 期、一期一個請求、間隔 5 秒，見 `2026-11-07-event-banner-design.md`。AGENTS.md 的限制條款已同步加上這個例外。
- 單元測試與整合測試一律離線：合成劇本當 fixture，真實資料用硬碟上既有的 173-1。只有正式的每小時工作會碰網路。
- 分鏡費用：每日花費上限（預設 US$20，repo 變數可調），超過就把剩下的留到隔天；舊活動分鏡只在使用者手動觸發時做。
- 秘密只放 GitHub repo secrets 與使用者本機 git 忽略的檔案；任何腳本、日誌、測試輸出都不得印出金鑰。

## 4. 決定事項

標「使用者」的是對話中使用者說的；標「我的選擇」的是我替他做的預設，他可以推翻。

### 4.1 執行環境：GitHub Actions（我的選擇）
網站是靜態的，沒有東西需要常駐；跟 `sekai-border` 的 Cloud Run 不同（那邊每 5 分鐘抓榜線）。一個 workflow `pipeline.yml`，`schedule` 每小時一次（避開整點，例如 `17 * * * *`），外加 `workflow_dispatch` 供手動觸發與指定參數。`concurrency` 群組只允許一個實例，後到的排隊。公開 repo 的 Actions 分鐘數不計費。

### 4.2 素材倉庫：Cloudflare R2 私人桶（使用者）
- 同一個 Cloudflare 帳號，一個私人桶（名稱如 `sekai-reader-assets`），不開公開讀取，不掛網域。
- 桶內鏡像 `assets/raw/`（來源：劇本 `.asset`、原始背景與小人圖）與 `assets/public/`（`build_episode.ts` 的輸出）。保留 raw 的理由：劇本解析器改版時能不碰 Sekai-World 重建 public。
- 工作開始時把桶同步到 runner 的 `assets/`，結束前把新增的檔案同步回桶。同步用 S3 相容 API（rclone 或 aws cli，實作者決定），不用 wrangler 逐檔上傳。
- 現況的 173-1 素材由使用者硬碟當種子，第一次手動上傳。

### 4.3 部署：素材打包進 Cloudflare Pages（使用者）
- 讀者從 Pages 拿所有東西（程式、分鏡、劇本 JSON、背景、小人圖）。Pages 流量不計量，20,000 檔上限對目前規模（約 1,500 話劇本 ＋ 幾百張背景 ＋ 幾十張小人圖）綽綽有餘。
- 從 GitHub Actions 用 `wrangler pages deploy dist` 直接上傳，不用 Cloudflare 的建置系統，不吃每月 500 次建置額度。
- Pages 專案名 `sekai-reader`，網址 `sekai-reader.pages.dev`。從第一次成功執行起就持續部署；要不要對外公布由使用者決定（我的假設：先不宣傳，等分鏡補完）。

### 4.4 活動偵測與語言判定
- 目錄來源照舊：`scripts/build_index.py` 讀 Sekai-World 在 GitHub 的繁中 master DB 差分倉庫（GitHub raw，與 storage.sekai.best 的請求規則無關）。每次工作都重建目錄。
- 「是否已有繁中文字」改為資料驅動：抓到第 1 話劇本後算假名比例，超過門檻（實作者定，預期 5% 上下）判為日文。`build_index.py` 裡寫死的 `JP_TEXT_FROM = 181` 退場，`jp` 旗標改由流水線狀態提供。
- 判定時點在最前面：一期的第一個請求就是第 1 話劇本，判為日文就立刻結束這期（只花 1 個請求），劇本不存進 R2、不建置。只有判為繁中才繼續抓其餘的話。
- 判為日文的活動記錄在狀態檔，每天最多重查一次（一個請求）。重查時劇本抓到暫存路徑再判定，判為繁中才搬進 `assets/raw/`，所以不違反「既有檔案不重抓」，也不會留下日文檔案。

### 4.5 新舊活動的分界、佇列與優先序（我的選擇）
- 分界用狀態檔而不是 id 門檻：第一次執行把目錄裡當時的全部活動種成「舊」（素材 pending、分鏡 manual），之後才出現在目錄裡的活動都是「新」。173 期也屬於「舊」，但它是驗收用例，由手動觸發指名處理並送分鏡。
- 「新」的活動素材到齊就自動送分鏡；「舊」的只在手動觸發時送。
- 補舊素材由 repo 變數 `BACKFILL`（預設 `off`）控制，173 驗收過後由使用者或我改成 `on`。
每次工作最多處理一期素材，順序：
0. 手動觸發指名的活動。
1. 新活動（目錄裡有、狀態檔裡沒有、起始日最新）。
2. 上次因請求預算用完而只抓了一部分的活動（不論 `BACKFILL`，續抓到完成；2026-11-04 審查後補上）。
3. 待重查的活動（當天還沒查過的話）：第 1 話是日文的，或鏡像站還沒有劇本（HTTP 404，2026-11-05 在 184 期遇到：主資料已公布但劇本還沒上鏡像）的。
4. 補舊：狀態為 pending 的活動，從最新往回。
沒有東西要做就只做「有沒有新分鏡結果要收、要不要重新部署」然後結束，幾秒內完成。

### 4.6 狀態檔：`data/pipeline-state.json`（我的選擇）
由工作提交回 repo，是「做過」的唯一依據。每期一筆：新／舊、素材狀態（pending／jp／done／error 與時間、連續失敗次數）、每話分鏡狀態（none／manual／batch 等待中（含 batch id）／done／fallback）、累計花費估算。日文重查時間、當日花費也在這裡。沒有對白、沒有素材路徑以外的內容。
重建後的 `data/tc-event-index.json` 也由工作一併提交，`jp` 旗標在目錄建好後用狀態檔覆寫再寫檔，本機開發與站上目錄因此一致。

### 4.7 分鏡：Claude Opus 5.5、Batch API（使用者）
- 模型固定 `claude-opus-5-5`，走 Message Batches（半價）。提示為 `prompts/storyboard_director.md`（v3-manga），輸入是 `scripts/compact_script.py` 產生的精簡劇本（提示詞只對這個格式驗證過），輸出用結構化輸出綁定分鏡 JSON schema。
- 送出與收取分開：某次工作送出一期 8 話的 batch 並記下 batch id，之後的工作輪詢；完成就逐話跑 `validateStoryboard`，過的寫進 `storyboards/{sid}.json`（`meta.model`、`promptVersion`、`generatedAt` 照現有格式），不過的重送一次，再不過就記 fallback，閱讀器照既有行為用規則分鏡。
- 2026-11-07 補充（owner：「我希望 100% 都是 AI 分鏡」）。查 GitHub 執行紀錄，171 話 fallback 中 165 話有紀錄：132 話只因 `missing caption`、17 話只因 `cast must be strings`、14 話兩者皆有、2 話輸出被截斷。根因：閱讀器把 FX8、FX18 與 FX20（進入「世界」）都算成場景字幕，提示詞卻只說「第幾個 FX8」，模型照提示詞算一定少；`cast` 沒寫明要陣列。改法：(1) `compact_script.py` 把字幕直接標成 `CAP<n>:`，編號與 `parse.ts` 一致，提示詞改成填 CAP 編號（v4-caps）；(2) 提示詞寫明 `cast` 是字串陣列，`normalizePanels` 把寫成一個字串的 `cast` 拆開；(3) 重送時把拒絕原因（驗證訊息，只有代碼與編號，不含台詞）附在劇本後，最多三次；(4) 狀態檔記 `promptVersion`，提示詞改版時所有 fallback 的話歸零重排。每話狀態多一個 `err`（最後一次拒絕原因；驗證訊息不再引用模型寫的值（欄位名、`t`、`shape`），存入前再只保留 ASCII）。流水線另加一道只在流水線執行的閘門：`cast` 的每個名字必須是這話的說話者，否則退回重送（已提交的分鏡不重判）。每個 batch 記下送出時的提示詞版本（更早沒記版本的 batch 在改版時補標成被換掉的版本）：結果照該版本標示，舊版 batch 用盡次數也不記 fallback，改歸零交給新版。
- 新活動：素材到齊後自動送分鏡。
- 舊活動：只在使用者手動觸發時做，參數為「這次最多幾期」；使用者計畫 11 月送一半、12 月送一半。每日花費上限適用於兩者。
- 每日上限的入帳時點：送出時用估算入帳（輸入用 token 計數端點算，輸出用 3,000 token 估），收取時用實際用量校正。手動觸發的期數超過當日剩餘額度時，截到額度內送出，剩下的不送並在執行摘要寫明，不整次拒絕。
- 費用估算（量過 173-1：提示 5 KB ＋ 劇本 11 KB 進、分鏡 5 KB 出）：一話約 US$0.09（batch 價），一期約 US$0.7，舊活動全部約 US$125。第一次正式執行後以實際用量更新 `PROJECT.toml [[paid]]`。

- 實測（2026-11-05，173 期 7 話）：成功批次每話約 US$0.05（輸入約 4,400 token、輸出含思考約 3,500 token）；連同兩個全數被拒絕的批次，整期合計 US$0.84。結構化輸出的文法會讓模型只吐一格就結束（實測 147 秒對 35 秒），所以請求不帶 `output_config.format`，解析前剝掉 Markdown 圍欄；空的選填陣列、寫成單一整數的 `l`／`caps`／`cut`、不在 `l` 內的 `cut` 在驗證前正規化，不為裝飾欄位整話重送。

### 4.8 秘密與設定
- GitHub secrets：`ANTHROPIC_API_KEY`、`CLOUDFLARE_API_TOKEN`（Pages 編輯權限）、`CLOUDFLARE_ACCOUNT_ID`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`。
- GitHub variables：`R2_BUCKET`、`DIRECT_DAILY_USD`（預設 20）。
- 填寫流程照使用者的全域規則：建一份 git 忽略的 `.env.pipeline` 範本，用 Windows 記事本開給使用者填，再由腳本用 `gh secret set` 逐條送上 GitHub，過程不印值，送完刪檔。

### 4.9 頁尾著作權聲明（使用者 2026-11-04 核准措辭）
「本站為非官方粉絲專案，遊戲內容著作權屬 SEGA、Colorful Palette、Crypton。」（2026-11-07 owner 要求刪去原本的「權利人如有疑慮，請透過 GitHub issue 聯絡。」）不寫「即下架」承諾，不放個人信箱。閱讀器不提供任何下載或檔案連結。

### 4.10 失敗處理與通知
- 單步失敗讓工作以非零結束，GitHub 預設寄信給 repo 擁有者；不另做通知。
- 狀態檔每次工作結束都提交（成功或失敗），失敗時只寫失敗計數與錯誤摘要，再以非零結束；進度類的欄位只在該步驟成功後才改。隔小時重來時，已在 R2 的檔案跳過，已送出的 batch 不重送。
- 對 Sekai-World 的 4xx／5xx 不重試，記錄後下一小時再試；連續三次同一期失敗就把該期標 `error` 並跳過，等人看。
- 2026-11-08 追加（owner 同意）：背景圖回 404（鏡像站沒有這張）不再讓整期失敗，改記 `bg/<id>.missing`，那幾格以素色格呈現，之後不再要這張；其他錯誤照舊。起因是 162、171 期各缺一張背景。
- 請求預算用完不是失敗：目錄裡有 9 到 15 話的活動（17 期），背景多的一期可能超過 40 個請求。預算用完時工作正常收尾（已抓的檔案同步進 R2，狀態仍是 pending），下一小時從缺的檔案接著抓，不計入失敗次數。`fetch_episode.py` 因此要從「超預算就拋錯」改成「超預算就停止並回報進度」。

## 5. 一次工作的流程

```
checkout → 安裝 → 重建目錄（GitHub raw）
→ 讀狀態檔，挑一期（4.5）
→ 若有：同步 R2 → 抓第 1 話劇本到暫存路徑 → 假名比例判定
   → 日文：記 jp、結束這期（1 個請求）
   → 繁中：fetch_episode.py 續抓整期（合計 ≤40 請求、間隔 5 s；預算用完就停）→ build_episode 逐話 → 同步回 R2
→ 收取已完成的 batch → 驗證 → 寫 storyboards/ 或記 fallback
→ 若新活動素材到齊：送分鏡 batch（受每日上限）
→ 提交狀態檔、目錄與分鏡回 main（只有這個 job 有 contents: write；失敗時也提交狀態檔再以非零結束）
→ 建置 → wrangler pages deploy
```

## 6. 第一次正式執行（173 期）

1. 使用者填好秘密、建好 Pages 專案與 R2 桶（或由腳本建）。
2. 173-1 的 `assets/raw` 與 `assets/public` 從硬碟上傳到 R2 當種子。
3. 手動觸發一次工作並指名 173：第一次執行先把目錄種成狀態檔（全部為舊），再處理 173：只有第 1 話在桶裡，工作抓剩下 7 話（約 20 個請求），建置、部署，送 7 話的分鏡 batch（第 1 話已有離線分鏡，保留，不重做）。
4. 下一小時收 batch、寫分鏡、重新部署。使用者用手機開 `sekai-reader.pages.dev` 驗收。
5. 驗收過後把 `BACKFILL` 改成 `on`：補舊素材自動進行，分鏡等使用者手動觸發。

## 7. 測試與驗證

- 單元：語言判定（繁中／日文／混合）、佇列挑選順序、狀態檔轉換、每日花費上限、分鏡 batch 結果的驗證與重送決策、`fetch_episode.py` 的 40 上限與 5 s 間隔（用假 opener 與假 sleep）。
- 整合（離線）：用合成劇本跑完整工作的本機模式（`--dry-run`：不連網、不上傳、不呼叫模型，用 fixture 代替），檢查產物與狀態檔。
- 端到端：173 期那次正式執行就是驗收，驗收項目：7 話可讀、分鏡通過驗證的話數、實際請求數 ≤ 40、實際費用。
- 現有 `check_layout.ts` 與 231 個 vitest 維持綠燈。

## 8. 成本與額度（2026-11-03 查官方頁面）

| 項目 | 免費額度 | 預期用量 |
|------|---------|---------|
| R2 儲存 | 10 GB／帳號 | 幾年後幾百 MB |
| R2 讀寫 | 100 萬寫、1,000 萬讀／月 | 每期幾百次 |
| Pages 檔案數 | 20,000／次部署 | 約 2,500 |
| Pages 建置 | 500 次／月 | 0（直接上傳） |
| GitHub Actions | 公開 repo 免費 | 每小時一次、多數幾秒結束 |
| Anthropic API | 無免費額度 | 新活動每期約 US$0.7；舊活動一次性約 US$125 |

Cloudflare 額度是整個帳號共用，這個專案對每一項的用量都接近零。

## 9. 風險

- Sekai-World 改路徑或封鎖 User-Agent：工作報錯、停在那一期；人工看。
- Pages 直接上傳每次都要完整檔案集：從 R2 同步幾百 MB，幾分鐘；若未來變慢，再考慮只在有變動時部署（已是預設）。
- Batch 最長 24 小時才完成：分鏡最晚隔天出現，可接受。
- 版權：見 4.9；repo 不含素材，素材只在使用者自己的帳號裡，隨時可自行處置。

## 10. 留給實作者

- R2 同步工具（rclone／aws cli）與 Actions 內的安裝方式；wrangler 版本釘選。
- 假名比例門檻與取樣方式。
- 狀態檔的精確 schema 與提交訊息格式；提交時的 rebase 策略（工作與使用者可能同時推 main）。
- Batch 輪詢的錯誤分類（expired／errored 視同驗證失敗，走重送一次）。
- 花費校正用的單價表放哪裡、怎麼更新。
