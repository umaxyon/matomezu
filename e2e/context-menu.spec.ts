// 右クリックのコンテキストメニュー（D42）: 箱と背景に、コピーと貼り付けだけのメニューを出す。箱なら選んでから出し、背景なら右クリックした所に貼る
import { expect, test } from "@playwright/test";
import { openDiagram } from "./helpers";

const head = (page: import("@playwright/test").Page, id: number | string) => page.locator(`.mz-node[data-id="${id}"] > .mz-head`);

test("右クリックのメニューで写して貼る。使えない項目は灰色で、背景なら右クリックした所、箱ならその中に貼る", async ({ page }) => {
  await openDiagram(page, { nodes: [{ id: 1, caption: "写す箱", x: 40, y: 40 }, { id: 2, caption: "入れ物", x: 400, y: 40 }], edges: [] } as never);
  const menu = page.locator(".mz-cmenu");
  const copy = menu.locator("button").nth(0), paste = menu.locator("button").nth(1);
  const world = (await page.locator("#stage .mz-world").boundingBox())!;

  // 背景: ワールドを選ぶので写せず、まだ何も写していないので貼れない。Esc で閉じる
  await page.mouse.click(world.x + 300, world.y + 400, { button: "right" });
  await expect(menu).toBeVisible();
  await expect(copy).toBeDisabled();
  await expect(paste).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);

  // 箱: その箱を選んでから出す。コピーを押すと閉じる
  await head(page, 1).click({ position: { x: 10, y: 8 }, button: "right" });
  await expect(page.locator('.mz-node[data-id="1"]')).toHaveClass(/mz-current/);
  await expect(copy).toBeEnabled();
  await copy.click();
  await expect(menu).toHaveCount(0);

  // 背景で貼ると、右クリックした所（Ctrl+V のポインタの位置と同じずらし方）
  await page.mouse.click(world.x + 320, world.y + 420, { button: "right" });
  await expect(paste).toBeEnabled();
  await page.mouse.move(world.x + 600, world.y + 100); // メニューへ動かしても、右クリックした所に貼る
  await paste.click();
  await expect(page.locator("#stage .mz-node")).toHaveCount(3);
  const pasted = page.locator("#stage .mz-node:not([data-id='1']):not([data-id='2'])");
  const b = (await pasted.boundingBox())!;
  expect(Math.abs(b.x - (world.x + 320 - 16))).toBeLessThanOrEqual(2);
  expect(Math.abs(b.y - (world.y + 420 - 12))).toBeLessThanOrEqual(2);

  // 入れ物の上で貼ると、その中に入る
  await head(page, 2).click({ position: { x: 10, y: 8 }, button: "right" });
  await paste.click();
  await expect(page.locator('.mz-node[data-id="2"] .mz-node')).toHaveCount(1);
});

test("右クリックではドラッグ・削除を始めない。手のひらモードではメニューを出さない", async ({ page }) => {
  await openDiagram(page, { nodes: [{ id: 1, caption: "箱", x: 40, y: 40 }], edges: [] } as never);
  // 削除モードで右クリックしても消えない
  await page.locator("#mode-remove").click();
  await head(page, 1).click({ position: { x: 10, y: 8 }, button: "right" });
  await expect(page.locator('.mz-node[data-id="1"]')).toHaveCount(1);
  await expect(page.locator(".mz-cmenu")).toHaveCount(0);
  await page.locator("#mode-pan").click();
  await head(page, 1).click({ position: { x: 10, y: 8 }, button: "right" });
  await expect(page.locator(".mz-cmenu")).toHaveCount(0);
});
