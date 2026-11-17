# Spine 動態小人

2026-11-18，owner 同意（「同意加例外，動作播一次回待機就好」）。先前已定：用 Spine 小人、不用 Live2D（2026-11-17）；全身小人放進漫畫格的樣子可以、人物盡量面向中間線（2026-11-18）。特寫格的大小等階段 3 手機實測再定。

## 目的

漫畫格裡的角色現在是一張靜態圖，每個角色只有一個表情、一套衣服。換成遊戲的 Spine 小人後，角色會動、表情跟著台詞情緒換、衣服跟著該期活動換。

## 為什麼不是 Live2D

Live2D 的每個動作、每個表情各是一個檔。`event_173_01` 一話就用到 5 個模型、69 個動作、33 個表情，約 130 次請求，而抓檔規則是一整期活動 40 次。

## 已查證的事實

2026-11-17 owner 用瀏覽器存下三個檔，放在 git 忽略的 `assets/raw/chibi-probe/`，以下是實測。

| 項目 | 結果 |
|---|---|
| 骨架檔 `v2_sd_main.skel` | Spine 4.1.23；2.3 MB（gzip 後 516 KB）；所有 v2 小人共用 |
| 每套衣服 | `sekai_atlas.atlas.txt` 8 KB ＋ `sekai_atlas.png` 121 KB（1024×512） |
| 解析度 | 位置表 `scale:0.31`，小人原生約 223×240 像素；放大會糊 |
| 動作 | 222 個，命名 `v2_{w\|m}_{個性}_{情緒}NN_f` |
| 個性 | 通用 7 種：`pure` `cute` `cool` `happy` `adult` `normal` `silent`；另有少數角色專用組 |
| 情緒 | `idle` `talk` `listen` `joy` `laugh` `sad` `angry` `surprise` `doubt` `walk` |
| 預設朝向 | 朝畫面左邊；`skeleton.scaleX = -1` 可鏡像，試做畫面無破圖 |
| 播放程式 | `@esotericsoftware/spine-webgl` 4.1.56，壓縮前 201 KB、gzip 後 60 KB |
| 服裝對照 | 台服主資料 `costume2ds.json`：劇本的 `CostumeType` → `spineAssetbundleName`（例 `v2_01ichika_school01` → `v2_sd_01ichika_school`）。v2 小人 134 套，26 個角色都至少有一套 |
| 沒有小人的情況 | 配角（例 `sub_yoshiki`）沒有小人；舊服裝名對到舊系列 `sd_*`，那是另一個骨架，Sekai Viewer 註明讀不了 |

劇本的動作名稱是 `{w|m}-{個性}NN-{動作}`（例 `w-cute11-tilthead`），性別與個性直接可用。

## 授權

- 買的是 **Spine 編輯器的授權**（Essential，官網標價 US$69），不是金鑰，也不用把任何東西放進程式或 GitHub secrets。
- 播放程式是 npm 上的公開程式碼，技術上沒有授權也能跑。授權是法律上的許可：有編輯器授權的人，才可以把播放程式整合進產品並公開給別人用。
- 本機評估與開發不需要授權。**公開上線前**必須買好，由 owner 自己買。
- 播放程式的檔頭授權聲明要保留。

## 來源

`storage.sekai.best/sekai-jp-assets/area_sd/v2_sd_main/`（小人只在日服素材）：

- 骨架：`v2_base_model/v2_sd_main.skel`
- 每套衣服：`{name}/sekai_atlas.atlas.txt`、`{name}/sekai_atlas.png`

路徑出自 sekai-viewer 原始碼 `src/utils/ChibiPlayer/load.ts`。只用 `v2_sd_` 系列；舊系列 `sd_*` 與路人 `sd_mob*` 不抓。

## 資料

- **小人目錄**：`build_index.py` 多讀主資料的 `costume2ds.json` 與 `character2ds.json`，另寫一個檔 `data/chibi-index.json`（提交進 git，但不打包進網站，所以不會觸發部署）：
  - `chibis`：可抓的小人名，排序後的清單。只收 26 個角色自己的 v2 小人（名稱符合 `v2_sd_{兩位數角色編號}{名字}_{服裝}`，目前 118 套）；聯名角色、路人、工作人員不收。
  - `costumes`：劇本的服裝名 → 小人名。
  - `default`：每個角色的預設小人（優先 `_school`，沒有就 `_casual`，再沒有就該角色排序後第一套）。
- **話數 JSON**（階段 2）：`build_episode.ts` 從劇本的 `AppearCharacters`、`LayoutData` 取每個角色當下的服裝，每句台詞多帶 `chibi`（小人名，沒有就省略）。
- 劇本裡的服裝在對照表查不到時，用該角色的預設小人；配角沒有小人，維持名字圓圈。

## 抓取（小人通道）

新活動和舊活動用同一條通道，不跟著個別活動抓：主資料出現新服裝，小人目錄就多一筆，通道自然補上。

- 每小時一輪的 fetch 階段，在橫幅通道之後另跑一次 `fetch_episode.py --chibis NAME,...`。
- 名單只取自**這一輪開始時 HEAD 上已提交的**小人目錄（`git show HEAD:data/chibi-index.json`）與流水線狀態，不用這一輪剛從主資料重建、還沒提交的版本；新出現的名字下一輪才會抓。`chibis` 裡還沒有紀錄的，照清單順序，**每輪至多 4 套**。一套兩個檔（位置表、貼圖），所以每輪至多 8 次請求；共用骨架檔另算，只抓一次。請求間隔至少 5 秒；本輪前面發過請求就先等 5 秒。118 套約 30 輪補完。
- 開關：repo 變數 `CHIBIS=on` 才啟動，預設關閉。
- `fetch_episode.py --chibis` 自己讀小人目錄與狀態檔核對，只接受目錄裡有、狀態檔沒有紀錄的名字，所以流水線呼叫前先把本輪狀態寫回檔案，並把已提交的目錄內容寫成暫存檔交給它（`--chibi-index`）。
- 子程序的結果只在完全符合格式時才採用：結束碼 0、`status` 是 `done`、請求數是 0–9 的整數、名字都在這一輪要求的名單內且不重複、狀態值合法、骨架沒抓到時不得回報任何一套。否則整輪算失敗，不記任何檔案狀態。
- 骨架檔還沒有紀錄時先抓骨架；骨架沒抓成，這一輪就不抓小人。
- 404 記為 `missing`，之後不再要。其他錯誤不記完成狀態：**當下就停，這一輪後面的小人不再要，當天也不再發任何請求**，隔天再試。失敗次數按「一套」計（位置表和貼圖合併算），同一套或骨架第三次失敗就記為 `missing`。鏡像站掛掉幾個小時，只損失一次機會。
- 整輪失敗（子程序當掉、逾時、輸出不合格式）同樣當天停止；連續三次就把 `chibiHalted` 寫進狀態檔，通道停用，要人手動移除才恢復。
- 一套只成功一半時不記狀態，隔天補另一個檔（已存在的檔不重抓）。
- 內容檢查：`.png` 檔頭要是 PNG；`.atlas.txt` 第一個非空行要是 `sekai_atlas.png`；`.skel` 開頭要含版本字串 `4.1.`。不符視為錯誤，不留檔。
- 狀態記在 `pipeline-state.json`：`chibi: { [name]: 'done' | 'missing' }`、`chibiSkel: 'done' | 'missing'`、`chibiFails`（失敗次數）、`chibiPausedDay`（當天暫停）、`chibiHalted`。骨架是 `missing` 時通道停止。
- 原檔存 `assets/raw/chibi/v2_sd_main.skel` 與 `assets/raw/chibi/{name}/`，同步到私有 R2，不進 git。
- 階段 1 只存原檔，不產生公開檔，所以不觸發部署。

AGENTS.md Constraints 已加上這條例外（owner 2026-11-18 同意）。

## 產出

- 公開檔：`assets/public/chibi/v2_sd_main.skel`、`assets/public/chibi/{name}/sekai_atlas.atlas.txt`、`assets/public/chibi/{name}/sekai_atlas.png`。
- `manifest.json` 新增 `chibis: string[]`。
- `check_publishable.ts` 的允許清單加上這三種路徑。
- 全部補完後網站多約 18 MB（2.3 MB 骨架 ＋ 118 套 × 129 KB）。

## 顯示

- 新增 `SpineChibiArt`，實作既有的 `CharacterArt` 介面；`ArtRequest` 多帶 `chibi`、`side`。
- **先顯示現在的靜態圖**，播放程式和骨架檔在首次繪製之後才載入（動態 import），載好再換成小人。位置先保留，換的時候版面不跳。
- 以下情況維持靜態圖：這個角色或這套衣服沒有小人、瀏覽器沒有 WebGL、載入失敗、使用者開了「減少動態效果」。
- **只用一個 WebGL 畫布**在背景算圖，再貼到每格自己的 2D 畫布。iOS 同時能開的 WebGL 畫布有上限，不能每格一個。
- **只有畫面上看得到的格子會動**（IntersectionObserver），每秒 30 格；離開畫面就停在最後一格。
- 黑白模式下小人也轉灰階。

### 動作選擇

- 性別、個性：取自這句台詞的動作名稱。動作是 `s-common-*` 或空的時候，用這個角色在這一話最常出現的個性。
- 情緒：沿用現有的 `moodOf(face)`，對應到小人的情緒。
- 找不到就依序退：同個性的 `talk` → 同個性的 `idle` → `normal` 的同情緒 → `v2_pose_default`。
- 進入畫面時把情緒動作播一次，之後停在同個性的 `idle` 循環，避免一直重複同一個大動作干擾閱讀（owner 2026-11-18 定案）。

### 朝向

小人預設朝畫面左邊。

- 站在格子左側的（`side` 為 `l`、特寫格、`pair` 的左半）鏡像，朝右。
- 站在右側的維持預設，朝左。
- 置中的單人維持預設；一排多人（`shout`）左半鏡像、右半不鏡像。
- 主資料 `character2ds.json` 標了 `isEnabledFlipDisplay: false` 的角色（部分虛擬歌手造型）不鏡像，遊戲自己也不翻。

### 大小

小人是三頭身全身，現在的靜態圖是半身大頭。格子裡的角色框是 92／118／168 像素寬，全身放進去人會很小，放大又會糊。先在本機把小人接進真的閱讀器，讓 owner 在手機上看過再定，預設做法：

- 一般格（92、118）：取上半身，頭的大小接近現在。
- 特寫格（168）：先試 Spine 上半身；太糊就保留現在的靜態圖。

## 階段

1. 資料與抓取：小人目錄、`fetch_episode.py --chibis`、狀態、小人通道、AGENTS.md 例外。動到抓檔規則，每輪都要整包審查。
2. 產出與關卡：`build_episode.ts`、manifest、`check_publishable.ts`。
3. 顯示：`SpineChibiArt`，先只在本機開，owner 用手機確認大小與動作。
4. owner 買好授權後上線。

## 不做

- Live2D、舊系列小人、路人小人。
- 口型同步、語音。
- 執行時連 Sekai-World；頁面只引用本站部署的檔案。

## 待 owner 決定

- 特寫格的大小，等階段 3 的手機實測再定。
