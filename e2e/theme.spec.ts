// テーマ（docs/THEME-plan.md 11 章）を実際のブラウザで確かめる。箱の中の余白は文字を測るときに含まれる
import { expect, test } from "@playwright/test";
import { openDiagram, rect, violations } from "./helpers";

test.afterEach(async ({ page }) => {
  expect(await violations(page)).toEqual([]);
});

test("付箋紙にすると余白の分だけ文字の箱が大きくなり、標準に戻すと元の大きさに戻る", async ({ page }) => {
  // 幅が最小（120）と最大（240）のあいだに収まる長さの文字にする（張り付くと余白の差が出ない）
  await openDiagram(page, { nodes: [{ id: 1, caption: "テーマの余白を確かめる", x: 40, y: 40 }] });
  const before = await rect(page, 1);
  // ワールドを選んで、テーマを付箋紙にする
  await page.locator(".mz-world").click({ position: { x: 600, y: 400 } });
  await page.selectOption('select[name="mzp-theme"]', "sticky");
  const sticky = await rect(page, 1);
  expect(sticky.h).toBeGreaterThan(before.h - 1); // 高さは最小の 64 のこともある
  expect(sticky.w).toBeGreaterThan(before.w);
  const pad = await page.locator('.mz-node[data-id="1"] > .mz-head').evaluate(h => getComputedStyle(h).paddingLeft);
  expect(pad).toBe("12px");
  await page.selectOption('select[name="mzp-theme"]', "default");
  expect(await rect(page, 1)).toEqual(before);
});
