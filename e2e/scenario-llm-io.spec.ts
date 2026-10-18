// LLM とユーザーの往復のシナリオ（LLM の入出力）。テストごとに新しいサーバーと状態のフォルダ（e2e/server.ts の testServer）で、
// LLM の matomezu コマンドとユーザーの画面の操作をはじめから通す。
// - シナリオ 5: 問い（ask）・ツアー（tour）の答えを、-wait（バックグラウンド）・-status・-new で受け取る（D36・D38）
// - シナリオ 11: 届いた図からフォーカス・ツアー（郵便箱から開く。check の focus: と tour: の行の移り変わり。D26・D37・D38）
// - シナリオ 12: close で LLM の履歴が消える（D31）
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Page, expect, test } from "@playwright/test";
import { example } from "./helpers";
import { type TestServer, testServer } from "./server";

test.describe.configure({ mode: "parallel" });

let s: TestServer;

// 紙（D33）からはみ出さないよう、見本の図は大きな紙（A3 横）で開く（tabs.spec.ts と同じ）
const onA3 = (d: ReturnType<typeof example>) => ({ ...d, world: { ...(d.world ?? {}), paper: "a3-landscape" } });

test.beforeEach(() => {
  s = testServer();
  s.write("a.json", onA3(example("nested")));
  s.write("b.json", onA3(example("three-levels")));
});
test.afterEach(() => s.stop());

const selected = (page: Page) => page.locator('.tab[aria-selected="true"] .tab-name');
const dlg = (page: Page) => page.locator(".mz-dlg");

// matomezu が誤りで終わったときの出力（run は誤りで例外を投げる）
const fails = (...args: string[]) => {
  try { s.run(...args); } catch (e) { return String((e as { stderr?: string }).stderr ?? e); }
  throw new Error(`matomezu ${args.join(" ")} did not fail`);
};

// 待つコマンド（ask -wait・tour -wait）をバックグラウンドで動かす（LLM が run_in_background で動かすのと同じ）。
// done() で、もう返ったかが分かる
function background(...args: string[]) {
  const bin = process.env.MATOMEZU_E2E_BIN!;
  let done = false;
  const out = new Promise<string>((ok, ng) => execFile(bin, args, { cwd: s.dir, env: { ...process.env, MATOMEZU_HOME: s.dir }, encoding: "utf8", timeout: 60_000 },
    (err, stdout) => { done = true; if (err) ng(err); else ok(stdout); }));
  return { out, done: () => done };
}

// 図を open して、返った URL を開く（最初の画面）
async function openFirst(page: Page, file: string) {
  await page.goto(s.run("open", "-no-browser", file).trim());
  await expect(selected(page)).toHaveText(file);
}

// check の出力から、フォーカスとツアーの行だけを取り出す
const pointLines = (file: string) => s.run("check", file).split("\n").filter(l => /^(focus|tour): /.test(l));

test.describe("シナリオ 5: 問いとツアーの答えの受け取り", () => {
  test("ask -wait は、吹き出しとドロワー（複数選択とメモ）の答えがそろうと答えを持って返る。「終える」でも返り、-status は終えたと出して次の問いを出せる。-new は一度だけ出す。tour -wait は最後まで見ると complete で返る（D36・D38）", async ({ page }) => {
    await openFirst(page, "a.json");
    const palette = page.locator("#ask-palette");
    const bubbles = page.locator(".stage:visible .mz-ask-bubble:visible");

    // 1. 吹き出し（短い）とドロワー（長い。複数選択と文字）の 2 問を出し、答えをバックグラウンドで待つ
    expect(s.run("ask", "a.json", JSON.stringify({ items: [
      { box: "2", text: "Webは残す？", choices: ["はい", "いいえ"] },
      { box: "5", text: "APIで使う画面を選んでください。足りないものがあれば書いてください。", choices: ["一覧", "詳細", "設定"], multi: true, input: true },
    ] }))).toContain("shown");
    const wait1 = background("ask", "-wait");
    await bubbles.filter({ hasText: "Webは残す？" }).locator("[data-choice='はい']").click();
    await expect.poll(() => s.run("ask", "-status")).toContain(`1 (A) box 2, bubble: answered ["はい"]`);
    expect(wait1.done()).toBe(false); // 1 問だけではまだ返らない
    await palette.locator("button", { hasText: "B" }).click();
    const drawer = page.locator(".mz-ask-drawer");
    await expect(drawer).toContainText("APIで使う画面");
    await drawer.getByLabel("一覧").check();
    await drawer.getByLabel("設定").check();
    await drawer.locator("textarea").fill("詳細はあとで");
    await drawer.locator("[data-ok]").click();
    const out1 = await wait1.out;
    expect(out1).toContain("every question is responded");
    expect(out1).toContain(`1 (A) box 2, bubble: answered ["はい"]`);
    expect(out1).toContain(`2 (B) box 5, drawer: answered ["一覧","設定"] note "詳細はあとで"`);
    expect(out1).toContain("matomezu notify"); // 画面で「読んだ」と知らせる案内
    expect(fails("ask", "a.json", JSON.stringify({ items: [{ box: "2", text: "次？" }] }))).toContain("still open"); // 答えがそろっても -end までは次を出せない
    expect(s.run("ask", "-end")).toContain("ended");
    await expect(palette).toBeHidden();

    // 2. ユーザーがパレットの「終える」で終えると、-wait はそこまでの答えを持って返る
    s.run("ask", "a.json", JSON.stringify({ items: [{ box: "2", text: "残す？", choices: ["はい", "いいえ"] }, { box: "9", choices: ["了承する"] }] }));
    const wait2 = background("ask", "-wait");
    await bubbles.filter({ hasText: "残す？" }).locator("[data-choice='いいえ']").click();
    await expect.poll(() => s.run("ask", "-status")).toContain(`answered ["いいえ"]`);
    await palette.locator("[data-ask-end]").click();
    await expect(bubbles).toHaveCount(0);
    const out2 = await wait2.out;
    expect(out2).toContain("the user ended the topic");
    expect(out2).toContain(`1 (A) box 2, bubble: answered ["いいえ"]`);
    expect(s.run("ask", "-status")).toContain("the user ended the topic");
    s.run("ask", "-new"); // ここまでに読んでいない分を読んでおく（次の -new が新しい話題の答えだけを出すように）

    // 3. -end なしで次を出せる。-new は、ユーザーが答えるまでは何も出さず、答えたら一度だけ出す
    expect(s.run("ask", "a.json", JSON.stringify({ items: [{ box: "2", text: "次の問い", choices: ["OK"] }] }))).toContain("shown");
    expect(s.run("ask", "-new")).toBe("");
    await bubbles.filter({ hasText: "次の問い" }).locator("[data-choice='OK']").click();
    let news = "";
    await expect.poll(() => (news = s.run("ask", "-new"))).not.toBe("");
    expect(news).toContain("the user responded to your questions");
    expect(news).toContain(`1 box 2, bubble: answered ["OK"]`);
    expect(s.run("ask", "-new")).toBe("");
    s.run("ask", "-end");

    // 4. tour -wait: ユーザーが開始して最後まで見ると complete で返る
    s.run("tour", "-title", "手順", "a.json", JSON.stringify({ steps: [{ box: "2", say: "ここが入口です" }, { box: "5", say: "ここで受けます" }] }));
    const wait3 = background("tour", "-wait");
    await expect(dlg(page)).toContainText("「手順」の説明ツアーを開始してもいいですか？（2 ステップ）");
    await dlg(page).locator("[data-ok]").click();
    const bubble = page.locator(".mz-tour-bubble");
    await expect(bubble).toContainText("ここが入口です");
    expect(wait3.done()).toBe(false);
    await page.keyboard.press("ArrowRight");
    await expect(bubble).toContainText("ここで受けます");
    await bubble.locator("[data-next]").click();
    const out3 = await wait3.out;
    expect(out3).toContain(`tour "手順": complete (the user saw every step)`);
    await expect(dlg(page)).toContainText("ツアーが終わりました");
    await dlg(page).locator("[data-ok]").click();
  });

  test("リストの中の長い問い（ドロワー）: スクロールで行が隠れても印はリストの端に残り、印を押すとその行まで戻してドロワーを開く（D36）", async ({ page }) => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ id: 20 + i, parent: 1, caption: `行 ${i + 1}` }));
    s.write("d.json", { world: { paper: "a3-landscape" }, nodes: [{ id: 1, caption: "リスト", childView: "list", listHeight: 200, width: 200, x: 300, y: 200 }, ...rows] });
    await openFirst(page, "d.json");
    expect(s.run("ask", "d.json", JSON.stringify({ items: [{ box: "20", text: "1行目の名前は、ほかの行とそろえて短くしますか？それともこのままにしますか？", choices: ["短く", "このまま"] }] })))
      .toContain("drawer");
    const mark = page.locator(".stage:visible .mz-ask-mark:visible");
    await expect(mark).toHaveText("≡");
    const kids = page.locator(".stage:visible .mz-node[data-id='1'] .mz-list-kids").first();
    const lb = (await kids.boundingBox())!;
    // 1 行目が隠れるまでスクロールする
    const row1 = (await page.locator(".stage:visible .mz-node[data-id='20']").boundingBox())!;
    await kids.evaluate((el, h) => { el.scrollTop = h + 4; }, row1.height);
    await expect.poll(() => kids.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    await expect(mark).toHaveCount(1); // 印は消えない
    await expect(async () => {
      const m = (await mark.boundingBox())!;
      expect(m.y + m.height).toBeGreaterThan(lb.y - 16); // リストの上の端に寄る（リストの外へ飛ばない）
      expect(m.y).toBeLessThan(lb.y + 16);
    }).toPass();
    await mark.click();
    await expect(page.locator(".mz-ask-drawer")).toContainText("1行目の名前は");
    await expect.poll(() => kids.evaluate(el => el.scrollTop)).toBe(0); // その行まで戻す
    s.run("ask", "-end");
  });
});

test.describe("シナリオ 11: 届いた図からフォーカス・ツアー", () => {
  test("A を見ている所に B が届く（キャンセル）→ focus B は確かめて断られる → 郵便箱から開いて示す → 反応 → A と B をまたぐツアーを郵便箱から始めて complete。check の focus: と tour: の行が順に変わる（D26・D37・D38）", async ({ page }) => {
    await openFirst(page, "a.json");
    const seen: string[] = []; // check b.json の focus: と tour: の行を、初めて出た順に残す
    const note = () => { for (const l of pointLines("b.json")) if (!seen.includes(l)) seen.push(l); };

    // 1. LLM が B を open → 「届きました」をキャンセル（A のまま。郵便箱に残る）
    s.run("open", "-no-browser", "b.json");
    await expect(dlg(page).locator("h2")).toHaveText("ブックが届きました");
    await dlg(page).locator("[data-cancel]").click();
    await expect(selected(page)).toHaveText("a.json");

    // 2. focus B 5 は、移るかを確かめる（asked）。キャンセルは断った（declined）
    expect(s.run("focus", "b.json", "5")).toContain("asked the user");
    await expect(dlg(page)).toContainText("ブック「b.json」の「トップ画面」を示しています");
    note();
    await dlg(page).locator("[data-cancel]").click();
    await expect(dlg(page)).toHaveCount(0);
    await expect(selected(page)).toHaveText("a.json");
    note();

    // 3. 郵便箱に入れたフォーカス（-mail）を、ユーザーが郵便箱から開くと、B へ移って示す（shown）
    expect(s.run("focus", "-mail", "-title", "ここを見てください", "b.json", "5")).toContain("mailbox");
    await expect(page.locator("#mail-badge")).toHaveText("1");
    await page.locator("#mail-toggle").click();
    const rows = page.locator("#mailbox .mz-mail-row");
    await expect(rows.filter({ hasText: "b.json" }).first()).toBeVisible(); // 届いた B も残っている
    await rows.filter({ hasText: "ここを見てください" }).click();
    await dlg(page).locator("[data-ok]").click();
    await expect(selected(page)).toHaveText("b.json");
    const frame = page.locator(".stage:visible .mz-point");
    await expect(frame).toHaveCount(1);
    await page.locator("#mail-toggle").click();
    note();

    // 4. ユーザーが反応する（Esc）→ responded
    await page.keyboard.press("Escape");
    await expect(frame).toHaveCount(0);
    note();

    // 5. B と A をまたぐツアーを郵便箱に入れ、郵便箱から始めて最後まで見る
    s.run("tour", "-mail", "-title", "二つの図", "b.json", JSON.stringify({ steps: [{ box: "5", say: "B のトップ画面です" }, { box: "2", say: "A の Web です", path: "a.json" }] }));
    await expect(page.locator("#mail-badge")).toHaveText("1");
    note();
    await page.locator("#mail-toggle").click();
    await page.locator("#mailbox .mz-mail-row", { hasText: "説明ツアー: 二つの図" }).click();
    await dlg(page).locator("[data-ok]").click();
    const bubble = page.locator(".mz-tour-bubble");
    await expect(bubble).toContainText("B のトップ画面です");
    await expect.poll(() => s.run("tour", "-status")).toContain("running");
    note();
    await page.keyboard.press("ArrowRight");
    await expect(selected(page)).toHaveText("a.json");
    await expect(bubble).toContainText("A の Web です");
    await bubble.locator("[data-next]").click();
    await expect(page.locator(".mz-tour")).toHaveCount(0);
    // 終わったのを、まだ読んでいない -new が一度だけ出す（-status で読むと読んだことになるので、先に -new）
    await expect.poll(() => s.run("tour", "-new")).toContain("complete");
    expect(s.run("tour", "-new")).toBe("");
    note();
    await dlg(page).locator("[data-ok]").click();

    expect(seen).toEqual([
      "focus: asked the user whether to move to this diagram to see box 5; no answer yet",
      "focus: the user declined to move to box 5",
      "focus: box 5 is shown; the user has not responded yet",
      "focus: the user responded to box 5 (the frame is closed); you can focus again",
      `tour: "二つの図" (2 steps) waits for the user to start it`,
      `tour: the user is taking "二つの図" now`,
      `tour: complete: the user saw all of "二つの図"`,
    ]);
  });

  test("郵便箱の欄を開いている所に届いた図は、中身（「届きました」）を見るまで未読のまま。見たら読んだことになり、キャンセルでも残る（2026-10-15）", async ({ page }) => {
    await openFirst(page, "a.json");
    await page.locator("#mail-toggle").click();
    await expect(page.locator("#mail-toggle")).toHaveAttribute("aria-pressed", "true");
    // ほかのダイアログが開いている間は「届きました」が出ずに待つ（押しのけない）。その間、欄の行は未読
    await page.locator("#book").click();
    await expect(dlg(page)).toHaveCount(1);
    s.run("open", "-no-browser", "b.json");
    const row = page.locator("#mailbox .mz-mail-row", { hasText: "b.json" });
    await expect(row).toHaveClass(/mz-unread/);
    await expect(page.locator("#mail-badge")).toHaveText("1");
    await dlg(page).locator("[data-cancel]").click();
    // ダイアログが閉じると「届きました」が出て、中身を見たので読んだことになる
    await expect(dlg(page).locator("h2")).toHaveText("ブックが届きました");
    await expect(row).not.toHaveClass(/mz-unread/);
    await expect(page.locator("#mail-badge")).toHaveText("");
    await dlg(page).locator("[data-cancel]").click();
    await expect(row).toHaveCount(1); // 開く動きがあるので、キャンセルなら残る
    await expect(selected(page)).toHaveText("a.json");
  });

  test("届いた図を開いてプレビューにすると、道具・道具箱・閉じる × が隠れ、戻ると元に戻る（D26）", async ({ page }) => {
    await openFirst(page, "a.json");
    s.run("open", "-no-browser", "b.json");
    await dlg(page).locator("[data-ok]").click();
    await expect(selected(page)).toHaveText("b.json");
    await expect(page.locator(".stage:visible .mz-toolbox")).toBeVisible();
    await page.locator("#preview-toggle").click();
    await expect(page.locator(".toolbar")).toBeHidden();
    await expect(page.locator(".mz-toolbox:visible")).toHaveCount(0);
    await expect(page.locator(".tab-close:visible")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.locator(".toolbar")).toBeVisible();
    await expect(page.locator(".stage:visible .mz-toolbox")).toBeVisible();
    await expect(page.locator(".tab-close:visible")).toHaveCount(1);
  });
});

test.describe("シナリオ 12: close で LLM の履歴が消える", () => {
  test("set すると history に残る。close で消え、開き直すと 1 番から数え直す（D31）", async ({ page }) => {
    await openFirst(page, "a.json");
    // 開いた画面が大きさを書き戻すのを待つ（書き戻しは LLM の履歴に積まない。D44）
    await expect.poll(() => readFileSync(join(s.dir, "a.json"), "utf8").includes('"width"')).toBe(true);
    expect(s.run("history", "a.json")).toContain("no changes in the LLM history");
    expect(s.run("set", "a.json", "9.caption=利用者")).toContain("written");
    await expect(page.locator(".stage:visible .mz-head", { hasText: "利用者" })).toHaveCount(1);
    s.run("set", "a.json", "2.caption=ウェブ");
    const before = s.run("history", "a.json");
    expect(before).toMatch(/^#1 /m);
    expect(before).toMatch(/^#2 /m);
    expect(s.run("history", "a.json", "1")).toContain(`caption: "ユーザー" -> "利用者"`);

    expect(s.run("close", "a.json")).toContain("closed a.json");
    await expect(page.locator(".tab .tab-name", { hasText: "a.json" })).toHaveCount(0);
    expect(s.run("history", "a.json")).toContain("no changes in the LLM history");
    expect(fails("history", "a.json", "1")).toContain("no change 1");

    // 開き直す（マスターを見ているなら「届きました」を開く）。履歴は 1 番から
    s.run("open", "-no-browser", "a.json");
    const ok = dlg(page).locator("[data-ok]");
    await expect(ok.or(page.locator('.tab[aria-selected="true"]', { hasText: "a.json" }))).toBeVisible();
    if (await ok.isVisible()) await ok.click();
    await expect(selected(page)).toHaveText("a.json");
    await expect(page.locator(".stage:visible .mz-head", { hasText: "ウェブ" })).toHaveCount(1); // ファイルの中身はそのまま
    expect(s.run("history", "a.json")).toContain("no changes in the LLM history");
    s.run("set", "a.json", "9.caption=お客さま");
    const after = s.run("history", "a.json");
    expect(after).toMatch(/^#1 /m);
    expect(after).not.toMatch(/^#2 /m);
    expect(s.run("history", "a.json", "1")).toContain(`caption: "利用者" -> "お客さま"`);
  });
});
