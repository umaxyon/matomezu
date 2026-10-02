// 線の選択（選択モード）、矢印、サイドバーからの削除
import { expect, test } from "@playwright/test";
import { example, openDiagram } from "./helpers";

test("選択モードで線をクリックすると情報タブに線の情報が出て、矢印を付けたり消したりできる", async ({ page }) => {
  await openDiagram(page, example("nested"));
  await expect(page.locator("#mode-label")).toHaveText("選択モード");
  // e2（1-4、フロントエンドとバックエンド）の真ん中を押す
  const edge = page.locator(".mz-edge").nth(1);
  const mid = await edge.locator(".mz-hit").evaluate(l => {
    const g = l as SVGPolylineElement;
    const svg = g.ownerSVGElement!.getBoundingClientRect();
    const p = g.getPointAtLength(g.getTotalLength() / 2);
    return { x: svg.left + p.x, y: svg.top + p.y };
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

test("斜めに離れた箱どうしの線を折れ線にすると Z 字になり、直線に戻せる", async ({ page }) => {
  await openDiagram(page, example("nested"));
  // e1（9 ユーザー - 1 フロントエンド）は、上下にも左右にも重ならない
  const edge = page.locator(".mz-edge").nth(0);
  const mid = await edge.locator(".mz-hit").evaluate(l => {
    const g = l as SVGPolylineElement;
    const svg = g.ownerSVGElement!.getBoundingClientRect();
    const p = g.getPointAtLength(g.getTotalLength() / 2);
    return { x: svg.left + p.x, y: svg.top + p.y };
  });
  await page.mouse.click(mid.x, mid.y);
  const side = page.locator("#sidebar");
  const count = () => edge.locator(".mz-hit").evaluate(l => (l.getAttribute("points") ?? "").trim().split(/\s+/).length);
  await side.locator("label", { hasText: "折れ線" }).click();
  await expect.poll(count).toBe(4);
  // 線は塗らない（折れ線の点で囲まれた面が黒く塗られないように）
  expect(await edge.locator(".mz-line").evaluate(l => getComputedStyle(l).fill)).toBe("none");
  expect(await edge.locator(".mz-hit").evaluate(l => getComputedStyle(l).fill)).toBe("none");
  await side.locator("label", { hasText: "直線" }).click();
  await expect.poll(count).toBe(2);
});
