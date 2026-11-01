# SEKAI 劇情閱讀器 MVP 設計：單話漫畫閱讀器

2026-11-01。本文件是 MVP 的需求來源；與 `docs/PLAN.md`（原始計畫書）衝突之處以本文件為準。

## 目的

把《世界計畫》台服活動劇情做成手機上垂直捲動的條漫。讀者不用開遊戲，像看漫畫一樣滑過一話劇情。

試作版（173 期第 1 話，真實背景加漫畫分格）已由使用者在手機上試讀，結論是「比原型好到值得繼續做」。MVP 的工作是把試作版做成正式、可長期維護的閱讀器，**只針對 173 期第 1 話**，把閱讀體驗做完善。擴充到其他話數、每日排程、部署，都在 MVP 之後。

## 目標

1. 正式專案（Vite + TypeScript）能顯示 173-1 的漫畫模式，效果不輸試作版，而且版面、資料格式、角色圖層都是為了之後擴充而設計的。
2. 漫畫由「AI 導演分鏡」驅動：AI 決定節奏與構圖，台詞一律原文、只引用編號。
3. 每句台詞在漫畫模式剛好出現一次，由自動化測試保證。
4. 對話模式保留為備用閱讀方式。

## 非目標（MVP 不做）

- 其他話數與活動、每日排程、活動目錄瀏覽（目錄頁可以留著，但只有 173-1 能讀）。
- 部署到 Cloudflare、PWA、離線、書架、閱讀進度同步、追更提醒。
- 語音、Spine 小人、Live2D、AI 伴讀（摘要、人物卡、搜尋）。
- 呼叫 LLM API。MVP 的分鏡由開發者離線產生並提交進 repo。

## 反目標（做出來也算失敗）

- **大量存取 Sekai-World。** MVP 只允許抓 173-1 需要的檔案：1 個劇本、2 張背景、4 張小人圖。不得寫任何會逐話、逐期掃描 storage.sekai.best 的程式。master DB 走 GitHub raw，不在此限。
- **素材進 git。** 劇本、背景、小人圖一律放在 git 忽略的資料夾。可以進 repo 的只有程式碼、分鏡 JSON（只含編號，不含台詞）、活動目錄、角色表。
- **閱讀器在執行時連 Sekai-World。** 閱讀器只讀自己空間裡的檔案。原型的「從瀏覽器選取下載好的劇本檔」功能與指向 storage.sekai.best 的外部連結一併移除；頁面上不留任何 Sekai-World 的網址。
- **把 Spine 執行程式整合進專案。** 授權需要 Spine Editor 許可證，上線前再買、再接。

## 已決定的事

### 資料來源與抓取

- 劇本：`https://storage.sekai.best/sekai-tc-assets/event_story/event_unsteady_2025/scenario/event_173_01.asset`（JSON）。
- 背景：`https://storage.sekai.best/sekai-jp-assets/scenario/background/{bg}/{bg}.webp`，173-1 用到 `bg_a002201`（中庭）與 `bg_f001201`（經紀公司）。原圖 2048 px 寬。
- 靜態小人：`https://storage.sekai.best/sekai-jp-assets/bonds_honor/character/chr_sd_{unitId:02}_01.webp`，160 × 136，每角色一張。`unitId` 是 `gameCharacterUnits` 的 id；主要 20 位角色與其 `gameCharacters` id 相同。173-1 需要 01 一歌、02 咲希、03 穗波、04 志步。
- 這些伺服器只擋帶外站 Referer 的請求（2026-10-31 實測）。抓取時不送 Referer，User-Agent 寫上專案名稱與 repo 網址，每個請求間隔至少 1 秒，已存在的檔案不重抓。
- 抓取工具是一支一次性腳本（`scripts/fetch_episode.py`），參數是話數 id，只抓那一話需要的檔案到 `assets/`（git 忽略）。腳本內建硬上限：單次執行最多 20 個請求。腳本的測試用假的 HTTP 層，不實際連線。
- 173-1 需要的 7 個檔案已在開發機暫存區（`scratchpad/assets173/`），第一次建置直接複製進 `assets/raw/`，不重新抓。只有檔案遺失時才允許用腳本重抓，重抓的請求計入下方驗收第 7 點的額度。

### 專案形態

- Vite + TypeScript，純前端、無框架、無後端。原型的 `h()` DOM 輔助函式沿用。
- 靜態站：建置輸出是純檔案，之後可以直接放 Cloudflare Pages。
- 開發時 Vite 伺服器以靜態方式提供 `assets/` 與 `data/`。
- 測試：Vitest，jsdom 環境。至少覆蓋劇本解析、分鏡驗證、「每句台詞剛好出現一次」的整頁渲染檢查。
- 測試資料：repo 內放一份**自創台詞的合成劇本**（結構與 `.asset` 相同，內容是原創文字，不是遊戲劇本）與對應分鏡，所有測試在乾淨 clone 與 CI 上都靠它通過。另有一組「真實資料」測試，只在 `assets/raw/event_173_01.asset` 存在時執行，否則標記為跳過（不是失敗）。
- 字體沿用原型：霞鶩文楷 TC（標題、字幕、旁白）、Noto Sans TC（台詞），從 Google Fonts 載入。
- 原始碼授權 MIT。README 必須寫明劇本、圖片等遊戲素材的權利屬於 SEGA / Colorful Palette，不在 MIT 範圍內，且資料來自 Sekai-World。
- README 的截圖與主視覺在 MVP 階段不放（含遊戲背景或小人的截圖視同素材，先不進 git）；上線前再決定用什麼圖。

### 三層分離：劇本、分鏡、畫面

這是整個設計的核心。三者各自獨立產生與快取，改其中一層不必重做其他兩層。

**1. 劇本（episode JSON）**：由 `.asset` 轉成閱讀用格式，建置時產生，放在 `assets/episodes/{sid}.json`。

- `sid`：話數 id，以檔案的 `m_Name` 為準，不信任檔內的 `ScenarioId`（173-1 的檔內寫 172-1）。
- `firstBg`：開場背景 id。
- `lines[]`：依演出順序的台詞。每句保留 `r`（在原始 `TalkData` 的索引，分鏡用它引用）、`who`（說話者顯示名，空字串是旁白）、`body`（原文）、`face`（表情名）、`motion`（動作名，之後 Spine 姿勢對應用）、`bg`（這句當下的背景 id）、`flash`（是否在回憶段落）、`shake`（是否有震動特效）。
- `scenes[]`：場景字幕，依出現順序。每個有 `text`、`time`（傍晚／夜晚／無）、`bg`、`sekai`（是否進入「世界」）。分鏡用序號引用。
- 名字帶「的訊息」後綴代表手機訊息；「眾人」是群體台詞。這兩個規則由解析層處理，渲染層只看旗標。

**2. 分鏡（storyboard JSON）**：`storyboards/{sid}.json`，進 git。只含編號與構圖指令，不含任何台詞文字。

- `meta`：`director`（`ai` 或 `auto`）、`promptVersion`、`model`、`generatedAt`。
- `panels[]`，每格：
  - `t`：格子類型，沿用計畫書的 13 種（est、talk、close、pop、beat、insert、sfx、trans、impact、split、reveal、shout、mono）。
  - `l`：台詞 `r` 陣列；`caps`：場景字幕序號；`cut`、`fx`、`tone`、`big`、`cast`、`sfx`、`wide`：同計畫書。
  - `cam`：`{ "focus": [x, y], "zoom": z, "blur": px }`，x、y 為 0 到 1，是背景裁切中心；`zoom` 1 表示鋪滿不放大；`blur` 選填。
  - `edge`：這格底邊的斜切方向，`-1`（左低右高）、`0`（水平）、`1`（左高右低）。下一格的頂邊自動與它平行，溝槽才會等寬。
  - `bg`：選填，覆寫這格背景 id；預設取 `l` 第一句的 `bg`，或 `caps` 對應場景的 `bg`。
- 驗證規則（程式執行）：`l` 的聯集剛好等於全部台詞的 `r`、無重複、遞增；`caps` 的聯集剛好等於全部場景序號；`impact` 全話最多一格；`cam` 數值在範圍內。驗證失敗的分鏡不得使用，退回規則分鏡（`auto`）。
- 173-1 的分鏡以交接包的 36 格版本為基礎，由開發者（Claude）離線補上 `cam` 與 `edge` 後提交。提示詞放 `prompts/storyboard_director.md`，一併更新成含 `cam`、`edge` 的版本，供之後批次產生時使用。

**3. 畫面**：渲染層把分鏡與劇本組成 DOM。背景、角色、對白框三個子層各自可替換。

### 漫畫版面

延續試作版第二版，使用者已看過並接受：

- **白紙底**。漫畫模式整頁改用紙色背景；對話模式維持原本的淺色／深色主題。
- **滿版**。手機寬度下格子貼齊螢幕左右邊緣，沒有側邊留白；寬度超過 672 px 時置中、最寬 640 px。頁面不得出現橫向捲動。
- **斜切分格**。相鄰格子之間的溝槽依 `edge` 斜切，溝槽等寬、墨線 2.5 px。`est` 是無框滿版圖。`beat` 佔三分之二寬、左右交錯。`split` 兩格並排。
- **背景層**。背景以 cover 鋪滿格子，依 `cam.focus` 與 `cam.zoom` 取景；`close`、`mono`、`insert` 等格子加模糊讓前景跳出；`reveal` 把背景調淡；`impact` 不放背景，維持全黑集中線。格子底部有淡淡的暗角漸層，讓小人與對白框穩定。
- **對白框**。白底黑字、圓角、尾巴指向說話者那一側；思考框點線；被打斷的台詞右側虛線；`shout` 星形爆炸框；`insert` 傾斜剪貼。深色模式下對白框也維持白底。
- **說話者位置**。同一場景內，每個角色第一次出現時依序分配左、右；換場重置。
- **背景縮圖**。建置時把背景縮成手機用尺寸（長邊 1280 px，WebP），閱讀器只載入縮圖。建置工具是 Node 端的 sharp 或等效工具，由建置者決定。

### 角色圖層

- 定義 `CharacterArt` 介面：輸入角色名、情緒、尺寸（一般／中／大），輸出一個 DOM 元素。渲染層只透過這個介面取得角色畫面，不知道背後是圖片還是 Spine。
- MVP 實作 `StaticChibiArt`：主要 26 位角色用靜態小人圖（`assets/sd/chr_sd_{id}_01.webp`）。情緒參數在這個實作裡忽略。
- 上線前會換成 Spine 預先渲染的姿勢圖（`SpineSpriteArt`），同一介面；屆時情緒與 `motion` 才派上用場。設計上要讓替換只動一個檔案。
- **沒有圖的角色**（真堂等配角、「眾人」）：顯示代表色圓圈，**名字寫在圓圈內**，依名字長度縮小字級；配角代表色用固定的灰藍色。
- **不顯示名字下標。** 主角與配角都不在小人或圓圈下方標名字。
- 漫畫模式不顯示表情文字標籤（「微笑」「驚訝」）。這些資訊之後由小人姿勢表達。對話模式維持原型的表情標籤與開關。

### AI 導演

- 分工：AI 只輸出結構（格子類型、台詞編號、場景序號、取景、斜切、音效字），台詞由劇本層提供，角色畫面由規則推得。
- 提示詞輸入是精簡劇本（沿用 `scripts/compact_script.py` 的格式，加上背景 id 行），輸出是上面的分鏡 JSON。輸出中不得含台詞文字，驗證層會拒絕含有中文字串欄位（`sfx`、`cast` 除外）的分鏡。
- MVP 不呼叫 API；分鏡由開發者離線產生。接 API 時只需加一個產生器，不改閱讀器。

### 檔案配置

```
src/
  scenario/     parse.ts（.asset → episode JSON）、types.ts
  storyboard/   types.ts、validate.ts、auto.ts（規則分鏡）
  render/       comic/（panels.ts、layout.ts、background.ts、bubbles.ts）、chat.ts、dom.ts（h 輔助）
  art/          CharacterArt.ts（介面）、StaticChibiArt.ts、fallbackCircle.ts
  app/          router.ts、storage.ts、views/（library、event、reader）
  main.ts
data/           tc-event-index.json（活動目錄與角色表，進 git）
storyboards/    event_173_01.json（進 git）
prompts/        storyboard_director.md
scripts/        fetch_episode.py、build_episode.ts（.asset → episode JSON 與背景縮圖）
assets/         git 忽略：raw/（.asset、原圖）、episodes/、bg/、sd/
tests/
docs/specs/     本文件
```

交接包（`docs/sekai-reader-handoff/`）在移植完成後刪除，原型 HTML 不再維護。活動目錄與角色表沿用交接包的 `data/tc-event-index.json`。

## 驗收

1. `npm run dev` 開啟後，直接進入 173-1 的漫畫模式；手機寬度（390 px）下無橫向捲動，格子貼齊左右邊緣。
2. 36 格分鏡全部有正確背景與取景，兩個場景（中庭、經紀公司）的背景在「幾小時後」切換。
3. 一歌、咲希、穗波、志步顯示靜態小人；真堂顯示名字在內的色塊圓圈；任何地方都沒有名字下標。
4. `npm test` 通過。乾淨 clone 上以合成劇本通過「每句台詞各出現一次」的檢查；在有 `assets/raw/event_173_01.asset` 的開發機上，另外通過「49 句各出現一次」的真實資料檢查。
5. 切換到對話模式仍可正常閱讀。
6. `git status` 乾淨時，repo 內沒有任何 `.asset`、背景圖、小人圖。
7. 從本文件核准起算，整個 MVP 開發過程對 storage.sekai.best 的請求數不超過 20。試作階段的下載不計入；正常情況下應為 0，因為 7 個檔案由暫存區複製。

## 留給建置者決定

- 模組內部的函式切分、狀態管理方式、CSS 的組織方式（單檔或分檔）。
- 背景縮圖的工具選擇與縮圖尺寸的微調。
- 測試框架細節與測試案例的拆法，只要涵蓋驗收第 4 點。
- `edge` 斜切的實作方式（clip-path 或其他），只要溝槽等寬且不產生橫向溢出。
- 活動目錄頁與話數列表頁要保留多少原型功能。MVP 只要求 173-1 可讀；其他話數顯示「尚未提供」即可。原型的檔案選取器、localStorage 存劇本、`needsReload` 流程都不保留。
- 深色模式下漫畫模式是否也用紙色，或改用深色紙。

## 參考

- `docs/PLAN.md`：原始計畫書，含資料欄位說明、格子類型表、小人姿勢對應的初步構想。
- `docs/sekai-reader-handoff/`：原型原始碼、分鏡範例、提示詞草稿、腳本。
- 試作版第二版：開發機暫存區 `scratchpad/spike/sekai-comic-spike.html` 與 `build_spike.py`，已實作背景取景、斜切分格、靜態小人，可直接參考實作細節。
