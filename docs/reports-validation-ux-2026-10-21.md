# 回報表單欄位驗證 UX 紀錄報表

日期：2026-10-21（America/New_York）

## 本輪完成
- Bug、內容檢舉共用驗證；中／英／日皆有必填星號、必填說明、明確的缺填／不足／超限訊息。
- 回報類型與分類預設已選；標題、說明、Bug 重現步驟、內容檢舉目標及隱私同意皆標示必填。
- 初次開啟不滿頁報錯；輸入、離開欄位後即時驗證，按確認時揭露所有缺漏，修改後即時解除。
- 錯誤顯示目前字數、下限／上限及需補足／刪除字數；保留深色主題，紅色框線與文字，錯誤有 alert／polite live region，輸入框有可存取標籤、提示及 aria-invalid。
- 字數依實際 Pydantic 去前後空白後的 Unicode code points 計算；emoji、組合字與特殊空白均納入測試。保留 BOM 與 U+001C–001F，符合實際驗證器。
- 移除 TextInput 原生 UTF-16 maxLength 截斷，超限可明確顯示與修改；無效表單不能進確認，提交前再次驗證。
- 保留返回修改內容、穩定重送 request_id、我的回報紀錄與重新查詢。

## 後端規則核對
| 欄位 | Bug | 內容檢舉 | 上限 |
| --- | --- | --- | --- |
| 標題 | 必填，至少5字 | 必填，至少5字 | 120 |
| 說明 | 必填，至少20字 | 必填，至少20字 | 4000 |
| 目標 | 選填 | 必填，至少3字 | 500 |
| 重現步驟 | 必填，至少10字 | 不顯示／不送出內容 | 2000 |
| 預期結果 | 選填 | 不顯示／不送出內容 | 1000 |
| 隱私同意 | 必須開啟 | 必須開啟 | — |

## 驗證
- TypeScript：PASS（exit 0），npx --no-install tsc --noEmit。
- 定向 lint：PASS（exit 0），npx --no-install eslint src/app/reports.tsx src/constants/reports-copy.ts src/utils/report-validation.ts scripts/test-report-validation.cjs。
- node scripts/test-reports.cjs：PASS，既有憑證、HTTPS、錯誤映射、穩定重試、三語測試。
- node scripts/test-report-validation.cjs：PASS，144組字數／Unicode邊界；中英日 × Bug／內容的真實畫面函式處理器測試，包含缺漏阻擋、超限修正、返回編輯、紀錄存在、無效草稿阻擋提交、有效提交及重填。
- 使用 apps/api/.venv 的實際 Pydantic 驗證所有 Unicode scalar values 空白集合及 emoji 長度：PASS。僅模型驗證，未開資料庫。
- git diff --check：PASS；既有檔案有 Git CRLF 提醒，未變更其內容。
- 測試使用輕量 React hooks／React Native host mocks，並非 Android renderer 或實機測試。Android 小螢幕、鍵盤與 TalkBack 語音播報仍待實機驗收；未執行完整專案 lint 或重新打包。

## 修改清單
- apps/mobile/src/app/reports.tsx
- apps/mobile/src/constants/reports-copy.ts
- apps/mobile/src/utils/report-validation.ts（新增）
- apps/mobile/scripts/test-report-validation.cjs（新增）
- docs/reports-validation-ux-2026-10-21.md（本報表）
- docs/reports-progress-2026-10-21.md（追加本輪交接）

## 後續會員登入銜接需求
使用者希望回報功能未來自然串接會員登入。這是已記錄的後續需求，本輪未實作會員驗證。
- 保留目前免登入封閉測試流程；會員完成登入後，回報頁保持相同填寫、確認與查詢體驗。
- 後續設計由伺服器驗證會員身分並建立案件歸屬；不能把前端傳入的會員ID當成授權依據。
- 規劃登入後跨裝置紀錄、登出行為，以及現有裝置私人憑證紀錄是否／如何經持有證明銜接會員；不可只靠案件號認領或公開他人紀錄。
- 屆時再獨立設計 API／資料模型與測試，確認會員系統現況及隱私告知；不得直接把此文件視為資料庫變更或 migration 授權。

## 保護範圍與接續
保留既有 dirty/untracked；未變更 Reports API、安全機制、資料庫，未執行 migration、初始化、commit／push，未啟動 main 背景工作。既有報表中「SQLite 尚未初始化」為歷史記錄；依本次提供的前次對話，Android POST／GET 與管理狀態更新已有成功紀錄，本輪未重新查詢實際案件或資料庫。
下一步：Android 實機驗收星號、字數、即時錯誤與 TalkBack；日後另行規劃會員銜接。
