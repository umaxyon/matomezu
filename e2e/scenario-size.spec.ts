// シナリオ: 箱の大きさ（D44。docs/BOX-SIZE-plan.md）と紙（D33。docs/PAPER-plan.md）を、LLM（CLI）とユーザー（画面）の往復で通して確かめる。
// 本物のフォント（同梱の Noto Sans JP）と CSS で測るので、単体テスト（偽の測り方）では確かめられない所（折り返し・行数の切り捨て・テーマ）もここで見る。
// テストごとに自分のサーバーと状態のフォルダを持つ（e2e/server.ts の testServer）。画面が書き戻した大きさを、そのたびに CLI の validate で検査し直す
import { readFileSync } from "node:fs";
import { type Page, expect, test } from "@playwright/test";
import { choose, confirmDialog, openBoxDialog, rect, select, violations } from "./helpers";
import { type TestServer, testServer } from "./server";
import { BASE_MIN } from "../web/src/size-rules";

let s: TestServer;
test.beforeEach(() => { s = testServer(); });
test.afterEach(async ({ page }) => {
  expect(await violations(page)).toEqual([]);
  s.stop();
});

type Node = { id: number; page?: string; width?: number; height?: number; fixedWidth?: boolean; fixedHeight?: boolean; [k: string]: unknown };
type Book = { world?: Record<string, unknown>; pages?: { id: string; title?: string; world?: Record<string, unknown> }[]; nodes: Node[] };

const read = (file: string) => JSON.parse(readFileSync(file, "utf8")) as Book;
const nodeOf = (file: string, id: number) => read(file).nodes.find(n => n.id === id)!;
const node = (page: Page, id: number) => page.locator(`.stage:visible .mz-node[data-id="${id}"]`);
const head = (page: Page, id: number) => node(page, id).locator(":scope > .mz-head");
// LLM が JSON を書いたあとと同じ検査（DOM の無い CLI が、画面と同じ表で確かめる。CLAUDE.md の 16）
const validate = (file: string) => expect(s.run("validate", file).trim()).toBe("ok");
// set（誤りなら例外。断られた理由は stderr）
const set = (file: string, ...kv: string[]) => s.run("set", file, ...kv);
function refusedSet(file: string, ...kv: string[]): string {
  try {
    set(file, ...kv);
  } catch (e) {
    const err = e as { stderr?: string; stdout?: string; message: string };
    return `${err.stderr ?? ""}${err.stdout ?? ""}`;
  }
  throw new Error(`set was not refused: ${kv.join(" ")}`);
}

// 図をこのテストのサーバーで開く（LLM の open と同じ。返った URL をユーザーが開く）
async function open(page: Page, name: string, data: Book): Promise<string> {
  const file = s.write(name, data);
  const url = s.run("open", "-no-browser", file).trim().split("\n")[0]!;
  await page.goto(url);
  await expect(page.locator(".stage:visible .mz-world")).toHaveCount(1);
  await page.evaluate(() => document.fonts.ready);
  return file;
}

// 箱の右の縁のつまみ（リストの幅・本文の幅）を dx だけドラッグする
async function dragGrip(page: Page, id: number, grip: ".mz-width-grip" | ".mz-body-grip", dx: number) {
  const g = head(page, id).locator(`:scope > ${grip}`);
  await expect(g).toBeVisible();
  const b = (await g.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2, { steps: Math.max(1, Math.ceil(Math.abs(dx) / 10)) });
  await page.mouse.up();
}

// 画面に描いている箱の大きさが、ファイルの width・height と一致するまで待つ（画面が書き戻したのを確かめる）
async function fileMatchesScreen(page: Page, file: string, ids: number[]) {
  for (const id of ids) {
    const r = await rect(page, id);
    await expect.poll(() => { const n = nodeOf(file, id); return [n.width, n.height]; }, { message: `#${id}` })
      .toEqual([Math.round(r.w), Math.round(r.h)]);
  }
}

// ---------------------------------------------------------------------------------------------
// シナリオ 2: 画面が書いた大きさを CLI が検査し直す

const LIST = 10, A = 11, B = 12, GROUP = 1, KID = 2, CLASS = 30, LINK = 40, MEMO = 50, LEAF = 60, ROOT = 20;
const BODY = "メールアドレスとパスワードで入る。失敗が 5 回続いたら 10 分ロックする。";
const book = (): Book => ({
  world: { paper: "a4-landscape" },
  pages: [{ id: "p2", title: "組織", world: { childView: "tree", root: ROOT } }],
  nodes: [
    { id: GROUP, caption: "グループ", x: 40, y: 40 },
    { id: KID, parent: GROUP, caption: "中の箱" },
    { id: 3, parent: GROUP, caption: "もう 1 つ" },
    { id: LIST, caption: "一覧", childView: "list", x: 340, y: 40 },
    { id: A, parent: LIST, caption: "短い" },
    { id: B, parent: LIST, caption: "少し長めの項目の名前" },
    { id: CLASS, shape: "class", caption: "User", x: 40, y: 320, attrs: [{ name: "id", type: "int" }], ops: [{ name: "save" }] },
    { id: LINK, caption: "組織図", link: "p2", x: 340, y: 320 },
    { id: MEMO, caption: "ログイン画面", size: "L", bodyWidth: 160, body: BODY, x: 700, y: 40 },
    { id: LEAF, caption: "単独の箱", x: 700, y: 400 },
    { id: ROOT, page: "p2", caption: "社長" },
    { id: 21, parent: ROOT, caption: "開発部" },
    { id: 22, parent: ROOT, caption: "営業部" },
  ],
});
const FIRST_PAGE = [GROUP, KID, 3, LIST, A, B, CLASS, LINK, MEMO, LEAF];

test("画面が書いた大きさを CLI が検査し直す: 全部の箱が width・height を持ち、固定の印は固定した箱だけ。set の width で固定し、空にすると外れて戻る（D44）", { tag: "@d44" }, async ({ page }) => {
  const file = await open(page, "size.json", book());
  // 開いたときの計算の書き戻し: 最初のページの全部の箱が今の大きさを持つ
  await fileMatchesScreen(page, file, FIRST_PAGE);
  validate(file);

  // リストの子は同じ幅で、リストの幅いっぱい（本物のフォントで測った幅でもそろう）
  const sameWidth = async () => {
    const [l, a, b] = await Promise.all([rect(page, LIST), rect(page, A), rect(page, B)]);
    expect(a.w).toBe(b.w);
    expect(a.w + 24).toBe(l.w);
  };
  await sameWidth();

  // ユーザーがリストの幅のつまみで広げる → リストだけが幅の固定になる
  const listBefore = await rect(page, LIST);
  await head(page, LIST).click({ position: { x: 20, y: 10 } }); // 見出しを押して選ぶ（真ん中には子がある）
  await expect(node(page, LIST)).toHaveClass(/mz-current/);
  await dragGrip(page, LIST, ".mz-width-grip", 80);
  await expect.poll(async () => (await rect(page, LIST)).w).toBeGreaterThan(listBefore.w + 60);
  await sameWidth(); // 子もついてくる
  await expect.poll(() => nodeOf(file, LIST).fixedWidth).toBe(true);
  // ユーザーがダイアログで単独の箱のサイズを L にする（段を変えるだけで、固定にはしない）
  await choose(page, LEAF, "size", "L");
  await expect.poll(() => nodeOf(file, LEAF).size).toBe("L");
  await fileMatchesScreen(page, file, FIRST_PAGE);

  // ファイルを読む: 全部の箱が整数の width・height を持ち、固定の印はリストの幅だけ
  // （2 枚目のページの箱は、そのページで操作するまで書かれない。下の fixme のテスト）
  const data = read(file);
  for (const n of data.nodes.filter(n => FIRST_PAGE.includes(n.id))) {
    expect(Number.isInteger(n.width) && Number.isInteger(n.height), `#${n.id} ${n.width}x${n.height}`).toBe(true);
    expect(n.width!).toBeGreaterThanOrEqual(64); // 土台の最小（4.8）
    expect(n.height!).toBeGreaterThanOrEqual(44);
  }
  expect(data.nodes.filter(n => "fixedWidth" in n || "fixedHeight" in n).map(n => [n.id, n.fixedWidth, n.fixedHeight]))
    .toEqual([[LIST, true, undefined]]);
  validate(file);

  // LLM が set で width を書く → 固定の印が自動で付き、画面がその幅で描いて、決まりの範囲の値を書き戻す
  const leafBefore = await rect(page, LEAF);
  set(file, `${LEAF}.width=200`);
  await expect.poll(() => nodeOf(file, LEAF).fixedWidth).toBe(true);
  await expect.poll(async () => (await rect(page, LEAF)).w).toBe(200);
  await fileMatchesScreen(page, file, [LEAF]);
  validate(file);
  // width を空にすると固定の印も外れ、画面が中身に合わせて計算し直した幅に戻る
  set(file, `${LEAF}.width=`);
  await expect.poll(async () => (await rect(page, LEAF)).w).toBe(leafBefore.w);
  await expect.poll(() => nodeOf(file, LEAF).width).toBe(Math.round(leafBefore.w));
  expect("fixedWidth" in nodeOf(file, LEAF)).toBe(false);
  validate(file);
});

// 固定の width・height も土台の最小（size-rules.ts の BASE_MIN）を下回らない（CLAUDE.md の 17）。前はそのまま描いて書き戻していた（残課題図の H3）
test("set で土台の最小より小さい width・height を書いても、画面は最小（64 × 44）に収めて描き、その値を書き戻す（D44）", { tag: "@d44" }, async ({ page }) => {
  const file = await open(page, "min.json", book());
  await fileMatchesScreen(page, file, [LEAF]);
  set(file, `${LEAF}.width=10`, `${LEAF}.height=10`);
  await expect.poll(async () => { const r = await rect(page, LEAF); return [r.w, r.h]; }).toEqual([BASE_MIN.w, BASE_MIN.h]);
  await expect.poll(() => { const n = nodeOf(file, LEAF); return [n.width, n.height, n.fixedWidth, n.fixedHeight]; }).toEqual([BASE_MIN.w, BASE_MIN.h, true, true]);
  validate(file);
});

// 不具合の候補（2026-10-18 に見つけた。直すまで fixme）: 2 枚目のページ（ここではツリー）の箱は、開いたときも、そのページのタブを前に出して描いたときも
// width・height が書き戻されない。そのページで何かを操作して保存したときに初めて書かれる（CLAUDE.md の 17「全部の箱の今の大きさ」・view-api.md の「全部の箱が持つ」と食い違う）。
// 再現: 2 ページのブックを open → ファイルの p2 の箱に width が無い → p2 のタブを押して描く → まだ無い → p2 の箱のキャプションをダイアログで変える → 書かれる
test.fixme("2 枚目のページの箱も、開いたとき（遅くとも、そのページを描いたとき）に width・height を書き戻す（D44）", { tag: "@d44" }, async ({ page }) => {
  const file = await open(page, "pages.json", book());
  await fileMatchesScreen(page, file, FIRST_PAGE);
  await page.locator(".tab", { hasText: "組織" }).click();
  await expect(head(page, ROOT)).toBeVisible();
  await fileMatchesScreen(page, file, [ROOT, 21, 22]);
  validate(file);
});

test("本文はキャプションの下に左寄せで折り返し、つまみで広げると低くなる。最大行数で切ると低くなり、戻すと全部出る。どの段でも書き戻したファイルが validate を通る（D44）", { tag: "@d44" }, async ({ page }) => {
  const file = await open(page, "body.json", book());
  await fileMatchesScreen(page, file, [MEMO]);
  const body = head(page, MEMO).locator(".mz-body");
  const caption = head(page, MEMO).locator(".mz-text, .mz-caption").first();
  await expect(body).toBeVisible();
  expect(await body.evaluate(b => getComputedStyle(b).textAlign)).toBe("left");
  const [cb, bb] = [(await caption.boundingBox())!, (await body.boundingBox())!];
  expect(bb.y).toBeGreaterThanOrEqual(cb.y + cb.height - 0.5); // キャプションの下
  // 本文は折り返している（本物のフォントで 2 行以上）
  expect(await body.evaluate(b => {
    const r = document.createRange(); r.selectNodeContents(b);
    return new Set([...r.getClientRects()].map(x => Math.round(x.top))).size;
  })).toBeGreaterThan(1);
  validate(file);

  // 本文の幅のつまみで広げる → 折り返しが減って低くなり、左上は動かない。本文の幅と箱の大きさが書き戻される
  const before = await rect(page, MEMO);
  await select(page, MEMO);
  await dragGrip(page, MEMO, ".mz-body-grip", 60);
  await expect.poll(async () => (await rect(page, MEMO)).w).toBeCloseTo(before.w + 60, 0);
  const wide = await rect(page, MEMO);
  expect(wide.h).toBeLessThan(before.h);
  expect(wide.x).toBe(before.x);
  await expect.poll(() => nodeOf(file, MEMO).bodyWidth).toBeGreaterThan(160);
  await fileMatchesScreen(page, file, [MEMO]);
  validate(file);

  // 最大行数を 1 にする → 超えた分を切って低くなる（中身は切れている）
  await openBoxDialog(page, MEMO);
  await page.locator('.mz-dlg [name="lines"]').selectOption("1");
  await confirmDialog(page);
  await expect.poll(async () => (await rect(page, MEMO)).h).toBeLessThan(wide.h);
  expect(await body.evaluate(b => b.scrollHeight > b.clientHeight + 1)).toBe(true);
  await expect.poll(() => nodeOf(file, MEMO).bodyLines).toBe(1);
  await fileMatchesScreen(page, file, [MEMO]);
  validate(file);

  // 制限なしに戻すと全部出て、高さも戻る
  await openBoxDialog(page, MEMO);
  await page.locator('.mz-dlg [name="lines"]').selectOption("");
  await confirmDialog(page);
  await expect.poll(async () => (await rect(page, MEMO)).h).toBe(wide.h);
  await fileMatchesScreen(page, file, [MEMO]);
  expect("bodyLines" in nodeOf(file, MEMO)).toBe(false);
  validate(file);
});

test("付箋紙のテーマにしても、どの箱の大きさも位置も変わらず、書き戻した値も同じ。標準に戻しても同じ（テーマは見た目だけ。D44）", { tag: "@d44" }, async ({ page }) => {
  const file = await open(page, "theme.json", book());
  await fileMatchesScreen(page, file, FIRST_PAGE);
  const rects = () => Promise.all(FIRST_PAGE.map(id => rect(page, id)));
  const sizes = () => Object.fromEntries(read(file).nodes.filter(n => !n.page).map(n => [n.id, [n.width, n.height, n.x, n.y]]));
  const before = await rects(), saved = sizes();
  const pageTheme = async (value: string) => {
    await page.locator("#book").click();
    await page.selectOption('.mz-dlg [data-tab-pane]:not([hidden]) select[name="theme"]', value);
    await confirmDialog(page);
  };
  await pageTheme("sticky");
  await expect(head(page, LEAF)).toHaveClass(/mz-style-sticky/);
  await expect.poll(() => read(file).world?.theme).toBe("sticky");
  expect(await rects()).toEqual(before);
  expect(sizes()).toEqual(saved);
  validate(file);
  await pageTheme("default");
  await expect(head(page, LEAF)).not.toHaveClass(/mz-style-sticky/);
  await expect.poll(() => read(file).world?.theme ?? "default").toBe("default"); // 既定は消えるか "default" と書かれる
  expect(await rects()).toEqual(before);
  expect(sizes()).toEqual(saved);
  validate(file);
});

// ---------------------------------------------------------------------------------------------
// シナリオ 6: 紙の判定は CLI と画面で同じ

const LONG = "紙に収まるかを確かめるための長いキャプションです。".repeat(18); // M の最大幅 240 で折り返して高さ約 520
// A5 横（794×559）の紙に、2 つの列（上の箱と、その下の箱）を置く。上の箱のキャプションが長くなると、下の箱が紙の下へ押し出される
const paperBook = (): Book => ({
  world: { paper: "a5-landscape" },
  nodes: [
    { id: 1, caption: "左の上", x: 40, y: 40 },
    { id: 2, caption: "左の下", x: 40, y: 440 },
    { id: 3, caption: "右の上", x: 420, y: 40 },
    { id: 4, caption: "右の下", x: 420, y: 440 },
  ],
});

test("紙の判定は CLI と画面で同じ: A5 で長いキャプションは set もダイアログも断る。LLM が紙を A4 にすると両方通り、ユーザーが A5 に戻すのは断る（D33）", { tag: "@d44" }, async ({ page }) => {
  const file = await open(page, "paper.json", paperBook());
  await fileMatchesScreen(page, file, [1, 2, 3, 4]);
  const saved = readFileSync(file, "utf8");

  // LLM の set: 書かずに断り、どの並びが紙より何 px 長いかを返す
  const why = refusedSet(file, `1.caption=${LONG}`);
  expect(why).toMatch(/paper/);
  expect(why).toMatch(/\d+ ?px/);
  expect(readFileSync(file, "utf8")).toBe(saved);

  // ユーザーが同じキャプションをダイアログで確定: 閉じずに知らせ、図は変わらない
  const before = await rect(page, 3);
  await openBoxDialog(page, 3);
  await page.locator('.mz-dlg [name="caption"]').fill(LONG);
  await page.locator(".mz-dlg [data-ok]").click();
  await expect(page.locator(".mz-dlg-refused")).toContainText("紙に収まらない");
  await expect(page.locator('.mz-dlg [name="caption"]')).toHaveValue(LONG); // 入力したまま
  await page.locator(".mz-dlg [data-cancel]").click();
  await expect(page.locator(".mz-dlg-overlay")).toHaveCount(0);
  expect(await rect(page, 3)).toEqual(before);
  expect(readFileSync(file, "utf8")).toBe(saved);

  // LLM が紙を A4 横（1123×794）にする → 画面の紙も広がる
  set(file, "world.paper=a4-landscape");
  await expect.poll(() => page.locator(".stage:visible .mz-world").evaluate(el => (el as HTMLElement).style.height)).toBe("794px");
  validate(file);

  // 今度はどちらも通る
  set(file, `1.caption=${LONG}`);
  await expect(head(page, 1)).toContainText(LONG.slice(0, 20));
  await openBoxDialog(page, 3);
  await page.locator('.mz-dlg [name="caption"]').fill(LONG);
  await confirmDialog(page);
  await expect.poll(() => nodeOf(file, 3).caption).toBe(LONG);
  await fileMatchesScreen(page, file, [1, 2, 3, 4]);
  validate(file);
  // 下の箱は押し下げられたが紙（794）の中にある
  for (const id of [2, 4]) { const r = await rect(page, id); expect(r.y + r.h).toBeLessThanOrEqual(794); expect(r.y + r.h).toBeGreaterThan(559); }

  // ユーザーがブックのダイアログで A5 に戻そうとする → 閉じずに断り、紙は A4 のまま
  const now = readFileSync(file, "utf8");
  await page.locator("#book").click();
  await page.selectOption('.mz-dlg [data-tab-pane]:not([hidden]) select[name="paper"]', "a5-landscape");
  await page.locator(".mz-dlg [data-ok]").click();
  await expect(page.locator(".mz-dlg-refused")).toContainText("紙に収まらない");
  await page.locator(".mz-dlg [data-cancel]").click();
  await expect(page.locator(".mz-dlg-overlay")).toHaveCount(0);
  await expect(page.locator(".stage:visible .mz-world")).toHaveCSS("height", "794px");
  expect(readFileSync(file, "utf8")).toBe(now);
  // LLM が A5 に戻すのも同じく断る
  expect(refusedSet(file, "world.paper=a5-landscape")).toMatch(/paper/);
  expect(readFileSync(file, "utf8")).toBe(now);
});
