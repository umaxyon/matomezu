// 実際のブラウザ（WSL の Chromium ＋ Noto Sans CJK JP）でのテスト。bun run e2e で、画面をビルドしてから動かす。
// 画面は file:// で開き、図は「開く」のファイル選択から渡す（サーバーは立てない）。
// フォントはユーザーの Windows の画面と違うので、px の値ではなく関係（重ならない、折り返さない、元に戻る、
// 線が水平・垂直）を確かめる。px 単位の値は bun test（偽の測り方）のスナップショットで固定している
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  outputDir: "e2e/.results",
  reporter: [["list"]],
  use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
});
