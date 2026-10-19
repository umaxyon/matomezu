// 枠のつまみ（D45。docs/BOX-SIZE-plan.md の 6.3）を本物のフォントで確かめる: つまんだ向きだけ固定になってファイルに書かれ、
// 入らない文字は … で切れ、タイトルと本文の両方がある箱は 1 行ずつ残る。ダブルクリックで中身に合わせるに戻る
import { readFileSync } from "node:fs";
import { type Page, expect, test } from "@playwright/test";
import { rect, select, violations } from "./helpers";
import { type TestServer, testServer } from "./server";
import { BASE_MIN } from "../web/src/size-rules";

let s: TestServer;
test.beforeEach(() => { s = testServer(); });
test.afterEach(async ({ page }) => {
  expect(await violations(page)).toEqual([]);
  s.stop();
});

type Node = { id: number; width?: number; height?: number; fixedWidth?: boolean; fixedHeight?: boolean; [k: string]: unknown };
const nodeOf = (file: string, id: number) => (JSON.parse(readFileSync(file, "utf8")) as { nodes: Node[] }).nodes.find(n => n.id === id)!;
const head = (page: Page, id: number) => page.locator(`.stage:visible .mz-node[data-id="${id}"] > .mz-head`);

async function open(page: Page, data: { nodes: Node[] }): Promise<string> {
  const file = s.write("frame.json", data);
  await page.goto(s.run("open", "-no-browser", file).trim().split("\n")[0]!);
  await expect(page.locator(".stage:visible .mz-world")).toHaveCount(1);
  await page.evaluate(() => document.fonts.ready);
  return file;
}

// 枠のつまみ（axis）を (dx, dy) だけドラッグする
async function dragFrame(page: Page, id: number, axis: "x" | "y" | "xy", dx: number, dy: number) {
  const g = head(page, id).locator(`:scope > .mz-frame > [data-axis="${axis}"]`);
  await expect(g).toBeVisible();
  const b = (await g.boundingBox())!;
  const [x, y] = [b.x + b.width / 2, b.y + b.height / 2];
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 10 });
  await page.mouse.up();
}

const lines = (page: Page, id: number, sel: string) => head(page, id).locator(sel).evaluate(el => {
  const r = document.createRange(); r.selectNodeContents(el);
  const tops = new Set([...r.getClientRects()].map(x => Math.round(x.top)));
  return { clamped: el.scrollHeight > el.clientHeight + 1, lines: tops.size };
});

test("右の辺をつまむと幅だけ固定になり、ファイルに書かれる。ダブルクリックで中身に合わせるに戻る（D45）", async ({ page }) => {
  const file = await open(page, { nodes: [{ id: 1, caption: "ログイン", x: 40, y: 40 }] });
  const before = await rect(page, 1);
  await select(page, 1);
  await dragFrame(page, 1, "x", 120, 40);
  await expect.poll(async () => (await rect(page, 1)).w).toBeCloseTo(before.w + 120, 0);
  expect((await rect(page, 1)).h).toBe(before.h);
  await expect.poll(() => [nodeOf(file, 1).fixedWidth, nodeOf(file, 1).fixedHeight, nodeOf(file, 1).width]).toEqual([true, undefined, Math.round(before.w + 120)]);
  await head(page, 1).locator(':scope > .mz-frame > [data-axis="x"]').dblclick();
  await expect.poll(async () => (await rect(page, 1)).w).toBe(before.w);
  await expect.poll(() => nodeOf(file, 1).fixedWidth).toBeUndefined();
  await expect(page.locator(".mz-dlg-overlay")).toHaveCount(0);
});

test("角で縮めると最小 64×44 まで縮み、入らない文字は … で切れる。タイトルと本文の両方がある箱は 1 行ずつ残る（D45）", async ({ page }) => {
  const long = "とても長いキャプションの入った箱です";
  await open(page, { nodes: [
    { id: 1, caption: long, x: 40, y: 40 },
    { id: 2, caption: long, body: "本文の一行目\n本文の二行目\n本文の三行目", x: 40, y: 300 },
  ] });
  await select(page, 1);
  await dragFrame(page, 1, "xy", -600, -600);
  await expect.poll(async () => { const r = await rect(page, 1); return [r.w, r.h]; }).toEqual([BASE_MIN.w, BASE_MIN.h]);
  expect((await lines(page, 1, ".mz-text")).clamped).toBe(true);

  await select(page, 2);
  const tall = await rect(page, 2);
  await dragFrame(page, 2, "y", 0, -600);
  await expect.poll(async () => (await rect(page, 2)).h).toBeLessThan(tall.h);
  const r = await rect(page, 2);
  expect(r.h).toBeGreaterThan(BASE_MIN.h); // タイトル 1 行と本文 1 行の分は残る
  const [title, body] = [await lines(page, 2, ".mz-text"), await lines(page, 2, ".mz-body")];
  expect(title.clamped || body.clamped).toBe(true);
  // 切ったあとも、タイトルと本文のどちらも見える（箱の中に 1 行ずつ）
  const box = (await head(page, 2).boundingBox())!;
  for (const sel of [".mz-text", ".mz-body"]) {
    const b = (await head(page, 2).locator(sel).boundingBox())!;
    expect(b.height).toBeGreaterThan(10);
    expect(b.y + b.height).toBeLessThanOrEqual(box.y + box.height + 0.5);
  }
});
