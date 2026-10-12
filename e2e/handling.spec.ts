// 操作のしやすさ（残課題 E7〜E9）: Enter で編集ダイアログ、端へ寄せたドラッグで図を広げる、ボタンやタブの文字を選択させない
import { expect, test } from "@playwright/test";
import { example, openDiagram, rect, select } from "./helpers";

test("箱を選んで Enter を押すと、ダブルクリックと同じ編集ダイアログが開く。何も選んでいなければ開かない", async ({ page }) => {
  await openDiagram(page, example("nested"));
  await select(page, 9);
  await page.keyboard.press("Enter");
  await expect(page.locator(".mz-dlg-overlay")).toHaveCount(1);
  await expect(page.locator('.mz-dlg [name="caption"]')).toHaveValue("ユーザー");
  await page.keyboard.press("Escape");
  await expect(page.locator(".mz-dlg-overlay")).toHaveCount(0);
  // 何も選んでいなければ開かない
  await page.locator(".mz-world").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Enter");
  await expect(page.locator(".mz-dlg-overlay")).toHaveCount(0);
});

test("箱を図の下の端へ寄せたままにすると、図がスクロールして広がり、箱は見えていた範囲の外まで運べる", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 700 });
  await openDiagram(page, example("nested"));
  const stage = page.locator("#stage");
  const view = (await stage.boundingBox())!;
  const before = await rect(page, 9);
  const head = page.locator('.mz-node[data-id="9"] > .mz-head');
  const box = (await head.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, view.y + view.height - 4, { steps: 40 });
  await page.waitForTimeout(1600); // 端に止めている間も、スクロールして広がり続ける（端の近くで毎秒約 500px）
  await page.mouse.up();
  const after = await rect(page, 9);
  expect(after.y).toBeGreaterThan(before.y + view.height);
  expect(await stage.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
});

test("下へ広げたあと、つかんだまま上へ戻すと、箱はポインタと同じだけ動く（図はドラッグの間は縮まず、離したら縮む）", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 700 });
  await openDiagram(page, example("nested"));
  const stage = page.locator("#stage");
  const view = (await stage.boundingBox())!;
  const head = page.locator('.mz-node[data-id="9"] > .mz-head');
  const box = (await head.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, view.y + view.height - 4, { steps: 40 });
  await page.waitForTimeout(1200);
  // 端から離して止め（スクロールも止まる）、そこから上へ 30px ずつ 4 回動かす
  const yStop = view.y + view.height - 120;
  await page.mouse.move(x, yStop, { steps: 5 });
  const screenY = async () => (await head.boundingBox())!.y;
  const start = await screenY();
  for (let i = 1; i <= 4; i++) {
    await page.mouse.move(x, yStop - 30 * i, { steps: 3 });
    expect(Math.abs((start - await screenY()) - 30 * i)).toBeLessThan(2);
  }
  await page.mouse.up();
  // 離したら、図は中身に合わせて縮む
  const worldH = await page.locator(".mz-world").evaluate(el => (el as HTMLElement).offsetHeight);
  const bottom = await page.locator(".mz-node[data-id]").evaluateAll(els => Math.max(...els.map(e => (e as HTMLElement).offsetTop + (e as HTMLElement).offsetHeight)));
  expect(worldH).toBeLessThan(bottom + 100);
});

test("ボタンやタブの文字は、ドラッグで選択されない", async ({ page }) => {
  await openDiagram(page, example("nested"));
  // 箱の見出しの真ん中は線が通ることがあるので、左上の角を押して選ぶ
  await page.locator('.mz-node[data-id="1"] > .mz-head').click({ position: { x: 5, y: 5 } });
  const none = (sel: string) => page.locator(sel).first().evaluate(el => getComputedStyle(el).userSelect);
  expect(await none("header button")).toBe("none");
  expect(await none(".mzp-tab")).toBe("none");
  expect(await none(".mzp-seg label")).toBe("none");
});
