// 線の選択（選択モード）、矢印、サイドバーからの削除
import { expect, test } from "@playwright/test";
import { example, openDiagram } from "./helpers";

test("選択モードで線をクリックすると情報タブに線の情報が出て、矢印を付けたり消したりできる", async ({ page }) => {
  await openDiagram(page, example("nested"));
  await expect(page.locator("#mode-label")).toHaveText("選択モード");
  // e2（1-4、フロントエンドとバックエンド）の真ん中を押す
  const edge = page.locator(".mz-edge").nth(1);
  const mid = await edge.locator(".mz-hit").evaluate(l => {
    const g = l as SVGPolylineElement;
    const svg = g.ownerSVGElement!.getBoundingClientRect();
    const p = g.getPointAtLength(g.getTotalLength() / 2);
    return { x: svg.left + p.x, y: svg.top + p.y };
  });
  await page.mouse.click(mid.x, mid.y);
  await expect(edge).toHaveClass(/mz-selected/);
  const side = page.locator("#sidebar");
  await expect(side.locator(".mzp-title")).toHaveText("線");
  await expect(side.locator(".mzp-dl dd")).toHaveText(["e2", "1_フロントエンド", "4_バックエンド"]);
  await expect(side.locator(".mzp-kind")).toHaveCount(0); // 種類は出さない

  await side.locator('[data-arrow="end"]').check();
  await expect(edge.locator(".mz-arrow")).toHaveAttribute("d", /^M.+Z$/);
  await side.locator('[data-arrow="start"]').check();
  await expect.poll(() => edge.locator(".mz-arrow").getAttribute("d")).toMatch(/Z.*Z$/); // 両端に 1 つずつ
  await side.locator('[data-arrow="start"]').uncheck();
  await side.locator('[data-arrow="end"]').uncheck();
  await expect(edge.locator(".mz-arrow")).toHaveAttribute("d", "");

  await side.locator("label", { hasText: "破線" }).click();
  await expect(edge.locator(".mz-line")).toHaveClass(/mz-dashed/);
  await side.locator("label", { hasText: "実線" }).click();
  await expect(edge.locator(".mz-line")).not.toHaveClass(/mz-dashed/);

  const before = await page.locator(".mz-edge").count();
  await side.locator("[data-remove-edge]").click();
  await expect(page.locator(".mz-edge")).toHaveCount(before - 1);
  await expect(side.locator(".mzp-title")).toHaveText("ワールド");
});

test("斜めに離れた箱どうしの線を折れ線にすると Z 字になり、直線に戻せる", async ({ page }) => {
  await openDiagram(page, example("nested"));
  // e1（9 ユーザー - 1 フロントエンド）は、上下にも左右にも重ならない
  const edge = page.locator(".mz-edge").nth(0);
  const mid = await edge.locator(".mz-hit").evaluate(l => {
    const g = l as SVGPolylineElement;
    const svg = g.ownerSVGElement!.getBoundingClientRect();
    const p = g.getPointAtLength(g.getTotalLength() / 2);
    return { x: svg.left + p.x, y: svg.top + p.y };
  });
  await page.mouse.click(mid.x, mid.y);
  const side = page.locator("#sidebar");
  const count = () => edge.locator(".mz-hit").evaluate(l => (l.getAttribute("points") ?? "").trim().split(/\s+/).length);
  await side.locator("label", { hasText: "折れ線" }).click();
  await expect.poll(count).toBe(4);
  // 線は塗らない（折れ線の点で囲まれた面が黒く塗られないように）
  expect(await edge.locator(".mz-line").evaluate(l => getComputedStyle(l).fill)).toBe("none");
  expect(await edge.locator(".mz-hit").evaluate(l => getComputedStyle(l).fill)).toBe("none");
  // 向きの指定は折れ線のときだけ出る。始点・終点とも上下にすると、縦・横・縦の Z 字（点は 4 つのまま）
  const pick = (name: string, value: string) => side.locator(`label:has(input[name="${name}"][value="${value}"])`).click();
  await pick("mzp-exit", "vertical");
  await pick("mzp-enter", "vertical");
  await expect(side.locator('input[name="mzp-enter"][value="vertical"]')).toBeChecked();
  await expect.poll(count).toBe(4);
  await pick("mzp-exit", "auto");
  await pick("mzp-enter", "auto");
  await side.locator("label", { hasText: "直線" }).click();
  await expect.poll(count).toBe(2);
  await expect(side.locator('input[name="mzp-exit"]')).toHaveCount(0);
});

test("横に並ぶ箱どうしは、始点と終点の向きをそろえる組み合わせしか選べない", async ({ page }) => {
  await openDiagram(page, {
    nodes: [{ id: 1, caption: "A", x: 40, y: 40 }, { id: 2, caption: "B", x: 400, y: 60 }],
    edges: [{ id: "e1", from: 1, to: 2, route: "elbow" }],
  });
  const hit = page.locator(".mz-edge .mz-hit").first();
  const mid = await hit.evaluate(l => {
    const g = l as SVGPolylineElement;
    const svg = g.ownerSVGElement!.getBoundingClientRect();
    const p = g.getPointAtLength(g.getTotalLength() / 2);
    return { x: svg.left + p.x, y: svg.top + p.y };
  });
  await page.mouse.click(mid.x, mid.y);
  const side = page.locator("#sidebar");
  // 見出しの「?」に乗せると説明の吹き出しが出る
  await side.locator("h3", { hasText: "向きの指定" }).locator(".mz-help").hover();
  await expect(page.locator(".mz-help-tip")).toBeVisible();
  await expect(page.locator(".mz-help-tip")).toContainText("両端の向きをそろえたときだけ選べます");
  await side.locator('label:has(input[name="mzp-exit"][value="horizontal"])').click();
  await expect(side.locator('input[name="mzp-enter"][value="vertical"]')).toBeDisabled();
  await expect(side.locator('input[name="mzp-enter"][value="horizontal"]')).toBeEnabled();
  // 始点を上下にすると、終点の左右が選べなくなり、線は下を回るコの字（点が 4 つ）
  await side.locator('label:has(input[name="mzp-exit"][value="vertical"])').click();
  await expect(side.locator('input[name="mzp-enter"][value="horizontal"]')).toBeDisabled();
  await expect.poll(() => hit.evaluate(l => (l.getAttribute("points") ?? "").trim().split(/\s+/).length)).toBe(4);
});

test("Z 字の中棒をドラッグで動かせ、線を選ぶと自動に戻せる", async ({ page }) => {
  await openDiagram(page, {
    nodes: [{ id: 1, caption: "A", x: 40, y: 40 }, { id: 2, caption: "B", x: 400, y: 120 }],
    edges: [{ id: "e1", from: 1, to: 2, route: "elbow" }],
  });
  const edge = page.locator(".mz-edge").first();
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

  // 線を選ぶと「折れ線を自動に戻す」が出て、押すと戻る
  await page.mouse.click(bar.x + 60, bar.y);
  const reset = page.locator("#sidebar [data-via-reset]");
  await expect(reset).toBeVisible();
  await reset.click();
  await expect.poll(midX).toBeCloseTo(before, 0);
  await expect(reset).toHaveCount(0);
});

test("斜めの直線を選ぶと両端に丸が出て、ドラッグで端を辺に沿ってずらせる。自動に戻せる", async ({ page }) => {
  await openDiagram(page, {
    nodes: [{ id: 1, caption: "A", x: 40, y: 40 }, { id: 2, caption: "B", x: 400, y: 300 }],
    edges: [{ id: "e1", from: 1, to: 2 }],
  });
  const edge = page.locator(".mz-edge").first();
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
  await page.locator("#sidebar [data-at-reset]").click();
  // 自動の位置（中心どうしを結んだ線が縁と交わる点）は、下の辺の x = 144 あたり
  await expect.poll(async () => Math.round((await first())[0]!)).toBe(144);
});
