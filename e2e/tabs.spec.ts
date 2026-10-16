// サーバーから開いたときのアプリ内のタブ（docs/TABS-plan.md の段階 1・2）。
// 実行ファイルを作り、テスト用のフォルダ（MATOMEZU_HOME）で常駐サーバーを動かして、matomezu open / set で図を渡す。
// ブラウザは開かせず（-no-browser）、Playwright のページで表示された URL を開く
import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { example, openSide } from "./helpers";

const repo = resolve(import.meta.dirname, "..");
let dir = "";
let bin = "";

// タブとサーバーを確かめるテストなので、紙（D33）からはみ出さないよう大きな紙（A3 横）で開く
// （見本の図は、開いたときの並べ方が箱を A4 横の紙の外へ押し出すことがある。残課題図の F24）
const onA3 = (d: ReturnType<typeof example>) => ({ ...d, world: { ...(d.world ?? {}), paper: "a3-landscape" } });

const run = (...args: string[]) =>
  execFileSync(bin, args, { cwd: dir, env: { ...process.env, MATOMEZU_HOME: dir }, encoding: "utf8", timeout: 20_000 });

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "matomezu-e2e-"));
  bin = join(dir, "matomezu");
  execFileSync("go", ["build", "-o", bin, "./cmd/matomezu"], { cwd: repo, timeout: 120_000 });
  writeFileSync(join(dir, "a.json"), JSON.stringify(onA3(example("nested"))));
  writeFileSync(join(dir, "b.json"), JSON.stringify(onA3(example("three-levels"))));
});

test.afterAll(() => {
  try { run("stop"); } catch { /* 止まっていてもよい */ }
  rmSync(dir, { recursive: true, force: true });
});

const tabNames = (page: import("@playwright/test").Page) => page.locator(".tab .tab-name");
const selected = (page: import("@playwright/test").Page) => page.locator('.tab[aria-selected="true"] .tab-name');
const visibleTabs = (page: import("@playwright/test").Page) => page.locator(".tab .tab-name:visible");
// LLM の matomezu open（-page も）。ほかを見ているときは「届いています」のダイアログが出るので、出るのを待って開くを押す（D26 の段階 3）。
// 今見ているページを開くとき（ダイアログが出ない）は shown: true（待たずに進む。並べて流すと遅れて出ることがあるので、出る場面では必ず待つ）
async function arrive(page: import("@playwright/test").Page, file: string, pageId?: string, o: { shown?: boolean } = {}) {
  // 画面が何かを前に出してから頼む（何も見ていないうちに届くと、ダイアログを出さずにそのまま開く）
  await expect(page.locator('.tab[aria-selected="true"]')).toHaveCount(1);
  const out = run("open", "-no-browser", ...(pageId ? ["-page", pageId] : []), file);
  if (o.shown) return out;
  const ok = page.locator(".mz-dlg [data-ok]");
  await ok.waitFor({ timeout: 10_000 });
  await ok.click();
  await expect(page.locator(".mz-dlg")).toHaveCount(0);
  return out;
}
// マスターを開いて、その名前の窓を押す（タブは今のブックだけなので、ほかのブックへはマスターから移る。D26）
async function switchTo(page: import("@playwright/test").Page, name: string) {
  await page.locator("#master").click();
  await expect(page.locator('.tab[aria-selected="true"] .tab-name')).toHaveText("マスター");
  await page.locator(".stage:visible .mz-node[data-id^='b-']", { hasText: name }).first().locator(".mz-link-win").click();
}

test("別の図を open すると前に出る。タブは今のブックだけで、ほかのブックへはマスターの窓から移る。閉じられる", async ({ page }) => {
  const url = run("open", "-no-browser", "a.json").trim();
  await page.goto(url);
  await expect(visibleTabs(page)).toHaveText(["a.json"]);
  await expect(page.locator(".stage:visible .mz-node")).toHaveCount(9);

  const out = await arrive(page, "b.json");
  await expect(selected(page)).toHaveText("b.json");
  await expect(visibleTabs(page)).toHaveText(["b.json"]); // タブは今のブックだけ（D26）
  await expect(page.locator(".stage:visible")).toHaveCount(1);
  expect(page.url()).toContain("d=" + new URL(out.split("\n")[0]!).searchParams.get("d"));

  await switchTo(page, "a.json");
  await expect(selected(page)).toHaveText("a.json");
  await expect(page.locator(".stage:visible .mz-node")).toHaveCount(9);

  await page.locator(".tab", { hasText: "a.json" }).locator(".tab-close").click();
  await expect(selected(page)).toHaveText("b.json"); // 閉じると、開いているほかのブックが前に出る
});

test("マスター: 登録した図の窓が並び（作った人で分ける）、道具箱はブック追加・追加削除・設定。窓を押すとそのブックへ移る（D26）", async ({ page }) => {
  const url = run("open", "-no-browser", "a.json").trim();
  await page.goto(url);
  await page.locator("#master").click();
  await expect(selected(page)).toHaveText("マスター");
  await expect(page.locator("#master")).toHaveAttribute("aria-pressed", "true");
  const stage = page.locator(".stage:visible");
  await expect(stage.locator('.mz-node[data-id="ai"] .mz-node[data-id^="b-"]')).toHaveCount(2); // a・b とも LLM が渡したもの
  await expect(stage.locator('.mz-node[data-id="user"] .mz-node[data-id^="b-"]')).toHaveCount(0);
  await expect(stage.locator(".mz-toolbox [data-tool]")).toHaveCount(3);
  await expect(stage.locator('.mz-toolbox [data-tool="newBook"]')).toBeVisible();
  await expect(page.locator("#book")).toBeHidden(); // マスターではブックの道具を隠す
  await expect(page.locator(".tab-group-current .tab-close")).toBeHidden();
  await stage.locator('.mz-node[data-id^="b-"]', { hasText: "b.json" }).locator(".mz-link-win").click();
  await expect(selected(page)).toHaveText("b.json");
  await expect(page.locator("#master")).toHaveAttribute("aria-pressed", "false");
});

test("マスターを見ている最中に、登録した図のファイルが変わると、一覧をその場で作り直す（2026-10-15）", async ({ page }) => {
  const url = run("open", "-no-browser", "a.json").trim();
  await page.goto(url);
  await page.locator("#master").click();
  await expect(selected(page)).toHaveText("マスター");
  const stage = page.locator(".stage:visible");
  await expect(stage.locator('.mz-node[data-id^="b-"]', { hasText: "b.json" })).toHaveCount(1);
  const before = readFileSync(join(dir, "b.json"), "utf8");
  try {
    writeFileSync(join(dir, "b.json"), JSON.stringify({ ...JSON.parse(before), world: { ...JSON.parse(before).world, title: "題を変えた" } }));
    await expect(stage.locator('.mz-node[data-id^="b-"]', { hasText: "題を変えた" })).toHaveCount(1);
  } finally {
    writeFileSync(join(dir, "b.json"), before);
  }
  await expect(stage.locator('.mz-node[data-id^="b-"]', { hasText: "b.json" })).toHaveCount(1);
});

test("プレビューの間は、道具と道具箱、ページを足す＋と閉じる × が隠れる。戻ると元に戻る（D26）", async ({ page }) => {
  const url = run("open", "-no-browser", "a.json").trim();
  await page.goto(url);
  await arrive(page, "b.json");
  await expect(selected(page)).toHaveText("b.json");
  await expect(page.locator(".stage:visible .mz-toolbox")).toBeVisible();
  await page.locator("#preview-toggle").click();
  await expect(visibleTabs(page)).toHaveText(["b.json"]);
  await expect(page.locator(".toolbar")).toBeHidden();
  await expect(page.locator(".mz-toolbox:visible")).toHaveCount(0);
  await expect(page.locator(".tab-close:visible")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator(".stage:visible .mz-toolbox")).toBeVisible();
  await expect(page.locator(".tab-close:visible")).toHaveCount(1);
  await page.locator(".tab", { hasText: "b.json" }).locator(".tab-close").click();
});

test("郵便箱: LLM の open は今のブックの郵便箱に入り、「届いています」と聞く。キャンセルしても残り（中身は見たので読んだことになる）、郵便箱から開ける（D26）", async ({ page }) => {
  await page.goto(run("open", "-no-browser", "a.json").trim());
  await expect(selected(page)).toHaveText("a.json");
  run("open", "-no-browser", "b.json");
  const dlg = page.locator(".mz-dlg");
  await expect(dlg.locator("h2")).toHaveText("ブックが届きました");
  await expect(dlg).toContainText("b.json");
  await dlg.locator("[data-cancel]").click();
  await expect(selected(page)).toHaveText("a.json"); // 切り替えない
  await expect(page.locator("#mail-badge")).toHaveText(""); // ダイアログで中身を見たので読んだことになる（2026-10-15）
  await page.locator("#mail-toggle").click();
  const box = page.locator("#mailbox");
  await expect(box.locator(".mz-mail-row")).toHaveCount(1);
  await box.locator(".mz-mail-row", { hasText: "b.json" }).click();
  await dlg.locator("[data-ok]").click();
  await expect(selected(page)).toHaveText("b.json");
  await switchTo(page, "a.json"); // 郵便箱は出したまま、前に出したブックの郵便箱を見せる
  await expect(page.locator("#mail-toggle")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#mailbox .mz-mail-row")).toHaveCount(0); // 開いたら郵便箱から取り除く
  await page.locator("#mail-toggle").click();
});

test("郵便箱に届いた箱は、ブックを開いたときに知らせ、図へドラッグすると写して郵便箱から取り除く（D26）", async ({ page }) => {
  const url = run("open", "-no-browser", "b.json").trim();
  const doc = new URL(url).searchParams.get("d")!;
  const copy = { root: "4", pattern: "nest", nodes: [{ id: 4, caption: "届いた箱" }, { id: 5, caption: "その子", parent: 4 }], edges: [] };
  const res = await fetch(new URL(`d/${doc}/api/mail`, url), {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "box", from: "ほかのブック", pattern: "nest", caption: "4_届いた箱", copy }),
  });
  expect(res.ok).toBe(true);
  await page.goto(url);
  await expect(page.locator(".mz-toast", { hasText: "郵便箱にアイテムが届いています（1 件）" })).toBeVisible();
  await expect(page.locator("#mail-badge")).toHaveText("1");
  await page.locator("#mail-toggle").click();
  const before = JSON.parse(readFileSync(join(dir, "b.json"), "utf8")).nodes.length;
  await page.locator("#mailbox .mz-mail-row", { hasText: "4_届いた箱" }).dragTo(page.locator(".stage:visible"), { targetPosition: { x: 400, y: 400 } });
  await expect.poll(() => JSON.parse(readFileSync(join(dir, "b.json"), "utf8")).nodes.length).toBe(before + 2);
  await expect(page.locator("#mailbox .mz-mail-row")).toHaveCount(0);
  await page.locator("#mail-toggle").click();
  writeFileSync(join(dir, "b.json"), JSON.stringify(onA3(example("three-levels"))));
});

test("リンクの箱の窓を押すと、そのページのタブが前に出る。持ち手でドラッグすると箱が動く（link-box.ts）", async ({ page }) => {
  writeFileSync(join(dir, "link.json"), JSON.stringify({
    pages: [{ id: "p1", title: "流れ", world: { childView: "flow" } }],
    nodes: [{ id: 1, caption: "窓", body: "のぞく", link: "p1", x: 60, y: 60 }, { id: 2, caption: "開始", page: "p1", x: 40, y: 40 }],
  }));
  const url = run("open", "-no-browser", "link.json").trim();
  await page.goto(url);
  await expect(tabNames(page)).toHaveText(["link.json", "流れ"]);
  await expect(selected(page)).toHaveText("link.json");
  const head = page.locator('.stage:visible .mz-node[data-id="1"] > .mz-head');
  await expect(head.locator(".mz-link-badge")).toHaveText("フローチャート");
  // 持ち手（上の帯）でドラッグすると動く
  const bar = (await head.locator(".mz-link-bar").boundingBox())!;
  await page.mouse.move(bar.x + 10, bar.y + bar.height / 2);
  await page.mouse.down();
  await page.mouse.move(bar.x + 110, bar.y + 60, { steps: 8 });
  await page.mouse.up();
  const moved = () => JSON.parse(readFileSync(join(dir, "link.json"), "utf8")).nodes[0] as { x: number; y: number };
  await expect.poll(() => moved().x).toBeGreaterThan(60);
  expect(moved().y).toBeGreaterThan(60);
  // 窓を押すと、ページのタブが前に出る
  await head.locator(".mz-link-win").click();
  await expect(selected(page)).toHaveText("流れ");
  await expect(page.locator(".stage:visible .mz-head", { hasText: "開始" })).toHaveCount(1);
});

test("matomezu close で、画面のタブが閉じる（タブの × と同じ。読み直しても戻らず、open すればまた開ける）", async ({ page }) => {
  const url = run("open", "-no-browser", "a.json").trim();
  await page.goto(url);
  await arrive(page, "b.json");
  await expect(tabNames(page)).toHaveText(["a.json", "b.json"]);
  expect(run("close", "b.json")).toContain("closed b.json");
  await expect(tabNames(page)).toHaveText(["a.json"]);
  await expect(selected(page)).toHaveText("a.json");
  await page.reload();
  await expect(tabNames(page)).toHaveText(["a.json"]);
  // 登録は残るので、open すればまた開ける。登録の無い図は誤り
  await arrive(page, "b.json");
  await expect(tabNames(page)).toHaveText(["a.json", "b.json"]);
  expect(() => run("close", "nothing.json")).toThrow(/not registered/);
});

test("set は書き換えだけ: 見ていないブックを set しても前に出さず、要約も返さない。書き換えは check と、開いたときに見える（D30）", async ({ page }) => {
  const url = run("open", "-no-browser", "a.json").trim();
  await page.goto(url);
  await arrive(page, "b.json");
  await switchTo(page, "a.json");
  await expect(selected(page)).toHaveText("a.json");

  const out = run("set", "b.json", "5.caption=変えたトップ画面");
  expect(out).toContain("written");
  expect(out).not.toContain("paper");
  await expect(selected(page)).toHaveText("a.json");
  expect(run("check", "b.json")).toContain("paper a3-landscape"); // 要約は紙に対して（D33）
  await expect(selected(page)).toHaveText("a.json");
  await switchTo(page, "b.json");
  await expect(page.locator(".stage:visible .mz-head", { hasText: "変えたトップ画面" })).toHaveCount(1);
});

test("開いていたタブは、読み直しても残る", async ({ page }) => {
  const url = run("open", "-no-browser", "a.json").trim();
  await page.goto(url);
  await arrive(page, "b.json");
  await expect(tabNames(page)).toHaveText(["a.json", "b.json"]);
  await page.reload();
  await expect(tabNames(page)).toHaveText(["a.json", "b.json"]);
  await expect(selected(page)).toHaveText("b.json");
});

test("サーバーを止めて別の図だけ open し直しても、前に開いていたタブは残る（登録した図はサーバーが覚えている）", async ({ page }) => {
  const url = run("open", "-no-browser", "a.json").trim();
  await page.goto(url);
  await arrive(page, "b.json");
  await expect(tabNames(page)).toHaveText(["a.json", "b.json"]);
  run("stop");
  run("open", "-no-browser", "a.json"); // 新しいサーバーは a だけを頼まれる
  // 実行ファイルを作り直したとき（版が変わる）は画面が読み直し、覚えているタブをサーバーに問い合わせて開き直す
  await page.reload();
  await expect(tabNames(page)).toHaveText(["a.json", "b.json"], { timeout: 10_000 });
});

test("読み直したあと一度も前に出していないタブの図が外部で変わったら、前に出したとき新しい内容を出す", async ({ page }) => {
  writeFileSync(join(dir, "c.json"), JSON.stringify({ nodes: [{ id: 1, caption: "前の内容", x: 40, y: 40 }] }));
  const url = run("open", "-no-browser", "a.json").trim();
  await page.goto(url);
  await arrive(page, "c.json");
  await switchTo(page, "a.json");
  await page.waitForTimeout(5500); // open の知らせを送り直す時間（hub.go の showReplay）を過ぎてから読み直す
  await page.reload(); // c は読み直したあと一度も前に出ていない（最初のデータを持ったまま待つ）
  await expect(selected(page)).toHaveText("a.json");
  writeFileSync(join(dir, "c.json"), JSON.stringify({ nodes: [{ id: 1, caption: "新しい内容", x: 40, y: 40 }] }));
  await page.waitForTimeout(1000); // サーバーが変更を見つけて知らせるまで
  await switchTo(page, "c.json");
  await expect(page.locator(".stage:visible .mz-head", { hasText: "新しい内容" })).toHaveCount(1);
});

// ページ（docs/TABS-plan.md。2026-10-12 から、ページはブックの子）。ページ p1「詳細」に 3 と 4 が載る
const paged = {
  pages: [{ id: "p1", title: "詳細" }],
  nodes: [
    { id: 1, caption: "表", x: 40, y: 40 },
    { id: 2, caption: "隣", x: 400, y: 40 },
    { id: 3, caption: "中A", page: "p1", x: 20, y: 20 },
    { id: 4, caption: "中B", page: "p1", x: 300, y: 20 },
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

  await arrive(page, "p.json", "p1");
  await expect(selected(page)).toHaveText("詳細");
  expect(await visibleIds(page)).toEqual(["3", "4"]);
  expect(page.url()).toContain("p=p1");

  await group.locator(".tab", { hasText: "p.json" }).click();
  expect(await visibleIds(page)).toEqual(["1", "2"]);
});

test("check -page はそのページの要約を返す（前に出さない。D30）。set -page はそのページの world を直す。ページを消すとタブは閉じる", async ({ page }) => {
  writeFileSync(join(dir, "p.json"), JSON.stringify(paged));
  await page.goto(run("open", "-no-browser", "p.json").trim());
  await expect(selected(page)).toHaveText("p.json");
  const out = run("check", "-page", "p1", "p.json");
  expect(out).toContain("#3 中A");
  await expect(selected(page)).toHaveText("p.json");
  run("set", "-page", "p1", "p.json", "world.background=#123456");
  expect(JSON.parse(readFileSync(join(dir, "p.json"), "utf8")).pages[0].world).toEqual({ background: "#123456" });

  const gone = { ...paged, pages: [], nodes: paged.nodes.map(n => { const { page: _p, ...rest } = n as { page?: string }; return rest; }) };
  writeFileSync(join(dir, "p.json"), JSON.stringify(gone));
  await expect(page.locator(".tab-group", { hasText: "p.json" }).locator(".tab-name")).toHaveText(["p.json"]);
  expect(await visibleIds(page)).toEqual(["1", "2", "3", "4"]);
});

test("付け替えのドラッグでタブの上に少し止めるとページが切り替わり、落としたページへ移る", async ({ page }) => {
  writeFileSync(join(dir, "p.json"), JSON.stringify(paged));
  await page.goto(run("open", "-no-browser", "p.json").trim());
  await arrive(page, "p.json", "p1");
  await expect(selected(page)).toHaveText("詳細");
  await page.locator("#mode-reparent").click();

  // 左上の道具箱に重ならないよう、見出しの右寄りをつかむ
  const box = (await page.locator('.stage:visible .mz-node[data-id="3"] > .mz-head').boundingBox())!;
  await page.mouse.move(box.x + box.width - 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width, box.y + 40, { steps: 5 });
  const tab = (await page.locator(".tab", { hasText: "p.json" }).boundingBox())!;
  await page.mouse.move(tab.x + 20, tab.y + tab.height / 2, { steps: 5 });
  await expect(selected(page)).toHaveText("p.json"); // 少し止まると最初のページに切り替わる
  const stage = (await page.locator(".stage:visible").boundingBox())!;
  await page.mouse.move(stage.x + 300, stage.y + stage.height - 120, { steps: 10 });
  await page.mouse.up();

  expect(await visibleIds(page)).toEqual(["1", "2", "3"]);
  await expect.poll(() => JSON.parse(readFileSync(join(dir, "p.json"), "utf8")).nodes.find((n: { id: number }) => n.id === 3).page)
    .toBeUndefined();
  // 保存は箱 1 つを 1 行に書く
  const saved = readFileSync(join(dir, "p.json"), "utf8");
  expect(saved).toMatch(/^  "nodes": \[\n    \{ "id": 1, /m);
  expect(saved).toMatch(/^    \{ "id": 3, "caption": "[^"]*", .*\},?$/m);
});

test("追加削除の一覧はページごとの見出しで分かれ、ほかのページの箱も × で消せる", async ({ page }) => {
  writeFileSync(join(dir, "p.json"), JSON.stringify(paged));
  await page.goto(run("open", "-no-browser", "p.json").trim());
  const side = page.locator(".side-pane:visible");
  await openSide(page);
  await expect(side.locator(".mzp-subfold > summary h3")).toHaveText([/最初のページ（2）\s*表示中のページ/, "詳細（2）"]);
  // × は行にポインタを乗せると出る
  const row = side.locator('.mzp-subfold[data-fold="page:p1"] .mzp-row', { hasText: "中B" });
  await row.hover();
  await row.locator('[data-remove="4"]').click();
  await expect(side.locator(".mzp-subfold > summary h3")).toHaveText([/最初のページ（2）/, "詳細（1）"]);
  await expect.poll(() => JSON.parse(readFileSync(join(dir, "p.json"), "utf8")).nodes.map((n: { id: number }) => n.id))
    .toEqual([1, 2, 3]);
});

test("マスターの追加削除: 一覧の行を窓へ落とすと、そのブックの郵便箱へ写しを送り、開いて図へ置ける。同じパターンのページが無ければ送らない（D26）", async ({ page }) => {
  writeFileSync(join(dir, "p.json"), JSON.stringify(paged));
  writeFileSync(join(dir, "f.json"), JSON.stringify({ world: { childView: "flow" }, nodes: [{ id: 1, caption: "開始", x: 40, y: 40 }] }));
  writeFileSync(join(dir, "a.json"), JSON.stringify({ ...onA3(example("nested")), world: { title: "入れ子の例", paper: "a3-landscape" } }));
  const before = readFileSync(join(dir, "a.json"), "utf8");
  await page.goto(run("open", "-no-browser", "a.json").trim());
  await arrive(page, "p.json");
  await arrive(page, "f.json");
  await page.locator("#master").click();
  const stage = page.locator(".stage:visible");
  await stage.locator('.mz-toolbox [data-tool="crossMove"]').click();
  const list = page.locator("#crossmove");
  await expect(list).toBeVisible();
  await list.locator("summary", { hasText: "入れ子の例" }).click();
  // nested の 4（バックエンド）は、子 5・6 と孫 7・8 を持ち、中に線 5-6 と 7-8 がある
  const row = list.locator('[data-cross="4"]');
  await expect(row).toBeVisible();
  // フローチャートだけのブックへは送れない
  await row.dragTo(stage.locator(".mz-node[data-id^='b-']", { hasText: "f.json" }).locator(".mz-link-win"));
  await expect(page.locator(".mz-toast-warn", { hasText: "フローチャート" }).or(page.locator(".mz-toast-warn", { hasText: "内包のページが無い" }))).toBeVisible();
  await row.dragTo(stage.locator(".mz-node[data-id^='b-']", { hasText: "p.json" }).locator(".mz-link-win"));
  await expect(page.locator(".mz-toast", { hasText: "郵便箱へ送りました" })).toBeVisible();
  expect(readFileSync(join(dir, "a.json"), "utf8")).toBe(before); // 元のブックは変わらない
  // p を開くと知らせが出て、郵便箱から図へ置ける
  await switchTo(page, "p.json");
  await expect(page.locator(".mz-toast", { hasText: "郵便箱にアイテムが届いています" })).toBeVisible();
  await page.locator("#mail-toggle").click();
  await page.locator("#mailbox .mz-mail-row", { hasText: "バックエンド" }).dragTo(page.locator(".stage:visible"), { targetPosition: { x: 200, y: 400 } });
  await expect.poll(() => JSON.parse(readFileSync(join(dir, "p.json"), "utf8")).nodes.length).toBe(9);
  const out = JSON.parse(readFileSync(join(dir, "p.json"), "utf8"));
  expect(out.nodes.slice(-5).map((n: { id: number; parent?: number }) => [n.id, n.parent ?? null]))
    .toEqual([[5, null], [6, 5], [7, 5], [8, 7], [9, 7]]);
  expect(out.edges.length).toBe(4);
  await page.locator("#mail-toggle").click();
  writeFileSync(join(dir, "a.json"), JSON.stringify(onA3(example("nested")))); // 後のテストはファイル名の見出しを使う
});

test("図の題名（world.title）があればタブの見出しに出し、ポインタを乗せるとファイル名が出る。ブックのダイアログで書き換えられる", async ({ page }) => {
  writeFileSync(join(dir, "c.json"), JSON.stringify({ world: { title: "残りの作業" }, nodes: [{ id: 1, caption: "A" }] }));
  const url = run("open", "-no-browser", "c.json").trim();
  await page.goto(url);
  const tab = page.locator('.tab[aria-selected="true"]');
  await expect(tab.locator(".tab-name")).toHaveText("残りの作業");
  await expect(tab).toHaveAttribute("title", "c.json");
  await expect(page).toHaveTitle("残りの作業 - matomezu");
  // ブックのダイアログのブックのタブで書き換える（空にするとファイル名に戻る）
  const rename = async (text: string) => {
    await page.locator("#book").click();
    await page.locator('.mz-dlg [data-tab="\u0000book"]').click();
    await page.locator('.mz-dlg [name="book-title"]').fill(text);
    await page.locator(".mz-dlg [data-ok]").click();
  };
  await rename("新しい題名");
  await expect(tab.locator(".tab-name")).toHaveText("新しい題名");
  await expect.poll(() => JSON.parse(readFileSync(join(dir, "c.json"), "utf8")).world?.title).toBe("新しい題名");
  await rename("");
  await expect(tab.locator(".tab-name")).toHaveText("c.json");
  await arrive(page, "c.json", undefined, { shown: true });
  await tab.locator(".tab-close").click();
});

test("マスターの道具箱のブック追加で新しい図を作ると、最後に開いた図と同じフォルダにファイルができ、前に出る（D20・D26）", async ({ page }) => {
  const url = run("open", "-no-browser", "a.json").trim();
  await page.goto(url);
  await page.locator("#master").click();
  await page.locator('.stage:visible .mz-toolbox [data-tool="newBook"]').click();
  const dlg = page.locator(".mz-dlg");
  await expect(dlg.locator("h2")).toHaveText("新しい図");
  await expect(dlg).toContainText("最後に開いた図と同じフォルダに作ります");
  await dlg.locator('[name="caption"]').fill("設計メモ");
  await dlg.locator('[name="theme"]').selectOption("sticky");
  await dlg.locator("label", { hasText: "フローチャート" }).click();
  await dlg.locator("[data-ok]").click();
  await expect(selected(page)).toHaveText("設計メモ");
  await expect(page.locator(".stage:visible .mz-node")).toHaveCount(0);
  const saved = JSON.parse(readFileSync(join(dir, "設計メモ.json"), "utf8"));
  expect(saved.world).toEqual({ title: "設計メモ", theme: "sticky", childView: "flow", madeBy: "user" });
  // マスターでは「ユーザー」の箱に並ぶ
  await page.locator("#master").click();
  await expect(page.locator('.stage:visible .mz-node[data-id="user"] .mz-node[data-id^="b-"]', { hasText: "設計メモ" })).toHaveCount(1);
  await switchTo(page, "設計メモ");
  await page.locator(".tab-group-current .tab-book .tab-close").click();
});

test("マスターでブックの窓を Ctrl+C、Ctrl+V すると複製のダイアログが出て、番号付きの名前で同じフォルダに写す。キャンセルなら作らない。リストは写せない（D23）", async ({ page }) => {
  const url = run("open", "-no-browser", "a.json").trim();
  await page.goto(url);
  await page.locator("#master").click();
  await expect(selected(page)).toHaveText("マスター");
  const stage = page.locator(".stage:visible");
  const win = stage.locator('.mz-node[data-id^="b-"]', { hasText: "設計メモ" }).first();
  await win.locator(":scope > .mz-head").click({ position: { x: 6, y: 6 } });
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  const dlg = page.locator(".mz-dlg");
  await expect(dlg.locator("h2")).toHaveText("ブックの複製");
  await expect(dlg.locator('[name="caption"]')).toHaveValue("設計メモ (2)");
  // キャンセルなら作らない
  await page.keyboard.press("Escape");
  await expect(dlg).toHaveCount(0);
  expect(() => readFileSync(join(dir, "設計メモ (2).json"), "utf8")).toThrow();
  // もう一度貼って作る: 中身は元のまま、題名と作った人が変わり、マスターのユーザーの箱に並ぶ
  await page.keyboard.press("Control+v");
  await expect(dlg.locator('[name="caption"]')).toHaveValue("設計メモ (2)");
  await dlg.locator("[data-ok]").click();
  await expect(stage.locator('.mz-node[data-id="user"] .mz-node[data-id^="b-"]', { hasText: "設計メモ (2)" })).toHaveCount(1);
  const saved = JSON.parse(readFileSync(join(dir, "設計メモ (2).json"), "utf8"));
  expect(saved.world).toEqual({ title: "設計メモ (2)", theme: "sticky", childView: "flow", madeBy: "user" });
  // リストの箱は写せない（前に写したブックの窓のまま）
  await stage.locator('.mz-node[data-id="user"] > .mz-head').click({ position: { x: 6, y: 6 } });
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  await expect(dlg.locator('[name="caption"]')).toHaveValue("設計メモ (3)");
  await page.keyboard.press("Escape");
});

test("ふつうのページのブックリンク: 窓にブックの題名を出し、押すと移動してよいかを確かめてから移る。キャンセルなら移らない（D29）", async ({ page }) => {
  const idB = new URL(run("open", "-no-browser", "b.json").trim()).searchParams.get("d")!;
  writeFileSync(join(dir, "booklink.json"), JSON.stringify({ nodes: [{ id: 1, caption: "B へ", book: idB, x: 40, y: 40 }], edges: [] }));
  const url = run("open", "-no-browser", "booklink.json").trim();
  await page.goto(url);
  await expect(selected(page)).toHaveText("booklink.json");
  const win = page.locator('.stage:visible .mz-node[data-id="1"] .mz-link-win');
  await expect(win).toHaveAttribute("title", "押すと「b.json」を開きます");
  await expect(page.locator('.stage:visible .mz-node[data-id="1"] > .mz-head')).toHaveClass(/mz-link-book/); // 持ち手が縞（ページリンクと見分ける）
  await win.click();
  const dlg = page.locator(".mz-dlg");
  await expect(dlg).toContainText("ブック「b.json」に移動してよいですか？");
  await dlg.locator("[data-cancel]").click();
  await expect(dlg).toHaveCount(0);
  await expect(selected(page)).toHaveText("booklink.json");
  await win.click();
  await dlg.locator("[data-ok]").click();
  await expect(selected(page)).toHaveText("b.json");
});

test("ページのタブを図へドラッグすると点線の影が付き、落とすとダイアログでリンク先のページと見せ方を選んで、リンクの箱を作る。今見ているタブは出ない（D29）", async ({ page }) => {
  writeFileSync(join(dir, "tabdrag.json"), JSON.stringify({ pages: [{ id: "p2", title: "流れ" }, { id: "p3", title: "画面" }], nodes: [{ id: 1, caption: "表紙", x: 40, y: 40 }, { id: 2, caption: "中", page: "p2" }], edges: [] }));
  await page.goto(run("open", "-no-browser", "tabdrag.json").trim());
  await expect(selected(page)).toHaveText("tabdrag.json");
  const stage = page.locator(".stage:visible");
  const world = (await stage.locator(".mz-world").boundingBox())!;
  const drag = async (name: string, x: number, y: number) => {
    const tab = (await page.locator(".tab-group-current .tab", { hasText: name }).boundingBox())!;
    await page.mouse.move(tab.x + tab.width / 2, tab.y + tab.height / 2);
    await page.mouse.down();
    await page.mouse.move(world.x + x - 40, world.y + y - 40, { steps: 4 });
    await page.mouse.move(world.x + x, world.y + y, { steps: 4 });
  };
  // 今見ているタブ（最初のページ）は出ない
  await drag("tabdrag.json", 400, 300);
  await expect(page.locator(".mz-add-ghost")).toHaveCount(0);
  await page.mouse.up();
  // 「流れ」のタブを図へ運ぶと点線の影。落とすとダイアログ（初めは流れを選んでいる）
  await drag("流れ", 400, 300);
  await expect(page.locator(".mz-add-ghost")).toHaveCount(1);
  await page.mouse.up();
  await expect(page.locator(".mz-add-ghost")).toHaveCount(0);
  const dlg = page.locator(".mz-dlg");
  await expect(dlg.locator("h2")).toHaveText("ページへのリンク");
  await expect(dlg.locator('[aria-selected="true"] .mz-ss-label')).toHaveText("流れ");
  await expect(selected(page)).toHaveText("tabdrag.json"); // ドラッグしたタブへは切り替えない
  // 画面に選び直し、縮図を出さないにして作る
  await dlg.locator(".mz-ss-input").fill("画");
  await dlg.locator(".mz-ss-item", { hasText: "画面" }).click();
  await dlg.locator("label", { hasText: "縮図を出さない" }).click();
  await dlg.locator("[data-ok]").click();
  await expect(dlg).toHaveCount(0);
  const box = stage.locator(".mz-node", { hasText: "画面" });
  await expect(box.locator(":scope > .mz-head")).toHaveClass(/mz-link-icon/);
  await expect.poll(() => JSON.parse(readFileSync(join(dir, "tabdrag.json"), "utf8")).nodes.find((n: { link?: string }) => n.link === "p3")?.linkLook).toBe("icon");
  // キャンセルなら作らない
  await drag("流れ", 600, 300);
  await page.mouse.up();
  await dlg.locator("[data-cancel]").click();
  await expect(stage.locator(".mz-node")).toHaveCount(2);
  await page.locator(".tab-group-current .tab-book .tab-close").click();
});

test("LLM の変更はユーザーの Undo に入らず、見えたら認知してユーザーの履歴に入る。画面の外の箱は、スクロールで見えるまで認知しない。matomezu history に残り、見たら seen（D31）", async ({ page }) => {
  const file = join(dir, "hist.json");
  writeFileSync(file, JSON.stringify({ nodes: [{ id: 1, caption: "見える", x: 40, y: 40 }, { id: 2, caption: "遠く", x: 40, y: 3000 }] }));
  const url = run("open", "-no-browser", "hist.json").trim();
  await page.goto(url);
  const stage = page.locator(".stage:visible");
  await expect(stage.locator('.mz-node[data-id="2"]')).toHaveCount(1);
  const undo = page.locator("#undo");
  await expect(undo).toBeDisabled();
  const write = (caps: [string, string]) => {
    const d = JSON.parse(readFileSync(file, "utf8"));
    d.nodes[0].caption = caps[0];
    d.nodes[1].caption = caps[1];
    writeFileSync(file, JSON.stringify(d));
  };
  // 画面の外の箱だけを変える → 認知しない（Undo は押せないまま）
  write(["見える", "遠くを変えた"]);
  await expect(stage.locator('.mz-node[data-id="2"]')).toContainText("遠くを変えた");
  await page.waitForTimeout(300);
  await expect(undo).toBeDisabled();
  expect(run("history", "hist.json")).not.toContain("seen");
  // スクロールして見えたら認知 → ユーザーの履歴に入り、Undo で戻せる
  await stage.locator('.mz-node[data-id="2"]').scrollIntoViewIfNeeded();
  await expect(undo).toBeEnabled();
  await expect.poll(() => run("history", "hist.json")).toContain("seen");
  await undo.click();
  await expect(stage.locator('.mz-node[data-id="2"]')).toContainText("遠く");
  await expect(stage.locator('.mz-node[data-id="2"]')).not.toContainText("遠くを変えた");
  expect(run("history", "hist.json", "1")).toContain("caption: \"遠く\" -> \"遠くを変えた\"");
});

test("2 つの画面を開いているとき、最後にフォーカスされた画面がカレントになる。閉じた画面は残らない（D30）", async ({ page, context }) => {
  const url = run("open", "-no-browser", "a.json").trim();
  const current = async (p: import("@playwright/test").Page) =>
    (await (await p.request.get(new URL("/api/current", url).href)).json()).client as string;
  // 画面の接続の id（hello）は画面の中にしか無いので、フォーカスを送る要求から読む。
  // ヘッドレスのブラウザではウィンドウのフォーカスが動かないので、focus のイベントを起こしてフォーカスされたことにする
  const idOf = (p: import("@playwright/test").Page) =>
    p.waitForRequest(r => r.url().endsWith("/api/focus")).then(r => (JSON.parse(r.postData() ?? "{}") as { client: string }).client);
  const first = idOf(page);
  await page.goto(url);
  await expect(selected(page)).toHaveText("a.json");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const a = await first;
  await expect.poll(() => current(page)).toBe(a);

  const other = await context.newPage();
  const second = idOf(other);
  await other.goto(url);
  await expect(selected(other)).toHaveText("a.json");
  await other.evaluate(() => window.dispatchEvent(new Event("focus")));
  const b = await second;
  expect(b).not.toBe(a);
  await expect.poll(() => current(page)).toBe(b);

  // 前の画面にフォーカスが戻れば、そちらがカレント
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => current(page)).toBe(a);
  // その画面を閉じたら、残った画面
  await page.close();
  await expect.poll(() => current(other)).toBe(b);
  await other.close();
});

test("見ていないブックを check しても前に出さず、見えない所で並べた要約を返す。開いて表示中の図から作った要約と同じ（D30）", async ({ page }) => {
  await page.goto(run("open", "-no-browser", "a.json").trim());
  await expect(selected(page)).toHaveText("a.json");
  run("open", "-no-browser", "b.json");
  await page.locator(".mz-dlg [data-cancel]").click(); // 届いた b は開かない
  const unseen = run("check", "b.json");
  expect(unseen).toContain("paper");
  await expect(selected(page)).toHaveText("a.json");
  expect(run("check", "a.json")).not.toBe(unseen); // 表示している a は a の要約
  // b を開いてから問い合わせると、表示中の図から作る。見えない所で並べたものと同じになる
  await arrive(page, "b.json");
  await expect(selected(page)).toHaveText("b.json");
  expect(run("check", "b.json")).toBe(unseen);
});

test("ユーザーがボタンを押している間は、要約を作らずに待つ。離すと答える（D30）", async ({ page }) => {
  await page.goto(run("open", "-no-browser", "a.json").trim());
  await expect(selected(page)).toHaveText("a.json");
  await page.mouse.move(5, 300);
  await page.mouse.down();
  let done = false;
  const out = new Promise<string>((ok, ng) => execFile(bin, ["check", "a.json"], { cwd: dir, env: { ...process.env, MATOMEZU_HOME: dir }, encoding: "utf8" },
    (err, stdout) => { done = true; if (err) ng(err); else ok(stdout); }));
  await page.waitForTimeout(800);
  expect(done).toBe(false);
  await page.mouse.up();
  expect(await out).toContain("paper");
});

test("通知: ほかのブックを開く通知は題名と本文のダイアログを出す。キャンセルなら郵便箱に残り、行を押すとダイアログを挟んで開ける（D30）", async ({ page }) => {
  await page.goto(run("open", "-no-browser", "a.json").trim());
  await expect(selected(page)).toHaveText("a.json");
  expect(run("notify", "-title", "図を直しました", "-body", "箱 5 の名前を変えました", "b.json")).toContain("notified");
  const dlg = page.locator(".mz-dlg");
  await expect(dlg.locator("h2")).toHaveText("図を直しました");
  await expect(dlg).toContainText("箱 5 の名前を変えました");
  await dlg.locator("[data-cancel]").click();
  await expect(selected(page)).toHaveText("a.json"); // 切り替えない
  await page.locator("#mail-toggle").click();
  const row = page.locator("#mailbox .mz-mail-row", { hasText: "図を直しました（b.json）" });
  await expect(row).toHaveCount(1);
  await row.click(); // 押しただけでは移らず、ダイアログを挟む
  await expect(dlg.locator("h2")).toHaveText("図を直しました");
  await expect(selected(page)).toHaveText("a.json");
  await dlg.locator("[data-ok]").click();
  await expect(selected(page)).toHaveText("b.json");
  await switchTo(page, "a.json");
  await expect(page.locator("#mailbox .mz-mail-row")).toHaveCount(0); // 開いたら取り除く
  await page.locator("#mail-toggle").click();
});

test("通知: 説明だけの通知は「閉じる」だけのダイアログで、見たら郵便箱に残らない。-mail はダイアログを出さず未読の数だけ増える（D30）", async ({ page }) => {
  await page.goto(run("open", "-no-browser", "a.json").trim());
  await expect(selected(page)).toHaveText("a.json");
  run("notify", "-title", "作業が終わりました", "-body", "1 行目\n2 行目");
  const dlg = page.locator(".mz-dlg");
  await expect(dlg.locator("h2")).toHaveText("作業が終わりました");
  await expect(dlg.locator("[data-cancel]")).toHaveCount(0);
  await dlg.locator("[data-ok]").click();
  await expect(page.locator("#mail-badge")).toHaveText("");
  run("notify", "-mail", "-title", "あとで見てください");
  await expect(page.locator("#mail-badge")).toHaveText("1");
  await expect(dlg).toHaveCount(0);
  await page.locator("#mail-toggle").click();
  const row = page.locator("#mailbox .mz-mail-row", { hasText: "あとで見てください" });
  await expect(row.locator(".mz-mail-chip")).toHaveText("お知らせ");
  await expect(page.locator("#mailbox .mz-mail-row", { hasText: "作業が終わりました" })).toHaveCount(0); // ダイアログで見たものは残らない
  await row.click();
  await dlg.locator("[data-ok]").click();
  await expect(row).toHaveCount(0);
  await page.locator("#mail-toggle").click();
});

test("通知はカレントの画面にだけ届く。画面が無ければ断る（D30）", async ({ page, context }) => {
  await page.goto(run("open", "-no-browser", "a.json").trim());
  await expect(selected(page)).toHaveText("a.json");
  const other = await context.newPage();
  await other.goto(page.url());
  await expect(selected(other)).toHaveText("a.json");
  await page.evaluate(() => window.dispatchEvent(new Event("focus"))); // ヘッドレスではフォーカスが動かないので起こす
  await expect.poll(async () => (await (await page.request.get(new URL("/api/current", page.url()).href)).json()).client).not.toBe("");
  // focus の知らせが届いてから送る
  await page.waitForTimeout(200);
  run("notify", "-title", "こちらにだけ");
  await expect(page.locator(".mz-dlg h2")).toHaveText("こちらにだけ");
  await other.waitForTimeout(300);
  await expect(other.locator(".mz-dlg")).toHaveCount(0);
  await page.locator(".mz-dlg [data-ok]").click();
  await other.close();
});

test("郵便箱は、欄を開いて題名が見えただけでは読んだことにしない。行を押して中身を見たら読んだことになる（2026-10-15）", async ({ page }) => {
  await page.goto(run("open", "-no-browser", "a.json").trim());
  await expect(selected(page)).toHaveText("a.json");
  await page.locator("#mail-toggle").click();
  await expect(page.locator("#mail-toggle")).toHaveAttribute("aria-pressed", "true");
  run("notify", "-mail", "-title", "欄が開いている所に届いた");
  run("notify", "-mail", "-title", "b を開ける知らせ", "b.json");
  const info = page.locator("#mailbox .mz-mail-row", { hasText: "欄が開いている所に届いた" });
  const book = page.locator("#mailbox .mz-mail-row", { hasText: "b を開ける知らせ" });
  await expect(info).toHaveClass(/mz-unread/);
  await expect(book).toHaveClass(/mz-unread/);
  await expect(page.locator("#mail-badge")).toHaveText("2");
  // 開く動きのある通知: 中身を見たら読んだことになり、キャンセルなら残る
  await book.click();
  await page.locator(".mz-dlg [data-cancel]").click();
  await expect(book).not.toHaveClass(/mz-unread/);
  await expect(page.locator("#mail-badge")).toHaveText("1");
  // 説明だけの通知: 中身を見たら取り除く
  await info.click();
  await page.locator(".mz-dlg [data-ok]").click();
  await expect(info).toHaveCount(0);
  await expect(page.locator("#mail-badge")).toHaveText("");
  await book.locator(".mz-mail-del").click();
  await page.locator("#mail-toggle").click();
});

test("通知のダイアログは順番待ち: 開いているダイアログを押しのけず、閉じたら次を出す。待っている間に郵便箱で見た分は出さない（2026-10-15）", async ({ page }) => {
  await page.goto(run("open", "-no-browser", "a.json").trim());
  await expect(selected(page)).toHaveText("a.json");
  const dlg = page.locator(".mz-dlg");
  run("notify", "-title", "1 つ目");
  await expect(dlg.locator("h2")).toHaveText("1 つ目");
  run("notify", "-title", "2 つ目");
  run("notify", "-title", "3 つ目");
  await expect(page.locator("#mail-badge")).toHaveText("2"); // 待っている間は未読
  await page.waitForTimeout(300);
  await expect(dlg.locator("h2")).toHaveText("1 つ目"); // 押しのけない
  await dlg.locator("[data-ok]").click();
  await expect(dlg.locator("h2")).toHaveText("2 つ目");
  // 3 つ目は、待っている間にほかから読まれた（ダイアログは画面を覆うので、別の画面などから。ここではサーバーに直接）。2 つ目を閉じても出さない
  const base = new URL(`d/${new URL(page.url()).searchParams.get("d")}/api/mail`, page.url()).href;
  const items = (await (await page.request.get(base)).json()).items as { id: string; body: { title?: string } }[];
  const third = items.find(i => i.body.title === "3 つ目")!;
  await page.request.post(`${base}/${third.id}/read`, { data: {} });
  await dlg.locator("[data-ok]").click();
  await page.waitForTimeout(300);
  await expect(dlg).toHaveCount(0);
  await expect(page.locator("#mail-badge")).toHaveText("");
});

test("マスターを見ている最中に check・history で問い合わせても、マスターは作り直さず、箱が動かない（2026-10-15）", async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 });
  await page.goto(run("open", "-no-browser", "a.json").trim());
  await page.locator("#master").click();
  await expect(selected(page)).toHaveText("マスター");
  const ai = page.locator('.stage:visible .mz-node[data-id="ai"]');
  await expect(ai).toBeVisible();
  const before = await ai.evaluate(el => (el as HTMLElement).style.cssText);
  const books = new Set<string>();
  page.on("request", r => { if (r.url().endsWith("/api/books")) books.add(r.url()); });
  run("check", "b.json");
  run("history", "a.json");
  await page.waitForTimeout(500);
  expect(books.size).toBe(0); // 一覧を取り直していない（ブックの一覧が変わった知らせが出ていない）
  expect(await ai.evaluate(el => (el as HTMLElement).style.cssText)).toBe(before);
  await expect(selected(page)).toHaveText("マスター");
});

test("サーバーを入れ替えても、最後にフォーカスされた画面がカレントのまま（あとからつながった画面にならない。D30）", async ({ page, context }) => {
  // ヘッドレスではどの画面も「フォーカスがある」と答えるので、無いことにして、フォーカスは focus のイベントでだけ起こす
  await context.addInitScript(() => { document.hasFocus = () => false; });
  const url = run("open", "-no-browser", "a.json").trim();
  await page.goto(url);
  await expect(selected(page)).toHaveText("a.json");
  const other = await context.newPage();
  await other.goto(url);
  await expect(selected(other)).toHaveText("a.json");
  const idOf = (p: import("@playwright/test").Page) =>
    p.waitForRequest(r => r.url().endsWith("/api/focus")).then(r => (JSON.parse(r.postData() ?? "{}") as { client: string }).client);
  const first = idOf(page);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await first;
  // サーバーを止めて起こし直す。つなぎ直した page は、前にフォーカスされた時刻を新しい id で送る
  const again = idOf(page);
  run("stop");
  run("open", "-no-browser", "a.json");
  const id = await again;
  // other は確実にあとからつながらせる（読み直す）。一度もフォーカスされていないので、カレントにはならない
  await other.reload();
  await expect(selected(other)).toHaveText("a.json");
  const current = async () => (await (await page.request.get(new URL("/api/current", url).href)).json()).client as string;
  await page.waitForTimeout(500);
  expect(await current()).toBe(id);
  await other.close();
});

test("紙からはみ出す set は書かずにエラー（どの箱がどれだけはみ出すかと手段）。紙の外に箱があれば check はエラーで終わる。画面が無ければ set は断る（D33）", async ({ page }) => {
  writeFileSync(join(dir, "p.json"), JSON.stringify({ world: { paper: "a5-landscape" }, nodes: [{ id: 1, caption: "箱", x: 40, y: 40 }], edges: [] }));
  await page.goto(run("open", "-no-browser", "p.json").trim());
  await expect(selected(page)).toHaveText("p.json");
  const before = readFileSync(join(dir, "p.json"), "utf8");
  // 紙（A5 横 794 × 559）の右の外へ動かす
  let err = "";
  try { run("set", "p.json", "1.x=900"); } catch (e) { err = String((e as { stderr?: string }).stderr ?? e); }
  expect(err).toContain("not written");
  expect(err).toContain("off the paper");
  expect(err).toContain("#1 箱");
  expect(err).toContain("larger paper");
  expect(readFileSync(join(dir, "p.json"), "utf8")).toBe(before);
  // 収まる set は書ける
  expect(run("set", "p.json", "1.x=200")).toContain("written");
  // ファイルを直接書かれて紙の外に箱があると、check は要約を出したうえでエラー
  writeFileSync(join(dir, "p.json"), JSON.stringify({ world: { paper: "a5-landscape" }, nodes: [{ id: 1, caption: "箱", x: 900, y: 40 }], edges: [] }));
  await expect.poll(() => page.locator('.stage:visible .mz-node[data-id="1"]').evaluate(el => (el as HTMLElement).style.left)).toBe("900px");
  let out = "";
  try { run("check", "p.json"); } catch (e) { out = String((e as { stdout?: string }).stdout ?? "") + String((e as { stderr?: string }).stderr ?? ""); }
  expect(out).toContain("paper a5-landscape 794x559");
  expect(out).toContain("off the paper");
  // 画面が無ければ set は断る
  run("stop");
  err = "";
  try { run("set", "p.json", "1.x=100"); } catch (e) { err = String((e as { stderr?: string }).stderr ?? e); }
  expect(err).toContain("matomezu open");
});

// matomezu が誤りで終わったときの出力（run は誤りで例外を投げる）
const fails = (...args: string[]) => {
  try { run(...args); } catch (e) { return String((e as { stderr?: string }).stderr ?? e); }
  throw new Error(`matomezu ${args.join(" ")} did not fail`);
};

test("フォーカス枠: 今のブックの箱をデータに書かずに枠で示し、箱の大きさは変えない。反応（Esc・図を押す）までは次を断り、手すきでなければ断る。別のページへは移る（D37）", async ({ page }) => {
  writeFileSync(join(dir, "c.json"), JSON.stringify({
    world: { paper: "a3-landscape" }, pages: [{ id: "p2", title: "2枚目" }],
    nodes: [{ id: 1, caption: "表の箱" }, { id: 2, caption: "裏の箱", page: "p2" }],
  }));
  await page.goto(run("open", "-no-browser", "c.json").trim());
  await expect(selected(page)).toHaveText("c.json");
  const box = page.locator(".stage:visible .mz-node[data-id='1']");
  const before = await box.boundingBox();
  const file = readFileSync(join(dir, "c.json"), "utf8");
  expect(run("focus", "c.json", "1")).toContain("shown");
  const frame = page.locator(".stage:visible .mz-point");
  await expect(frame).toHaveCount(1);
  const f = (await frame.boundingBox())!, b = (await box.boundingBox())!;
  expect(f.x).toBeLessThan(b.x);
  expect(f.x + f.width).toBeGreaterThan(b.x + b.width);
  expect(b).toEqual(before); // 箱の大きさ・位置は変わらない
  expect(readFileSync(join(dir, "c.json"), "utf8")).toBe(file); // データにも書かない
  expect(run("check", "c.json")).toContain("focus: box 1 is shown; the user has not responded yet");
  expect(fails("focus", "c.json", "2")).toContain("has not responded to the previous focus");
  await page.keyboard.press("Escape");
  await expect(frame).toHaveCount(0);
  expect(run("check", "c.json")).toContain("focus: the user responded to box 1 (the frame is closed)");
  // 別のページの箱: そのページへ移って示す。図を押すと消える
  run("focus", "c.json", "2");
  await expect(selected(page)).toHaveText("2枚目");
  await expect(frame).toHaveCount(1);
  await page.locator(".stage:visible").click({ position: { x: 5, y: 5 } });
  await expect(frame).toHaveCount(0);
  // 手すきでない（ダイアログが開いている）なら断る。消えた箱は示せない
  await page.locator("#book").click();
  await expect(page.locator(".mz-dlg")).toHaveCount(1);
  expect(fails("focus", "c.json", "1")).toContain("the user is operating the screen");
  await page.locator(".mz-dlg [data-cancel]").click(); // Esc は F27（ダイアログの中にフォーカスが移らないことがある）
  await expect(page.locator(".mz-dlg")).toHaveCount(0);
  expect(fails("focus", "c.json", "99")).toContain("no box 99");
  // -clear で AI が自分で消す
  run("focus", "c.json", "1");
  await expect(selected(page)).toHaveText("c.json");
  await expect(frame).toHaveCount(1);
  expect(run("focus", "-clear")).toContain("cleared");
  await expect(frame).toHaveCount(0);
});

test("フォーカス枠: ほかのブックの箱は移るかを確かめる。答えるまでは次を断り、キャンセルは check に出る。移動を押すと移って示す。-mail は郵便箱から開くと示す（D37）", async ({ page }) => {
  await page.goto(run("open", "-no-browser", "a.json").trim());
  await expect(selected(page)).toHaveText("a.json");
  expect(run("focus", "b.json", "5")).toContain("asked the user");
  const dlg = page.locator(".mz-dlg");
  await expect(dlg).toContainText(/ブック「b.json」の「.*トップ画面」を示しています/); // 前のテストが名前を変えていることがある
  expect(fails("focus", "a.json", "1")).toMatch(/has not responded|operating the screen/);
  await dlg.locator("[data-cancel]").click();
  await expect(selected(page)).toHaveText("a.json");
  expect(run("check", "b.json")).toContain("focus: the user declined to move to box 5");
  run("focus", "b.json", "5");
  await dlg.locator("[data-ok]").click();
  await expect(selected(page)).toHaveText("b.json");
  const frame = page.locator(".stage:visible .mz-point");
  await expect(frame).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(frame).toHaveCount(0);
  // 郵便: 入れるだけで、開くと示す（反応待ちの枠があっても入れられる）
  run("focus", "b.json", "12");
  expect(run("focus", "-mail", "-title", "ここを見てください", "a.json", "7")).toContain("mailbox");
  await expect(page.locator("#mail-badge")).toHaveText("1");
  await page.locator("#mail-toggle").click();
  await page.locator("#mailbox .mz-mail-row", { hasText: "ここを見てください" }).click();
  await dlg.locator("[data-ok]").click();
  await expect(selected(page)).toHaveText("a.json");
  await expect(frame).toHaveCount(1);
  await page.locator("#mail-toggle").click();
  await page.keyboard.press("Escape");
  await expect(frame).toHaveCount(0);
});

test("AI の問い: 吹き出しを A・B で出し（データにも箱の大きさにも触らない）、答え・隠す・開くはサーバーに残る。話題が残る間は次の問いもフォーカスも断り、-end で消える（D36）", async ({ page }) => {
  await page.goto(run("open", "-no-browser", "a.json").trim());
  await expect(selected(page)).toHaveText("a.json");
  const web = page.locator(".stage:visible .mz-node[data-id='2']");
  const before = await web.boundingBox();
  const file = readFileSync(join(dir, "a.json"), "utf8");
  const spec = JSON.stringify({ items: [
    { box: "2", text: "Webは残す？", choices: ["はい", "いいえ"] },
    { box: "5", choices: ["了承する"] },
    { box: "9", text: "あとで名前を直します" },
  ] });
  expect(run("ask", "a.json", spec)).toContain("shown");
  const bubbles = page.locator(".stage:visible .mz-ask-bubble:visible");
  await expect(bubbles).toHaveCount(3);
  await expect(bubbles.locator(".mz-ask-id")).toHaveText(["A", "B", "C"]);
  expect(await web.boundingBox()).toEqual(before);
  expect(readFileSync(join(dir, "a.json"), "utf8")).toBe(file);
  const palette = page.locator("#ask-palette");
  await expect(palette).toBeVisible();
  await expect(palette.locator(".ask-count")).toHaveText("0 / 3");
  // 話題が残る間は、次の問いもフォーカスも断る
  expect(fails("ask", "a.json", spec)).toContain("still open");
  expect(fails("focus", "a.json", "1")).toContain("still open");
  // A に答える
  await bubbles.filter({ hasText: "Webは残す？" }).locator("[data-choice='はい']").click();
  await expect(palette.locator(".ask-count")).toHaveText("1 / 3");
  await expect(palette.locator("button.ask-done")).toHaveText("A");
  expect(run("ask", "-status")).toMatch(/1 \(A\) box 2, bubble: answered \["はい"\]/);
  // B を隠すと印に縮み、印を押すと戻る。AI からも閉じられる
  const b = bubbles.filter({ hasText: "了承する" });
  await b.locator("[data-hide]").click();
  const markB = page.locator(".stage:visible .mz-ask-mark:visible", { hasText: "B" });
  await expect(markB).toHaveCount(1);
  expect(run("ask", "-status")).toContain("2 (B) box 5, bubble: hidden");
  await markB.click();
  await expect(bubbles).toHaveCount(2);
  run("ask", "-hide", "B");
  await expect(markB).toHaveCount(1);
  run("ask", "-show", "2");
  await expect(bubbles).toHaveCount(2);
  // ボタンの無い C は × で見た
  await bubbles.filter({ hasText: "あとで名前を直します" }).locator("[data-seen]").click();
  expect(run("ask", "-status")).toContain("3 (C) box 9, bubble: seen");
  expect(run("check", "a.json")).toContain("ask: 2 of 3 questions responded");
  // 図を押しても消えない
  await page.locator(".stage:visible").click({ position: { x: 5, y: 5 } });
  await expect(bubbles).toHaveCount(1);
  expect(run("ask", "-end")).toContain("ended");
  await expect(bubbles).toHaveCount(0);
  await expect(palette).toBeHidden();
  expect(run("ask", "-status")).toContain("no topic");
});

test("AI の問い: 長いものはドロワーの印になる。ほかのブックは移るかを確かめ、キャンセルは -status に出る。ページをまたぐ問い・無い箱は断る（D36）", async ({ page }) => {
  await page.goto(run("open", "-no-browser", "a.json").trim());
  await expect(selected(page)).toHaveText("a.json");
  const long = JSON.stringify({ items: [{ box: "5", text: "トップ画面は残しますか？ほかの画面とまとめますか？", choices: ["残す", "まとめる"] }] });
  expect(run("ask", "b.json", long)).toContain("asked the user");
  const dlg = page.locator(".mz-dlg");
  await expect(dlg).toContainText("1 件の問い");
  await dlg.locator("[data-cancel]").click();
  await expect(selected(page)).toHaveText("a.json");
  expect(run("ask", "-status")).toContain("the user declined to move");
  run("ask", "-end");
  // 今のブックの長い問いはドロワー行き: 吹き出しは出さず、印（1 つなので ≡）
  expect(run("ask", "a.json", JSON.stringify({ items: [{ box: "2", text: "Webの画面はスマホでも同じ並びで見せますか？それとも縦に積みますか？" }] }))).toContain("drawer");
  await expect(page.locator(".stage:visible .mz-ask-bubble:visible")).toHaveCount(0);
  await expect(page.locator(".stage:visible .mz-ask-mark:visible")).toHaveText("≡");
  run("ask", "-end");
  expect(fails("ask", "a.json", JSON.stringify({ items: [{ box: "99", text: "これは？" }] }))).toContain("no box 99");
  expect(run("ask", "-status")).toContain("no topic"); // 断った話題は残らない
});

test("AI の問い: ドロワーは複数選択と文字で答えられ、答えないも選べる。答えたら閉じてパレットで線が引かれる（D36）", async ({ page }) => {
  await page.goto(run("open", "-no-browser", "a.json").trim());
  await expect(selected(page)).toHaveText("a.json");
  run("ask", "a.json", JSON.stringify({ items: [
    { box: "2", text: "Webで使う画面を選んでください", choices: ["一覧", "詳細", "設定"], multi: true, input: true },
    { box: "5", text: "APIの公開範囲について、社内だけにするか外部にも出すかを決めたいです。どちらにしますか？", choices: ["社内", "外部"] },
  ] }));
  const palette = page.locator("#ask-palette");
  await expect(palette.locator("button.ask-drawer")).toHaveCount(2);
  await page.locator(".stage:visible .mz-ask-mark", { hasText: "A" }).click();
  const drawer = page.locator(".mz-ask-drawer");
  await expect(drawer).toBeVisible();
  await expect(drawer.locator("[data-ok]")).toBeDisabled();
  await drawer.getByLabel("一覧").check();
  await drawer.getByLabel("設定").check();
  await drawer.locator("textarea").fill("詳細はあとで");
  await drawer.locator("[data-ok]").click();
  await expect(drawer).toBeHidden();
  expect(run("ask", "-status")).toContain(`1 (A) box 2, drawer: answered ["一覧","設定"] note "詳細はあとで"`);
  await palette.locator("button", { hasText: "B" }).click();
  await expect(drawer).toContainText("APIの公開範囲");
  await drawer.locator("[data-decline]").click();
  expect(run("ask", "-status")).toContain("2 (B) box 5, drawer: declined");
  await expect(palette.locator(".ask-count")).toHaveText("2 / 2");
  run("ask", "-end");
  await expect(palette).toBeHidden();
});

test("フォーカスの簡易メッセージ: -say は枠と吹き出しを出し、図を押すと一緒に消える。-button は 1 問の話題になり、押した答えが -status に出る。長すぎれば断る（D36）", async ({ page }) => {
  await page.goto(run("open", "-no-browser", "a.json").trim());
  await expect(selected(page)).toHaveText("a.json");
  run("focus", "-say", "ここを直しました", "a.json", "5");
  const frame = page.locator(".stage:visible .mz-point");
  const bubbles = page.locator(".stage:visible .mz-ask-bubble:visible");
  await expect(frame).toHaveCount(1);
  await expect(bubbles).toHaveText(/ここを直しました/);
  await page.locator(".stage:visible").click({ position: { x: 5, y: 5 } });
  await expect(frame).toHaveCount(0);
  await expect(bubbles).toHaveCount(0);
  expect(run("check", "a.json")).toContain("focus: the user responded to box 5");
  expect(fails("focus", "-say", "この箱の名前は長すぎるので短くしてもよいですか", "a.json", "5")).toContain("too long for a bubble");
  expect(run("focus", "-say", "名前を変えます", "-button", "了承する", "a.json", "5")).toContain("ask -status");
  await expect(frame).toHaveCount(1);
  await expect(page.locator("#ask-palette")).toBeVisible();
  expect(fails("focus", "a.json", "1")).toContain("still open");
  await bubbles.locator("[data-choice='了承する']").click();
  expect(run("ask", "-status")).toContain(`1 box 5, bubble: answered ["了承する"]`);
  run("ask", "-end");
  await expect(frame).toHaveCount(0);
  await expect(bubbles).toHaveCount(0);
});

test("AI の問い: リストの中でスクロールして見えなくなった行の吹き出しは、リストの外へ飛ばずに印になってリストの端に寄る。パレットを押すとその行までスクロールして吹き出しを見せる（D36）", async ({ page }) => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ id: 20 + i, parent: 1, caption: `行 ${i + 1}` }));
  writeFileSync(join(dir, "d.json"), JSON.stringify({
    world: { paper: "a3-landscape" },
    nodes: [{ id: 1, caption: "リスト", childView: "list", listHeight: 200, width: 200, x: 300, y: 200 }, ...rows],
  }));
  await page.goto(run("open", "-no-browser", "d.json").trim());
  await expect(selected(page)).toHaveText("d.json");
  run("ask", "d.json", JSON.stringify({ items: [{ box: "20", text: "1行目？", choices: ["はい"] }, { box: "31", text: "最後の行？", choices: ["はい"] }] }));
  const list = page.locator(".stage:visible .mz-node[data-id='1']");
  const lb = (await list.boundingBox())!;
  const bubble = (text: string) => page.locator(".stage:visible .mz-ask-bubble:visible", { hasText: text });
  await expect(bubble("1行目？")).toHaveCount(1);
  await expect(bubble("最後の行？")).toHaveCount(0); // 最後の行はリストの中で見えていない
  const markB = page.locator(".stage:visible .mz-ask-mark:visible", { hasText: "B" });
  const mb = (await markB.boundingBox())!;
  expect(mb.y).toBeLessThan(lb.y + lb.height + 12); // リストの下の端に寄る（下へ飛ばない）
  await page.locator("#ask-palette button", { hasText: "B" }).click();
  await expect(bubble("最後の行？")).toHaveCount(1);
  await expect(bubble("1行目？")).toHaveCount(0); // 1 行目はスクロールで隠れた
  run("ask", "-end");
});

test("AI の問い: リストをスクロールすると、付け根が隠れた行の吹き出しは印に縮み（リストの外に取り残さない）、印を押すとその行まで戻して吹き出しを出す（D36）", async ({ page }) => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ id: 20 + i, parent: 1, caption: `行 ${i + 1}` }));
  writeFileSync(join(dir, "d.json"), JSON.stringify({
    world: { paper: "a3-landscape" },
    nodes: [{ id: 1, caption: "リスト", childView: "list", listHeight: 200, width: 200, x: 300, y: 200 }, ...rows],
  }));
  await page.goto(run("open", "-no-browser", "d.json").trim());
  await expect(selected(page)).toHaveText("d.json");
  run("ask", "d.json", JSON.stringify({ items: [{ box: "21", text: "2行目？", choices: ["はい"] }, { box: "20", text: "1行目？", choices: ["はい"] }] }));
  const bubble = (text: string) => page.locator(".stage:visible .mz-ask-bubble:visible", { hasText: text });
  await expect(bubble("1行目？")).toHaveCount(1);
  await expect(bubble("2行目？")).toHaveCount(1);
  const kids = page.locator(".stage:visible .mz-node[data-id='1'] .mz-list-kids").first();
  const lb = (await kids.boundingBox())!;
  // 1 行目が隠れるまでスクロール（付け根の辺がどれも見えない）
  const row1 = (await page.locator(".stage:visible .mz-node[data-id='20']").boundingBox())!;
  await kids.evaluate((el, h) => { el.scrollTop = h + 4; }, row1.height);
  await expect(bubble("1行目？")).toHaveCount(0);
  const markB = page.locator(".stage:visible .mz-ask-mark:visible", { hasText: "B" });
  await expect(markB).toHaveCount(1);
  const mb = (await markB.boundingBox())!;
  expect(mb.y + mb.height).toBeGreaterThan(lb.y - 16); // リストの上の端に寄っている（取り残されない）
  expect(mb.y).toBeLessThan(lb.y + 16);
  await markB.click();
  await expect(bubble("1行目？")).toHaveCount(1);
  expect(await kids.evaluate(el => el.scrollTop)).toBe(0);
  run("ask", "-end");
});

test("AI の問い: ドロワーを開くと、その問いの印がドロワーに隠れない所に来る。パレットでほかの問いを押すとドロワーは閉じる（D36）", async ({ page }) => {
  writeFileSync(join(dir, "w.json"), JSON.stringify({
    world: { paper: "a3-landscape" },
    nodes: [{ id: 1, caption: "幅の広い箱", width: 1000, height: 120, x: 200, y: 300 }, { id: 2, caption: "小さな箱", x: 200, y: 100 }],
  }));
  await page.goto(run("open", "-no-browser", "w.json").trim());
  await expect(selected(page)).toHaveText("w.json");
  run("ask", "w.json", JSON.stringify({ items: [
    { box: "1", text: "この箱の中身を、もっと短くまとめてもよいですか？ 長い説明は別のページに移します。", choices: ["はい", "いいえ"] },
    { box: "2", text: "小さい？", choices: ["はい"] },
  ] }));
  await page.locator("#ask-palette button", { hasText: "A" }).click();
  const drawer = page.locator(".mz-ask-drawer");
  await expect(drawer).toBeVisible();
  const markA = page.locator(".stage:visible .mz-ask-mark", { hasText: "A" });
  await expect(async () => {
    const m = (await markA.boundingBox())!, d = (await drawer.boundingBox())!;
    expect(m.x + m.width).toBeLessThanOrEqual(d.x);
  }).toPass();
  await page.locator("#ask-palette button", { hasText: "B" }).click();
  await expect(drawer).toBeHidden();
  run("ask", "-end");
});
