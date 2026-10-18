// 画面の操作（D32）: 図の周りの余白、手のひら（モード）・Space でモードのアイコン、編集中の拡大縮小
import { expect, test } from "@playwright/test";
import { example, openDiagram, rect, violations, setMode } from "./helpers";

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
  await setMode(page, "pan");
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
  await setMode(page, "pan");
  await expect(page.locator("#mode-tool")).toHaveAttribute("data-mode", "pan");
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

test("Space でポインタの位置にモードのアイコンを出す。もう一度 Space で閉じ、アイコンを押せばそのモード", async ({ page }) => {
  await page.locator("#stage").click({ position: { x: 5, y: 5 } }); // 図に焦点を移す（ボタンの上の Space はボタンを押すので）
  const b = (await head(page, 3).boundingBox())!;
  await page.mouse.move(b.x + 10, b.y + 80);
  await page.keyboard.press(" ");
  const btns = page.locator(".mz-mpick-btn[data-mode]");
  await expect(btns).toHaveCount(3);
  const first = (await btns.nth(0).boundingBox())!, lastBtn = (await btns.nth(2).boundingBox())!;
  expect(first.x).toBeLessThan(b.x + 10);
  expect(lastBtn.x + lastBtn.width).toBeGreaterThan(b.x + 10);
  await expect(page.locator("#mode-tool")).toHaveAttribute("data-mode", "move"); // 出しただけではモードは変わらない
  await page.keyboard.press(" ");
  await expect(page.locator(".mz-mpick-overlay")).toHaveCount(0);
  await page.keyboard.press(" ");
  await btns.nth(1).click();
  await expect(page.locator("#mode-tool")).toHaveAttribute("data-mode", "pan");
  await expect(page.locator("#mode-label")).toHaveText("手のひらモード");
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

test("「初めの位置に戻す」と Home キーで、倍率 100% の開いたときの見え方に戻る。プレビューでは出さない（E20）", async ({ page }) => {
  const start = await scrollOf(page);
  await page.click("#zoom-in");
  await expect(page.locator("#zoom-level")).toHaveText("125%");
  await stage(page).evaluate(s => { s.scrollLeft += 120; s.scrollTop += 80; });
  await page.click("#zoom-home");
  await expect(page.locator("#zoom-level")).toHaveText("100%");
  await expect.poll(() => scrollOf(page)).toEqual(start);
  await stage(page).evaluate(s => { s.scrollLeft += 120; s.scrollTop += 80; });
  await page.locator("#stage").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Home");
  await expect.poll(() => scrollOf(page)).toEqual(start);
  await page.click("#preview-toggle");
  await expect(page.locator("#zoom-home")).toBeHidden();
});

test("125% でも、箱はポインタに付いて動き（画面で 125 動かすと図で 100）、箱の大きさは 100% のときと同じ", { tag: "@d44" }, async ({ page }) => {
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

test("紙に収まらない本文を箱の編集ダイアログで確定すると、閉じずに知らせ、図は変わらない（D33）", { tag: "@d44" }, async ({ page }) => {
  await openDiagram(page, { world: { paper: "a5-landscape" }, nodes: [{ id: 1, caption: "箱", x: 40, y: 40 }], edges: [] } as never);
  const before = await rect(page, 1);
  await head(page, 1).dblclick();
  await expect(page.locator(".mz-dlg h2")).toHaveText("ボックスの編集");
  await page.locator('.mz-dlg [name="body"]').fill("続き\n".repeat(60));
  await page.locator(".mz-dlg [data-ok]").click();
  await expect(page.locator(".mz-dlg-refused")).toContainText("紙に収まらない");
  await expect(page.locator('.mz-dlg [name="body"]')).toHaveValue("続き\n".repeat(60)); // 入力したまま
  await page.locator(".mz-dlg [data-cancel]").click();
  expect(await rect(page, 1)).toEqual(before);
  await expect(page.locator("#undo")).toBeDisabled();
});

test("追加モードで紙の外（周りの余白の上）を押しても、箱は足せない（D33）", async ({ page }) => {
  await openDiagram(page, { world: { paper: "a5-landscape" }, nodes: [{ id: 1, caption: "箱", x: 40, y: 40 }], edges: [] } as never);
  await page.locator('.mz-toolbox [data-tool="add"]').click();
  const paper = (await page.locator("#stage .mz-world").boundingBox())!;
  // 紙（A5 横 794 × 559）の右の外
  await page.mouse.move(paper.x + paper.width + 40, paper.y + 100);
  await expect(page.locator(".mz-add-ghost")).toHaveClass(/mz-ghost-no/);
  await page.mouse.click(paper.x + paper.width + 40, paper.y + 100);
  await expect(page.locator(".mz-dlg")).toHaveCount(0);
  await expect(page.locator("#stage .mz-node")).toHaveCount(1);
});

test("紙が画面より小さければ紙を図の枠の真ん中に置き、大きければ紙の左上を図の枠の左上に合わせる（D33。2026-10-15 ユーザー）", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await openDiagram(page, { world: { paper: "a5-landscape" }, nodes: [{ id: 1, caption: "箱", x: 40, y: 40 }], edges: [] } as never);
  const frame = (await stage(page).boundingBox())!, paper = (await page.locator("#stage .mz-world").boundingBox())!;
  expect(paper.width).toBeLessThan(frame.width);
  expect(Math.abs(paper.x + paper.width / 2 - (frame.x + frame.width / 2))).toBeLessThan(1.5);
  expect(Math.abs(paper.y + paper.height / 2 - (frame.y + frame.height / 2))).toBeLessThan(1.5);
  // A3 縦（1123 × 1587）は横は収まるので真ん中、縦は収まらないので上を合わせる
  await openDiagram(page, { world: { paper: "a3-portrait" }, nodes: [{ id: 1, caption: "箱", x: 40, y: 40 }], edges: [] } as never);
  const f2 = (await stage(page).boundingBox())!, p2 = (await page.locator("#stage .mz-world").boundingBox())!;
  expect(Math.abs(p2.x + p2.width / 2 - (f2.x + f2.width / 2))).toBeLessThan(1.5);
  expect(Math.round(p2.y)).toBe(Math.round(f2.y));
});

test("紙の型: ブックのダイアログで今のページを小さな紙にして収まらなければ閉じずに知らせ、見ていないページは大きな紙だけ選べる（D33）", { tag: "@d44" }, async ({ page }) => {
  // 横に 7 つ並んだ箱（A4 横には入るが、A5 横には間隔を詰めても入らない。紙を小さくすると押し込み、入らなければ断る。docs/PAPER-plan.md の 4.6 の 7）
  const row = Array.from({ length: 7 }, (_, i) => ({ id: 10 + i, caption: `横${i + 1}`, x: 40 + i * 140, y: 40 }));
  await openDiagram(page, { pages: [{ id: "p2", title: "二枚目" }], nodes: [...row, { id: 2, caption: "二枚目の箱", page: "p2" }], edges: [] } as never);
  await page.locator("#book").click();
  const dlg = page.locator(".mz-dlg");
  // 見ていないページ（二枚目、A4 横）: 縦横とも A4 横以上の型だけ
  await dlg.locator('[data-tab="p2"]').click();
  const others = await dlg.locator('[data-tab-pane="p2"] [name="paper"] option').evaluateAll(os => os.map(o => (o as HTMLOptionElement).value));
  expect(others).toEqual(["a4-landscape", "a3-portrait", "a3-landscape"]);
  // 今のページを A5 横にすると、7 つの並びが入らないので確定できない
  await dlg.locator('[data-tab=""]').click();
  await dlg.locator('[data-tab-pane=""] [name="paper"]').selectOption("a5-landscape");
  await dlg.locator("[data-ok]").click();
  await expect(page.locator(".mz-dlg-refused")).toContainText("紙に収まらない");
  await page.keyboard.press("Escape");
  await expect(page.locator("#stage .mz-world")).toHaveCSS("width", "1123px");
});

test("スクロールするリストの並べ替え: 上下の端へ寄せたまま止めると中がスクロールし、隠れていた行の先へ移せる（E18。D33）", async ({ page }) => {
  const kids = Array.from({ length: 12 }, (_, i) => ({ id: 10 + i, caption: `項目 ${i + 1}`, parent: 1 }));
  await openDiagram(page, { nodes: [{ id: 1, caption: "リスト", childView: "list", listHeight: 200, x: 40, y: 40 }, ...kids], edges: [] } as never);
  const kidsBox = page.locator('.mz-node[data-id="1"] > .mz-list-kids');
  await expect(kidsBox).toHaveCount(1);
  const list = (await kidsBox.boundingBox())!;
  const first = (await head(page, 10).boundingBox())!;
  // 一番上の行をつかみ、リストの下の縁の少し内側まで運んで止める
  await page.mouse.move(first.x + 20, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(first.x + 20, list.y + list.height - 4, { steps: 10 });
  await expect.poll(() => kidsBox.evaluate(el => el.scrollTop + el.clientHeight >= el.scrollHeight - 1), { timeout: 5000 }).toBe(true);
  await page.mouse.up();
  // 一番上にいた行（10）が、一番下まで移った
  const ys = await Promise.all(kids.map(async k => ({ id: k.id, y: (await head(page, k.id).boundingBox())!.y })));
  ys.sort((a, b) => a.y - b.y);
  expect(ys[ys.length - 1]!.id).toBe(10);
  // 上へも: 一番下へ移した行を、上の縁の少し内側まで運んで止めると、先頭まで戻る
  const last = (await head(page, 10).boundingBox())!;
  await page.mouse.move(last.x + 20, last.y + last.height / 2);
  await page.mouse.down();
  await page.mouse.move(last.x + 20, list.y + 4, { steps: 10 });
  await expect.poll(() => kidsBox.evaluate(el => el.scrollTop), { timeout: 5000 }).toBe(0);
  await page.mouse.up();
  const ys2 = await Promise.all(kids.map(async k => ({ id: k.id, y: (await head(page, k.id).boundingBox())!.y })));
  ys2.sort((a, b) => a.y - b.y);
  expect(ys2[0]!.id).toBe(10);
});

test("リストのスクロール: ダイアログで入れると今の高さが上限になり、下の縁のつまみで縮めると、リストの中だけスクロールする。Undo で戻る（D33）", { tag: "@d44" }, async ({ page }) => {
  // 下の縁のつまみが画面（900 × 600）の中に来る数
  const kids = Array.from({ length: 5 }, (_, i) => ({ id: 10 + i, caption: `項目 ${i + 1}`, parent: 1 }));
  await openDiagram(page, { nodes: [{ id: 1, caption: "リスト", childView: "list", x: 40, y: 40 }, ...kids], edges: [] } as never);
  const full = (await rect(page, 1)).h;
  await head(page, 1).dblclick({ position: { x: 20, y: 8 } });
  await expect(page.locator(".mz-dlg h2")).toHaveText("ボックスの編集");
  await page.locator('.mz-dlg [name="list-scroll"]').check();
  await page.locator(".mz-dlg [data-ok]").click();
  await expect(page.locator(".mz-dlg")).toHaveCount(0);
  expect((await rect(page, 1)).h).toBe(full); // 入れただけでは隠れない
  // 選んで、下の縁のつまみを上へドラッグして縮める
  await head(page, 1).click({ position: { x: 20, y: 8 } });
  const grip = page.locator('.mz-node[data-id="1"] > .mz-head > .mz-height-grip');
  await expect(grip).toBeVisible();
  const g = (await grip.boundingBox())!;
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2 - 150, { steps: 8 });
  await page.mouse.up();
  const small = (await rect(page, 1)).h;
  expect(Math.abs(small - (full - 150))).toBeLessThanOrEqual(2);
  // 中だけスクロールする（見出しは動かない）
  const kidsBox = page.locator('.mz-node[data-id="1"] > .mz-list-kids');
  await expect(kidsBox).toHaveCount(1);
  const capY = (await page.locator('.mz-node[data-id="1"] > .mz-head').boundingBox())!.y;
  await kidsBox.evaluate(el => { el.scrollTop = 100; });
  expect((await page.locator('.mz-node[data-id="1"] > .mz-head').boundingBox())!.y).toBe(capY);
  expect(await kidsBox.evaluate(el => el.scrollTop)).toBe(100);
  // 中身は枠の線（2px）の内側まで（下の枠に行が重なって、境目があいまいにならないように。2026-10-15 ユーザー）
  const kb = (await kidsBox.boundingBox())!, lb = (await page.locator('.mz-node[data-id="1"] > .mz-head').boundingBox())!;
  expect(kb.y + kb.height).toBeLessThanOrEqual(lb.y + lb.height - 2 + 0.5);
  expect(kb.x + kb.width).toBeLessThanOrEqual(lb.x + lb.width - 2 + 0.5);
  // Undo でつまみの前に戻る
  await page.keyboard.press("Control+z");
  expect((await rect(page, 1)).h).toBe(full);
});
