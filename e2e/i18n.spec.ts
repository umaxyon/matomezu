// 言語の切り替え（docs/I18N-plan.md）。ブラウザの言語に合わせ、設定画面で選んだ言語があればそちらで見せる
import { expect, test } from "@playwright/test";
import { openDiagram } from "./helpers";

const data = { nodes: [{ id: 1, caption: "A" }, { id: 2, caption: "B", parent: 1 }], edges: [] };
const SHOTS = process.env.SHOTS_DIR;

test.describe("ブラウザの言語が英語", () => {
  test.use({ locale: "en-US" });

  test("英語で見せ、設定で日本語を選ぶと読み直して日本語になる。ブラウザに合わせるに戻すと英語", async ({ page }) => {
    await openDiagram(page, data);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("#mode-label")).toHaveText("Select mode");
    await expect(page.locator("#undo")).toHaveAttribute("title", "Undo (Ctrl+Z)");
    await page.locator('.mz-node[data-id="2"] > .mz-head').click();
    await expect(page.locator("#sidebar")).toContainText("Caption");
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/en-main.png` });

    await page.locator("#settings").click();
    const dlg = page.locator(".mz-dlg");
    await expect(dlg.locator("h2")).toHaveText("Settings");
    await expect(dlg.locator('[name="lang"]')).toHaveValue("auto");
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/en-settings.png` });
    await dlg.locator('[name="lang"]').selectOption("ja");
    await dlg.locator("[data-ok]").click();
    // サーバーから開いていないので、読み直す前に確かめる
    await expect(page.locator(".mz-dlg h2")).toHaveText("Change the language");
    await page.locator(".mz-dlg [data-ok]").click();
    await expect(page.locator("#mode-label")).toHaveText("選択モード");
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");

    await page.locator("#settings").click();
    await expect(page.locator(".mz-dlg h2")).toHaveText("設定");
    await expect(page.locator('.mz-dlg [name="lang"]')).toHaveValue("ja");
    await page.locator('.mz-dlg [name="lang"]').selectOption("auto");
    await page.locator(".mz-dlg [data-ok]").click();
    await page.locator(".mz-dlg [data-ok]").click(); // 確かめ
    await expect(page.locator("#mode-label")).toHaveText("Select mode");
  });

  test("言語を変えずに確定したら読み直さない", async ({ page }) => {
    await openDiagram(page, data);
    await page.locator("#settings").click();
    await page.locator(".mz-dlg [data-ok]").click();
    await expect(page.locator(".mz-dlg")).toHaveCount(0);
    await expect(page.locator("#name")).toHaveText("e2e.json"); // 読み直すと開いた図が消える
  });
});
