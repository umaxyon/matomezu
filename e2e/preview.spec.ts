// プレビュー（見るだけのモード。残課題 D5）を実際のブラウザで確かめる。
// examples/three-levels.json の id: 2 ユーザー、3 フロントエンド
import { expect, test } from "@playwright/test";
import { example, openDiagram, rect, violations } from "./helpers";

test.beforeEach(async ({ page }) => {
  await openDiagram(page, example("three-levels"));
});
test.afterEach(async ({ page }) => {
  expect(await violations(page)).toEqual([]);
});

const zoomOf = (page: import("@playwright/test").Page) =>
  page.locator(".mz-world").evaluate(el => Number((el as HTMLElement).style.zoom || 1));

test("入ると全体が収まる倍率になり、サイドバーと編集のツールバーが隠れる。Esc で編集に戻る", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 500 });
  await page.click("#preview-toggle");
  await expect(page.locator("body")).toHaveClass(/previewing/);
  await expect(page.locator("#sidebar")).toBeHidden();
  await expect(page.locator(".toolbar")).toBeHidden();
  const z = await zoomOf(page);
  expect(z).toBeLessThan(1);
  await expect(page.locator("#zoom-level")).toHaveText(`${Math.round(z * 100)}%`);
  // 全体が表示領域に収まる（スクロールしない）
  const fits = await page.locator("#stage").evaluate(s => s.scrollWidth <= s.clientWidth + 1 && s.scrollHeight <= s.clientHeight + 1);
  expect(fits).toBe(true);

  await page.keyboard.press("Escape");
  await expect(page.locator("body")).not.toHaveClass(/previewing/);
  await expect(page.locator("#sidebar")).toBeVisible();
  expect(await zoomOf(page)).toBe(1);
});

test("押すと選べるが、ドラッグしても動かず、Undo も効かない", async ({ page }) => {
  await page.click("#preview-toggle");
  const before = await rect(page, 2);
  const head = page.locator('.mz-node[data-id="2"] > .mz-head');
  const box = (await head.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 60, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.mz-node[data-id="2"]')).toHaveClass(/mz-current/);
  expect(await rect(page, 2)).toEqual(before);
  await page.keyboard.press("Control+z");
  expect(await rect(page, 2)).toEqual(before);
});

test("＋で拡大し、全体で収まる倍率に戻る", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 500 });
  await page.click("#preview-toggle");
  const fit = await zoomOf(page);
  await page.click("#zoom-in");
  expect(await zoomOf(page)).toBeCloseTo(fit * 1.25, 5);
  await page.click("#zoom-fit");
  expect(await zoomOf(page)).toBeCloseTo(fit, 5);
});

test("プレビュー中に図を読み直しても、箱の大きさは編集のときと同じ（倍率を外して文字を測る）", async ({ page, browser }) => {
  // まだ測っていない文字にする（同じ文字は前に測った幅を使い回すので、測り方の誤りが出ない）
  const changed = example("three-levels");
  // 周りに何も無い所に、文字だけの箱を足す（幅が文字で決まる。グループは子の並びで、隣に箱があればその手前までで幅が決まるので、
  // 文字を測り誤っても大きさに出ない）
  changed.nodes.push({ id: 99, caption: "プレビュー中に足した、少し長めのキャプション", x: 40, y: 900 });
  // 比べる相手: 別のページで、普通に（倍率なしで）開いたときの大きさ
  const other = await browser.newPage({ viewport: { width: 700, height: 500 } });
  await openDiagram(other, changed);
  const expected = await rect(other, 99);
  await other.close();

  await page.setViewportSize({ width: 700, height: 500 });
  await page.click("#preview-toggle");
  expect(await zoomOf(page)).toBeLessThan(1);
  await page.setInputFiles("#file", {
    name: "e2e.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(changed)),
  });
  await expect(page.locator('.mz-node[data-id="99"]')).toContainText("少し長め");
  const after = await rect(page, 99);
  expect([after.w, after.h]).toEqual([expected.w, expected.h]);
  expect(await zoomOf(page)).toBeLessThan(1);
});
