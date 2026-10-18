// LLM とユーザーの往復のシナリオ（同時に直す）。テストごとに新しいサーバーと状態のフォルダ（e2e/server.ts の testServer）で、
// LLM の matomezu コマンドとユーザーの画面の操作をはじめから通す。
// - シナリオ 4: 編集の最中に LLM が書く（ドラッグ中の set、編集ダイアログを開いている間の set、書きかけの壊れたファイル）
// - シナリオ 8: 2 画面で同じブックを直す（片方の変更がもう片方に出る。Undo は自分の画面の履歴。close で両方の画面のタブが閉じる）
import { execFile } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type BrowserContext, type Page, expect, test } from "@playwright/test";
import { example } from "./helpers";
import { type TestServer, testServer } from "./server";

test.describe.configure({ mode: "parallel" });

let s: TestServer;

// 紙（D33）からはみ出さないよう、見本の図は大きな紙（A3 横）で開く（tabs.spec.ts と同じ）
const onA3 = (d: ReturnType<typeof example>) => ({ ...d, world: { ...(d.world ?? {}), paper: "a3-landscape" } });

test.beforeEach(() => {
  s = testServer();
  s.write("a.json", onA3(example("nested")));
});
test.afterEach(() => s.stop());

const selected = (page: Page) => page.locator('.tab[aria-selected="true"] .tab-name');
const stage = (page: Page) => page.locator(".stage:visible");
const nodeOf = (page: Page, id: number) => stage(page).locator(`.mz-node[data-id="${id}"]`);
const headOf = (page: Page, id: number) => nodeOf(page, id).locator(":scope > .mz-head");
// ファイルの中身（画面の保存を待つときは expect.poll で読む）
const fileText = (name: string) => readFileSync(join(s.dir, name), "utf8");
const readJson = (name: string) => JSON.parse(fileText(name)) as { nodes: { id: number; caption?: string; x?: number; y?: number }[] };
const boxIn = (name: string, id: number) => readJson(name).nodes.find(n => n.id === id);
// 直るまで出しておくエラー（main.ts の showError。消すときは mz-toast-out を付けてから取り除く）
const errorToast = (page: Page) => page.locator(".mz-toast-error:not(.mz-toast-out)");

// 待つコマンド（set は、ユーザーがボタンを押している間は画面の確かめを待つ）をバックグラウンドで動かす（LLM が run_in_background で動かすのと同じ）。
// done() で、もう返ったかが分かる
function background(...args: string[]) {
  const bin = process.env.MATOMEZU_E2E_BIN!;
  let done = false;
  const out = new Promise<string>((ok, ng) => execFile(bin, args, { cwd: s.dir, env: { ...process.env, MATOMEZU_HOME: s.dir }, encoding: "utf8", timeout: 60_000 },
    (err, stdout, stderr) => { done = true; if (err) ng(new Error(`${err.message}\n${stderr}`)); else ok(stdout); }));
  return { out, done: () => done };
}

// 画面に届いたサーバーの知らせ（SSE。web/src/events.ts）の名前を、届いた順に window.__mzSse へ残す（tabs.spec.ts と同じ）。
// 「起きない」ことを確かめるとき、決まった時間を待つ代わりに、届いた知らせを区切りにする
const SSE_NAMES = ["hello", "version", "notify", "close", "mail", "books", "fit", "summary"];
async function spySse(target: Page | BrowserContext) {
  await target.addInitScript((names: string[]) => {
    const w = window as unknown as { __mzSse: string[]; EventSource: typeof EventSource };
    w.__mzSse = [];
    const Base = w.EventSource;
    w.EventSource = class extends Base {
      constructor(url: string | URL, init?: EventSourceInit) {
        super(url, init);
        for (const n of names) this.addEventListener(n, () => { w.__mzSse.push(n); }); // 画面の受け手より先に登録するので、先に残る
      }
    } as typeof EventSource;
  }, SSE_NAMES);
}
const sseOf = (p: Page) => p.evaluate(() => (window as unknown as { __mzSse: string[] }).__mzSse.slice());

// 画面が図を保存した回数（PUT api/data）。fetch を呼んだその場で数える（要求のイベントがテストに届くのを待たずに済む）
async function spyPuts(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __mzPuts: number };
    w.__mzPuts = 0;
    const base = window.fetch.bind(window);
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT" && String(input instanceof Request ? input.url : input).endsWith("api/data")) w.__mzPuts++;
      return base(input, init);
    }) as typeof fetch;
  });
}
const putsOf = (p: Page) => p.evaluate(() => (window as unknown as { __mzPuts: number }).__mzPuts);

// 図を open して、返った URL を開く（最初の画面）。開いた画面が大きさを書き戻すのを待つ（D44。書き戻しの保存が、あとの確かめに混ざらないように）
async function openFirst(page: Page, file: string) {
  const url = s.run("open", "-no-browser", file).trim().split("\n")[0]!;
  await page.goto(url);
  await expect(selected(page)).toHaveText(file);
  await expect.poll(() => fileText(file).includes('"width"')).toBe(true);
  return url;
}

// 箱の位置（ワールドの座標。style の left・top）
const posOf = (page: Page, id: number) =>
  nodeOf(page, id).evaluate(el => ({ x: parseFloat((el as HTMLElement).style.left), y: parseFloat((el as HTMLElement).style.top) }));
// 最上位の箱の位置を全部
const tops = (page: Page) => Promise.all([1, 4, 9].map(id => posOf(page, id)));

// 箱の編集ダイアログを開いて、キャプションを入れる（確定はしない）
async function editCaption(page: Page, id: number, text: string) {
  const w = (await headOf(page, id).boundingBox())!.width;
  await headOf(page, id).click({ position: { x: w - 6, y: 6 } });
  await expect(nodeOf(page, id)).toHaveClass(/mz-current/);
  await page.keyboard.press("Enter");
  await expect(page.locator(".mz-dlg")).toBeVisible();
  await page.locator('.mz-dlg [name="caption"]').fill(text);
}
const confirm = async (page: Page) => {
  await page.locator(".mz-dlg [data-ok]").click();
  await expect(page.locator(".mz-dlg-overlay")).toHaveCount(0);
};
const caption = (page: Page, id: number) => headOf(page, id).locator(".mz-text, .mz-caption").first();

test.describe("シナリオ 4: 編集の最中に LLM が書く", () => {
  // ユーザーが「ユーザー」（9）をつかんで空いている下へ動かし、離さないうちに LLM が別の箱（API。5）を set する。
  // 画面がボタンを押している間は set の確かめ（fit）を待たせるので、ドラッグ中は set が書かず、何も飛ばない。確かめたら手を離す
  async function dragWhileSet(page: Page) {
    await spySse(page);
    await openFirst(page, "a.json");
    const b = (await headOf(page, 9).boundingBox())!;
    const from = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    const start = await posOf(page, 9);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x, from.y + 120, { steps: 24 });
    const during = await tops(page);
    expect(during[2]!.y).toBeGreaterThan(start.y + 60); // つかんだ箱は動いている

    const from0 = (await sseOf(page)).length;
    const set = background("set", "a.json", "5.caption=LLMが変えたAPI");
    await expect.poll(async () => (await sseOf(page)).slice(from0)).toContain("fit"); // set の確かめが画面に届いた
    await page.evaluate(() => new Promise(r => setTimeout(r, 0))); // 届いた知らせの処理をひと回り待つ
    expect(set.done()).toBe(false); // まだ書いていない
    expect(boxIn("a.json", 5)?.caption).toBe("API");
    // ドラッグ中は何も飛ばない（どの最上位の箱も、つかんでいる箱も、さっきの位置のまま）。画面の文字もまだ変わらない
    expect(await tops(page)).toEqual(during);
    await expect(caption(page, 5)).toHaveText("API");

    await page.mouse.up();
    const dropped = await posOf(page, 9); // 手を離した位置（ここを基準に、あとで飛んだかを比べる）
    expect(await set.out).toContain("written");
    await expect(caption(page, 5)).toHaveText("LLMが変えたAPI"); // 離したら set の書き換えが画面に出る
    return { start, dropped };
  }
  // ファイルの位置は丸めて書く（画面の 407.095 がファイルでは 407）ので、比べるときは丸める
  const rounded = (p: { x: number; y: number }) => ({ x: Math.round(p.x), y: Math.round(p.y) });

  test("ドラッグしている間に LLM が別の箱を set しても、ドラッグ中は何も飛ばない。set は手を離すまで待ち、離すと書いて画面に出る", async ({ page }) => {
    await dragWhileSet(page);
    await expect.poll(() => boxIn("a.json", 5)?.caption).toBe("LLMが変えたAPI");
  });

  // 不具合（2026-10-18 に見つけた。製品のコードは直していない）: 手を離すと、ドラッグした箱が元の位置へ戻り、ファイルにもドラッグが残らない。
  // set は確かめ（fit）の前にファイルを読んで書き換えた中身を作り、画面の確かめを待ってからそのまま書く（cmd/matomezu/tune.go の set）。
  // 待っている間に手を離すと、画面のドラッグの保存と、ドラッグを含まない古い中身の set の書き込みがぶつかり、ドラッグが失われる
  // （set が先なら画面の保存は 409 で読み直し、画面が先なら set が上書きする）。set を待たせずに同じ操作をすると、離した位置が残る
  test.fixme("ドラッグしている間に LLM が別の箱を set しても、離したあとはドラッグした位置と set の両方が画面とファイルに残る", async ({ page }) => {
    const { start, dropped } = await dragWhileSet(page);
    // ドラッグした箱は離した位置のまま（読み直しで元へ戻らない）
    await expect.poll(async () => rounded(await posOf(page, 9))).toEqual(rounded(dropped));
    // ファイルには両方が残る（ドラッグした位置と、set のキャプション）
    await expect.poll(() => {
      const n9 = boxIn("a.json", 9)!;
      return { caption5: boxIn("a.json", 5)?.caption, at9: rounded({ x: n9.x!, y: n9.y! }) };
    }).toEqual({ caption5: "LLMが変えたAPI", at9: rounded(dropped) });
    expect(rounded(dropped)).not.toEqual(rounded(start));
  });

  test("編集ダイアログを開いている間に LLM が別の箱を set し、そのあとユーザーが確定すると、ファイルに両方の変更が残る", async ({ page }) => {
    await openFirst(page, "a.json");
    await editCaption(page, 2, "ユーザーが変えたWeb");
    // ダイアログを開いたまま、LLM が API（5）を書き換える（ダイアログはボタンを押していないので、set は待たずに書く）
    expect(s.run("set", "a.json", "5.caption=LLMが変えたAPI")).toContain("written");
    await expect(caption(page, 5)).toHaveText("LLMが変えたAPI"); // 画面は読み直す
    await expect(page.locator(".mz-dlg")).toBeVisible(); // 読み直してもダイアログは開いたまま
    await expect(page.locator('.mz-dlg [name="caption"]')).toHaveValue("ユーザーが変えたWeb"); // 入れかけた文字も残る
    await confirm(page);
    await expect(caption(page, 2)).toHaveText("ユーザーが変えたWeb");
    await expect(caption(page, 5)).toHaveText("LLMが変えたAPI");
    await expect.poll(() => [boxIn("a.json", 2)?.caption, boxIn("a.json", 5)?.caption]).toEqual(["ユーザーが変えたWeb", "LLMが変えたAPI"]);
  });

  test("ファイルが書きかけの壊れた JSON で上書きされると、画面はエラーを出して上書き保存しない。ファイルが直ると読み直し、保存も戻る", async ({ page }) => {
    await spySse(page);
    await spyPuts(page);
    await page.clock.install(); // 時間は普通に流れる。保存の待ち（sync.ts の SAVE_DELAY）を、決まった時間を待たずに過ぎさせるため
    await openFirst(page, "a.json");
    const good = fileText("a.json");

    // 書きかけ（途中で切れた JSON）。画面は表示を残し、直るまで保存を止めるとエラーで知らせる
    const broken = good.slice(0, Math.floor(good.length / 2));
    const from = (await sseOf(page)).length;
    writeFileSync(join(s.dir, "a.json"), broken);
    await expect.poll(async () => (await sseOf(page)).slice(from)).toContain("version");
    await expect(errorToast(page)).toContainText("ファイルを読み込めません");
    await expect(caption(page, 5)).toHaveText("API"); // 前の表示が残る

    // その間にユーザーが画面で直しても、保存しない（壊れたファイルを画面の中身で上書きしない）
    const puts = await putsOf(page);
    await editCaption(page, 2, "壊れている間の変更");
    await confirm(page);
    await expect(caption(page, 2)).toHaveText("壊れている間の変更");
    await page.clock.runFor(2000); // 保存の待ちを過ぎさせる（待っていた保存があればここで送る）
    expect(await putsOf(page)).toBe(puts);
    expect(fileText("a.json")).toBe(broken);

    // ファイルが直る（LLM が書き終えた）。画面は読み直し、エラーを消す。外の変更が先なので、壊れている間の画面の変更は残らない
    const fixed = JSON.parse(good);
    fixed.nodes.find((n: { id: number }) => n.id === 5).caption = "直したAPI";
    writeFileSync(join(s.dir, "a.json"), JSON.stringify(fixed));
    await expect(caption(page, 5)).toHaveText("直したAPI");
    await expect(caption(page, 2)).toHaveText("Web");
    await expect(errorToast(page)).toHaveCount(0);

    // 保存も戻る
    await editCaption(page, 3, "直ったあとの変更");
    await confirm(page);
    await expect.poll(() => [boxIn("a.json", 3)?.caption, boxIn("a.json", 5)?.caption]).toEqual(["直ったあとの変更", "直したAPI"]);
  });
});

test.describe("シナリオ 8: 2 画面で同じブックを直す", () => {
  test("A の変更が B に出て、B の変更が A に出る。A の Undo は A の履歴（自分の操作と、見た外の変更）を 1 件ずつ戻す。close で両方の画面のタブが閉じる", async ({ page, context }) => {
    const a = page;
    const url = await openFirst(a, "a.json");
    const b = await context.newPage();
    await b.goto(url);
    await expect(selected(b)).toHaveText("a.json");
    // ヘッドレスではウィンドウのフォーカスが動かないので、操作する画面に focus のイベントを起こす（tabs.spec.ts と同じ）
    const focus = (p: Page) => p.evaluate(() => window.dispatchEvent(new Event("focus")));

    // A で直す → B に出る
    await focus(a);
    await editCaption(a, 2, "Aが変えたWeb");
    await confirm(a);
    await expect(caption(b, 2)).toHaveText("Aが変えたWeb");
    await expect.poll(() => boxIn("a.json", 2)?.caption).toBe("Aが変えたWeb");

    // B で直す → A に出る（A から見ると外の変更）。A は変えた箱が見えたら認知し、A の履歴のその時刻の位置に差し込む（D31。llm/seen を送る）
    const seen = a.waitForRequest(r => r.method() === "POST" && r.url().endsWith("/api/llm/seen"));
    await focus(b);
    await editCaption(b, 5, "Bが変えたAPI");
    await confirm(b);
    await expect(caption(a, 5)).toHaveText("Bが変えたAPI");
    await expect.poll(() => boxIn("a.json", 5)?.caption).toBe("Bが変えたAPI");
    await seen;

    // A の Undo は差分で 1 件ずつ戻す。認知した B の変更は A の操作より後の時刻なので先に戻り、A の変更は残る。戻した結果は B にもファイルにも出る
    const undoA = async (cap2: string, cap5: string) => {
      await a.locator("#undo").click();
      for (const p of [a, b]) {
        await expect(caption(p, 2)).toHaveText(cap2);
        await expect(caption(p, 5)).toHaveText(cap5);
      }
      await expect.poll(() => [boxIn("a.json", 2)?.caption, boxIn("a.json", 5)?.caption]).toEqual([cap2, cap5]);
    };
    await focus(a);
    await undoA("Aが変えたWeb", "API");
    // 次の Undo で A の操作が戻る（B の画面の変更は、もう戻したので戻ったまま）。A の履歴はこれで空
    await undoA("Web", "API");
    await expect(a.locator("#undo")).toBeDisabled();

    // LLM が close すると、両方の画面のタブが閉じる
    expect(s.run("close", "a.json")).toContain("closed a.json");
    for (const p of [a, b]) await expect(p.locator(".tab .tab-name", { hasText: "a.json" })).toHaveCount(0);
    await b.close();
  });
});
