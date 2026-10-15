// 画面の操作（D32）: 図の周りの余白、手のひら（モードと Space）、編集中の拡大縮小
import { expect, test } from "@playwright/test";
import { example, openDiagram, rect, violations } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 600 }); // 図がはみ出してスクロールできる大きさ
  await openDiagram(page, example("three-levels"));
});
test.afterEach(async ({ page }) => {
  expect(await violations(page)).toEqual([]);
});

const stage = (page: import("@playwright/test").Page) => page.locator("#stage");
const scrollOf = (page: import("@playwright/test").Page) => stage(page).evaluate(s => [s.scrollLeft, s.scrollTop]);
const head = (page: import("@playwright/test").Page, id: number) => page.locator(`.mz-node[data-id="${id}"] > .mz-head`);

test("開いたとき、道具箱は図の周りの余白の上にあり、箱に重ならない", async ({ page }) => {
  const box = await page.locator(".mz-toolbox").boundingBox();
  const world = await page.locator("#stage .mz-world").boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(world!.x); // ワールドは道具箱の右から始まる
});

test("手のひらのモードでは、箱をドラッグしても箱は動かず、見る範囲が動く。選びもしない", async ({ page }) => {
  await page.click("#mode-pan");
  await expect(page.locator("#mode-pan")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#mode-label")).toHaveText("手のひらモード");
  const before = await rect(page, 3);
  const b = (await head(page, 3).boundingBox())!;
  await page.mouse.move(b.x + 10, b.y + 10);
  await page.mouse.down();
  await page.mouse.move(b.x - 90, b.y - 60, { steps: 5 });
  await page.mouse.up();
  expect(await rect(page, 3)).toEqual(before);
  const [sl, st] = await scrollOf(page);
  expect(sl).toBeGreaterThan(0);
  expect(st).toBeGreaterThan(0);
  await expect(page.locator(".mz-node.mz-current")).toHaveCount(0);
});

test("Space を押している間は手のひらになり、離すと前のモードに戻る", async ({ page }) => {
  await page.locator("#stage").click({ position: { x: 5, y: 5 } }); // 図に焦点を移す（ボタンの上の Space はボタンを押すので）
  await page.keyboard.down(" ");
  await expect(page.locator("#mode-label")).toHaveText("手のひらモード");
  const before = await rect(page, 3);
  const b = (await head(page, 3).boundingBox())!;
  await page.mouse.move(b.x + 10, b.y + 10);
  await page.mouse.down();
  await page.mouse.move(b.x - 60, b.y - 40, { steps: 5 });
  await page.mouse.up();
  expect(await rect(page, 3)).toEqual(before);
  expect((await scrollOf(page))[0]).toBeGreaterThan(0);
  await page.keyboard.up(" ");
  await expect(page.locator("#mode-move")).toHaveAttribute("aria-pressed", "true");
});
