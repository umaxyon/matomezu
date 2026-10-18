// サーバーからの問い合わせへの答え（app-answers.ts。D30・D33）: matomezu check の配置の要約と、matomezu set の前の紙の確かめ・open の判定
import { afterEach, beforeEach, expect, test } from "bun:test";
import { createAnswers } from "../web/src/app-answers";
import { DEFAULTS } from "../web/src/graph";
import type { Geometry } from "../web/src/report";

const realFetch = globalThis.fetch;
let files: Record<string, { text: string; etag: string } | null> = {}; // d/<doc>/api/data
let fitBody: unknown = null; // api/fit/<req> の GET（預けた中身）
let replies: { url: string; body: Record<string, unknown> }[] = [];
beforeEach(() => {
  files = {}; fitBody = null; replies = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if ((init?.method ?? "GET") === "POST") {
      replies.push({ url, body: JSON.parse(String(init!.body)) });
      return new Response(null, { status: 204 });
    }
    if (url.startsWith("api/fit/")) return fitBody == null ? new Response("gone", { status: 404 }) : Response.json(fitBody);
    const doc = decodeURIComponent(url.split("/")[1]!);
    const f = files[doc];
    if (!f) return new Response("no", { status: 404 });
    return new Response(f.text, { headers: { ETag: f.etag } });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  window.dispatchEvent(new PointerEvent("pointerup"));
  document.body.innerHTML = "";
});

const GEO: Geometry = {
  viewport: { w: 800, h: 600 }, outside: [], edges: [],
  boxes: [{ id: "1", caption: "箱", ancestors: [], x: 10, y: 10, w: 100, h: 40, cut: false } as Geometry["boxes"][number]],
};
function setup(shown: Geometry | null = null, refused: string[] = []) {
  const canvas = document.createElement("div");
  document.body.appendChild(canvas);
  const asked: string[] = [];
  const A = createAnswers({
    canvas,
    focus: doc => `focus of ${doc}`,
    shown: (doc, page, version) => { asked.push(`${doc} ${page} ${version}`); return shown; },
    refuseOpen: (doc, reason, name) => refused.push(`${doc} ${name} ${reason}`),
    flush: async () => {},
  });
  return { A, asked };
}

test("その版のページを表示していれば、表示中の図から要約を作って答え、フォーカス枠の様子を添える", async () => {
  const { A, asked } = setup(GEO);
  await A.summary("r1", "a", "7", "v3");
  expect(asked).toEqual(["a 7 v3"]);
  expect(replies.map(r => r.url)).toEqual(["api/summary/r1"]);
  const b = replies[0]!.body;
  expect([b.version, b.page, b.outside, b.focus]).toEqual(["v3", "7", [], "focus of a"]);
  expect(b.summary).toContain("#1 箱");
});

test("表示していなければ、ファイルを読んで見えない所で並べ、読んだ版（引用符・W/ を除く）で答える", async () => {
  files.a = { text: JSON.stringify({ nodes: [{ id: 1, caption: "見えない" }] }), etag: 'W/"v9"' };
  const { A } = setup(null);
  await A.summary("r1", "a", "", "v3");
  const b = replies[0]!.body;
  expect(b.version).toBe("v9");
  expect(b.summary).toContain("#1 見えない");
  expect(document.body.children.length).toBe(1); // 見えない図は片付ける（canvas だけ残る）
});

test("ファイルを読めない・壊れているときは error で答える", async () => {
  files.b = { text: "{ broken", etag: '"v1"' };
  const { A } = setup(null);
  await A.summary("r1", "a", "", "v1");
  await A.summary("r2", "b", "", "v1");
  expect(replies[0]!.body).toEqual({ error: "the diagram could not be read" });
  expect(typeof replies[1]!.body.error).toBe("string");
});

test("ユーザーがボタンを押している間は待ち、離したら答える", async () => {
  const { A } = setup(GEO);
  window.dispatchEvent(new PointerEvent("pointerdown"));
  const p = A.summary("r1", "a", "", "v1");
  await new Promise(r => setTimeout(r, 150));
  expect(replies).toEqual([]);
  window.dispatchEvent(new PointerEvent("pointerup"));
  await p;
  expect(replies.length).toBe(1);
  expect(replies[0]!.body.summary).toBeDefined();
});

test("押したまま 5 秒を過ぎたら busy と答える（LLM はあとで頼み直す）。ウィンドウを離れたら押していないことにする", async () => {
  const { A } = setup(GEO);
  const now = Date.now;
  let t = now();
  Date.now = () => t;
  try {
    window.dispatchEvent(new PointerEvent("pointerdown"));
    const p = A.summary("r1", "a", "", "v1");
    const q = A.fit("r2", "a", false);
    t += 6000;
    await Promise.all([p, q]);
    expect(replies.map(r => [r.url, r.body])).toEqual([["api/summary/r1", { busy: true }], ["api/fit/r2", { busy: true }]]);
    window.dispatchEvent(new Event("blur"));
    replies = [];
    await A.summary("r3", "a", "", "v1");
    expect(replies[0]!.body.busy).toBeUndefined();
  } finally {
    Date.now = now;
  }
});

test("紙の確かめ: 預けた中身が読めなければ、その状態の数を error で答える", async () => {
  const { A } = setup();
  await A.fit("r1", "a", false);
  expect(replies).toEqual([{ url: "api/fit/r1", body: { error: "404" } }]);
});

test("紙の確かめ: 紙の制限が無ければ（紙を切っている）はみ出しは無い", async () => {
  DEFAULTS.paper = false;
  try {
    fitBody = { nodes: [{ id: 1 }, { id: 2, x: 50000, y: 0 }] };
    files.a = { text: JSON.stringify({ nodes: [{ id: 1 }] }), etag: '"v1"' };
    const { A } = setup();
    await A.fit("r1", "a", false);
    expect(replies).toEqual([{ url: "api/fit/r1", body: { over: [] } }]);
  } finally {
    DEFAULTS.paper = true;
  }
});

// 横に並んだ 12 個の箱（A4 横の幅 1123 に、間隔の下限 8px を詰めても入らない）。右の 2 つは紙の外に書いてある
const TOO_WIDE = { nodes: Array.from({ length: 12 }, (_, i) => ({ id: i + 1, caption: `横${i + 1}`, x: 12 + i * 130, y: 12 })) };

test("紙の確かめ: 開いたときと同じに紙の外の箱を押し込み、それでも入らないページを、紙の型・向き・足りない px・端から端への並びと一緒に答える", async () => {
  fitBody = TOO_WIDE;
  const { A } = setup();
  await A.fit("r1", "a", false);
  const over = replies[0]!.body.over as { page: string; name: string; paper: string; axis: string; short: number; boxes: { id: string; caption: string }[] }[];
  expect(over.length).toBe(1);
  expect([over[0]!.page, over[0]!.axis]).toEqual(["", "x"]);
  expect(over[0]!.paper).toMatch(/^\S+ \d+x\d+$/);
  expect(over[0]!.short).toBeGreaterThan(0);
  expect(over[0]!.boxes.map(b => b.id)).toEqual(TOO_WIDE.nodes.map(n => String(n.id)));
});

test("紙の確かめ: 紙の外に書かれていても、形を変えずに押し込めば入るなら、はみ出しは無い（前から外にあったかは見ない）", async () => {
  fitBody = { nodes: [{ id: 1, caption: "外", x: 50000, y: 0 }, { id: 2, caption: "もっと外", x: 60000, y: 0 }, { id: 3, caption: "位置なし" }] };
  const refused: string[] = [];
  const { A } = setup(null, refused);
  await A.fit("r1", "a", true);
  expect(replies).toEqual([{ url: "api/fit/r1", body: { over: [] } }]);
  expect(refused).toEqual([]);
});

test("open の判定で入らなければ、マスターに出す理由（ページ・並び・足りない px）を知らせる。set の確かめでは知らせない", async () => {
  fitBody = TOO_WIDE;
  const refused: string[] = [];
  const { A } = setup(null, refused);
  await A.fit("r1", "a", false);
  expect(refused).toEqual([]);
  await A.fit("r2", "a", true, "wide.json");
  expect(refused.length).toBe(1);
  expect(refused[0]).toMatch(/^a wide.json 原因：ページ幅オーバー（\d+px）$/);
});
