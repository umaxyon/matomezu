// サーバーなしの動き（web/index.html を file:// で開き、「開く」のファイル選択から図を渡す）の代表 1 件（正常系だけ）。
// ほかの e2e はサーバーを通す（F29）。サーバーなしの入口は残すので、開いて描けることと、直して保存（ダウンロード）したファイルが
// CLI の validate を通ることだけを確かめる（記憶 decision-serverless-mode。2026-10-18 ユーザー）
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";
import { example, setCaption } from "./helpers";

const INDEX = pathToFileURL(resolve(import.meta.dirname, "../web/index.html")).href;

test("file:// で開き、「開く」で選んだ図を描く。キャプションを直して保存（ダウンロード）したファイルは validate を通る", async ({ page }) => {
  await page.goto(INDEX);
  const data = example("nested");
  await page.setInputFiles("#file", { name: "e2e.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(data)) });
  await expect(page.locator("#name")).toHaveText("e2e.json");
  await expect(page.locator("#stage .mz-node")).toHaveCount(data.nodes.length);

  // 1 回直して、保存（サーバーなしではダウンロード。main.ts の save）
  await setCaption(page, 9, "利用者（直した）");
  const downloaded = page.waitForEvent("download");
  await page.locator("#save").click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe("e2e.json");
  const dir = mkdtempSync(join(tmpdir(), "matomezu-e2e-saved-"));
  try {
    const path = join(dir, "saved.json");
    await file.saveAs(path);
    const saved = JSON.parse(readFileSync(path, "utf8")) as { nodes: { id: number; caption?: string }[] };
    expect(saved.nodes.find(n => n.id === 9)?.caption).toBe("利用者（直した）");
    // LLM が読むのと同じ CLI で確かめる（サーバーは要らない）
    const out = execFileSync(process.env.MATOMEZU_E2E_BIN!, ["validate", path], { env: { ...process.env, MATOMEZU_HOME: dir }, encoding: "utf8", timeout: 20_000 });
    expect(out.trim()).toBe("ok");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
