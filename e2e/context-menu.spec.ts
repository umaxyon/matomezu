// 右クリックのコンテキストメニュー（D42）: 一番上に設定、箱と背景には切り取り・コピー・貼り付け・削除、線には矢印・通り方（2 段目）と削除。右クリックした箱か線を選んでから出し、背景なら右クリックした所に貼る
import { expect, test } from "@playwright/test";
import { openDiagram, setMode } from "./helpers";

const head = (page: import("@playwright/test").Page, id: number | string) => page.locator(`.mz-node[data-id="${id}"] > .mz-head`);

test("右クリックのメニューで写して貼る。使えない項目は灰色で、背景なら右クリックした所、箱ならその中に貼る", async ({ page }) => {
  await openDiagram(page, { nodes: [{ id: 1, caption: "写す箱", x: 40, y: 40 }, { id: 2, caption: "入れ物", x: 400, y: 40 }], edges: [] } as never);
  const menu = page.locator(".mz-cmenu");
  const settings = menu.locator("button").nth(0), cut = menu.locator("button").nth(1), copy = menu.locator("button").nth(2), paste = menu.locator("button").nth(3), del = menu.locator("button").nth(4);
  const world = (await page.locator(".stage:visible .mz-world").boundingBox())!;

  // 背景: ワールドを選ぶので写せず、まだ何も写していないので貼れない。Esc で閉じる
  await page.mouse.click(world.x + 300, world.y + 400, { button: "right" });
  await expect(menu).toBeVisible();
  await expect(settings).toBeEnabled(); // 背景はブックの設定
  await expect(cut).toBeDisabled();
  await expect(copy).toBeDisabled();
  await expect(paste).toBeDisabled();
  await expect(del).toBeDisabled();
  await expect(menu.locator("hr")).toHaveCount(2); // 設定の下と、切り取り・コピー・貼り付けと削除の間
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
  await expect(page.locator(".stage:visible .mz-node")).toHaveCount(3);
  const pasted = page.locator(".stage:visible .mz-node:not([data-id='1']):not([data-id='2'])");
  const b = (await pasted.boundingBox())!;
  expect(Math.abs(b.x - (world.x + 320 - 16))).toBeLessThanOrEqual(2);
  expect(Math.abs(b.y - (world.y + 420 - 12))).toBeLessThanOrEqual(2);

  // 入れ物の上で貼ると、その中に入る
  await head(page, 2).click({ position: { x: 10, y: 8 }, button: "right" });
  await paste.click();
  await expect(page.locator('.mz-node[data-id="2"] .mz-node')).toHaveCount(1);
});

test("右ボタンではドラッグを始めない（押したまま動かしても箱は動かない）", async ({ page }) => {
  await openDiagram(page, { nodes: [{ id: 1, caption: "箱", x: 40, y: 40 }], edges: [] } as never);
  const before = (await head(page, 1).boundingBox())!;
  await page.mouse.move(before.x + 10, before.y + 8);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(before.x + 80, before.y + 60, { steps: 4 });
  await page.mouse.up({ button: "right" });
  await page.keyboard.press("Escape");
  const after = (await head(page, 1).boundingBox())!;
  expect([after.x, after.y]).toEqual([before.x, before.y]);
});

test("手のひらモードのメニューは設定だけ（箱なら編集ダイアログ）", async ({ page }) => {
  await openDiagram(page, { nodes: [{ id: 1, caption: "箱", x: 40, y: 40 }], edges: [] } as never);
  await setMode(page, "pan");
  await head(page, 1).click({ position: { x: 10, y: 8 }, button: "right" });
  const menu = page.locator(".mz-cmenu");
  await expect(menu.locator("button")).toHaveCount(1);
  await expect(menu.locator("button")).toContainText("設定");
  await expect(menu.locator("hr")).toHaveCount(0);
  await menu.locator("button").click();
  await expect(page.locator(".mz-dlg-overlay")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.locator(".mz-dlg-overlay")).toHaveCount(0);
});

test("図の外（タブ行・サイドバー・ミニマップ）の右クリックでは何も出さない（ブラウザのメニューも止める）。入力欄の中はブラウザのまま", async ({ page }) => {
  await openDiagram(page, { nodes: [{ id: 1, caption: "箱", x: 40, y: 40 }], edges: [] } as never);
  const prevented = await page.evaluate(() => ["#mode-tool", "#sidebar", "#minimap-toggle", "body"].map(sel => {
    const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    document.querySelector(sel)!.dispatchEvent(ev);
    return ev.defaultPrevented;
  }));
  expect(prevented).toEqual([true, true, true, true]);
  const inInput = await page.evaluate(() => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    input.dispatchEvent(ev);
    input.remove();
    return ev.defaultPrevented;
  });
  expect(inInput).toBe(false);
  await expect(page.locator(".mz-cmenu")).toHaveCount(0);
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
  await expect(top).toHaveCount(3); // 設定・通り方 >・削除
  await expect(menus.first().locator("hr")).toHaveCount(2);
  // 通り方に乗ると 2 段目が開き、今の通り方（直線）に印が付いている
  await top.nth(1).hover();
  await expect(menus).toHaveCount(2);
  const sub = menus.nth(1).locator("button");
  await expect(sub.nth(1)).toHaveAttribute("aria-checked", "true");
  await sub.nth(0).click(); // 折れ線
  await expect(menus).toHaveCount(0);
  await expect.poll(count).toBeGreaterThan(2);
  // 直線に戻す（2 段目は押しても開く）
  await rightClick();
  await top.nth(1).click();
  await expect(menus.nth(1).locator("button").nth(0)).toHaveAttribute("aria-checked", "true");
  await menus.nth(1).locator("button").nth(1).click();
  await expect.poll(count).toBe(2);
  // 削除は一番下
  await rightClick();
  await top.last().click();
  await expect(edge).toHaveCount(0);
});

test("線の端の近くか〇を右クリックすると「矢印」が設定の下に出て、2 段目でその端の形を選べる。真ん中では出ない", async ({ page }) => {
  await openDiagram(page, {
    nodes: [{ id: 1, caption: "始点の箱", x: 40, y: 40 }, { id: 2, caption: "終点の箱", x: 400, y: 300 }],
    edges: [{ id: "e1", from: 1, to: 2, route: "straight" }],
  } as never);
  const edge = page.locator('.mz-edge[data-id="e1"]');
  // 線の上の点（始点から len px。負なら終点から）
  const along = (len: number) => edge.locator(".mz-hit").evaluate((l, len) => {
    const g = l as SVGPolylineElement;
    const svg = g.ownerSVGElement!.getBoundingClientRect();
    const total = g.getTotalLength();
    const p = g.getPointAtLength(len === 0 ? total / 2 : len > 0 ? len : total + len);
    return { x: svg.left + p.x, y: svg.top + p.y };
  }, len);
  const menus = page.locator(".mz-cmenu");
  const rightClick = async (len: number) => { const m = await along(len); await page.mouse.click(m.x, m.y, { button: "right" }); };
  const headIn = async (side: "start" | "end") => {
    await page.keyboard.press("Escape");
    await page.mouse.dblclick((await along(0)).x, (await along(0)).y);
    const v = await page.locator(`.mz-dlg [name="head-${side}"]`).inputValue();
    await page.locator(".mz-dlg [data-cancel]").click();
    return v;
  };

  // 真ん中: 矢印は無い（通り方と削除）
  await rightClick(0);
  await expect(menus.first().locator("button")).toHaveCount(3);
  await page.keyboard.press("Escape");

  // 始点の近く: 矢印（始点）> の 2 段目で、塗りの三角
  await rightClick(10);
  const top = menus.first().locator("button");
  await expect(top).toHaveCount(4);
  await top.nth(1).hover();
  const sub = menus.nth(1).locator("button");
  await expect(sub).toHaveCount(11);
  await expect(sub.nth(0)).toHaveAttribute("aria-checked", "true"); // 今はなし
  await sub.nth(1).click();
  await expect(menus).toHaveCount(0);
  expect(await headIn("start")).toBe("arrow");
  expect(await headIn("end")).toBe("");

  // 選んだ線の終点の〇: 矢印（終点）で、白抜きのひし形
  await page.mouse.click((await along(0)).x, (await along(0)).y);
  const ring = (await edge.locator('.mz-end[data-end="enter"]').boundingBox())!;
  await page.mouse.click(ring.x + ring.width / 2, ring.y + ring.height / 2, { button: "right" });
  await menus.first().locator("button").nth(1).click();
  await menus.nth(1).locator("button").nth(5).click();
  expect(await headIn("end")).toBe("hollowDiamond");
  expect(await headIn("start")).toBe("arrow");
});

test("線を引く〇を右クリックすると、〇を出した箱のメニューになる（ブラウザのメニューを出さない）", async ({ page }) => {
  await openDiagram(page, { nodes: [{ id: 1, caption: "箱", x: 80, y: 80 }], edges: [] } as never);
  await page.locator('.mz-node[data-id="1"] > .mz-head').hover();
  const port = page.locator('.mz-port[data-side="r"]');
  await expect(port).toBeVisible();
  const p = (await port.boundingBox())!;
  await page.mouse.click(p.x + p.width / 2, p.y + p.height / 2, { button: "right" });
  await expect(page.locator('.mz-node[data-id="1"]')).toHaveClass(/mz-current/);
  await expect(page.locator(".mz-cmenu button")).toHaveCount(5); // 設定・切り取り・コピー・貼り付け・削除
  await expect(page.locator(".mz-cmenu button").first()).toBeEnabled();
});

test("〇に線の端が重なっていれば、〇の右クリックは線の端のメニュー（矢印）を優先する。重なっていない〇は箱のメニュー", async ({ page }) => {
  await openDiagram(page, {
    nodes: [{ id: 1, caption: "左", x: 40, y: 80 }, { id: 2, caption: "右", x: 400, y: 80 }],
    edges: [{ id: "e1", from: 1, to: 2, route: "straight" }],
  } as never);
  const rightClickPort = async (side: string) => {
    await page.keyboard.press("Escape");
    await page.mouse.click(5, 5); // 選択を外して、〇が出るようにする
    await page.locator('.mz-node[data-id="1"] > .mz-head').hover();
    const port = page.locator(`.mz-port[data-side="${side}"]`);
    await expect(port).toBeVisible();
    const p = (await port.boundingBox())!;
    await page.mouse.click(p.x + p.width / 2, p.y + p.height / 2, { button: "right" });
  };
  const top = page.locator(".mz-cmenu").first().locator("button");
  // 右の〇には線の始点が重なる: 線を選び、矢印（始点）が一番上
  await rightClickPort("r");
  await expect(page.locator('.mz-edge[data-id="e1"]')).toHaveClass(/mz-selected/);
  await expect(top).toHaveCount(4);
  await top.nth(1).hover();
  await expect(page.locator(".mz-cmenu").nth(1).locator("button")).toHaveCount(11);
  // 上の〇には線が無い: 箱のメニュー
  await rightClickPort("t");
  await expect(page.locator('.mz-node[data-id="1"]')).toHaveClass(/mz-current/);
  await expect(top).toHaveCount(5);
});
