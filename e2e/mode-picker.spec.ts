// 右の長押しのモードの切り替え（D39 の試し）: 0.25 秒押し続けるとポインタの近くにアイコンを並べ、押すとそのモードにする。動いたら取り消す
import { expect, test } from "@playwright/test";
import { LONG_PRESS_MS } from "../web/src/mode-picker";
import { openDiagram, setMode } from "./helpers";

// 広がるアニメーションが終わるのを待つ
const settled = (page: import("@playwright/test").Page) =>
  page.waitForFunction(() => [...document.querySelectorAll(".mz-mpick-btn")].every(b => b.getAnimations().length === 0));

// 右の長押しでアイコンを出して、離すまで待つ（at はポインタの位置）
async function openByLongPress(page: import("@playwright/test").Page, at: { x: number; y: number }) {
  await page.mouse.move(at.x, at.y);
  await page.mouse.down({ button: "right" });
  await expect(page.locator(".mz-mpick-overlay")).toBeVisible({ timeout: 2000 });
  await page.mouse.up({ button: "right" });
}
// 1 箱の図を開き、アイコンを出す位置（ワールドの左上から 300, 300）を返す
async function openOneBox(page: import("@playwright/test").Page) {
  await openDiagram(page, { nodes: [{ id: 1, caption: "箱", x: 40, y: 40 }], edges: [] } as never);
  const world = (await page.locator(".stage:visible .mz-world").boundingBox())!;
  return { x: world.x + 300, y: world.y + 300 };
}
// 描き終わるまで待つ（メニューは押した・離したときの処理の中で出すので、次の描画の時点で出ていなければ出ない）
const nextFrame = (page: import("@playwright/test").Page) =>
  page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));

test("右の長押しでモードのアイコンを出す。離しても残り、コンテキストメニューは出ず、今のモードが押された形でポインタの上に横並び", async ({ page }) => {
  const at = await openOneBox(page);
  const picker = page.locator(".mz-mpick-overlay"), btns = picker.locator(".mz-mpick-btn[data-mode]");
  await page.mouse.move(at.x, at.y);
  await page.mouse.down({ button: "right" });
  await expect(page.locator(".mz-mpick-ring")).toBeVisible();
  await expect(picker).toBeVisible({ timeout: 2000 });
  await page.mouse.up({ button: "right" });
  await expect(picker).toBeVisible();
  await expect(page.locator(".mz-cmenu")).toHaveCount(0);
  await expect(btns).toHaveCount(3);
  await expect(btns.nth(0)).toHaveAttribute("aria-pressed", "true");
  // 基本はポインタの上に横並び
  await settled(page);
  const b0 = (await btns.nth(0).boundingBox())!, b2 = (await btns.nth(2).boundingBox())!;
  expect(b0.y + b0.height).toBeLessThan(at.y);
  expect(Math.abs(b0.y - b2.y)).toBeLessThan(1);
  expect(b0.x).toBeLessThan(at.x);
  expect(b2.x + b2.width).toBeGreaterThan(at.x);
});

test("モードのアイコンの手のひらを押すと、手のひらモードになって閉じる", async ({ page }) => {
  const at = await openOneBox(page);
  const picker = page.locator(".mz-mpick-overlay");
  await openByLongPress(page, at);
  await settled(page);
  await picker.locator(".mz-mpick-btn[data-mode]").nth(1).click();
  await expect(picker).toHaveCount(0);
  await expect(page.locator("#mode-tool")).toHaveAttribute("data-mode", "pan");
});

test("手のひらモードでも右の長押しでアイコンが出て、外を押すと何もせずに閉じる", async ({ page }) => {
  const at = await openOneBox(page);
  const picker = page.locator(".mz-mpick-overlay");
  await setMode(page, "pan");
  await openByLongPress(page, at);
  await page.mouse.click(at.x, at.y + 40);
  await expect(picker).toHaveCount(0);
  await expect(page.locator("#mode-tool")).toHaveAttribute("data-mode", "pan");
});

test("モードのアイコンは Esc で何もせずに閉じる", async ({ page }) => {
  const at = await openOneBox(page);
  const picker = page.locator(".mz-mpick-overlay");
  await openByLongPress(page, at);
  await page.keyboard.press("Escape");
  await expect(picker).toHaveCount(0);
  await expect(page.locator("#mode-tool")).toHaveAttribute("data-mode", "move");
});

test("モードのアイコンを右ボタンで外を押して閉じても、コンテキストメニューは出ない", async ({ page }) => {
  const at = await openOneBox(page);
  const picker = page.locator(".mz-mpick-overlay");
  await openByLongPress(page, at);
  await page.mouse.click(at.x, at.y + 40, { button: "right" });
  await expect(picker).toHaveCount(0);
  await nextFrame(page);
  await expect(page.locator(".mz-cmenu")).toHaveCount(0);
});

test("押している間に動いたら長押しを取り消し、離すとコンテキストメニューを出す", async ({ page }) => {
  const at = await openOneBox(page);
  await page.mouse.move(at.x, at.y);
  const pressed = Date.now();
  await page.mouse.down({ button: "right" });
  await page.mouse.move(at.x + 3, at.y + 2); // 遊びの中
  await page.mouse.move(at.x + 30, at.y);   // 遊びより動いた
  // 出ないことを確かめるので、押してから長押しの時間（LONG_PRESS_MS）を確実に過ぎるまで待つ。余分の 150ms は、時計の進みと押した時点のずれの分
  await page.waitForTimeout(Math.max(0, pressed + LONG_PRESS_MS + 150 - Date.now()));
  await expect(page.locator(".mz-mpick-overlay")).toHaveCount(0);
  await page.mouse.up({ button: "right" });
  await expect(page.locator(".mz-cmenu")).toBeVisible();
});

test("右ボタンを短く押したらコンテキストメニューで、モードのアイコンは出ない", async ({ page }) => {
  const at = await openOneBox(page);
  await page.mouse.click(at.x, at.y, { button: "right" });
  await expect(page.locator(".mz-cmenu")).toBeVisible();
  await expect(page.locator(".mz-mpick-overlay")).toHaveCount(0);
});

test("右端では縦並びでポインタの左、左端では縦並びで右、上端では下に出す", async ({ page }) => {
  await openDiagram(page, { nodes: [], edges: [] } as never);
  const vw = page.viewportSize()!.width;
  const stage = (await page.locator(".stage:visible").boundingBox())!;
  const btns = page.locator(".mz-mpick-btn[data-mode]");
  const longPress = async (x: number, y: number) => {
    await page.mouse.move(x, y);
    await page.mouse.down({ button: "right" });
    await expect(btns).toHaveCount(3, { timeout: 2000 });
    await page.mouse.up({ button: "right" });
    await settled(page);
  };
  // 右端
  const rx = Math.min(vw, stage.x + stage.width) - 10, ry = stage.y + 200;
  await longPress(rx, ry);
  const r0 = (await btns.nth(0).boundingBox())!, r2 = (await btns.nth(2).boundingBox())!;
  expect(Math.abs(r0.x - r2.x)).toBeLessThan(1);
  expect(r0.x + r0.width).toBeLessThan(rx);
  await page.keyboard.press("Escape");
  // 左端
  const lx = stage.x + 10;
  await longPress(lx, ry);
  const l0 = (await btns.nth(0).boundingBox())!, l2 = (await btns.nth(2).boundingBox())!;
  expect(Math.abs(l0.x - l2.x)).toBeLessThan(1);
  expect(l0.x).toBeGreaterThan(lx);
  await page.keyboard.press("Escape");
  // 上端
  const tx = stage.x + 300, ty = stage.y + 10;
  await longPress(tx, ty);
  const t0 = (await btns.nth(0).boundingBox())!;
  expect(t0.y).toBeGreaterThan(ty);
});

test("アイコンに乗ると名前を出す。押さずに遠くへ動かすと、今のモードのまま閉じる", async ({ page }) => {
  await openDiagram(page, { nodes: [], edges: [] } as never);
  const world = (await page.locator(".stage:visible .mz-world").boundingBox())!;
  const at = { x: world.x + 300, y: world.y + 300 };
  const btns = page.locator(".mz-mpick-btn[data-mode]"), tip = page.locator(".mz-mpick-tip");
  await page.mouse.move(at.x, at.y);
  await page.mouse.down({ button: "right" });
  await expect(btns).toHaveCount(3, { timeout: 2000 });
  await page.mouse.up({ button: "right" });
  await settled(page);
  await expect(tip).toBeHidden();
  await btns.nth(1).hover();
  await expect(tip).toHaveText("ハンドツール");
  const tb = (await tip.boundingBox())!, bb = (await btns.nth(1).boundingBox())!;
  expect(tb.y + tb.height).toBeLessThanOrEqual(bb.y); // 横並びなら上
  await btns.nth(2).hover();
  await expect(tip).toHaveText("付け替えツール");
  await btns.nth(0).hover();
  await expect(tip).toHaveText("選択ツール");
  // 少し離れても残り、遠くへ動かすと閉じる
  await page.mouse.move(at.x, at.y + 40);
  await expect(btns).toHaveCount(3);
  await page.mouse.move(at.x, at.y + 300, { steps: 5 });
  await expect(page.locator(".mz-mpick-overlay")).toHaveCount(0);
  await expect(page.locator("#mode-tool")).toHaveAttribute("data-mode", "move");
  // アイコンの向こう側（上）へ通り過ぎたら、近くても閉じる
  await page.mouse.move(at.x, at.y);
  await page.mouse.down({ button: "right" });
  await expect(btns).toHaveCount(3, { timeout: 2000 });
  await page.mouse.up({ button: "right" });
  await settled(page);
  const top = (await page.locator(".mz-mpick-map").boundingBox())!.y; // 並びの一番上はミニマップのボタン
  await page.mouse.move(at.x, top - 30, { steps: 3 });
  await expect(btns).toHaveCount(3);
  await page.mouse.move(at.x, top - 50, { steps: 2 });
  await expect(page.locator(".mz-mpick-overlay")).toHaveCount(0);
});

test("並びの上の真ん中のミニマップのボタンを押すと、アイコンがミニマップに替わり、倍率の帯で拡大・縮小・初めの位置ができる", async ({ page }) => {
  await openDiagram(page, { nodes: [{ id: 1, caption: "箱", x: 40, y: 40 }], edges: [] } as never);
  const world = (await page.locator(".stage:visible .mz-world").boundingBox())!;
  const at = { x: world.x + 300, y: world.y + 300 };
  await page.mouse.move(at.x, at.y);
  await page.mouse.down({ button: "right" });
  const mapBtn = page.locator(".mz-mpick-map");
  await expect(mapBtn).toBeVisible({ timeout: 2000 });
  await page.mouse.up({ button: "right" });
  await settled(page);
  // 3 つの上の真ん中
  const mid = (await page.locator(".mz-mpick-btn[data-mode]").nth(1).boundingBox())!, mb = (await mapBtn.boundingBox())!;
  expect(Math.abs(mb.x - mid.x)).toBeLessThan(1);
  expect(mb.y + mb.height).toBeLessThan(mid.y);
  await mapBtn.click();
  const panel = page.locator(".mz-mpick-panel");
  await expect(panel).toBeVisible();
  await expect(page.locator(".mz-mpick-btn")).toHaveCount(0);
  // 図が画面に収まっていても出す。倍率の帯は タブ行のボタンと同じ動き
  const level = panel.locator(".mm-level");
  await expect(level).toHaveText("100%");
  await panel.locator(".mm-in").click();
  await expect(level).toHaveText("125%");
  await expect(page.locator("#zoom-level")).toHaveText("125%");
  await panel.locator(".mm-out").click();
  await panel.locator(".mm-out").click();
  await expect(level).toHaveText("75%");
  await panel.locator(".mm-home").click();
  await expect(level).toHaveText("100%");
  // 絵の上でドラッグしている間は、外へ出ても閉じない。離れると閉じる
  const pb = (await panel.locator(".mz-minimap-body > svg").boundingBox())!;
  await page.mouse.move(pb.x + 10, pb.y + 10);
  await page.mouse.down();
  await page.mouse.move(pb.x + pb.width + 150, pb.y + 10, { steps: 4 });
  await expect(panel).toBeVisible();
  await page.mouse.up();
  await page.mouse.move(pb.x + pb.width + 160, pb.y + 20);
  await expect(page.locator(".mz-mpick-overlay")).toHaveCount(0);
});

test("ミニマップの絵を押して見る範囲を動かしても、ミニマップの位置は変わらない", async ({ page }) => {
  // 広がるアニメーションの途中で大きさを測り違え、絵を押して描き直したときに正しい位置へ飛んでいた
  await openDiagram(page, { nodes: Array.from({ length: 30 }, (_, i) => ({ id: i + 1, caption: `箱${i}`, x: 40 + (i % 6) * 260, y: 40 + Math.floor(i / 6) * 200 })), edges: [] } as never);
  const world = (await page.locator(".stage:visible .mz-world").boundingBox())!;
  await page.mouse.move(world.x + 400, world.y + 300);
  await page.mouse.down({ button: "right" });
  await expect(page.locator(".mz-mpick-map")).toBeVisible({ timeout: 2000 });
  await page.mouse.up({ button: "right" });
  await settled(page);
  await page.locator(".mz-mpick-map").click();
  const panel = page.locator(".mz-mpick-panel");
  await page.waitForFunction(() => document.querySelector(".mz-mpick-panel")?.getAnimations().length === 0);
  const p0 = (await panel.boundingBox())!;
  const scroll0 = await page.locator(".stage:visible").evaluate(s => s.scrollLeft + s.scrollTop);
  for (const [fx, fy] of [[0.9, 0.9], [0.1, 0.1]] as const) {
    const art = (await panel.locator(".mz-minimap-body > svg").boundingBox())!;
    const before = await page.locator(".stage:visible").evaluate(s => [s.scrollLeft, s.scrollTop]);
    await page.mouse.click(art.x + art.width * fx, art.y + art.height * fy);
    // 押した所へ見る範囲が動き（スクロール）、それを受けてミニマップを描き直したあとの位置を比べる
    await expect.poll(() => page.locator(".stage:visible").evaluate(s => [s.scrollLeft, s.scrollTop])).not.toEqual(before);
    await nextFrame(page);
    const p1 = (await panel.boundingBox())!;
    expect([p1.x, p1.y]).toEqual([p0.x, p0.y]);
  }
  expect(await page.locator(".stage:visible").evaluate(s => s.scrollLeft + s.scrollTop)).not.toBe(scroll0); // 見る範囲は動いた
});
