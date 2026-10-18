// サーバーとのつなぎ目のシナリオ: 版の違う実行ファイルでサーバーが入れ替わったとき（シナリオ 7）と、英語の画面での LLM との往復（シナリオ 13）。
// テストごとに自分のサーバーと状態のフォルダを持つ（e2e/server.ts の testServer）。郵便箱・LLM の履歴・問いの話題が前のテストから残らない。
// 入れ替えで残るもの・消えるもの（コードの決まり）:
// - 残る: 登録した図（状態のフォルダの docs.json。hub.go の WithStore）・郵便箱（mail/<id>.json。mail.go）・LLM の履歴（llm/<id>.json。llmhist.go）
// - 消える: 問いの話題（サーバーが持つだけ。ask.go の先頭）・ユーザーの Undo（画面が持つ。サーバーの版が変わると画面は読み直す。events.ts の server）
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, readFileSync, statSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { type Page, expect, test } from "@playwright/test";
import { type TestServer, testServer } from "./server";

test.describe.configure({ mode: "parallel" });

let s: TestServer;
test.beforeEach(() => { s = testServer(); });
test.afterEach(() => { s.stop(); });

const stage = (page: Page) => page.locator(".stage:visible");
const head = (page: Page, id: number) => stage(page).locator(`.mz-node[data-id="${id}"] > .mz-head`);
const selected = (page: Page) => page.locator('.tab[aria-selected="true"] .tab-name');
// 日本語の文字（ひらがな・カタカナ・漢字・全角の記号）。英語の画面に混ざっていないかを見る
const JA = /[　-ヿ㐀-鿿＀-￯]/;

// A4 横の紙に余裕をもって収まる、離れて並んだ箱
const book = (names: string[]) => ({
  world: { paper: "a4-landscape" },
  nodes: names.map((caption, i) => ({ id: i + 1, caption, x: 40 + i * 240, y: 40 })),
  edges: [],
});

// LLM の matomezu open で届いたブックを「届いています」のダイアログで開く（今見ているブックとは別のブックのとき）
async function arrive(page: Page, run: (...a: string[]) => string, file: string) {
  await expect(page.locator('.tab[aria-selected="true"]')).toHaveCount(1); // 画面が何かを前に出してから頼む
  run("open", "-no-browser", file);
  const ok = page.locator(".mz-dlg [data-ok]");
  await ok.waitFor({ timeout: 10_000 });
  await ok.click();
  await expect(page.locator(".mz-dlg")).toHaveCount(0);
}

test("版が変わったときのサーバーの入れ替え: 同じポートで入れ替わり、画面はひとりでに読み直してブックのタブが残る。Undo と問いの話題は消え、郵便箱と LLM の履歴は残る", async ({ page, context }) => {
  s.write("a.json", book(["甲", "乙"]));
  s.write("b.json", book(["丙", "丁", "戊"]));
  const url = s.run("open", "-no-browser", "a.json").trim().split("\n")[0]!;
  await page.goto(url);
  await expect(selected(page)).toHaveText("a.json");
  await arrive(page, s.run, "b.json");
  await expect(selected(page)).toHaveText("b.json");

  // LLM の変更（見ていないブック a）→ LLM の履歴に残る
  s.run("set", "a.json", "2.caption=乙（LLM）");
  await expect.poll(() => s.run("history", "a.json")).toContain("box 2: caption");
  const history = s.run("history", "a.json");

  // ユーザーの直し（b）→ 保存され、Undo できる
  await head(page, 1).dblclick();
  await page.locator('.mz-dlg [name="caption"]').fill("丙（直した）");
  await page.locator(".mz-dlg [data-ok]").click();
  await expect(page.locator(".mz-dlg-overlay")).toHaveCount(0);
  await expect.poll(() => readFileSync(join(s.dir, "b.json"), "utf8")).toContain("丙（直した）");
  await expect(page.locator("#undo")).toBeEnabled();

  // 郵便箱に 1 件（今のブック b）・問いの話題を 1 つ出す
  s.run("notify", "-mail", "-title", "入れ替えの前に届いた");
  await expect(page.locator("#mail-badge")).toHaveText("1");
  expect(s.run("ask", "b.json", JSON.stringify({ items: [{ box: "2", text: "残す？", choices: ["はい", "いいえ"] }] }))).toContain("shown");
  await expect(stage(page).locator(".mz-ask-bubble:visible")).toHaveCount(1);
  expect(s.run("ask", "-status")).not.toContain("no topic");

  const tabsBefore = await page.locator(".tab .tab-name").allTextContents();
  // 読み直したかを見分ける印（読み直すと消える）
  await page.evaluate(() => { (window as unknown as { __mzBefore: boolean }).__mzBefore = true; });

  // 版の違う実行ファイル: 共有の実行ファイルを自分のフォルダへ写し、更新時刻をずらす（開発版の版は更新時刻。main.go の buildVersion）
  const shared = process.env.MATOMEZU_E2E_BIN!;
  const next = join(s.dir, "matomezu-next");
  copyFileSync(shared, next);
  chmodSync(next, 0o755);
  const later = new Date(statSync(shared).mtimeMs + 60_000);
  utimesSync(next, later, later);
  // 以後は新しい版で動かす（古い版で open すると、また入れ替わる）
  const runNext = (...args: string[]) =>
    execFileSync(next, args, { cwd: s.dir, env: { ...process.env, MATOMEZU_HOME: s.dir }, encoding: "utf8", timeout: 20_000 });
  const serverState = () => JSON.parse(readFileSync(join(s.dir, "server.json"), "utf8")) as { pid: number; addr: string; version: string };
  const old = serverState();

  const reloaded = page.waitForEvent("load", { timeout: 15_000 });
  const out = runNext("open", "-no-browser", "b.json"); // 今見ているブック（届いていますのダイアログは出ない）
  expect(new URL(out.trim().split("\n")[0]!).origin).toBe(new URL(url).origin); // 同じポート
  const now = serverState();
  expect(now.pid).not.toBe(old.pid); // 別のサーバー（入れ替わった）
  expect(now.version).not.toBe(old.version);
  expect(now.addr).toBe(old.addr);

  // 画面はひとりでに読み直す（タブもページも増えない）
  await reloaded;
  expect(await page.evaluate(() => (window as unknown as { __mzBefore?: boolean }).__mzBefore ?? false)).toBe(false);
  expect(context.pages()).toHaveLength(1);
  await expect(selected(page)).toHaveText("b.json");
  await expect(page.locator(".tab .tab-name")).toHaveText(tabsBefore);
  await expect(head(page, 1)).toContainText("丙（直した）");

  // 消えるもの: Undo（画面が持つ）・問いの話題（サーバーが持つ）
  await expect(page.locator("#undo")).toBeDisabled();
  expect(runNext("ask", "-status")).toContain("no topic");
  await expect(stage(page).locator(".mz-ask-bubble:visible")).toHaveCount(0);

  // 残るもの: 郵便箱・LLM の履歴（状態のフォルダのファイル）
  await expect(page.locator("#mail-badge")).toHaveText("1");
  await page.locator("#mail-toggle").click();
  await expect(page.locator("#mailbox .mz-mail-row", { hasText: "入れ替えの前に届いた" })).toHaveCount(1);
  expect(runNext("history", "a.json")).toBe(history);
});

test.describe("ブラウザの言語が英語", () => {
  test.use({ locale: "en-US" });

  test("英語の画面で LLM と往復: open の「届いています」・notify のダイアログ・ask の吹き出し・紙からはみ出す操作を断るトーストが英語", async ({ page }) => {
    s.write("a.json", book(["One", "Two"]));
    // 紙（A5 横。高さ 559）に内包の箱 1 と、紙の高さに近い背の高い箱 3。3 を 1 へ付け替えると、1 は 3 と子 2 を縦に積む高さになり、
    // どこへ動かしても紙に入らないので、断ってトーストで知らせる（付け替えのドラッグはダイアログを通らない操作）
    s.write("b.json", {
      world: { paper: "a5-landscape" },
      nodes: [
        { id: 1, caption: "Group", x: 40, y: 400 },
        { id: 2, caption: "Child", parent: 1 },
        { id: 3, caption: "Tall", body: "line\n".repeat(22), x: 400, y: 20 },
      ],
      edges: [],
    });
    const url = s.run("open", "-no-browser", "a.json").trim().split("\n")[0]!;
    await page.goto(url);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(selected(page)).toHaveText("a.json");

    // open: 届いていますのダイアログ
    await expect(page.locator('.tab[aria-selected="true"]')).toHaveCount(1);
    s.run("open", "-no-browser", "b.json");
    const dlg = page.locator(".mz-dlg");
    await expect(dlg).toBeVisible({ timeout: 10_000 });
    await expect(dlg).toContainText("arrived");
    expect(await dlg.innerText()).not.toMatch(JA);
    await dlg.locator("[data-ok]").click();
    await expect(dlg).toHaveCount(0);
    await expect(selected(page)).toHaveText("b.json");

    // notify: 知らせのダイアログ
    s.run("notify", "-title", "Look here", "-body", "The diagram was updated");
    await expect(dlg.locator("h2")).toHaveText("Look here");
    expect(await dlg.innerText()).not.toMatch(JA);
    await dlg.locator("[data-ok]").click();
    await expect(dlg).toHaveCount(0);

    // ask: 吹き出しとパレット
    expect(s.run("ask", "b.json", JSON.stringify({ items: [{ box: "2", text: "Keep it?", choices: ["Yes", "No"] }] }))).toContain("shown");
    const bubble = stage(page).locator(".mz-ask-bubble:visible");
    await expect(bubble).toHaveCount(1);
    await expect(bubble).toContainText("Keep it?");
    expect(await bubble.innerText()).not.toMatch(JA);
    await expect(page.locator("#ask-palette")).toBeVisible();
    expect(await page.locator("#ask-palette").innerText()).not.toMatch(JA);
    s.run("ask", "-end");
    await expect(bubble).toHaveCount(0);

    // 紙からはみ出す付け替えを断るトースト
    const before = await stage(page).locator('.mz-node[data-id="3"]').evaluate(el => (el as HTMLElement).style.cssText);
    await page.locator("#mode-tool").click(); // 選択 → 付け替え
    await expect(page.locator("#mode-tool")).toHaveAttribute("data-mode", "reparent");
    const from = (await head(page, 3).boundingBox())!;
    const to = (await head(page, 1).boundingBox())!;
    await page.mouse.move(from.x + from.width - 10, from.y + 10);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width - 10, to.y + 10, { steps: 10 });
    await page.mouse.up();
    const toast = page.locator(".mz-toast");
    await expect(toast).toContainText("would not fit on the paper");
    expect(await toast.innerText()).not.toMatch(JA);
    await expect(stage(page).locator('.mz-node[data-id="1"] .mz-node[data-id="3"]')).toHaveCount(0);
    expect(await stage(page).locator('.mz-node[data-id="3"]').evaluate(el => (el as HTMLElement).style.cssText)).toBe(before);
  });
});
