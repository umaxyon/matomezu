// 線の選択（選択モード）、矢印、サイドバーからの削除
import { expect, test } from "@playwright/test";
import { example, openDiagram } from "./helpers";

test("選択モードで線をクリックすると情報タブに線の情報が出て、矢印を付けたり消したりできる", async ({ page }) => {
  await openDiagram(page, example("nested"));
  await expect(page.locator("#mode-label")).toHaveText("選択モード");
  // e2（1-4、フロントエンドとバックエンド）の真ん中を押す
  const edge = page.locator(".mz-edge").nth(1);
  const mid = await edge.locator(".mz-hit").evaluate(l => {
    const svg = (l as SVGLineElement).ownerSVGElement!.getBoundingClientRect();
    const n = (k: string) => Number(l.getAttribute(k));
    return { x: svg.left + (n("x1") + n("x2")) / 2, y: svg.top + (n("y1") + n("y2")) / 2 };
  });
  await page.mouse.click(mid.x, mid.y);
  await expect(edge).toHaveClass(/mz-selected/);
  const side = page.locator("#sidebar");
  await expect(side.locator(".mzp-title")).toHaveText("線");
  await expect(side.locator(".mzp-dl dd")).toHaveText(["e2", "1_フロントエンド", "4_バックエンド"]);
  await expect(side.locator(".mzp-kind")).toHaveCount(0); // 種類は出さない

  await side.locator('[data-arrow="end"]').check();
  await expect(edge.locator(".mz-arrow")).toHaveAttribute("d", /^M.+Z$/);
  await side.locator('[data-arrow="start"]').check();
  await expect.poll(() => edge.locator(".mz-arrow").getAttribute("d")).toMatch(/Z.*Z$/); // 両端に 1 つずつ
  await side.locator('[data-arrow="start"]').uncheck();
  await side.locator('[data-arrow="end"]').uncheck();
  await expect(edge.locator(".mz-arrow")).toHaveAttribute("d", "");

  await side.locator("label", { hasText: "破線" }).click();
  await expect(edge.locator(".mz-line")).toHaveClass(/mz-dashed/);
  await side.locator("label", { hasText: "実線" }).click();
  await expect(edge.locator(".mz-line")).not.toHaveClass(/mz-dashed/);

  const before = await page.locator(".mz-edge").count();
  await side.locator("[data-remove-edge]").click();
  await expect(page.locator(".mz-edge")).toHaveCount(before - 1);
  await expect(side.locator(".mzp-title")).toHaveText("ワールド");
});
