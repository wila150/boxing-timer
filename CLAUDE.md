# RoundBell 拳擊計時器（獨立 Web App）

企劃：`docs/企劃_拳擊計時器.md`（照企劃做、完成要更新 `## 進度`）。

- 技術：Astro 7（純靜態輸出）＋Tailwind 4（`@tailwindcss/vite`），部署 **GitHub Pages**：repo wila150/boxing-timer（公開），push 到 main → `.github/workflows/deploy.yml` 自動 build＋發佈，約 1 分鐘。網址 https://wila150.github.io/boxing-timer/
- 子路徑 `/boxing-timer`（astro.config.mjs `base`）：頁面裡的連結/圖片一律用 `import.meta.env.BASE_URL` 開頭，不可寫死 `/`；`public/manifest.webmanifest`、`public/sw.js` 用相對路徑
- 檔案：`src/layouts/Base.astro`（head／SEO meta）、`src/pages/index.astro`（快速計時器 `/`）、`src/scripts/timer.js`（Store → Engine → View）、`src/styles/global.css`
- Engine＝時間戳記狀態機，開始/繼續時 Web Audio 一次預排整段鐘聲（音效全合成沒有音檔）；資料存 localStorage `roundbell_v1`
- 本機：`npm run dev`；`npm run build && npx astro preview` 看正式版（SW 只在正式版註冊）
- 圖示 `public/img/icon.svg` → png 用 headless Chromium 轉
- 舊 Firebase 專案 `boxing-timer-d0896`、`roundbell-timer` 已在 2026-11-16 刪除（30 天內可在 GCP 救回）；不再用 Firebase
- 來源：從 `../Boxing Coach/public/timer.html`（突破重圍 /timer）複製出來，兩邊各自改
