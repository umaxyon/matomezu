// ボックスの削除と復活を実際のブラウザで確かめる（docs/DELETE-plan.md）。
// examples/three-levels.json の id: 3 フロントエンド、10 バックエンド、17 外部サービス（ツリー。子は 18 決済、19 メール配信）
import { expect, test } from "@playwright/test";
import { example, openDiagram, rect, violations } from "./helpers";

test.beforeEach(async ({ page }) => {
  await openDiagram(page, example("three-levels"));
});
test.afterEach(async ({ page }) => {
  expect(await violations(page)).toEqual([]);
});

const node = (page: import("@playwright/test").Page, id: number) => page.locator(`.mz-node[data-id="${id}"]`);

test("一覧の × で子ごと消え、消したものの行を図へドラッグすると、落とした位置に子ごと戻る", async ({ page }) => {
  await page.click('[data-tab="list"]');
  const row = page.locator('.mzp-row[data-select="17"]');
  await row.hover();
  await row.locator(".mzp-del").click();
  await expect(node(page, 17)).toHaveCount(0);
  await expect(node(page, 18)).toHaveCount(0);

  await page.locator('.mzp-removed[data-restore="17"]').dragTo(page.locator("#stage"), {
    targetPosition: { x: 60, y: 520 },
  });
  await expect(node(page, 17)).toHaveCount(1);
  await expect(node(page, 18)).toHaveCount(1);
  await expect(node(page, 19)).toHaveCount(1);
  const r = await rect(page, 17);
  // ポインタの少し左上が箱の左上になる
  expect(Math.abs(r.x - (60 - 16))).toBeLessThanOrEqual(1);
  expect(Math.abs(r.y - (520 - 12))).toBeLessThanOrEqual(1);
  await expect(page.locator(".mzp-removed")).toHaveCount(0);
});

test("グループの上に落とすと、その中へ戻る", async ({ page }) => {
  await page.click('[data-tab="list"]');
  const row = page.locator('.mzp-row[data-select="2"]'); // ユーザー
  await row.hover();
  await row.locator(".mzp-del").click();
  await page.locator('.mzp-removed[data-restore="2"]').dragTo(node(page, 10).locator(":scope > .mz-head"), {
    targetPosition: { x: 40, y: 20 },
  });
  const parent = await node(page, 2).evaluate(el => el.parentElement!.closest<HTMLElement>(".mz-node")?.dataset.id);
  expect(parent).toBe("10");
});

test("削除モードで箱を押すと消え、ほかのモードに戻せば押しても消えない", async ({ page }) => {
  await page.click("#mode-remove");
  await node(page, 3).locator(":scope > .mz-head").click({ position: { x: 20, y: 10 } });
  await expect(node(page, 3)).toHaveCount(0);
  await page.click("#mode-move");
  await node(page, 10).locator(":scope > .mz-head").click({ position: { x: 20, y: 10 } });
  await expect(node(page, 10)).toHaveCount(1);
});

test("一覧の見出しを押すと区画が折りたたまれ、箱を消して一覧が変わっても閉じたまま", async ({ page }) => {
  await page.click('[data-tab="list"]');
  const live = page.locator('[data-fold="live"]');
  await live.locator("summary").click();
  await expect(live).not.toHaveAttribute("open");
  await expect(page.locator('.mzp-row[data-select="2"]')).toBeHidden();
  await page.click("#mode-remove");
  await node(page, 2).locator(":scope > .mz-head").click({ position: { x: 20, y: 10 } });
  await expect(page.locator(".mzp-removed")).toHaveCount(1);
  await expect(live).not.toHaveAttribute("open");
  await live.locator("summary").click();
  await expect(page.locator('.mzp-row[data-select="3"]')).toBeVisible();
});

for (const mode of ["link", "remove"]) {
  test(`${mode === "link" ? "線" : "削除"}モードで一覧から戻すと、選択モードに切り替わる`, async ({ page }) => {
    await page.click('[data-tab="list"]');
    const row = page.locator('.mzp-row[data-select="2"]');
    await row.hover();
    await row.locator(".mzp-del").click();
    await page.click(`#mode-${mode}`);
    await page.locator('.mzp-removed[data-restore="2"]').dragTo(page.locator("#stage"), { targetPosition: { x: 60, y: 560 } });
    await expect(node(page, 2)).toHaveCount(1);
    await expect(page.locator("#mode-move")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(`#mode-${mode}`)).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("#mode-label")).toHaveText("選択モード");
  });
}
