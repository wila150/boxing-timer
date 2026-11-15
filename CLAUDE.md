# RoundBell 拳擊計時器（獨立 Web App）

企劃：`docs/企劃_拳擊計時器.md`（照企劃做、完成要更新 `## 進度`）。

- 技術：Astro 7（純靜態輸出）＋Tailwind 4（`@tailwindcss/vite`），部署 **GitHub Pages**：repo wila150/boxing-timer（公開），push 到 main → `.github/workflows/deploy.yml` 自動 build＋發佈，約 1 分鐘。網址 https://wila150.github.io/boxing-timer/
- 子路徑 `/boxing-timer`（astro.config.mjs `base`）：頁面裡的連結/圖片一律用 `import.meta.env.BASE_URL` 開頭，不可寫死 `/`；`public/manifest.webmanifest`、`public/sw.js` 用相對路徑
- 頁面：`/`（index.astro）、`/routines/`、`/routines/[slug]/`（10 份，資料 `src/data/routines.json`）、`/builder/`（動作庫 `src/data/moves.json`）、`/sitemap.xml`、`/sw.js`（都是 build 時從 JSON 產生）
- 元件：`src/components/Timer.astro`（計時器本體，課表頁傳 routine）、`SiteHeader.astro`；`src/layouts/Base.astro`（SEO meta、canonical、JSON-LD）
- 程式：`src/scripts/timer.js`（Store → Audio 音效池／Voice／Wake／Beat(Worker) → Engine 段落狀態機 → View）、`share.js`（課表 ⇄ `?s=` base64url，含數值驗證）、`builder.js`；拳法庫與休息提醒 `src/data/combos.js`
- 課表格式：簡單型 `{prep,work,rest,rounds}` 或段落型 `{segments:[{type,dur,name,how}]}`，兩種都帶 `warn, half, theme, combo:{on,level,pace}`
- 內部連結結尾一律加 `/`（GitHub Pages 會 301）；測試腳本放 scratchpad（Playwright＋本機 libnss3），`astro preview` 同時只能開一個
- Engine：開始/繼續時把整段剩餘鐘聲一次預排（音效開頁就用 OfflineAudioContext 合成成 AudioBuffer，沒有音檔）、喊拳事件也預先排好；資料存 localStorage `roundbell_v1`（編輯器草稿 `roundbell_builder_v1`）
- 本機：`npm run dev`；`npm run build && npx astro preview` 看正式版（SW 只在正式版註冊）
- 圖示 `public/img/icon.svg` → png 用 headless Chromium 轉
- 舊 Firebase 專案 `boxing-timer-d0896`、`roundbell-timer` 已在 2026-11-16 刪除（30 天內可在 GCP 救回）；不再用 Firebase
- 來源：從 `../Boxing Coach/public/timer.html`（突破重圍 /timer）複製出來，兩邊各自改
