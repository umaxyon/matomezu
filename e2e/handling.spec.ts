// 操作のしやすさ（残課題 E7〜E9）: Enter で編集ダイアログ、端へ寄せたドラッグで図をスクロールする、ボタンやタブの文字を選択させない
import { type Page, expect, test } from "@playwright/test";
import { example, openDiagram, rect, select, choose, openSide } from "./helpers";

// 2 フレーム待つ（端の自動スクロールは毎フレーム進むので、この間に値が変わらなければ止まっている）
const frames = (page: Page) => page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
// 値が止まるまで待ち、止まった値を返す（2 フレーム離した 2 回の読みが同じ）
async function settled(page: Page, read: () => Promise<number>): Promise<number> {
  let last = NaN;
  await expect.poll(async () => { const a = await read(); await frames(page); last = await read(); return last === a; }).toBe(true);
  return last;
}

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

// 紙（D33）は広がらないので、画面より縦に長い紙（A3 縦）で、端へ寄せると見る範囲がスクロールし、紙の下の端までは運べることを確かめる
const tallPaper = () => { const d = example("nested"); return { ...d, world: { ...(d.world ?? {}), paper: "a3-portrait" } }; };
// 開いたときに見えている最上位の箱のうち、一番上のもの（画面の外の箱はつかめない）
const topBoxId = (page: import("@playwright/test").Page) =>
  page.locator(".stage:visible .mz-world > .mz-node").evaluateAll(els => Number(els.reduce((a, b) => (parseFloat((a as HTMLElement).style.top) <= parseFloat((b as HTMLElement).style.top) ? a : b)).getAttribute("data-id")));

test("箱を図の下の端へ寄せたままにすると、図がスクロールし、箱は見えていた範囲の外まで運べる（紙の下の端まで）", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 700 });
  await openDiagram(page, tallPaper());
  const stage = page.locator(".stage:visible");
  const view = (await stage.boundingBox())!;
  const id = await topBoxId(page);
  const before = await rect(page, id);
  const head = page.locator(`.mz-node[data-id="${id}"] > .mz-head`);
  const box = (await head.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, view.y + view.height - 4, { steps: 40 });
  // 端に止めている間もスクロールし続け、箱はつかんだまま見えていた範囲の外まで運ばれる（端の近くで毎秒約 500px）
  await expect.poll(async () => (await rect(page, id)).y, { timeout: 10_000 }).toBeGreaterThan(before.y + view.height);
  await page.mouse.up();
  const after = await rect(page, id);
  expect(after.y).toBeGreaterThan(before.y + view.height);
  expect(after.y + after.h).toBeLessThanOrEqual(1587); // A3 縦の紙の高さを超えない
  expect(await stage.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
});

test("下の端でスクロールしたあと、つかんだまま上へ戻すと、箱はポインタと同じだけ動く", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 700 });
  await openDiagram(page, tallPaper());
  const stage = page.locator(".stage:visible");
  const view = (await stage.boundingBox())!;
  const head = page.locator(`.mz-node[data-id="${await topBoxId(page)}"] > .mz-head`);
  const box = (await head.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, view.y + view.height - 4, { steps: 40 });
  await expect.poll(() => stage.evaluate(el => el.scrollTop), { timeout: 10_000 }).toBeGreaterThan(300);
  // 端から離して止め（スクロールも止まる）、そこから上へ 30px ずつ 4 回動かす
  const yStop = view.y + view.height - 120;
  await page.mouse.move(x, yStop, { steps: 5 });
  await settled(page, () => stage.evaluate(el => el.scrollTop));
  const screenY = async () => (await head.boundingBox())!.y;
  const start = await screenY();
  for (let i = 1; i <= 4; i++) {
    await page.mouse.move(x, yStop - 30 * i, { steps: 3 });
    expect(Math.abs((start - await screenY()) - 30 * i)).toBeLessThan(2);
  }
  await page.mouse.up();
  // 紙の大きさは変わらない（D33）
  expect(await page.locator(".mz-world").evaluate(el => (el as HTMLElement).offsetHeight)).toBe(1587);
});

test("ボタンやタブの文字は、ドラッグで選択されない", async ({ page }) => {
  await openDiagram(page, example("nested"));
  // 箱の見出しの真ん中は線が通ることがあるので、左上の角を押して選ぶ
  await page.locator('.mz-node[data-id="1"] > .mz-head').click({ position: { x: 5, y: 5 } });
  await openSide(page);
  // 左の端から右の端まで、文字の上をなぞる（タブの列のボタン・サイドバーのタブ）
  const across = async (sel: string) => {
    const b = (await page.locator(sel).first().boundingBox())!;
    await page.evaluate(() => getSelection()!.removeAllRanges());
    await page.mouse.move(b.x + 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width - 2, b.y + b.height / 2, { steps: 10 });
    await page.mouse.up();
    return page.evaluate(() => getSelection()!.toString());
  };
  expect(await across(".tab-bar")).toBe("");
  expect(await across(".mzp-tabs")).toBe("");
});

// 紙（D33）は広がらないので、紙の中で見る範囲がスクロールし、紙の大きさは変わらない
test("追加モードで影を図の下の端へ寄せると紙の中でスクロールし、見えていた範囲の外に箱を足せる。帯の外へ戻すとスクロールは止まる", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 700 });
  await openDiagram(page, example("nested"));
  const stage = page.locator(".stage:visible");
  const view = (await stage.boundingBox())!;
  const worldH = () => page.locator(".mz-world").evaluate(el => (el as HTMLElement).offsetHeight);
  const paperH = await worldH();
  await page.locator('.mz-toolbox [data-tool="add"]').click();
  const x = view.x + 200;
  await page.mouse.move(x, view.y + 200);
  await page.mouse.move(x, view.y + view.height - 6, { steps: 20 });
  // 紙の下の端まで（それ以上はスクロールできない所まで）スクロールするのを待つ
  await expect.poll(() => stage.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop), { timeout: 10_000 }).toBeLessThanOrEqual(1);
  expect(await stage.evaluate(el => el.scrollTop)).toBeGreaterThan(200);
  await page.mouse.move(x, view.y + view.height - 120, { steps: 5 }); // 帯の外へ戻すとスクロールは止まる
  const top = await settled(page, () => stage.evaluate(el => el.scrollTop));
  expect(top).toBeGreaterThan(200);
  await frames(page);
  expect(await stage.evaluate(el => el.scrollTop)).toBe(top);
  expect(await worldH()).toBe(paperH); // 紙の大きさは変わらない
  await page.mouse.click(x, view.y + view.height - 120);
  await page.locator('.mz-dlg [name="caption"]').fill("下の箱");
  await page.locator(".mz-dlg [data-ok]").click();
  const added = page.locator(".mz-node > .mz-head", { hasText: "下の箱" });
  await expect(added).toBeVisible();
  const y = await added.evaluate(el => (el.parentElement as HTMLElement).offsetTop);
  expect(y).toBeGreaterThan(view.height);
  expect(await worldH()).toBe(paperH);
});

test("フローチャートの道具入れの道具を押して、影を図の下の端へ寄せると、紙の中でスクロールし、押した所に足せる", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 700 });
  await openDiagram(page, { world: { childView: "flow" }, nodes: [{ id: 1, caption: "開始", shape: "stadium", x: 200, y: 40 }] });
  const stage = page.locator(".stage:visible");
  const view = (await stage.boundingBox())!;
  await page.locator(".mz-world").click({ position: { x: 5, y: 300 } });
  await page.locator('.mz-toolbox [data-tool="box"]').click();
  const x = view.x + 300;
  await page.mouse.move(x, view.y + 200);
  await page.mouse.move(x, view.y + view.height - 6, { steps: 20 });
  // 紙の下の端まで（それ以上はスクロールできない所まで）スクロールするのを待つ
  await expect.poll(() => stage.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop), { timeout: 10_000 }).toBeLessThanOrEqual(1);
  expect(await stage.evaluate(el => el.scrollTop)).toBeGreaterThan(200);
  await page.mouse.move(x, view.y + view.height - 120, { steps: 5 });
  await page.mouse.click(x, view.y + view.height - 120);
  await page.locator('.mz-dlg [name="caption"]').fill("運んだ箱");
  await page.locator(".mz-dlg [data-ok]").click();
  const added = page.locator(".mz-node > .mz-head", { hasText: "運んだ箱" });
  await expect(added).toBeVisible();
  expect(await added.evaluate(el => (el.parentElement as HTMLElement).offsetTop)).toBeGreaterThan(view.height);
});

test("追加モードでポインタを図の上の外（タブの列の上）へ出しても、上へのスクロールは続く。図から離れたら（サイドバーの上）止まる", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 700 });
  // 縦に長い図を一番下までスクロールしておく
  // 紙（A3 縦）に収まる縦に長い図（紙に収まらない図は開かない。docs/PAPER-plan.md の 4.6 の 7）
  await openDiagram(page, { world: { paper: "a3-portrait" }, nodes: Array.from({ length: 9 }, (_, i) => ({ id: i + 1, caption: `箱${i + 1}`, x: 40, y: 40 + i * 160 })) } as never);
  await openSide(page); // 図から離れる先にサイドバーを出しておく
  const stage = page.locator(".stage:visible");
  const view = (await stage.boundingBox())!;
  await stage.evaluate(el => { el.scrollTop = 1e6; });
  const start = await stage.evaluate(el => el.scrollTop);
  expect(start).toBeGreaterThan(500);
  await page.locator('.mz-toolbox [data-tool="add"]').click();
  const x = view.x + 200;
  await page.mouse.move(x, view.y + 200);
  await page.mouse.move(x, view.y - 20, { steps: 10 }); // 図の上の外
  await expect.poll(() => stage.evaluate(el => el.scrollTop)).toBeLessThan(start);
  // 図の上の外に止めたままでも、上へのスクロールは続く
  const mid = await stage.evaluate(el => el.scrollTop);
  await expect.poll(() => stage.evaluate(el => el.scrollTop)).toBeLessThan(mid);
  const side = (await page.locator("#sidebar").boundingBox())!;
  await page.mouse.move(side.x + side.width / 2, view.y + 100, { steps: 5 }); // 図から離れる（図にかぶせたサイドバーの上。E22）
  // 止まる（上の端まで行って止まったのではない）
  const stopped = await settled(page, () => stage.evaluate(el => el.scrollTop));
  expect(stopped).toBeGreaterThan(0);
  await frames(page);
  expect(await stage.evaluate(el => el.scrollTop)).toBe(stopped);
});

test("低い窓で編集ダイアログの子の見せ方を変えても、ページ全体はスクロールしない（アプリの枠がずれない）", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 660 });
  await openDiagram(page, {
    nodes: [{ id: 3, caption: "えええ", x: 300, y: 120 }, { id: 13, caption: "子", parent: 3 }],
  });
  await choose(page, 3, "view", "list");
  // リストの見せ方が描かれ、配置が落ち着いてから確かめる
  await expect(page.locator('.mz-node[data-id="13"]')).toBeVisible();
  await settled(page, () => page.locator('.mz-node[data-id="3"]').evaluate(el => (el as HTMLElement).offsetHeight));
  expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(660);
});
