// sync.ts のテスト。fetch を偽のサーバーに置き換え、サーバーの通知（notify）の届く順番を操作する
import { afterEach, beforeEach, expect, test } from "bun:test";
import { createGraph, type Graph } from "../web/src/graph";
import { fetchRemote, startSync, type Sync } from "../web/src/sync";
import type { Diagram } from "../web/src/types";
import { fakeMeasure } from "./helpers";

// ---- 偽のサーバー ----

let file = "";
let seq = 0;
let fileVersion = "";
let putGate: Promise<void> | null = null; // これが解決するまで PUT の応答を返さない
let puts: string[] = [];

function writeFile(text: string) {
  file = text;
  fileVersion = `"v${++seq}"`;
}

// 外部（LLM）がファイルを書き換え、SSE で知らせる
function external(data: unknown) {
  writeFile(JSON.stringify(data));
  emit();
}

// サーバーの通知（本物は events.ts が受けて sync.notify に渡す）
function emit() {
  sync?.notify(fileVersion.slice(1, -1));
}

const realFetch = globalThis.fetch;

beforeEach(() => {
  writeFile(JSON.stringify({ nodes: [{ id: 1, x: 20, y: 20 }, { id: 2, x: 300, y: 20 }] }));
  puts = [];
  putGate = null;
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      // 本物と同じく、書き込んでから応答を返す。putGate があれば応答だけを遅らせる
      const match = new Headers(init.headers).get("If-Match");
      if (match !== fileVersion) return new Response("file changed", { status: 409, headers: { ETag: fileVersion } });
      writeFile(String(init.body));
      puts.push(String(init.body));
      const written = fileVersion;
      if (putGate) await putGate;
      return new Response(null, { status: 204, headers: { ETag: written } });
    }
    return new Response(file, { headers: { ETag: fileVersion, "X-Matomezu-Name": "d.json", "X-Matomezu-Server": "s1" } });
  }) as typeof fetch;
});

let graph: Graph | null = null;
let sync: Sync | null = null;
let messages: string[] = [];
afterEach(() => {
  sync?.close();
  graph?.destroy();
  graph = null; sync = null;
  document.body.innerHTML = "";
  globalThis.fetch = realFetch;
});

async function setup() {
  messages = [];
  const el = document.createElement("div");
  document.body.appendChild(el);
  const remote = (await fetchRemote(""))!;
  graph = createGraph(el, { nodes: [] }, { measureText: fakeMeasure, onChange: (d: Diagram) => sync?.changed(d) });
  sync = startSync(graph, "", remote, {
    error: t => messages.push("ERROR " + t),
    clearError: () => {},
  });
  return graph;
}

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const settle = () => wait(400); // 保存を待つ時間（300ms）より長く
const captions = (g: Graph) => g.toJSON().nodes.map(n => n.caption ?? null);

// ---- テスト ----

test("サーバーが無ければ null", async () => {
  globalThis.fetch = (async () => { throw new TypeError("failed"); }) as unknown as typeof fetch;
  expect(await fetchRemote("")).toBeNull();
});

test("画面の変更はまとめて1回保存する", async () => {
  const g = await setup();
  g.update(1, { caption: "a" });
  g.update(1, { caption: "b" });
  g.update(1, { caption: "c" });
  await settle();
  expect(puts.length).toBe(1);
  expect(JSON.parse(puts[0]!).nodes[0].caption).toBe("c");
});

test("外部の変更を読み込み、選択を保つ", async () => {
  const g = await setup();
  g.select(2);
  external({ nodes: [{ id: 1, caption: "x" }, { id: 2, caption: "y" }] });
  await wait(10);
  expect(captions(g)).toEqual(["x", "y"]);
  expect(g.selected()).toBe("2");
});

test("自分の保存の通知では読み直さない（応答より先に届いても後でも）", async () => {
  const g = await setup();
  let loads = 0;
  const load = g.load;
  g.load = d => { loads++; load(d); };

  // 通知が応答より先
  let open!: () => void;
  putGate = new Promise(r => { open = r; });
  g.update(1, { caption: "a" });
  await wait(350); // 書き込みは済み、応答を待っている
  emit();
  await wait(10);
  putGate = null;
  open();
  await settle();

  // 通知が応答より後
  g.update(1, { caption: "b" });
  await settle();
  emit();
  await wait(10);

  expect(puts.length).toBe(2);
  expect(loads).toBe(0);
  expect(captions(g)[0]).toBe("b");
});

test("ドラッグ中に届いた変更は、手を離してから反映する", async () => {
  const g = await setup();
  const el = document.querySelector(".mz-stage")!;
  g.select(1);
  const head = el.querySelector(".mz-node.mz-current > .mz-head")!;
  head.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 0, clientY: 0, pointerId: 1 }));
  head.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: 30, clientY: 0, pointerId: 1 }));

  external({ nodes: [{ id: 1, caption: "new" }, { id: 2 }] });
  await wait(10);
  expect(captions(g)[0]).toBeNull(); // まだ反映しない
  expect(g.dragging()).toBe(true);

  head.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1 }));
  window.dispatchEvent(new PointerEvent("pointerup"));
  await settle();
  // 外部の変更が優先され、ドラッグの結果は保存されない（409 で読み直す）
  expect(captions(g)[0]).toBe("new");
  expect(JSON.parse(file).nodes[0].caption).toBe("new");
});

test("保存より後の外部の変更が、保存の応答より先に届いても取りこぼさない", async () => {
  const g = await setup();
  let open!: () => void;
  putGate = new Promise(r => { open = r; });
  g.update(1, { caption: "mine" });
  await wait(350); // 書き込みは済み、応答を待っている
  // 自分の保存のあとに外部が書き換え、その通知が応答より先に届く
  external({ nodes: [{ id: 1, caption: "theirs" }, { id: 2 }] });
  await wait(10);
  putGate = null;
  open();
  await settle();
  expect(captions(g)[0]).toBe("theirs");
});

test("不正なファイルのあいだは保存を止め、直ったら再開する", async () => {
  const g = await setup();
  writeFile("{ broken");
  emit();
  await wait(10);
  expect(messages.some(m => m.startsWith("ERROR ファイルを読み込めません"))).toBe(true);

  g.update(1, { caption: "lost" });
  await settle();
  expect(file).toBe("{ broken"); // 書きかけのファイルを上書きしない

  external({ nodes: [{ id: 1, caption: "fixed" }] });
  await wait(10);
  expect(captions(g)).toEqual(["fixed"]);
  g.update(1, { caption: "after" });
  await settle();
  expect(JSON.parse(file).nodes[0].caption).toBe("after");
});

test("外部の変更はユーザーの Undo に入らない。Undo はユーザーの操作だけを戻し、戻した状態が保存される（LLM の変更は残る。D31）", async () => {
  const g = await setup();
  g.update(2, { caption: "ユーザー" });
  await settle();
  external({ nodes: [{ id: 1, caption: "LLM" }, { id: 2, caption: "ユーザー" }] });
  await wait(10);
  expect(captions(g)[0]).toBe("LLM");
  expect(g.undo()).toBe(true);
  await settle();
  expect(captions(g)).toEqual(["LLM", null]);
  expect(JSON.parse(file).nodes.map((n: { caption?: string }) => n.caption ?? null)).toEqual(["LLM", null]);
});

test("ユーザーがまだ図を変えていなければ、外部の変更は履歴に積まない（開いた直後に LLM が整えている間）", async () => {
  const g = await setup();
  external({ nodes: [{ id: 1, caption: "LLM" }, { id: 2 }] });
  await wait(10);
  expect(captions(g)[0]).toBe("LLM");
  expect(g.history().canUndo).toBe(false);
});

test("最初の読み込みは履歴に残さない", async () => {
  const g = await setup();
  expect(g.history().canUndo).toBe(false);
});

test("LLM の変更を読み直しても、はみ出したボックスを動かさない", async () => {
  const g = await setup();
  external({ nodes: [{ id: 1, x: 20, y: 20 }, { id: 2, caption: "右端", x: 900, y: 20 }], edges: [[1, 2]] });
  await wait(10);
  expect([g.info(2).x, g.info(2).y]).toEqual([900, 20]);
});

test("見ていないあいだの変更は、前に出たときに読み直す", async () => {
  const g = await setup();
  sync!.setActive(false);
  external({ nodes: [{ id: 1, caption: "x" }] });
  await wait(10);
  expect(captions(g)).toEqual([null, null]);
  sync!.setActive(true);
  await wait(10);
  expect(captions(g)).toEqual(["x"]);
});

test("最初から見ていなければ、前に出るまで読み込まない", async () => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const remote = (await fetchRemote(""))!;
  graph = createGraph(el, { nodes: [] }, { measureText: fakeMeasure });
  sync = startSync(graph, "", remote, { error() {}, clearError() {} }, { active: false });
  expect(graph.toJSON().nodes).toEqual([]);
  sync.setActive(true);
  expect(graph.toJSON().nodes.length).toBe(2);
});

test("一度も前に出ていないあいだに外部で変わったら、前に出たとき最初のデータではなく新しい版を出す", async () => {
  // 画面を読み込んだあと裏にあったタブ（最初のデータを持ったまま）のファイルが変わり、通知が届いてから前に出る
  const el = document.createElement("div");
  document.body.appendChild(el);
  const remote = (await fetchRemote(""))!;
  graph = createGraph(el, { nodes: [] }, { measureText: fakeMeasure });
  sync = startSync(graph, "", remote, { error() {}, clearError() {} }, { active: false });
  external({ nodes: [{ id: 1, caption: "新しい" }] });
  sync.setActive(true);
  await wait(20);
  expect(captions(graph)).toEqual(["新しい"]);
});

test("通知より先に保存がぶつかった（409）ら、画面の変更を取り消して外部の版を読み直し、気づいてほしい知らせを出す", async () => {
  const notices: string[] = [];
  const el = document.createElement("div");
  document.body.appendChild(el);
  const remote = (await fetchRemote(""))!;
  graph = createGraph(el, { nodes: [] }, { measureText: fakeMeasure, onChange: (d: Diagram) => sync?.changed(d) });
  sync = startSync(graph, "", remote, { notice: t => notices.push(t), error() {}, clearError() {} });
  writeFile(JSON.stringify({ nodes: [{ id: 1, caption: "theirs" }, { id: 2 }] })); // 外部の書き換え（通知はまだ届かない）
  graph.update(1, { caption: "mine" });
  await settle();
  expect(puts).toEqual([]); // 上書きしない
  expect(captions(graph)[0]).toBe("theirs");
  expect(notices).toEqual(["外部で変更されていたため、画面の変更を取り消して読み直します"]);
  expect(sync.shown()).toBe(fileVersion.replace(/"/g, ""));
});

test("保存に失敗したら（サーバーの誤り・つながらない）エラーとして知らせる", async () => {
  const g = await setup();
  const fake = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) =>
    (init?.method === "PUT" ? new Response("disk full", { status: 500 }) : fake(url, init))) as typeof fetch;
  g.update(1, { caption: "a" });
  await settle();
  expect(messages.at(-1)).toBe("ERROR 保存できませんでした: 500 disk full");
  globalThis.fetch = (async () => { throw new TypeError("offline"); }) as unknown as typeof fetch;
  g.update(1, { caption: "b" });
  await settle();
  expect(messages.at(-1)).toBe("ERROR 保存できませんでした: offline");
});

test("外部の変更を読みに行けなければ、サーバーにつながらないと知らせ、表示は残す", async () => {
  const g = await setup();
  globalThis.fetch = (async () => { throw new TypeError("offline"); }) as unknown as typeof fetch;
  sync!.notify("v99");
  await wait(10);
  expect(messages.at(-1)).toBe("ERROR サーバーに接続できません");
  expect(g.toJSON().nodes.length).toBe(2);
});

test("画面が表示している版は、引用符を除いて返す（matomezu check の版と比べる）", async () => {
  await setup();
  expect(sync!.shown()).toBe(fileVersion.replace(/"/g, ""));
});

// ---- 紙に収まるかの判定（docs/PAPER-plan.md の 4.6 の 7） ----

// A4 横に、間隔を詰めても入らない 12 個の横の並び
const TOO_WIDE = { nodes: Array.from({ length: 12 }, (_, i) => ({ id: i + 1, caption: `横${i + 1}`, x: 12 + i * 130, y: 12 })) };

test("最初に開くとき紙に収まらなければ、描かずに refused で理由を知らせる（app.ts がマスターを出す）。表示した版は無い", async () => {
  writeFile(JSON.stringify(TOO_WIDE));
  const el = document.createElement("div");
  document.body.appendChild(el);
  const refused: string[] = [];
  graph = createGraph(el, { nodes: [] }, { measureText: fakeMeasure, onChange: (d: Diagram) => sync?.changed(d) });
  sync = startSync(graph, "", (await fetchRemote(""))!, { error: t => refused.push("ERROR " + t), clearError: () => {}, refused: r => refused.push(r) });
  expect(refused).toHaveLength(1);
  expect(refused[0]).toMatch(/^原因：ページ幅オーバー（\d+px）$/);
  expect(graph.toJSON().nodes).toEqual([]);
  expect(sync.shown()).toBe("");
});

test("紙の外の箱を押し込んで開いたら、押し込んだ位置を保存する（履歴には積まない）", async () => {
  writeFile(JSON.stringify({ nodes: [{ id: 1, caption: "外", x: 5000, y: 20 }] }));
  // アプリと同じく、裏で読み込んでから前に出す（app.ts の openBook と activate。前に出したときに表示する）
  const el = document.createElement("div");
  document.body.appendChild(el);
  const g = graph = createGraph(el, { nodes: [] }, { measureText: fakeMeasure, onChange: (d: Diagram) => sync?.changed(d) });
  sync = startSync(g, "", (await fetchRemote(""))!, { error: () => {}, clearError: () => {} }, { active: false });
  sync.setActive(true);
  await settle();
  expect(puts).toHaveLength(1);
  const x = JSON.parse(puts[0]!).nodes[0].x;
  expect(x).toBe(g.info(1).x);
  expect(x).toBeLessThan(1123);
  expect(g.history().canUndo).toBe(false);
});

test("読み直したファイルが紙に収まらなければ、前の表示を残して知らせ、直るまで保存を止める。表示した版にはしない", async () => {
  const g = await setup();
  const shown = sync!.shown();
  external(TOO_WIDE);
  await wait(10);
  expect(messages.at(-1)).toMatch(/^ERROR AIが図の書き換えに失敗しました\n原因：ページ幅オーバー（\d+px）$/);
  expect(g.toJSON().nodes.map(n => n.id)).toEqual([1, 2]);
  expect(sync!.shown()).toBe("");
  g.update(1, { caption: "保存しない" });
  await settle();
  expect(puts).toHaveLength(0);
  // 直れば読み直して保存も戻る
  external({ nodes: [{ id: 1, caption: "直した", x: 20, y: 20 }] });
  await wait(10);
  expect(captions(g)).toEqual(["直した"]);
  expect(sync!.shown()).not.toBe("");
  expect(sync!.shown()).not.toBe(shown);
});
