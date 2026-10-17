// 右クリックのコンテキストメニュー（D42）: 箱と背景にはコピー・貼り付け・削除、線には通り方（2 段目）と削除。右クリックした箱か線を選んでから出し、背景なら右クリックした所に貼る
import { expect, test } from "@playwright/test";
import { openDiagram } from "./helpers";

const head = (page: import("@playwright/test").Page, id: number | string) => page.locator(`.mz-node[data-id="${id}"] > .mz-head`);

test("右クリックのメニューで写して貼る。使えない項目は灰色で、背景なら右クリックした所、箱ならその中に貼る", async ({ page }) => {
  await openDiagram(page, { nodes: [{ id: 1, caption: "写す箱", x: 40, y: 40 }, { id: 2, caption: "入れ物", x: 400, y: 40 }], edges: [] } as never);
  const menu = page.locator(".mz-cmenu");
  const copy = menu.locator("button").nth(0), paste = menu.locator("button").nth(1), del = menu.locator("button").nth(2);
  const world = (await page.locator("#stage .mz-world").boundingBox())!;

  // 背景: ワールドを選ぶので写せず、まだ何も写していないので貼れない。Esc で閉じる
  await page.mouse.click(world.x + 300, world.y + 400, { button: "right" });
  await expect(menu).toBeVisible();
  await expect(copy).toBeDisabled();
  await expect(paste).toBeDisabled();
  await expect(del).toBeDisabled();
  await expect(menu.locator("hr")).toHaveCount(1); // コピー・貼り付けと削除の間
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

test("箱のメニューの削除で、その箱を消す", async ({ page }) => {
  await openDiagram(page, { nodes: [{ id: 1, caption: "消す箱", x: 40, y: 40 }, { id: 2, caption: "残す箱", x: 300, y: 40 }], edges: [] } as never);
  await head(page, 1).click({ position: { x: 10, y: 8 }, button: "right" });
  const del = page.locator(".mz-cmenu button").last();
  await expect(del).toBeEnabled();
  await del.click();
  await expect(page.locator('.mz-node[data-id="1"]')).toHaveCount(0);
  await expect(page.locator('.mz-node[data-id="2"]')).toHaveCount(1);
});

test("線のメニュー: 通り方の 2 段目で折れ線と直線を選び、削除は一番下", async ({ page }) => {
  await openDiagram(page, {
    nodes: [{ id: 1, caption: "左", x: 40, y: 40 }, { id: 2, caption: "右下", x: 400, y: 300 }],
    edges: [{ id: "e1", from: 1, to: 2, route: "straight" }],
  } as never);
  const edge = page.locator('.mz-edge[data-id="e1"]');
  const mid = () => edge.locator(".mz-hit").evaluate(l => {
    const g = l as SVGPolylineElement;
    const svg = g.ownerSVGElement!.getBoundingClientRect();
    const p = g.getPointAtLength(g.getTotalLength() / 2);
    return { x: svg.left + p.x, y: svg.top + p.y };
  });
  const count = () => edge.locator(".mz-hit").evaluate(l => (l.getAttribute("points") ?? "").trim().split(/\s+/).length);
  const menus = page.locator(".mz-cmenu");
  const rightClick = async () => { const m = await mid(); await page.mouse.click(m.x, m.y, { button: "right" }); };

  await rightClick();
  await expect(edge).toHaveClass(/mz-selected/);
  const top = menus.first().locator("button");
  await expect(top).toHaveCount(2); // 通り方 > と削除
  await expect(menus.first().locator("hr")).toHaveCount(1);
  // 通り方に乗ると 2 段目が開き、今の通り方（直線）に印が付いている
  await top.first().hover();
  await expect(menus).toHaveCount(2);
  const sub = menus.nth(1).locator("button");
  await expect(sub.nth(1)).toHaveAttribute("aria-checked", "true");
  await sub.nth(0).click(); // 折れ線
  await expect(menus).toHaveCount(0);
  await expect.poll(count).toBeGreaterThan(2);
  // 直線に戻す（2 段目は押しても開く）
  await rightClick();
  await top.first().click();
  await expect(menus.nth(1).locator("button").nth(0)).toHaveAttribute("aria-checked", "true");
  await menus.nth(1).locator("button").nth(1).click();
  await expect.poll(count).toBe(2);
  // 削除は一番下
  await rightClick();
  await top.last().click();
  await expect(edge).toHaveCount(0);
});
