// サーバーなしの動き（web/index.html を file:// で開き、「開く」のファイル選択から図を渡す）の代表 1 件（正常系だけ）。
// ほかの e2e はサーバーを通す（F29）。サーバーなしの入口は残すので、開いて描けることだけを確かめる（記憶 decision-serverless-mode。2026-10-18 ユーザー）
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";
import { example } from "./helpers";

const INDEX = pathToFileURL(resolve(import.meta.dirname, "../web/index.html")).href;

test("file:// で開き、「開く」で選んだ図を描く", async ({ page }) => {
  await page.goto(INDEX);
  const data = example("nested");
  await page.setInputFiles("#file", { name: "e2e.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(data)) });
  await expect(page.locator("#name")).toHaveText("e2e.json");
  await expect(page.locator("#stage .mz-node")).toHaveCount(data.nodes.length);
});
