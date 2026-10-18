// プレビュー（見るだけのモード。残課題 D5）を実際のブラウザで確かめる。
// test/fixtures/three-levels.json の id: 2 ユーザー、3 フロントエンド
import { writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { example, openDiagram, rect, violations } from "./helpers";

let file = ""; // 開いた図のファイル（書き換えると、外の変更として読み直す）
test.beforeEach(async ({ page }) => {
  file = await openDiagram(page, example("three-levels"));
});
test.afterEach(async ({ page }) => {
  expect(await violations(page)).toEqual([]);
});

// 倍率は transform: scale でかけている（D32）
const zoomOf = (page: import("@playwright/test").Page) =>
  page.locator(".stage:visible .mz-world").evaluate(el => Number(/scale\(([\d.]+)\)/.exec((el as HTMLElement).style.transform)?.[1] ?? 1));

test("入ると全体が収まる倍率になり、サイドバーと編集のツールバーが隠れる。Esc で編集に戻る", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 500 });
  await page.click("#side-toggle"); // サイドバーを出しておく（プレビューの間は隠れ、戻ると出る）
  await page.click("#preview-toggle");
  await expect(page.locator("body")).toHaveClass(/previewing/);
  await expect(page.locator("#sidebar")).toBeHidden();
  await expect(page.locator(".toolbar")).toBeHidden();
  const z = await zoomOf(page);
  expect(z).toBeLessThan(1);
  await expect(page.locator("#zoom-level")).toHaveText(`${Math.round(z * 100)}%`);
  // 全体（ワールド）が表示領域に収まる（周りの余白の分はいつもずらせる。D32）
  const frame = (await page.locator(".stage:visible").boundingBox())!, world = (await page.locator(".stage:visible .mz-world").boundingBox())!;
  expect(world.x).toBeGreaterThanOrEqual(frame.x - 1);
  expect(world.y).toBeGreaterThanOrEqual(frame.y - 1);
  expect(world.x + world.width).toBeLessThanOrEqual(frame.x + frame.width + 1);
  expect(world.y + world.height).toBeLessThanOrEqual(frame.y + frame.height + 1);

  await page.keyboard.press("Escape");
  await expect(page.locator("body")).not.toHaveClass(/previewing/);
  await expect(page.locator("#sidebar")).toBeVisible();
  expect(await zoomOf(page)).toBe(1);
});

test("プレビュー中に図を読み直しても、箱の大きさは編集のときと同じ（倍率で割り戻して文字を測る。D32）", { tag: "@d44" }, async ({ page, browser }) => {
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
  // 同じサーバーで開いたので、こちらの画面には「届きました」が出る。開かずに閉じる
  await expect(page.locator(".mz-dlg-overlay")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator(".mz-dlg-overlay")).toHaveCount(0);

  await page.setViewportSize({ width: 700, height: 500 });
  await page.click("#preview-toggle");
  expect(await zoomOf(page)).toBeLessThan(1);
  writeFileSync(file, JSON.stringify(changed)); // 外の変更（LLM がファイルを書き換えた）として読み直す
  await expect(page.locator('.mz-node[data-id="99"]')).toContainText("少し長め");
  const after = await rect(page, 99);
  expect([after.w, after.h]).toEqual([expected.w, expected.h]);
  expect(await zoomOf(page)).toBeLessThan(1);
});
