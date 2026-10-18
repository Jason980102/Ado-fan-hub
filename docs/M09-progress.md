# M09 現況盤點與實作方案

盤點日期：2026-10-18。以本機程式及 YouTube Data API 唯讀查詢為依據。

## M09-A
既有 MV 頁直接使用 /api/analytics/youtube；後端只收 Original、歌いました兩張清單，單張清單 maxResults=50 且最多讀 20 頁，影片資訊亦分 50 支批次讀取。不是只取第一頁。YOUTUBE_MV_IDS 在 _fetch 中被播放清單結果取代，不能用它補充影片。Analytics 對非 Ado 頻道影片會整體拒絕，不能直接混入外部合作作品。

實查官方擁有清單：Original 57、歌いました 74、LIVE 27、Remix 10、出張 27；合併195個 Video ID，videos.list 找到187個，8個 unavailable。數量會隨官方更新變化，不能當固定產品資料。「出張」包含節目及教學，整張映射 Collaboration 不可靠。其他官方清單包含別人演唱、Ado 製作等，不代表 Ado 本人演唱，不自動收錄。

官方 videos.localizations 已有多語 title（原始回應187支均有至少一個語言），可作搜尋別名；不自動生成中文／Romaji，某首歌沒有對應官方別名時不保證能搜尋該寫法。

## M09-B/C/D 方案
- 新增 /api/mv/catalog、獨立快取與 TypeScript 型別；不改 analytics.py、快照、增長及排行榜定義。
- 原有 Original/Cover 清單照收，新增已核對的 LIVE、Remix、出張；每次核對清單擁有者。Original/Cover/Live 以清單為證據，Remix 歸其他並保留來源名稱。
- 出張：已人工核對 metadata 的合作影片才標 collaboration；其餘未確認類型保留 unclassified；已識別的非音樂節目／教學以明確 ID 排除，不用標題關鍵字自動推斷。
- 同 Video ID 合併分類和來源；不同版本 ID 分別保留。外部頻道保留發行頻道資訊，只接受來自核對官方清單的成員。
- metadata 不足、非公開、未處理完成的影片不顯示為可觀看項目，回傳 unavailable ID。某來源失敗時明確標 partial，其他來源繼續；全部失敗回傳503。
- 官方多語 title 作 aliases，保留原標題，前端做 NFKC／大小寫／空白／變音符號／平假名片假名正規化及部分比對，不做不可靠的 AI 翻譯或羅馬化。
- 搜尋、分類、排序共用同一查詢流程；卡片補發布日期、發行頻道與觀看入口。分批顯示，避免一次掛載數百張卡片。
- 三語分類與空狀態，失敗重試與縮圖備援；不改首頁、Shop、Wishlist、導航。

## 限制與驗收
實際計數、檢查結果、修改檔案與實機步驟待完成後補充。新路由需要重新啟動／部署後端；新 API 與舊 Analytics endpoint 並存。不要 commit/push。

來源：
- https://developers.google.com/youtube/v3/docs/playlists/list
- https://developers.google.com/youtube/v3/docs/playlistItems/list
- https://developers.google.com/youtube/v3/docs/videos/list
- https://www.youtube.com/playlist?list=PLaxauk3chSWj6Lg0HZtQ8mhTeGRyopOl5
- https://www.youtube.com/playlist?list=PLaxauk3chSWizBh8KxPj83Ue03qy0A_Xv
- https://www.youtube.com/playlist?list=PLaxauk3chSWjVFK0vMo9TGiOzyYZOXt9j

## M09 實作與驗證紀錄（2026-10-18）

實際收錄：原有可用影片130支，新目錄185支（增加55支）；8支無法取得／不可用，另排除2支已確認的非音樂節目。分類標籤可重疊，目前 Original 57、Cover 74、Live 21、Collaboration 3、Other 10、Unclassified 21。LIVE清單27筆不代表27支可公開取得。185支均具有至少一個官方localized title，184支有公開likeCount，1支按讚數為null。以上為實查當下數量，不寫死於產品。

使用者中途追加按讚數：已在獨立CatalogVideo模型與TypeScript驗證增加like_count:number|null，卡片顯示按讚人數、發布日期、發行頻道、觀看數與觀看入口。缺少likeCount顯示無資料，不補0。這不改Analytics模型或排行榜。

變更檔案：
- apps/api/main.py：只追加mv_catalog路由，保留已存在的Shop等路由修改。
- apps/api/mv_catalog.py：新目錄API、官方來源所有權驗證、完整分頁、批次影片資訊、獨立快取及partial狀態。
- apps/api/test_mv_catalog.py：5項離線回歸測試。
- apps/mobile/src/app/mv.tsx：改用新目錄、partial／缺漏提示及重試；保留原頁面框架與開啟YouTube方式。
- apps/mobile/src/components/mv-catalog.tsx：擴充分類、搜尋、日期／按讚／頻道資訊、每批24筆。
- apps/mobile/src/services/mv-api.ts：獨立TypeScript資料型別與嚴格回應驗證。
- apps/mobile/src/services/mv-search.ts：別名索引、ID去重／分類合併、正規化與穩定排序。
- apps/mobile/src/localization/mv-copy.ts：繁中／英／日文。
- apps/mobile/scripts/test-mv-catalog.cjs：搜尋與驗證回歸檢查。
- docs/M09-progress.md：本紀錄。

目前檢查：
- npx tsc --noEmit：通過。
- 5個MV相關TypeScript檔案ESLint：通過。
- Python unittest test_mv_catalog：5項全數通過。
- node scripts/test-mv-catalog.cjs：通過（別名／全半形／大小寫／假名／去重分類／穩定排序／null觀看數／空結果／輸入不變／回應驗證及按讚null與0區分）。
- 真實YouTube API fetch_catalog：185支、partial=false；Analytics video_snapshots筆數查詢前後一致。
- git diff --check：通過；其他既有檔案只有LF/CRLF提示。
- Web打包：進行中，後續補充。

開發中曾修正：初版UI替換留下舊排序片段造成TS語法錯誤，已移除後重跑通過；live檢查起初用了系統Python缺少FastAPI，已改專案.venv通過。第一次來源盤點終端不支援emoji輸出，但JSON已寫出，後續改UTF-8正常取得詳細資料。

## Android／Web 驗收
1. 先以原API設定重新啟動後端，使 /api/mv/catalog 新路由生效；舊後端未更新會404。不要只更新APP。
2. 啟動Expo 57相容的現有開發環境，進入MV分頁，確認可載入新目錄。
3. 搜尋 Usseewa、ＵＳＳＥＥＷＡ、うっせぇわ，應能找到官方有對應別名的作品；切換Live或Cover並配合三種排序。
4. 確認合作標籤只在已核對ID，出張其餘未確認影片保留未分類；同影片在全部只顯示一次。
5. 卡片確認縮圖16:9、長日文標題換行、發布日期依設定時區、觀看數、按讚數與發行頻道，點擊可開啟該Video ID。
6. 下滑按顯示更多，確認每次增加24筆；修改分類／查詢／排序後回到首批。Web測窄／中／寬視窗。
7. 測試離線重試、來源partial、無結果、縮圖失敗；按讚null應為無資料，0應為0。
8. 回首頁、Analytics、新聞、Shop、Wishlist及其他分頁驗證原功能保留；新增Live等不進原有Analytics統計。

限制：
- 未進行Android實機操作；瀏覽器視覺驗收待後續記錄。
- 非所有作品都有中文或Romaji官方別名，不能保證任意譯名皆能搜到。
- 出張尚有21支未分類；不是把全清單猜成Collaboration。後續可逐筆依發布方證據擴充VERIFIED_CATEGORIES。
- 其他未核對的官方清單不自動導入；本階段不宣稱收錄所有Ado作品。
- YouTube區域／年齡／權利限制仍可能使某些公開影片無法在特定裝置播放；以YouTube實際播放狀態為準。
- 未修改首頁排行榜／Analytics來源或歷史快照，也未commit／push。既有未提交修改保留。

### 最終補充驗證
- Web export 成功（expo export --platform web --max-workers 1），13個靜態路由包含 /mv 均完成；本機輸出在對話工作區 m09-web-build，未發布。
- 第一次Web打包因較高資源使用停止，改單工作程序後成功；不是產品編譯錯誤。
- 185筆真實Catalog回應均通過前端isMvCatalog驗證，含nullable按讚數。
- FastAPI TestClient HTTP路由與第二次請求快取測試通過，未查詢YouTube或寫DB；測試環境有既有Starlette/httpx棄用提示，不影響結果。
- 最終限制：已驗證Web可編譯，尚未做瀏覽器視覺操作或Android實機驗收。無commit、push、reset、clean。

## GitHub 推送授權（2026-10-18）
使用者在驗證完成後明確要求『先push』，已授權本次提交與推送。此次包含M09與先前完成的首頁訂閱框、共用hook及MV所需的RoseScrollView選項；Shop等其他修改仍保留未提交。
