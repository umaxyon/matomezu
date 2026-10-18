// LLM（matomezu の CLI）とユーザー（画面）が 1 つのブックを往復で直すシナリオ（D31 の履歴の分離と、画面が書いたファイルを CLI が読めること）。
// テストごとに自分のサーバーと状態のフォルダを持つ（e2e/server.ts の testServer）。LLM の履歴・郵便箱が前のテストから残らないので、
// open から history までをはじめから通せる。
// 履歴の決まり（web/src/history.ts・unseen.ts）: Undo はユーザーの操作だけを積む。LLM の変更はユーザーが画面で見たとき（認知）に、
// その時刻の位置でユーザーの履歴に差し込まれる。だから、見たあとの LLM の変更は、時刻の順にユーザーの Undo でも戻る
import { readFileSync } from "node:fs";
import { type Page, expect, test } from "@playwright/test";
import { dragBy, rect, setCaption } from "./helpers";
import { type TestServer, testServer } from "./server";

test.describe.configure({ mode: "parallel" });

let s: TestServer;
test.beforeEach(() => { s = testServer(); });
test.afterEach(() => { s.stop(); });

type FileBox = { id: number | string; caption?: string; x?: number; y?: number; userAdded?: boolean };
type FileEdge = { id: string; from: number | string; to: number | string };
type FileData = { nodes: FileBox[]; edges?: FileEdge[] };

// 4 つの箱が離れて並ぶ図（A4 横の紙の中。ドラッグしてもほかの箱を押さない間隔）
const BASE = {
  world: { paper: "a4-landscape" },
  nodes: [
    { id: 1, caption: "入口", x: 40, y: 40 },
    { id: 2, caption: "処理", x: 320, y: 40 },
    { id: 3, caption: "出口", x: 600, y: 40 },
    { id: 4, caption: "記録", x: 40, y: 320 },
  ],
  edges: [{ id: "e1", from: 1, to: 2 }],
};

const stage = (page: Page) => page.locator(".stage:visible");
const head = (page: Page, id: number | string) => stage(page).locator(`.mz-node[data-id="${id}"] > .mz-head`);
// 箱の文字（見出しには ▼ などの印も入るので、文字の要素だけを見る）
const caption = (page: Page, id: number | string) => head(page, id).locator(".mz-text");
const edge = (page: Page, id: string) => stage(page).locator(`.mz-edge[data-id="${id}"]`);
const readFile = (file: string) => JSON.parse(readFileSync(file, "utf8")) as FileData;
const boxIn = (file: string, id: number | string) => readFile(file).nodes.find(n => String(n.id) === String(id));
const undo = (page: Page) => page.locator("#undo").click();

// LLM が図を書いて open し、ユーザーがその URL を開く
async function openAsLLM(page: Page, name: string, data: unknown): Promise<string> {
  const file = s.write(name, data);
  const url = s.run("open", "-no-browser", file).trim().split("\n")[0]!;
  await page.goto(url);
  await expect(stage(page).locator(".mz-world")).toHaveCount(1);
  await page.evaluate(() => document.fonts.ready);
  await expect(head(page, 1)).toBeVisible();
  return file;
}

// LLM の履歴の n 番の見出しの行（"#n 日時  k change(s)  [印]"）
const historyLine = (file: string, n: number) =>
  s.run("history", file).split("\n").find(l => l.startsWith(`#${n} `)) ?? "";

test("往復の一巡: ユーザーが直して保存したファイルを LLM の validate・check が通し、LLM の set はユーザーの直しを壊さず、見たあとは時刻の順に Undo で戻る（D31）", async ({ page }) => {
  const file = await openAsLLM(page, "session.json", BASE);
  const start3 = await rect(page, 3);

  // ユーザーの操作 1: ダイアログでキャプションを直す → 画面がファイルに保存する
  await setCaption(page, 1, "入口（直した）");
  await expect.poll(() => boxIn(file, 1)?.caption).toBe("入口（直した）");

  // ユーザーの操作 2: 箱 3 を下へドラッグする
  await dragBy(page, 3, 0, 150);
  await expect.poll(async () => (await rect(page, 3)).y).toBeGreaterThan(start3.y + 100);
  const moved3 = await rect(page, 3);
  await expect.poll(() => boxIn(file, 3)?.y).toBe(moved3.y);

  // ユーザーの操作 3: 追加モードで何も無い所を押し、ダイアログで箱を足す → ファイルに userAdded の印付きで入る
  await page.locator('.mz-toolbox [data-tool="add"]').click();
  const world = (await stage(page).locator(".mz-world").boundingBox())!;
  await page.mouse.move(world.x + 600, world.y + 400);
  await page.mouse.click(world.x + 600, world.y + 400);
  await expect(page.locator(".mz-dlg h2")).toHaveText("ボックスの追加");
  await page.locator('.mz-dlg [name="caption"]').fill("ユーザーの箱");
  await page.locator(".mz-dlg [data-ok]").click();
  await expect(page.locator(".mz-dlg-overlay")).toHaveCount(0);
  await expect(stage(page).locator(".mz-node > .mz-head", { hasText: "ユーザーの箱" })).toBeVisible();
  await expect.poll(() => readFile(file).nodes.find(n => n.caption === "ユーザーの箱")?.userAdded).toBe(true);
  const added = readFile(file).nodes.find(n => n.caption === "ユーザーの箱")!;

  // LLM: 画面が書いたファイルを確かめる。データの誤りは無く、紙に収まる
  expect(s.run("validate", file).trim()).toBe("ok");
  expect(s.run("check", file)).toContain("fits");
  // ユーザーの保存は LLM の履歴に入らない
  expect(s.run("history", file).trim()).toBe("no changes in the LLM history");

  // LLM: ほかの箱（2）を set で直す → 画面が読み直して映す。ユーザーの直し（キャプション・位置・足した箱）は残る
  s.run("set", file, "2.caption=処理（LLM）");
  await expect(caption(page, 2)).toHaveText("処理（LLM）");
  await expect(caption(page, 1)).toHaveText("入口（直した）");
  expect((await rect(page, 3)).y).toBe(moved3.y);
  await expect(caption(page, added.id)).toHaveText("ユーザーの箱");
  expect(boxIn(file, 1)?.caption).toBe("入口（直した）");
  expect(boxIn(file, 3)?.y).toBe(moved3.y);
  expect(boxIn(file, added.id)?.userAdded).toBe(true);

  // 箱 2 は画面に見えているので、ユーザーが見た（認知）→ LLM の履歴の #1 に seen が付く
  await expect.poll(() => historyLine(file, 1)).toContain("seen");
  expect(s.run("history", file, "1")).toContain('caption: "処理" -> "処理（LLM）"');

  // Undo: 認知した LLM の変更は時刻の位置（3 つのユーザーの操作のあと）に差し込まれるので、時刻の新しい順に 1 つずつ戻る
  // 1 回目: LLM の set（見たので、ユーザーの履歴に入っている）
  await undo(page);
  await expect(caption(page, 2)).toHaveText("処理");
  await expect(head(page, added.id)).toBeVisible(); // ユーザーの操作はまだ戻らない
  await expect(caption(page, 1)).toHaveText("入口（直した）");
  // 2 回目: 足した箱
  await undo(page);
  await expect(head(page, added.id)).toHaveCount(0);
  expect((await rect(page, 3)).y).toBe(moved3.y);
  // 3 回目: ドラッグ
  await undo(page);
  await expect.poll(async () => (await rect(page, 3)).y).toBe(start3.y);
  await expect(caption(page, 1)).toHaveText("入口（直した）");
  // 4 回目: キャプションの直し。これでユーザーの履歴は空
  await undo(page);
  await expect(caption(page, 1)).toHaveText("入口");
  await expect(page.locator("#undo")).toBeDisabled();

  // Undo の結果も画面が保存する。ファイルは開いたときの中身に戻り、CLI の検査も通る
  await expect.poll(() => boxIn(file, 2)?.caption).toBe("処理");
  await expect.poll(() => boxIn(file, 1)?.caption).toBe("入口");
  await expect.poll(() => boxIn(file, 3)?.y).toBe(start3.y);
  expect(readFile(file).nodes.some(n => n.caption === "ユーザーの箱")).toBe(false);
  expect(s.run("validate", file).trim()).toBe("ok");
  // 見たあとの変更をユーザーが戻しても「見る前に上書きした」印は付かない（seen のまま）
  const line1 = historyLine(file, 1);
  expect(line1).toContain("seen");
  expect(line1).not.toContain("overwritten");
});

test("revert で LLM の変更だけを取り消す: キャプションと足した線が戻り、あとからのユーザーのドラッグは残る。取り消しも新しい変更として履歴に入る（D31）", async ({ page }) => {
  const file = await openAsLLM(page, "revert.json", BASE);

  // LLM: 1 回の set でキャプションを変え、線を足す（振った線の id が出る）
  const out = s.run("set", file, "1.caption=入口（LLM）", "link=1,4");
  const eid = readFile(file).edges!.find(e => String(e.from) === "1" && String(e.to) === "4")?.id;
  expect(eid).toBeTruthy();
  expect(out).toContain(eid!);
  await expect(caption(page, 1)).toHaveText("入口（LLM）");
  await expect(edge(page, eid!)).toHaveCount(1);
  await expect.poll(() => historyLine(file, 1)).toContain("seen");

  // ユーザー: LLM が変えた同じ箱を右へドラッグする
  const start1 = await rect(page, 1);
  await dragBy(page, 1, 120, 0);
  await expect.poll(async () => (await rect(page, 1)).x).toBeGreaterThan(start1.x + 80);
  const moved1 = await rect(page, 1);
  await expect.poll(() => boxIn(file, 1)?.x).toBe(moved1.x);

  // LLM: #1 を revert → 画面のキャプションと線が戻る。ユーザーのドラッグ（位置）は残る
  expect(s.run("revert", file, "1")).toContain("reverted change 1");
  await expect(caption(page, 1)).toHaveText("入口");
  await expect(edge(page, eid!)).toHaveCount(0);
  await expect(edge(page, "e1")).toHaveCount(1);
  expect((await rect(page, 1)).x).toBe(moved1.x);
  expect(boxIn(file, 1)?.x).toBe(moved1.x);
  expect(boxIn(file, 1)?.caption).toBe("入口");
  expect(readFile(file).edges!.some(e => e.id === eid)).toBe(false);
  expect(s.run("validate", file).trim()).toBe("ok");

  // 取り消しは LLM の履歴の新しい変更（#2）。箱 1 は見えているので、これも認知される
  await expect.poll(() => historyLine(file, 2)).toContain("revert 1");
  await expect.poll(() => historyLine(file, 2)).toContain("seen");
  expect(s.run("history", file, "2")).toContain('caption: "入口（LLM）" -> "入口"');

  // Undo: 見た取り消し（#2）は時刻の位置でユーザーの履歴に入るので、1 回目はそれを戻す（キャプションと線が LLM の変更のあとに戻る）。
  // ドラッグはそのまま
  await undo(page);
  await expect(caption(page, 1)).toHaveText("入口（LLM）");
  await expect(edge(page, eid!)).toHaveCount(1);
  expect((await rect(page, 1)).x).toBe(moved1.x);
  // 2 回目: ドラッグだけが戻る（キャプションと線は 1 回目のあとのまま）
  await undo(page);
  await expect.poll(async () => (await rect(page, 1)).x).toBe(start1.x);
  await expect(caption(page, 1)).toHaveText("入口（LLM）");
  await expect(edge(page, eid!)).toHaveCount(1);
  await expect.poll(() => boxIn(file, 1)?.x).toBe(start1.x);
});
