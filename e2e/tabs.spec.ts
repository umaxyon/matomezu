// サーバーから開いたときのアプリ内のタブ（docs/TABS-plan.md の段階 1・2）。
// 実行ファイルを作り、テスト用のフォルダ（MATOMEZU_HOME）で常駐サーバーを動かして、matomezu open / set で図を渡す。
// ブラウザは開かせず（-no-browser）、Playwright のページで表示された URL を開く
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { example } from "./helpers";

const repo = resolve(import.meta.dirname, "..");
let dir = "";
let bin = "";

const run = (...args: string[]) =>
  execFileSync(bin, args, { cwd: dir, env: { ...process.env, MATOMEZU_HOME: dir }, encoding: "utf8", timeout: 20_000 });

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "matomezu-e2e-"));
  bin = join(dir, "matomezu");
  execFileSync("go", ["build", "-o", bin, "./cmd/matomezu"], { cwd: repo, timeout: 120_000 });
  writeFileSync(join(dir, "a.json"), JSON.stringify(example("nested")));
  writeFileSync(join(dir, "b.json"), JSON.stringify(example("three-levels")));
});

test.afterAll(() => {
  try { run("stop"); } catch { /* 止まっていてもよい */ }
  rmSync(dir, { recursive: true, force: true });
});

const tabNames = (page: import("@playwright/test").Page) => page.locator(".tab .tab-name");
const selected = (page: import("@playwright/test").Page) => page.locator('.tab[aria-selected="true"] .tab-name');

test("別の図を open するとアプリ内のタブが増え、前に出る。タブで切り替え、閉じられる", async ({ page }) => {
  const url = run("open", "-no-browser", "a.json").trim();
  await page.goto(url);
  await expect(tabNames(page)).toHaveText(["a.json"]);
  await expect(page.locator(".stage:visible .mz-node")).toHaveCount(9);

  const out = run("open", "-no-browser", "b.json");
  await expect(tabNames(page)).toHaveText(["a.json", "b.json"]);
  await expect(selected(page)).toHaveText("b.json");
  await expect(page.locator(".stage:visible")).toHaveCount(1);
  expect(page.url()).toContain("d=" + new URL(out.split("\n")[0]!).searchParams.get("d"));

  await page.locator(".tab", { hasText: "a.json" }).click();
  await expect(selected(page)).toHaveText("a.json");
  await expect(page.locator(".stage:visible .mz-node")).toHaveCount(9);

  await page.locator(".tab", { hasText: "b.json" }).locator(".tab-close").click();
  await expect(tabNames(page)).toHaveText(["a.json"]);
});

test("見ていないタブの図を set すると、そのタブが前に出て配置の要約が返る", async ({ page }) => {
  const url = run("open", "-no-browser", "a.json").trim();
  await page.goto(url);
  run("open", "-no-browser", "b.json");
  await page.locator(".tab", { hasText: "a.json" }).click();
  await expect(selected(page)).toHaveText("a.json");

  const out = run("set", "b.json", "5.caption=変えたトップ画面");
  expect(out).toContain("viewport");
  await expect(selected(page)).toHaveText("b.json");
  await expect(page.locator(".stage:visible .mz-head", { hasText: "変えたトップ画面" })).toHaveCount(1);
});

test("開いていたタブは、読み直しても残る", async ({ page }) => {
  const url = run("open", "-no-browser", "a.json").trim();
  await page.goto(url);
  run("open", "-no-browser", "b.json");
  await expect(tabNames(page)).toHaveText(["a.json", "b.json"]);
  await page.reload();
  await expect(tabNames(page)).toHaveText(["a.json", "b.json"]);
  await expect(selected(page)).toHaveText("b.json");
});

// ページ（docs/TABS-plan.md の段階 4）。1 はページの箱で、中に 3 と 4
const paged = {
  nodes: [
    { id: 1, caption: "詳細", page: true, x: 40, y: 40 },
    { id: 2, caption: "隣", x: 400, y: 40 },
    { id: 3, caption: "中A", parent: 1, x: 20, y: 20 },
    { id: 4, caption: "中B", parent: 1, x: 300, y: 20 },
  ],
  edges: [{ id: "e1", from: 1, to: 2 }, { id: "e2", from: 3, to: 4 }],
};
const visibleIds = (page: import("@playwright/test").Page) =>
  page.locator(".stage:visible .mz-node").evaluateAll(els => els.map(e => (e as HTMLElement).dataset.id).sort());

test("ブックを開くと全部のページのタブが並ぶ。ページのタブは閉じられない。open -page でそのページが前に出る", async ({ page }) => {
  writeFileSync(join(dir, "p.json"), JSON.stringify(paged));
  await page.goto(run("open", "-no-browser", "p.json").trim());
  const group = page.locator(".tab-group", { hasText: "p.json" });
  await expect(group.locator(".tab-name")).toHaveText(["p.json", "詳細"]);
  await expect(selected(page)).toHaveText("p.json");
  expect(await visibleIds(page)).toEqual(["1", "2"]);
  await expect(group.locator(".tab", { hasText: "詳細" }).locator(".tab-close")).toHaveCount(0);

  run("open", "-no-browser", "-page", "1", "p.json");
  await expect(selected(page)).toHaveText("詳細");
  expect(await visibleIds(page)).toEqual(["3", "4"]);
  expect(page.url()).toContain("p=1");

  await group.locator(".tab", { hasText: "p.json" }).click();
  expect(await visibleIds(page)).toEqual(["1", "2"]);
});

test("check -page はそのページのタブを前に出して要約を返し、page を外すとページのタブは閉じる", async ({ page }) => {
  writeFileSync(join(dir, "p.json"), JSON.stringify(paged));
  await page.goto(run("open", "-no-browser", "p.json").trim());
  const out = run("check", "-page", "1", "p.json");
  expect(out).toContain("#3 中A");
  await expect(selected(page)).toHaveText("詳細");

  run("set", "p.json", "1.page=");
  await expect(page.locator(".tab-group", { hasText: "p.json" }).locator(".tab-name")).toHaveText(["p.json"]);
  expect(await visibleIds(page)).toEqual(["1", "2", "3", "4"]);
});

test("付け替えのドラッグでタブの上に少し止めるとページが切り替わり、落としたページへ移る", async ({ page }) => {
  writeFileSync(join(dir, "p.json"), JSON.stringify(paged));
  await page.goto(run("open", "-no-browser", "p.json").trim());
  run("open", "-no-browser", "-page", "1", "p.json");
  await expect(selected(page)).toHaveText("詳細");
  await page.locator("#mode-reparent").click();

  const box = (await page.locator('.stage:visible .mz-node[data-id="3"] > .mz-head').boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 40, box.y + 40, { steps: 5 });
  const tab = (await page.locator(".tab", { hasText: "p.json" }).boundingBox())!;
  await page.mouse.move(tab.x + 20, tab.y + tab.height / 2, { steps: 5 });
  await expect(selected(page)).toHaveText("p.json"); // 少し止まると最初のページに切り替わる
  const stage = (await page.locator(".stage:visible").boundingBox())!;
  await page.mouse.move(stage.x + 300, stage.y + stage.height - 120, { steps: 10 });
  await page.mouse.up();

  expect(await visibleIds(page)).toEqual(["1", "2", "3"]);
  await expect.poll(() => JSON.parse(readFileSync(join(dir, "p.json"), "utf8")).nodes.find((n: { id: number }) => n.id === 3).parent)
    .toBeUndefined();
});

test("追加削除の一覧はページごとの見出しで分かれ、ほかのページの箱も × で消せる", async ({ page }) => {
  writeFileSync(join(dir, "p.json"), JSON.stringify(paged));
  await page.goto(run("open", "-no-browser", "p.json").trim());
  const side = page.locator(".side-pane:visible");
  await side.locator('[data-tab="list"]').click();
  await expect(side.locator(".mzp-subfold > summary h3")).toHaveText([/最初のページ（2）\s*表示中のページ/, "詳細（2）"]);
  // × は行にポインタを乗せると出る
  const row = side.locator('.mzp-subfold[data-fold="page:1"] .mzp-row', { hasText: "中B" });
  await row.hover();
  await row.locator('[data-remove="4"]').click();
  await expect(side.locator(".mzp-subfold > summary h3")).toHaveText([/最初のページ（2）/, "詳細（1）"]);
  await expect.poll(() => JSON.parse(readFileSync(join(dir, "p.json"), "utf8")).nodes.map((n: { id: number }) => n.id))
    .toEqual([1, 2, 3]);
});
