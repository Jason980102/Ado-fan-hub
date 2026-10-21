# Ado Fan Hub Bug／檢舉開發紀錄

日期：2026-10-21（America/New_York）。本檔每完成一階段更新，供下一個 ChatGPT 對話接續。

## 已核對基準
- 專案：C:\Users\tc\gitRestore\Ado-fan-hub；分支 feat/official-shop-catalog，HEAD 735b218。
- 已讀 apps/mobile/AGENTS.md、2026-10-20 報告、附加 Git 狀態輸出。
- Git dirty/untracked 與附件一致；保留既有全部變更。受限模式曾誤報不是 work tree，提升權限唯讀確認成功，不是 repo 損壞。
- Expo 57 / React Native 0.86.3 / Expo Router；Settings 只有偏好設定。Native 使用 Tabs，Web 使用 expo-router/ui 自訂 Tabs。
- FastAPI 主程式啟動會帶背景工作；測試必須只載入 reports router，不啟動 main lifespan。
- 主要資料為 PostgreSQL / SQLAlchemy / Alembic；shop 通知另有 SQLite 模式。本功能選用明確 opt-in 的獨立 SQLite，避免修改或遷移 History。

## 階段 1：架構與實作草稿
- 後端：獨立回報檔、需管理者手動 init（已存在就拒絕）、欄位／種類驗證、案件號、私人 bearer 憑證雜湊、只查自己最近50筆、重送去重、SQLite交易限流、內容大小上限、管理CLI及狀態audit。
- App：中英日表單、Bug與內容分類、重現步驟／內容定位、隱私同意、確認預覽、送出成功案件號、私人紀錄查詢、失敗重試。
- 原生憑證放 SecureStore；Web sessionStorage 僅目前分頁。沒有會員帳號或跨裝置恢復。
- 草稿暫存此工作區 reports-work/；已複製至repo並整合，請以repo為後續開發主體。不要重跑 reports-work/install-reports.ps1（已完成安裝且會拒絕既有檔案）。

## 階段 2：整合與第一輪驗證完成
- 新增 apps/api/reports_api.py、reports_body_limit.py、reports_admin.py、reports_dev.py、test_reports.py。
- 新增 apps/mobile/src/app/reports.tsx、constants/reports-copy.ts、services/reports-api.ts、services/report-identity.ts、services/report-identity.native.ts、scripts/test-reports.cjs。
- 最小修改 apps/api/main.py（掛載router、body限制、CORS POST）；保留原本History與ADO_DEMO_MODE未提交內容。
- 最小修改 Settings與兩種Tabs；保留它們原有History入口。
- 操作文件：repo docs/reports-closed-test-2026-10-21.md，內含完整PowerShell初始化／啟動／測試／管理步驟。
- 後端第一輪14項測試PASS，後續另補管理CLI與CORS兩項，最後結果待更新。
- 前端隔離測試PASS：憑證不進URL、保存失敗不送出、發行版HTTPS、狀態碼映射、同表單重試、Web session憑證、多語、畸形API回應不當成功。
- 修改檔定向lint PASS；TypeScript --noEmit PASS。
- Web export PASS，包含 /reports，共15個靜態routes。這是打包檢查，未進行瀏覽器互動／手機UI驗收。
- 全專案lint第一輪發現本輪頁面2個React Compiler錯誤與新測試__dirname宣告問題，均已修正；仍有既有history.tsx:104、169 set-state-in-effect兩個error，mv.tsx:28 unused router一個warning。未擅自更動這些檔案。
- 測試曾發現SQLite初始化連線未立即close導致Windows暫存清理失敗，已修正為contextlib.closing，重測PASS。
- 本輪實際SQLite尚未初始化，未啟動main或任何背景同步，未連PostgreSQL。

## 階段 3：本輪交付驗證完成
- 後端最終16項unittest全PASS，包括管理CLI狀態更新／audit、reports_dev CORS與413、並發去重、私人紀錄隔離、欄位限制、讀寫限流、持久化及拒絕未初始化檔案。
- 前端隔離測試PASS；最終修改檔定向ESLint PASS；TypeScript PASS。
- Web export成功（15個靜態routes含/reports）；最終Android export成功（1946 modules，Hermes bundle）。只代表編譯／打包，不代表APK、實機、推播或正式發布。
- 最終全專案lint：2 errors / 1 warning，全部在本輪未修改的既有history.tsx:104、169及mv.tsx:28；本輪檔案無lint錯誤。
- Python語法與git diff --check成功。測試套件出現既有Starlette/httpx棄用警告，不影響16項PASS；未因警告更換依賴。
- Git最終核對：保留原本所有dirty/untracked；新增回報功能及操作文件。main.py、兩種Tabs保留原有History／demo mode變更；未commit/push。

## 實際修改清單（本輪）
新增：
- apps/api/reports_api.py
- apps/api/reports_body_limit.py
- apps/api/reports_admin.py
- apps/api/reports_dev.py
- apps/api/test_reports.py
- apps/mobile/src/app/reports.tsx
- apps/mobile/src/constants/reports-copy.ts
- apps/mobile/src/services/reports-api.ts
- apps/mobile/src/services/report-identity.ts
- apps/mobile/src/services/report-identity.native.ts
- apps/mobile/scripts/test-reports.cjs
- docs/reports-closed-test-2026-10-21.md
- docs/reports-progress-2026-10-21.md（本紀錄副本）

修改：apps/api/main.py、apps/mobile/src/app/settings.tsx、apps/mobile/src/components/app-tabs.tsx、apps/mobile/src/components/app-tabs.web.tsx。

## 下一階段（尚未完成，不要誤報）
1. 使用者依docs/reports-closed-test-2026-10-21.md，在repo外建立獨立closed-test SQLite與salt（初始化尚未執行）。
2. 啟動reports_dev:app，設定EXPO_PUBLIC_REPORTS_API_URL，從Settings操作Bug／內容表單、案件號與管理者狀態更新。
3. 手機／小螢幕／鍵盤與中英日互動驗收；Web分頁憑證隔離、斷線重試、狀態刷新。
4. 如需公開服務，另處理部署層防濫用、保存刪除規則、備份、管理權限與監控。本輪只是封閉測試實作。
5. 既有History lint問題可下一輪單獨修；不可藉此操作正式History發布資料。

可直接交給下一個ChatGPT：
> 繼續Ado Fan Hub Bug／內容檢舉實機驗收。先讀repo docs/reports-progress-2026-10-21.md及docs/reports-closed-test-2026-10-21.md，再讀apps/mobile/AGENTS.md。基準735b218，既有dirty/untracked全保留。本輪回報功能已實作，後端16測試、前端隔離測試、TypeScript、定向lint、Web／Android打包PASS；完整lint只有既有History兩錯誤與MV一警告。實際回報SQLite尚未初始化，優先依操作文件隔離啟動reports_dev:app並做UI／手機驗收。不要重跑reports-work/install-reports.ps1，不啟動main背景同步、不自動migration、不碰正式History發布、不做X sync Step6.87、不commit/push。每階段更新本進度檔。

## 必須持續遵守
- 暫緩 X sync Step 6.87。不輸出金鑰，不重跑一次性腳本，不自動套 migration，不修改正式 History 發布狀態。
- 不 commit/push，不 reset/clean/stash，不覆蓋既有 dirty/untracked。
- 後續以「下一階段」清單為準；本輪功能開發與自動驗證已完成，待使用者明確初始化隔離回報檔並實機驗收。


## 階段 4：欄位驗證 UX（2026-10-21）
- 完成中英日必填星號、欄位即時錯誤、Unicode/Pydantic字數一致、確認及提交雙重閘門；保留深色樣式與我的回報紀錄。
- 新增144組邊界與三語雙表單互動測試；既有回報測試通過。TypeScript與定向lint結果見本輪報表。
- 完整紀錄：docs/reports-validation-ux-2026-10-21.md，含修改清單、規則、驗證及實機待驗收項目。
- 使用者追加需求：未來自然串接會員登入；已記錄後續會員歸屬與裝置紀錄銜接考量，本輪未更動API或資料庫。
- 上方「SQLite尚未初始化」屬早期歷史；使用者提供的後續對話已有Android POST/GET與管理狀態更新成功。本輪未存取實際回報資料庫。
- 既有dirty/untracked保留，未migration、commit或push。
