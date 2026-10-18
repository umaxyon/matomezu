// 実際のブラウザ（WSL の Chromium）でのテスト。bun run e2e（global-setup.ts が画面のビルドと実行ファイルを作る）。
// 図はワーカーごとの常駐サーバーを通して開く（e2e/server.ts。自分の状態のフォルダと空いたポート。画面表示用のサーバーとはぶつからない。F29。2026-10-18）。
// 文字は同梱のフォント（Noto Sans JP。D44）で描くので、ユーザーの画面と同じ幅で測る。それでも px の値ではなく関係（重ならない、折り返さない、元に戻る、
// 線が水平・垂直）を確かめる。px 単位の値は bun test（偽の測り方）のスナップショットで固定している
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  outputDir: "e2e/.results",
  // 画面のビルドと実行ファイルを一度だけ作る。図はワーカーごとのサーバーを通して開く（e2e/server.ts。F29）
  globalSetup: "./e2e/global-setup.ts",
  reporter: [["list"]],
  // 画面の文言は日本語で確かめる（ブラウザの言語で決まる。docs/I18N-plan.md）
  use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 }, locale: "ja-JP" },
});
