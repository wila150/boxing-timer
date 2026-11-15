# RoundBell 拳擊計時器（獨立 Web App）

企劃：`docs/企劃_拳擊計時器.md`（照企劃做、完成要更新 `## 進度`）。

- 純靜態 PWA，無 build：`public/index.html` 單檔（CSS/JS 內嵌），`public/manifest.webmanifest`、`public/sw.js`（先網路後快取，離線可開）、圖示 `public/img/icon.svg` → png（用 headless Chromium 轉）
- 程式分三塊：Store（localStorage `roundbell_v1`：課表、設定、紀錄）→ Engine（時間戳記狀態機，開始/繼續時用 Web Audio 一次預排整段鐘聲，音效全合成沒有音檔）→ View（只讀狀態畫畫面）
- 本機預覽：`cd public && python3 -m http.server 8080`
- 部署：`firebase deploy --only hosting`（`.firebaserc` 預設 `boxing-timer-d0896`，網址 https://boxing-timer-d0896.web.app；使用者自己建的專案）。舊的 `roundbell-timer` 是我先建的，已不用
- 來源：從 `../Boxing Coach/public/timer.html`（突破重圍 /timer）複製出來，兩邊之後各自改
