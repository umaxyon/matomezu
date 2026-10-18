// 言語の切り替え（docs/I18N-plan.md）。ブラウザの言語に合わせ、設定画面で選んだ言語があればそちらで見せる
import { expect, test } from "@playwright/test";
import { openDiagram } from "./helpers";

const data = { nodes: [{ id: 1, caption: "A" }, { id: 2, caption: "B", parent: 1 }], edges: [] };
const SHOTS = process.env.SHOTS_DIR;
// 設定のダイアログ: マスターの道具箱の「設定」から開く（サーバーから開いた画面。F29）
async function openSettings(page: import("@playwright/test").Page) {
  await page.locator("#master").click();
  await page.locator('.stage:visible .mz-toolbox [data-tool="settings"]').click();
}

test.describe("ブラウザの言語が英語", () => {
  test.use({ locale: "en-US" });

  test("英語で見せ、設定で日本語を選ぶと読み直して日本語になる。ブラウザに合わせるに戻すと英語", async ({ page }) => {
    await openDiagram(page, data);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("#mode-label")).toHaveText("Select mode");
    await expect(page.locator("#undo")).toHaveAttribute("title", "Undo (Ctrl+Z)");
    await page.locator('.mz-node[data-id="2"] > .mz-head').dblclick();
    await expect(page.locator(".mz-dlg")).toContainText("Caption");
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/en-main.png` });
    await page.keyboard.press("Escape");

    await openSettings(page);
    const dlg = page.locator(".mz-dlg");
    await expect(dlg.locator("h2")).toHaveText("Settings");
    await expect(dlg.locator('[name="lang"]')).toHaveValue("auto");
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/en-settings.png` });
    await dlg.locator('[name="lang"]').selectOption("ja");
    await dlg.locator("[data-ok]").click(); // サーバーから開いた画面は、保存してあるので確かめずに読み直す
    await expect(page.locator("#mode-label")).toHaveText("選択モード");
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");

    await openSettings(page);
    await expect(page.locator(".mz-dlg h2")).toHaveText("設定");
    await expect(page.locator('.mz-dlg [name="lang"]')).toHaveValue("ja");
    await page.locator('.mz-dlg [name="lang"]').selectOption("auto");
    await page.locator(".mz-dlg [data-ok]").click();
    await expect(page.locator("#mode-label")).toHaveText("Select mode");
  });

  test("言語を変えずに確定したら読み直さない", async ({ page }) => {
    await openDiagram(page, data);
    await page.evaluate(() => { (window as unknown as { mzMark: number }).mzMark = 1; }); // 読み直すと消える印
    await openSettings(page);
    await page.locator(".mz-dlg [data-ok]").click();
    await expect(page.locator(".mz-dlg")).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { mzMark?: number }).mzMark)).toBe(1);
  });
});
