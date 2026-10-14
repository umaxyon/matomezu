// 線の選択（選択モード）、矢印、線の編集ダイアログからの削除
import { expect, test } from "@playwright/test";
import { example, openDiagram, confirmDialog } from "./helpers";

test("選択モードで線をクリックすると選べ、線の編集ダイアログで矢印を付けたり消したりできる", async ({ page }) => {
  await openDiagram(page, example("nested"));
  await expect(page.locator("#mode-label")).toHaveText("選択モード");
  // e2（1-4、フロントエンドとバックエンド）の真ん中を押す
  const edge = page.locator('.mz-edge[data-id="e2"]');
  const mid = await edge.locator(".mz-hit").evaluate(l => {
    const g = l as SVGPolylineElement;
    const svg = g.ownerSVGElement!.getBoundingClientRect();
    const p = g.getPointAtLength(g.getTotalLength() / 2);
    return { x: svg.left + p.x, y: svg.top + p.y };
  });
  await page.mouse.click(mid.x, mid.y);
  await expect(edge).toHaveClass(/mz-selected/);
  // 矢印・線の種類・消すは、線の編集ダイアログで（線のダブルクリックで開く。サイドバーには出さない。2026-10-13 D26）
  const dlg = page.locator(".mz-dlg-overlay > .mz-dlg");
  const edit = async (fn: () => Promise<unknown>) => {
    await page.mouse.dblclick(mid.x, mid.y);
    await fn();
    await dlg.locator("[data-ok]").click();
  };
  await edit(() => dlg.locator('[name="head-end"]').selectOption("arrow"));
  await expect(edge.locator(".mz-arrow")).toHaveAttribute("d", /^M.+Z$/);
  await edit(() => dlg.locator('[name="head-start"]').selectOption("arrow"));
  await expect.poll(() => edge.locator(".mz-arrow").getAttribute("d")).toMatch(/Z.*Z$/); // 両端に 1 つずつ
  await edit(async () => {
    await dlg.locator('[name="head-start"]').selectOption("");
    await dlg.locator('[name="head-end"]').selectOption("");
  });
  await expect(edge.locator(".mz-arrow")).toHaveAttribute("d", "");

  await edit(() => dlg.locator('[name="dash"][value="dashed"]').check());
  await expect(edge.locator(".mz-line")).toHaveClass(/mz-dashed/);
  await edit(() => dlg.locator('[name="dash"][value="solid"]').check());
  await expect(edge.locator(".mz-line")).not.toHaveClass(/mz-dashed/);

  const before = await page.locator(".mz-edge").count();
  await page.mouse.dblclick(mid.x, mid.y);
  await dlg.locator("[data-delete]").click();
  await expect(page.locator(".mz-edge")).toHaveCount(before - 1);
});

test("斜めに離れた箱どうしの線を折れ線にすると Z 字になり、直線に戻せる", async ({ page }) => {
  // e1（9 ユーザー - 1 フロントエンド）は、上下にも左右にも重ならない（位置を書いて斜めに離す）
  const data = example("nested");
  for (const n of data.nodes) {
    if (n.id === 9) Object.assign(n, { x: 40, y: 40 });
    if (n.id === 1) Object.assign(n, { x: 360, y: 130 }); // 縦の隙間を横の隙間の 1/3 より小さくする（Z 字になる。routing.ts の ELBOW_Z_RATIO）
    if (n.id === 4) Object.assign(n, { x: 360, y: 460 });
  }
  await openDiagram(page, data);
  const edge = page.locator('.mz-edge[data-id="e1"]');
  const mid = await edge.locator(".mz-hit").evaluate(l => {
    const g = l as SVGPolylineElement;
    const svg = g.ownerSVGElement!.getBoundingClientRect();
    const p = g.getPointAtLength(g.getTotalLength() / 2);
    return { x: svg.left + p.x, y: svg.top + p.y };
  });
  const count = () => edge.locator(".mz-hit").evaluate(l => (l.getAttribute("points") ?? "").trim().split(/\s+/).length);
  // 通り方は線の編集ダイアログで（線のダブルクリックで開く）
  const route = async (value: string) => {
    await page.mouse.dblclick(mid.x, mid.y);
    await page.locator(`.mz-dlg [name="route"][value="${value}"]`).check();
    await page.locator(".mz-dlg [data-ok]").click();
  };
  await route("elbow");
  await expect.poll(count).toBe(4);
  // 線は塗らない（折れ線の点で囲まれた面が黒く塗られないように）
  expect(await edge.locator(".mz-line").evaluate(l => getComputedStyle(l).fill)).toBe("none");
  expect(await edge.locator(".mz-hit").evaluate(l => getComputedStyle(l).fill)).toBe("none");
  await route("straight");
  await expect.poll(count).toBe(2);
});

test("線を選ぶと「整列」が出る。押すと両端が辺の真ん中（まっすぐ結べるならまっすぐ）に固定されて押せなくなり、「接辺の自動選択」で戻る（端が自動なら押せない）", async ({ page }) => {
  // 1 の右の辺の上の方（y = 44）に固定した線。2 は 1 の右で、上下の範囲が重なる
  await openDiagram(page, {
    nodes: [{ id: 1, caption: "A", x: 40, y: 40 }, { id: 2, caption: "B", x: 400, y: 60 }],
    edges: [{ id: "e1", from: 1, to: 2, route: "elbow", exitAt: 124 / 368 }],
  });
  const hit = page.locator(".mz-edge .mz-hit").first();
  const points = () => hit.evaluate(l => (l.getAttribute("points") ?? "").trim().split(/\s+/).length);
  expect(await points()).toBe(4); // Z 字
  const mid = await hit.evaluate(l => {
    const g = l as SVGPolylineElement;
    const svg = g.ownerSVGElement!.getBoundingClientRect();
    const p = g.getPointAtLength(g.getTotalLength() / 2);
    return { x: svg.left + p.x, y: svg.top + p.y };
  });
  // 端の位置の操作は線の編集ダイアログ（押すと印が付き、確定のときに行う。D26）
  const dlg = page.locator(".mz-dlg");
  await page.mouse.dblclick(mid.x, mid.y);
  // 見出しの「?」に乗せると説明の吹き出しが出る
  await dlg.locator(".mz-dlg-ends > span .mz-help").hover();
  await expect(page.locator(".mz-help-tip:visible")).toContainText("つまんで動かすとその位置に固定されます");
  await expect(dlg.locator('[data-once="align"]')).toBeEnabled();
  await dlg.locator('[data-once="align"]').click();
  await confirmDialog(page);
  await expect.poll(points).toBe(2); // まっすぐ
  await hit.dblclick({ force: true }); // まっすぐになった線の真ん中
  await expect(dlg.locator('[data-once="align"]')).toBeDisabled(); // 整列済み
  await expect(dlg.locator('[data-once="free"]')).toHaveText("接辺の自動選択");
  await dlg.locator('[data-once="free"]').click();
  await confirmDialog(page);
  await hit.dblclick({ force: true });
  await expect(dlg.locator('[data-once="free"]')).toBeDisabled(); // 端は自動で選んでいる
  await page.keyboard.press("Escape");
  await expect.poll(points).toBe(2); // 自由な端どうしも、横に並ぶのでまっすぐ
});

test("Z 字の中棒をドラッグで動かせ、線を選ぶと自動に戻せる", async ({ page }) => {
  await openDiagram(page, {
    nodes: [{ id: 1, caption: "A", x: 40, y: 40 }, { id: 2, caption: "B", x: 400, y: 120 }],
    edges: [{ id: "e1", from: 1, to: 2, route: "elbow" }],
  });
  const edge = page.locator('.mz-edge[data-id="e1"]');
  const midX = () => edge.locator(".mz-hit").evaluate(l => Number((l.getAttribute("points") ?? "").trim().split(/\s+/)[1]!.split(",")[0]));
  const before = await midX();
  const bar = await edge.locator(".mz-bend").evaluate(l => {
    const g = l as SVGLineElement;
    const svg = g.ownerSVGElement!.getBoundingClientRect();
    const n = (k: string) => Number(g.getAttribute(k));
    return { x: svg.left + n("x1"), y: svg.top + (n("y1") + n("y2")) / 2 };
  });
  expect(await edge.locator(".mz-bend").evaluate(l => getComputedStyle(l).cursor)).toBe("col-resize");
  await page.mouse.move(bar.x, bar.y);
  await page.mouse.down();
  await page.mouse.move(bar.x + 60, bar.y, { steps: 5 });
  await page.mouse.up();
  expect(await midX()).toBeCloseTo(before + 60, 0);

  // 線の編集ダイアログに「折れ線を自動に戻す」が出て、押して確定すると戻る
  await page.mouse.dblclick(bar.x + 60, bar.y);
  const reset = page.locator('.mz-dlg [data-once="via"]');
  await expect(reset).toBeVisible();
  await reset.click();
  await confirmDialog(page);
  await expect.poll(midX).toBeCloseTo(before, 0);
  await page.mouse.dblclick(bar.x, bar.y);
  await expect(page.locator(".mz-dlg h2")).toHaveText("線の編集");
  await expect(reset).toHaveCount(0);
  await page.keyboard.press("Escape");
});

test("斜めの直線を選ぶと両端に丸が出て、ドラッグで端を辺に沿ってずらせる。自動に戻せる", async ({ page }) => {
  await openDiagram(page, {
    world: { route: "straight" }, // 何も書かなければ折れ線（2026-10-11 から）
    nodes: [{ id: 1, caption: "A", x: 40, y: 40 }, { id: 2, caption: "B", x: 400, y: 300 }],
    edges: [{ id: "e1", from: 1, to: 2 }],
  });
  const edge = page.locator('.mz-edge[data-id="e1"]');
  const start = await edge.locator(".mz-hit").evaluate(l => {
    const g = l as SVGPolylineElement;
    const svg = g.ownerSVGElement!.getBoundingClientRect();
    const [p, q] = (g.getAttribute("points") ?? "").trim().split(/\s+/).map(s => s.split(",").map(Number));
    return { svgX: svg.left, svgY: svg.top, p: p!, q: q! };
  });
  const end = edge.locator('.mz-end[data-end="exit"]');
  await expect(end).toBeHidden(); // 選ぶまでは出ない
  await page.mouse.click(start.svgX + (start.p[0]! + start.q[0]!) / 2, start.svgY + (start.p[1]! + start.q[1]!) / 2);
  await expect(end).toBeVisible();
  // 始点の丸を、1 の下の辺の左寄り（x = 60）へ
  await page.mouse.move(start.svgX + start.p[0]!, start.svgY + start.p[1]!);
  await page.mouse.down();
  await page.mouse.move(start.svgX + 60, start.svgY + 130, { steps: 8 });
  await page.mouse.up();
  const first = () => edge.locator(".mz-hit").evaluate(l => (l.getAttribute("points") ?? "").trim().split(/\s+/)[0]!.split(",").map(Number));
  // 割合は小数 3 桁で持つので、0.2px ほどずれることがある
  await expect.poll(async () => { const [x, y] = await first(); return Math.abs(x! - 60) < 0.5 && y === 104; }).toBe(true);
  await edge.locator(".mz-hit").dblclick({ force: true });
  await page.locator('.mz-dlg [data-once="free"]').click();
  await confirmDialog(page);
  // 自動の位置（中心どうしを結んだ線が縁と交わる点）は、下の辺の x = 144 あたり
  await expect.poll(async () => Math.round((await first())[0]!)).toBe(144);
});

test("選んだ線の端をほかの箱まで運ぶと、その箱を強調し、離すとつなぎ替える。付け替えられない箱へは付け替えない（E12）", async ({ page }) => {
  await openDiagram(page, {
    nodes: [
      { id: 1, caption: "A", x: 40, y: 40 }, { id: 2, caption: "B", x: 340, y: 40 }, { id: 3, caption: "C", x: 340, y: 240 },
      { id: 4, caption: "D", x: 40, y: 240 },
    ],
    edges: [{ id: "e1", from: 1, to: 2, caption: "使う" }, { id: "e2", from: 1, to: 4 }],
  });
  const edge = page.locator('.mz-edge[data-id="e1"]');
  // 線の終点がどの箱の上にあるか（終点の座標を含む箱の id）
  const endOn = () => edge.locator(".mz-hit").evaluate(l => {
    const g = l as SVGPolylineElement, svg = g.ownerSVGElement!.getBoundingClientRect();
    const [x, y] = (g.getAttribute("points") ?? "").trim().split(/\s+/).at(-1)!.split(",").map(Number);
    const px = svg.left + x!, py = svg.top + y!;
    return [...document.querySelectorAll<HTMLElement>(".mz-node[data-id] > .mz-head")].find(h => {
      const r = h.getBoundingClientRect();
      return px >= r.left - 2 && px <= r.right + 2 && py >= r.top - 2 && py <= r.bottom + 2;
    })?.parentElement!.dataset.id;
  });
  const center = async (id: number) => {
    const b = (await page.locator(`.mz-node[data-id="${id}"] > .mz-head`).boundingBox())!;
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const dragEnd = async (to: { x: number; y: number }, check?: () => Promise<void>) => {
    const b = (await edge.locator('.mz-end[data-end="enter"]').boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 10 });
    await check?.();
    await page.mouse.up();
  };
  await edge.locator(".mz-label").click();
  await expect(edge).toHaveClass(/mz-selected/);
  // 終点（B）を C へ運ぶ: C が強調され、離すと 1 → 3 になる（キャプションはそのまま）
  await dragEnd(await center(3), async () => {
    await expect(page.locator('.mz-node[data-id="3"]')).toHaveClass(/mz-link-target/);
  });
  await expect.poll(endOn).toBe("3");
  await expect(edge.locator(".mz-label")).toHaveText("使う");
  await expect(page.locator(".mz-link-target")).toHaveCount(0);
  // D へは、1 → 4 の線がもうあるので付け替えない（強調もしない）
  await dragEnd(await center(4), async () => {
    await expect(page.locator(".mz-link-target")).toHaveCount(0);
  });
  await expect.poll(endOn).toBe("3");
  // Undo で元に戻る
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  await edge.locator(".mz-label").click();
  await expect.poll(endOn).toBe("2");
});
