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
const scrollOf = (page: import("@playwright/test").Page) => stage(page).evaluate(s => [s.scrollLeft, s.scrollTop] as [number, number]);
const head = (page: import("@playwright/test").Page, id: number) => page.locator(`.mz-node[data-id="${id}"] > .mz-head`);

test("開いたとき、ワールドの左上が図の枠の左上に合い、スクロールバーは出ない。手のひらで、上下左右とも余白の分だけ外へずらせる", async ({ page }) => {
  const frame = (await stage(page).boundingBox())!;
  const world = () => page.locator("#stage .mz-world").boundingBox().then(b => b!);
  expect(Math.round((await world()).x)).toBe(Math.round(frame.x));
  expect(Math.round((await world()).y)).toBe(Math.round(frame.y));
  expect(await stage(page).evaluate(s => { const e = s as HTMLElement; return [e.offsetWidth - e.clientWidth, e.offsetHeight - e.clientHeight]; })).toEqual([0, 0]);
  // 右下へ大きくずらしても、余白（DEFAULTS.margin）の分で止まる
  const margin = await stage(page).evaluate(s => s.scrollLeft);
  expect(margin).toBeGreaterThan(0);
  await page.click("#mode-pan");
  const drag = async (dx: number, dy: number) => {
    await page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2);
    await page.mouse.down();
    await page.mouse.move(frame.x + frame.width / 2 + dx, frame.y + frame.height / 2 + dy, { steps: 5 });
    await page.mouse.up();
  };
  await drag(400, 400);
  expect(Math.round((await world()).x - frame.x)).toBe(margin);
  expect(Math.round((await world()).y - frame.y)).toBe(margin);
  // 左上へ大きくずらすと、ワールドの右下の角の外に余白の分だけ見える所で止まる
  await drag(-3000, -3000);
  await drag(-3000, -3000);
  const w = await world();
  expect(Math.round(frame.x + frame.width - (w.x + w.width))).toBe(margin);
  expect(Math.round(frame.y + frame.height - (w.y + w.height))).toBe(margin);
});

test("手のひらのモードでは、箱をドラッグしても箱は動かず、見る範囲が動く。選びもしない", async ({ page }) => {
  await page.click("#mode-pan");
  await expect(page.locator("#mode-pan")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#mode-label")).toHaveText("手のひらモード");
  const before = await rect(page, 3);
  const [sl0, st0] = await scrollOf(page);
  const b = (await head(page, 3).boundingBox())!;
  await page.mouse.move(b.x + 10, b.y + 10);
  await page.mouse.down();
  await page.mouse.move(b.x - 90, b.y - 60, { steps: 5 });
  await page.mouse.up();
  expect(await rect(page, 3)).toEqual(before);
  const [sl, st] = await scrollOf(page);
  expect(sl).toBeGreaterThan(sl0);
  expect(st).toBeGreaterThan(st0);
  await expect(page.locator(".mz-node.mz-current")).toHaveCount(0);
});

test("Space を押している間は手のひらになり、離すと前のモードに戻る", async ({ page }) => {
  await page.locator("#stage").click({ position: { x: 5, y: 5 } }); // 図に焦点を移す（ボタンの上の Space はボタンを押すので）
  await page.keyboard.down(" ");
  await expect(page.locator("#mode-label")).toHaveText("手のひらモード");
  const before = await rect(page, 3);
  const [sl0] = await scrollOf(page);
  const b = (await head(page, 3).boundingBox())!;
  await page.mouse.move(b.x + 10, b.y + 10);
  await page.mouse.down();
  await page.mouse.move(b.x - 60, b.y - 40, { steps: 5 });
  await page.mouse.up();
  expect(await rect(page, 3)).toEqual(before);
  expect((await scrollOf(page))[0]).toBeGreaterThan(sl0);
  await page.keyboard.up(" ");
  await expect(page.locator("#mode-move")).toHaveAttribute("aria-pressed", "true");
});

// ワールドの左上を図の枠の左上に合わせる（拡大縮小は画面の真ん中を中心に広がるので、確かめる前に見る範囲をそろえる）
const homeView = (page: import("@playwright/test").Page) =>
  stage(page).evaluate(s => {
    const w = s.querySelector(".mz-world")!.getBoundingClientRect(), f = s.getBoundingClientRect();
    s.scrollLeft += w.left - f.left;
    s.scrollTop += w.top - f.top;
  });

const zoomOf = (page: import("@playwright/test").Page) =>
  page.locator("#stage .mz-world").evaluate(el => Number(/scale\(([\d.]+)\)/.exec((el as HTMLElement).style.transform)?.[1] ?? 1));

test("編集中も倍率のボタンが出て、50% / 75% / 100% / 125% の段で切り替わる（なめらかに変わる）。端の段ではボタンを押せない。「全体」はプレビューだけ", async ({ page }) => {
  await expect(page.locator("#zoom-level")).toHaveText("100%");
  await expect(page.locator("#zoom-fit")).toBeHidden();
  await page.click("#zoom-in");
  await expect(page.locator("#zoom-level")).toHaveText("125%");
  await expect.poll(() => zoomOf(page)).toBe(1.25);
  await expect(page.locator("#zoom-in")).toBeDisabled();
  await page.click("#zoom-out");
  await page.click("#zoom-out");
  await expect(page.locator("#zoom-level")).toHaveText("75%");
  await expect.poll(() => zoomOf(page)).toBe(0.75);
  await page.click("#zoom-out");
  await expect(page.locator("#zoom-level")).toHaveText("50%"); // A3 の紙を見るための段（D33）
  await expect.poll(() => zoomOf(page)).toBe(0.5);
  await expect(page.locator("#zoom-out")).toBeDisabled();
  // プレビューに入って抜けると、編集中の倍率に戻る
  await page.click("#preview-toggle");
  await expect(page.locator("#zoom-fit")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect.poll(() => zoomOf(page)).toBe(0.5);
  await expect(page.locator("#zoom-level")).toHaveText("50%");
});

test("125% でも、箱はポインタに付いて動き（画面で 125 動かすと図で 100）、箱の大きさは 100% のときと同じ", async ({ page }) => {
  const at100 = await rect(page, 2);
  await page.click("#zoom-in");
  await expect.poll(() => zoomOf(page)).toBe(1.25);
  await homeView(page);
  expect(await rect(page, 2)).toEqual(at100); // 文字は倍率で割り戻して測る
  const b = (await head(page, 2).boundingBox())!;
  expect(Math.round(b.width)).toBe(Math.round(at100.w * 1.25)); // 見た目は 125%
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + 125, { steps: 10 });
  await page.mouse.up();
  const after = await rect(page, 2);
  expect(after.x).toBe(at100.x);
  expect(Math.abs(after.y - (at100.y + 100))).toBeLessThanOrEqual(1);
});

test("75% で追加モードを使うと、押した所（影の左上）に箱ができる。縮めても紙の大きさは変わらない", async ({ page }) => {
  await openDiagram(page, { nodes: [{ id: 1, caption: "A", x: 40, y: 40 }], edges: [] } as never);
  const paper = await page.locator("#stage .mz-world").evaluate(el => [(el as HTMLElement).style.width, (el as HTMLElement).style.height]);
  await page.click("#zoom-out");
  await expect.poll(() => zoomOf(page)).toBe(0.75);
  expect(await page.locator("#stage .mz-world").evaluate(el => [(el as HTMLElement).style.width, (el as HTMLElement).style.height])).toEqual(paper);
  await homeView(page);
  await page.locator('.mz-toolbox [data-tool="add"]').click();
  const world = (await page.locator("#stage .mz-world").boundingBox())!;
  await page.mouse.move(world.x + 300, world.y + 240);
  await page.mouse.click(world.x + 300, world.y + 240);
  await expect(page.locator(".mz-dlg h2")).toHaveText("ボックスの追加");
  await page.locator('.mz-dlg [name="caption"]').fill("新しい箱");
  await page.locator(".mz-dlg [data-ok]").click();
  const added = page.locator(".mz-node:not(:has(.mz-node))", { hasText: "新しい箱" });
  await expect(added).toHaveCount(1);
  const id = Number(await added.getAttribute("data-id"));
  const r = await rect(page, id);
  // 影の左上はポインタの (16, 12) 左上（画面の上）。図の座標では 75% で割り戻す
  expect(Math.abs(r.x - (300 - 16) / 0.75)).toBeLessThanOrEqual(1);
  expect(Math.abs(r.y - (240 - 12) / 0.75)).toBeLessThanOrEqual(1);
});

test("125% でも、線を引く〇は箱の辺のすぐ外（画面で同じだけ離れた所）に出て、〇から引くと線が引ける", async ({ page }) => {
  await openDiagram(page, { nodes: [{ id: 1, caption: "A", x: 40, y: 40 }, { id: 2, caption: "B", x: 400, y: 40 }], edges: [] } as never);
  await page.click("#zoom-in");
  await expect.poll(() => zoomOf(page)).toBe(1.25);
  await homeView(page);
  await head(page, 1).hover();
  const a = (await head(page, 1).boundingBox())!;
  const p = (await page.locator('.mz-port[data-side="r"]').boundingBox())!;
  const px = p.x + p.width / 2, py = p.y + p.height / 2;
  expect(Math.abs(px - (a.x + a.width + 10))).toBeLessThanOrEqual(1); // 〇の中心は右の辺から画面で 10px 外
  expect(Math.abs(py - (a.y + a.height / 2))).toBeLessThanOrEqual(1);
  const b = (await head(page, 2).boundingBox())!;
  await page.mouse.move(px, py);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator(".mz-edge")).toHaveCount(1);
});
