// sync.ts のテスト。fetch と EventSource を偽のサーバーに置き換え、届く順番を操作する
import { afterEach, beforeEach, expect, test } from "bun:test";
import { createGraph, type Graph } from "../web/src/graph";
import { fetchRemote, startSync, type Sync } from "../web/src/sync";
import type { Diagram } from "../web/src/types";

// ---- 偽のサーバー ----

let file = "";
let seq = 0;
let fileVersion = "";
let putGate: Promise<void> | null = null; // これが解決するまで PUT の応答を返さない
let puts: string[] = [];
let sources: FakeEventSource[] = [];

function writeFile(text: string) {
  file = text;
  fileVersion = `"v${++seq}"`;
}

// 外部（LLM）がファイルを書き換え、SSE で知らせる
function external(data: unknown) {
  writeFile(JSON.stringify(data));
  emit();
}

function emit() {
  for (const s of sources) s.emit(fileVersion.slice(1, -1));
}

class FakeEventSource extends EventTarget {
  static CONNECTING = 0;
  readyState = 1;
  constructor(_url: string) { super(); sources.push(this); }
  emit(v: string) { this.dispatchEvent(new MessageEvent("version", { data: v })); }
  close() { sources = sources.filter(s => s !== this); }
}

const realFetch = globalThis.fetch;
const realEventSource = globalThis.EventSource;

beforeEach(() => {
  writeFile(JSON.stringify({ nodes: [{ id: 1, x: 20, y: 20 }, { id: 2, x: 300, y: 20 }] }));
  puts = [];
  putGate = null;
  sources = [];
  globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;
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
    return new Response(file, { headers: { ETag: fileVersion, "X-Matomezu-Name": "d.json" } });
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
  globalThis.EventSource = realEventSource;
});

async function setup() {
  messages = [];
  const el = document.createElement("div");
  document.body.appendChild(el);
  const remote = (await fetchRemote())!;
  graph = createGraph(el, { nodes: [] }, { onChange: (d: Diagram) => sync?.changed(d) });
  sync = startSync(graph, remote, {
    status: t => messages.push(t),
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
  expect(await fetchRemote()).toBeNull();
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

test("外部の変更は Undo で取り消せ、取り消した状態が保存される", async () => {
  const g = await setup();
  external({ nodes: [{ id: 1, caption: "LLM" }, { id: 2 }] });
  await wait(10);
  expect(captions(g)[0]).toBe("LLM");
  expect(g.undo()).toBe(true);
  await settle();
  expect(captions(g)[0]).toBeNull();
  expect(JSON.parse(file).nodes[0].caption).toBeUndefined();
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
