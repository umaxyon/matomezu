// サーバーから開いたときのアプリ内のタブ（docs/TABS-plan.md の段階 1・2）。
// 実行ファイルを作り、テスト用のフォルダ（MATOMEZU_HOME）で常駐サーバーを動かして、matomezu open / set で図を渡す。
// ブラウザは開かせず（-no-browser）、Playwright のページで表示された URL を開く
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
