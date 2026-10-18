// 「追加削除」タブの一覧（検索欄、行から選んだ箱を見せる）を実際のブラウザで確かめる
import { expect, test } from "@playwright/test";
import type { Diagram } from "../web/src/types";
import { openDiagram, openSide } from "./helpers";

// 表示領域より下と右に箱がある図（行が多く、サイドバーもスクロールする）
const far = (): Diagram => ({
  world: { width: 3000 },
  nodes: [
    { id: 1, caption: "左上", x: 40, y: 40 },
    { id: 2, caption: "遠く", x: 2400, y: 1800 },
    { id: 3, caption: "隠れた親", x: 40, y: 1600, childView: "hidden" },
    { id: 4, caption: "隠れた子", parent: 3 },
    ...Array.from({ length: 40 }, (_, i) => ({ id: 10 + i, caption: `項目${i}`, x: 300 + (i % 5) * 140, y: 200 + Math.floor(i / 5) * 80 })),
  ],
});

// 箱が図の見えている範囲（スクロールバーを除く）に収まっているか
const inView = (page: import("@playwright/test").Page, id: number) => page.evaluate(id => {
  const s = document.querySelector<HTMLElement>(".stage:not([hidden])")!, r = document.querySelector(`.mz-node[data-id="${id}"]`)!.getBoundingClientRect();
  const c = s.getBoundingClientRect();
  return r.left >= c.left && r.top >= c.top && r.right <= c.left + s.clientWidth && r.bottom <= c.top + s.clientHeight;
}, id);

const scrollOf = (page: import("@playwright/test").Page) => page.evaluate(() => {
  const s = document.querySelector<HTMLElement>(".stage:not([hidden])")!;
  return [s.scrollLeft, s.scrollTop];
});
const frames = (page: import("@playwright/test").Page) => page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
// スクロールが止まるまで待ち（2 フレーム離した 2 回の読みが同じ）、その位置を返す
async function settledScroll(page: import("@playwright/test").Page): Promise<number[]> {
  let last: number[] = [];
  await expect.poll(async () => { const a = await scrollOf(page); await frames(page); last = await scrollOf(page); return String(a) === String(last); }).toBe(true);
  return last;
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 600 });
  await openDiagram(page, far());
  await openSide(page);
});

test("一覧の行を押すと、見えている範囲の外の箱へ図をスクロールする。見えていればスクロールしない", async ({ page }) => {
  expect(await inView(page, 2)).toBe(false);
  await page.locator('.mzp-row[data-select="2"]').click();
  await expect.poll(() => inView(page, 2)).toBe(true);
  // スクロールはなめらかに動くので、止まった位置を覚える
  const at = await settledScroll(page);
  // もう見えている。行の処理（選ぶ・見せる）はクリックの中で済むので、ページのクリックの知らせが届いたのを待つ
  await page.evaluate(() => { (window as never as { rowClicked: boolean }).rowClicked = false; addEventListener("click", () => { (window as never as { rowClicked: boolean }).rowClicked = true; }, { once: true }); });
  await page.locator('.mzp-row[data-select="2"]').click();
  await expect.poll(() => page.evaluate(() => (window as never as { rowClicked: boolean }).rowClicked)).toBe(true);
  await expect(page.locator('.mz-node[data-id="2"]')).toHaveClass(/mz-current/);
  // なめらかなスクロールは次のコマから動くので、2 フレーム待ってから読む
  await frames(page);
  expect(await scrollOf(page)).toEqual(at);
});

test("非表示の親の中の箱を選ぶと、親を見せる", async ({ page }) => {
  await page.locator('.mzp-row[data-select="4"]').click();
  await expect.poll(() => inView(page, 3)).toBe(true);
});

test("検索欄はサイドバーをスクロールしても上に残り、入力すると一致する行だけになる", async ({ page }) => {
  const search = page.locator("[data-search]");
  await page.locator("#sidebar").evaluate(s => { s.scrollTop = 600; });
  const [tabs, box] = await Promise.all([
    page.locator(".mzp-tabs").boundingBox(), search.locator("xpath=..").boundingBox(),
  ]);
  expect(Math.abs(box!.y - (tabs!.y + tabs!.height))).toBeLessThanOrEqual(1);
  await search.fill("項目3");
  await expect(page.locator('[data-fold="live"] .mzp-row:visible')).toHaveCount(11); // 項目3、項目30〜39
  await search.press("Escape");
  await expect(search).toHaveValue("");
  await expect(page.locator('[data-fold="live"] .mzp-row:visible')).toHaveCount(44);
});
