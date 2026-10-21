# Bug 回報與內容／違規檢舉：封閉測試操作

日期：2026-10-21（America/New_York）；開發基準 feat/official-shop-catalog / 735b218。

## 功能與資料界線

Settings → 回報與檢舉。支援中／英／日，Bug分類與重現步驟、內容定位與檢舉原因、隱私同意、確認預覽、送出案件號、重新查詢最近50件。案件號不是查詢密碼；只查持有同一裝置憑證的案件。原生憑證使用 SecureStore，Web 使用 sessionStorage（關閉分頁／清除資料可能失去查詢權限）。不提供跨裝置恢復、附件、電子郵件或登入。

後端使用獨立 SQLite，並非 PostgreSQL 的新 migration。不載入 History tables，不變更任何發布狀態。API 預設關閉；需 ADO_REPORTS_ENABLED=1、絕對路徑 ADO_REPORTS_DB、至少32字元的 ADO_REPORTS_IP_SALT，且必須由管理者明確執行 init。不存在／未初始化就503，API不自動建表。

API：POST /api/reports；GET /api/reports。兩者都需 Authorization: Bearer + 裝置隨機256-bit憑證。只存憑證SHA-256；不存原始IP，使用HMAC處理IP。不公開全站列表或管理端點。回應不包含完整描述／重現步驟。target僅存文字、不抓取連結，無自動下架或自動裁決。

限流以SQLite交易持久化：每個整點小時每憑證5筆、每來源IP30筆、全服務500筆；查詢每來源IP120次。可能在整點邊界連續使用兩個時段額度。429帶Retry-After。request_id搭配憑證唯一，同內容重送回同案；改內容重用ID為409。32KiB請求上限涵蓋chunked。成功回應Cache-Control: no-store。

## PowerShell：隔離啟動（兩個視窗）

下面會由你在本機明確建立獨立回報檔，不操作PostgreSQL。執行前確認路徑不是既有正式資料檔。不要重跑先前交接中的一次性腳本。

視窗一：只啟動回報服務，不載入main的背景工作。

```powershell
Set-Location -LiteralPath 'C:\Users\tc\gitRestore\Ado-fan-hub\apps\api'
$reportsDir = Join-Path $env:LOCALAPPDATA 'AdoFanHub\closed-test'
New-Item -ItemType Directory -Path $reportsDir -Force | Out-Null
$env:ADO_REPORTS_DB = Join-Path $reportsDir 'reports.sqlite3'
$reportsSaltPath = Join-Path $reportsDir 'reports-ip-salt.txt'
if (-not (Test-Path -LiteralPath $reportsSaltPath)) {
  ([guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')) |
    Set-Content -LiteralPath $reportsSaltPath -Encoding ASCII -NoNewline
}
$env:ADO_REPORTS_IP_SALT = [IO.File]::ReadAllText($reportsSaltPath).Trim()
$env:ADO_REPORTS_ENABLED = '1'
```

僅第一次、確定這是新回報檔時手動執行以下初始化。若已存在，會拒絕覆寫；已有檔案時跳過此行。

```powershell
.\.venv\Scripts\python.exe -m reports_admin init
```

然後啟動（8000若已使用，換一個空閒port並同步改視窗二）：

```powershell
.\.venv\Scripts\python.exe -m uvicorn reports_dev:app --host 127.0.0.1 --port 8000 --no-proxy-headers
```

視窗二：既有完整API可保持原設定，另指定回報API。

```powershell
Set-Location -LiteralPath 'C:\Users\tc\gitRestore\Ado-fan-hub\apps\mobile'
$env:EXPO_PUBLIC_REPORTS_API_URL = 'http://127.0.0.1:8000'
npm.cmd run start -- --web --port 8081
```

僅在localhost Web測試。手機上的127.0.0.1是手機本身；手機測試須另設定可達的受控LAN或HTTPS位址及精準CORS／防火牆，勿直接廣泛開放服務。發行版前端要求HTTPS。本機Web服務使用localhost或127.0.0.1:8081；reports_dev僅允許這兩個origin。

完整API已於main.py掛載同一router與請求大小限制，CORS新增POST。若日後使用main:app，會沿用其既有背景工作設定；本輪沒有啟動它。回報專用入口可先獨立驗收。

## 驗收步驟

1. 完成App既有初始偏好設定後，進Settings → 回報與檢舉。
2. Bug填標題、20字以上描述、10字以上步驟；未同意時不可進入確認。檢查預覽後提交，記下AFH案件號。
3. 點重新查詢；確認標題、案件號、狀態與更新時間。重整同一分頁後仍可查；新的獨立瀏覽器工作階段不能查到別人的紀錄。
4. 改選內容檢舉，填頁面名／內容ID／連結與原因；確認不會自動下架、不需要登入。
5. 中／英／日各檢查一次；長文字、鍵盤、捲動、小螢幕與返回設定仍需實機驗收。
6. 停止回報API後試送出，應保留確認頁內容並顯示錯誤。連線逾時可能已建案，可先查紀錄或原內容重試，勿立即修改後另送。

管理者在第三個PowerShell視窗設定同一ADO_REPORTS_DB（不必輸出salt）：

```powershell
Set-Location -LiteralPath 'C:\Users\tc\gitRestore\Ado-fan-hub\apps\api'
$env:ADO_REPORTS_DB = Join-Path $env:LOCALAPPDATA 'AdoFanHub\closed-test\reports.sqlite3'
.\.venv\Scripts\python.exe -m reports_admin list
# 用實際案件號替換下方字串
.\.venv\Scripts\python.exe -m reports_admin status 'AFH-實際案件號' reviewing
```

App重新查詢應顯示處理中。可選received / reviewing / resolved / closed，每次變更寫入audit。`reports_admin show '案件號'`僅供本機管理者查看原文，可能含使用者誤填的私人資料，勿貼到聊天或公開日誌。SQLite及salt需置於受保護的本機目錄，勿加入Git或公開靜態站。

## 自動測試

```powershell
Set-Location -LiteralPath 'C:\Users\tc\gitRestore\Ado-fan-hub\apps\api'
.\.venv\Scripts\python.exe -m unittest test_reports -v
Set-Location -LiteralPath 'C:\Users\tc\gitRestore\Ado-fan-hub\apps\mobile'
node scripts/test-reports.cjs
.\node_modules\.bin\tsc.cmd --noEmit
npm.cmd run lint
```

後端測試只建立TemporaryDirectory中的SQLite，不讀正式DATABASE_URL，不匯入main，不執行遷移／同步。前端測試使用模擬傳輸與儲存，不連線網路。

## 已知限制與下一步

這是封閉測試功能。IP限流無法可靠區分共用網路測試者；不接受X-Forwarded-For，啟動時加--no-proxy-headers。將來有可信反向代理時需另設可信代理策略；不得為繞過配額信任任意轉發標頭。公開服務前還需部署層連線限制、備份／保存期限與刪除流程、管理者身分權限、容量監控及必要的CAPTCHA。管理CLI目前沒有登入，使用作業系統檔案權限限制管理權。

完整回報正文保留於本機SQLite，不自動清除；測試結束後管理者需依約定處理保存／刪除。鹽檔跨重啟重用以維持IP額度。遺失裝置憑證無法用案件號恢復。只查最新50筆，未做分頁與公開案件追蹤頁。未新增第三方套件。

本輪不初始化實際回報檔、不自動套migration、不操作正式History發布狀態、不處理X sync Step 6.87、不commit/push。實際測試結果見同工作區「Ado-Fan-Hub_Bug檢舉_接續紀錄_2026-10-21.md」。
