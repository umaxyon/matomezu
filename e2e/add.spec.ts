// 画面からの箱の追加（docs/ADD-plan.md）を実際のブラウザで確かめる
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { openDiagram, rect, violations } from "./helpers";

test.beforeEach(async ({ page }) => {
  await openDiagram(page, {
    world: { width: 1000 },
    nodes: [
      { id: 1, caption: "葉", x: 40, y: 40 },
      { id: 2, caption: "一覧", childView: "list", x: 400, y: 40 },
      { id: 21, caption: "一", parent: 2 }, { id: 22, caption: "二", parent: 2 }, { id: 23, caption: "三", parent: 2 },
    ],
  });
});
test.afterEach(async ({ page }) => { expect(await violations(page)).toEqual([]); });

const box = (page: Page, id: number) => page.locator(`.mz-node[data-id="${id}"] > .mz-head`);
async function addWith(page: Page, caption: string) {
  await page.locator('.mz-dlg [name="caption"]').fill(caption);
  await page.locator(".mz-dlg [data-ok]").click();
  await expect(page.locator(".mz-dlg-overlay")).toHaveCount(0);
}
// 画面に描いた箱を、キャプションから探す（新しい箱の id を知らなくてよいように）
const captionOf = (page: Page, text: string) => page.locator(".mz-node > .mz-head", { hasText: text });

test("追加ボタンを押すとポインタに影が付き、何も無い所を押してダイアログで追加すると、その位置に置いて選択モードに戻る", async ({ page }) => {
  await page.locator("#mode-add").click();
  await expect(page.locator("#mode-label")).toHaveText("追加モード");
  const world = (await page.locator(".mz-world").boundingBox())!;
  await page.mouse.move(world.x + 300, world.y + 400);
  await expect(page.locator(".mz-add-ghost")).toBeVisible();
  await page.mouse.click(world.x + 300, world.y + 400);
  await expect(page.locator(".mz-dlg h2")).toHaveText("ボックスの追加");
  await addWith(page, "新しい箱");
  const added = captionOf(page, "新しい箱");
  await expect(added).toBeVisible();
  const r = (await added.boundingBox())!;
  expect(Math.round(r.x - world.x)).toBe(300 - 16);
  expect(Math.round(r.y - world.y)).toBe(400 - 12);
  await expect(page.locator("#mode-move")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".mz-add-ghost")).toHaveCount(0);
});

test("子の無い箱の上で追加すると、その箱の子になる", async ({ page }) => {
  await page.locator("#mode-add").click();
  await box(page, 1).click();
  await addWith(page, "子");
  await expect(page.locator('.mz-node[data-id="1"] > .mz-node > .mz-head', { hasText: "子" })).toBeVisible();
});

test("リストの上では子と子の間に線が出て、押すとそこへ差し込む", async ({ page }) => {
  await page.locator("#mode-add").click();
  const a = (await box(page, 21).boundingBox())!, b = (await box(page, 22).boundingBox())!;
  const y = (a.y + a.height + b.y) / 2; // 一 と 二 の間
  await page.mouse.move(a.x + a.width / 2, y);
  const line = page.locator(".mz-add-line");
  await expect(line).toBeVisible();
  const l = (await line.boundingBox())!;
  expect(l.y).toBeGreaterThan(a.y + a.height - 2);
  expect(l.y + l.height).toBeLessThan(b.y + 2);
  await page.mouse.click(a.x + a.width / 2, y);
  await addWith(page, "間");
  const kids = await page.locator('.mz-node[data-id="2"] > .mz-node').evaluateAll(els =>
    els.sort((p, q) => parseFloat((p as HTMLElement).style.top) - parseFloat((q as HTMLElement).style.top))
      .map(e => e.querySelector(":scope > .mz-head > .mz-text")!.textContent!.trim()));
  expect(kids).toEqual(["一", "間", "二", "三"]);
  expect((await rect(page, 21)).w).toBe((await rect(page, 22)).w);
});

test("Esc で選択モードに戻り、影が消える。ダイアログをキャンセルしても追加モードのまま", async ({ page }) => {
  await page.locator("#mode-add").click();
  const world = (await page.locator(".mz-world").boundingBox())!;
  await page.mouse.click(world.x + 300, world.y + 400);
  await page.locator(".mz-dlg [data-cancel]").click();
  await expect(page.locator("#mode-label")).toHaveText("追加モード");
  await page.mouse.move(world.x + 320, world.y + 420);
  await page.keyboard.press("Escape");
  await expect(page.locator("#mode-label")).toHaveText("選択モード");
  await expect(page.locator(".mz-add-ghost")).toHaveCount(0);
});
