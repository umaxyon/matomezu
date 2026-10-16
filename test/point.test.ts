// AI が箱を示すフォーカス枠（D37）: 枠そのもの（point-frame.ts）と、出すかどうかの判断（app-point.ts）
import { afterEach, beforeEach, expect, test } from "bun:test";
import { createPointer } from "../web/src/app-point";
import { closeEditDialog } from "../web/src/edit-dialog";
import type { Graph } from "../web/src/graph";
import { createPointFrame } from "../web/src/point-frame";

afterEach(() => {
  closeEditDialog();
  document.body.innerHTML = "";
  document.body.classList.remove("touring");
});

const frame = () => new Promise(r => requestAnimationFrame(r));
const tick = () => new Promise(r => setTimeout(r, 5));
function place(el: Element, left: number, top: number, w: number, h: number) {
  el.getBoundingClientRect = () => ({ left, top, right: left + w, bottom: top + h, width: w, height: h, x: left, y: top, toJSON() {} }) as DOMRect;
}

// ---- 枠（point-frame.ts） ----

function frameSetup(zoom = 1) {
  const container = document.createElement("div");
  const worldEl = document.createElement("div");
  const box = document.createElement("div");
  container.appendChild(worldEl);
  worldEl.appendChild(box);
  document.body.appendChild(container);
  place(worldEl, 10, 10, 1000, 1000);
  place(box, 110, 70, 40, 20);
  let drawn: HTMLElement | null = box;
  const F = createPointFrame({ container, worldEl, zoom: () => zoom, drawnEl: () => drawn });
  return { F, container, worldEl, box, lose: () => { drawn = null; } };
}
const pointEl = () => document.querySelector<HTMLElement>(".mz-point");

test("枠はワールドの層に、箱の外周から 4px 外の四角として、倍率で割ったワールドの座標で置く。色はテーマの色", () => {
  const { F, worldEl } = frameSetup(2);
  F.show("7", "#f00", () => {});
  const el = pointEl()!;
  expect(el.parentElement).toBe(worldEl);
  expect(el.style.getPropertyValue("--mz-point")).toBe("#f00");
  // 箱は画面で (110, 70) 40×20、ワールドは (10, 10)、倍率 2 → ワールドの座標で (50, 30) 20×10
  expect([el.style.left, el.style.top, el.style.width, el.style.height]).toEqual(["46px", "26px", "28px", "18px"]);
  expect(F.pointed()).toBe("7");
  F.clear();
});

test("図を押すと反応として枠を消し、onReact を 1 回だけ呼ぶ", () => {
  const { F, container } = frameSetup();
  let reacted = 0;
  F.show("7", "#f00", () => { reacted++; });
  container.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  container.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  expect(reacted).toBe(1);
  expect(pointEl()).toBeNull();
  expect(F.pointed()).toBeNull();
});

test("Esc でも反応として消す。図の枠が見えていない（別のタブ）ときの Esc では消さない", () => {
  const { F, container } = frameSetup();
  let reacted = 0;
  F.show("7", "#f00", () => { reacted++; });
  container.getClientRects = () => [] as unknown as DOMRectList;
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  expect(reacted).toBe(0);
  delete (container as { getClientRects?: unknown }).getClientRects;
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  expect(reacted).toBe(0);
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  expect(reacted).toBe(1);
});

test("clear は反応ではない（onReact を呼ばない）。出し直すと前の枠は反応なしで消える", () => {
  const { F, container } = frameSetup();
  const log: string[] = [];
  F.show("1", "#f00", () => log.push("1"));
  F.show("2", "#f00", () => log.push("2"));
  expect(document.querySelectorAll(".mz-point").length).toBe(1);
  expect(F.pointed()).toBe("2");
  F.clear();
  container.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); // 消したあとの押下は反応ではない
  expect(log).toEqual([]);
});

test("箱が無くなった（ページを切り替えた・消した）ら、次のフレームで反応として消す", async () => {
  const { F, lose } = frameSetup();
  let reacted = 0;
  F.show("7", "#f00", () => { reacted++; });
  lose();
  await frame();
  expect(reacted).toBe(1);
  expect(pointEl()).toBeNull();
});

test("組み立て直しで層から外れた枠は、次のフレームで層に戻す。箱が動けばついていく", async () => {
  const { F, worldEl, box } = frameSetup();
  F.show("7", "#f00", () => {});
  pointEl()!.remove();
  place(box, 210, 70, 40, 20);
  await frame();
  expect(pointEl()!.parentElement).toBe(worldEl);
  expect(pointEl()!.style.left).toBe("196px");
  F.clear();
});

// ---- 出すかどうかの判断（app-point.ts） ----

interface FakeBook { id: string; loaded: boolean; data: unknown; graph: Graph; log: string[] }
const realFetch = globalThis.fetch;
let sent: string[] = []; // api/point/<req> に答えた state（error は理由付き）
beforeEach(() => {
  sent = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const b = JSON.parse(String(init?.body ?? "{}"));
    sent.push(`${url.replace("api/point/", "")} ${b.state}${b.error ? ` ${b.error}` : ""}`);
    return new Response(null, { status: 204 });
  }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; });

function book(id: string, nodes: object[]): FakeBook {
  const log: string[] = [];
  let pointed: string | null = null;
  let react: (() => void) | null = null;
  const graph = {
    toJSON: () => ({ nodes }),
    dragging: () => false,
    point: (box: string | null, onReact?: () => void) => {
      log.push(`point ${box}`);
      if (box != null && !nodes.some(n => String((n as { id: unknown }).id) === box)) return false;
      pointed = box; react = onReact ?? null; return true;
    },
    pointed: () => pointed,
    askBubbles: (owner: string, items: { text?: string }[], h: { seen(id: string): void }) => {
      log.push(`bubbles ${owner} ${items.map(i => i.text).join(",")}`);
      bubbleSeen = items.length ? () => h.seen("say") : null;
    },
    react: () => { const f = react; pointed = null; react = null; f?.(); },
  };
  return { id, loaded: true, data: null, graph: graph as unknown as Graph, log };
}
let bubbleSeen: (() => void) | null = null;
const reactOf = (b: FakeBook) => (b.graph as unknown as { react(): void }).react();

function pointer(books: FakeBook[], current: FakeBook | null) {
  const moves: string[] = [];
  let cur = current;
  const P = createPointer({
    books: () => books,
    current: () => (cur ? { book: cur, page: null } : null),
    openBook: async id => books.find(b => b.id === id) ?? null,
    activate: (b, page) => { cur = b; moves.push(`${b.id} ${page}`); },
    title: b => `ブック${b.id}`,
  });
  return { P, moves };
}
const NODES = [{ id: 1, caption: "一" }, { id: 2, page: "P" }, { id: 3, parent: 2, caption: "三" }];
const dialog = () => document.querySelector<HTMLElement>(".mz-dlg-overlay");

test("今のブックの箱なら、そのページへ移って枠を出し shown。反応までは次を pending で断り、反応したらまた出せる", async () => {
  const a = book("a", NODES);
  const { P, moves } = pointer([a], a);
  await P.answer("r1", "a", "3");
  expect(sent).toEqual(["r1 shown"]);
  expect(moves).toEqual(["a P"]); // 箱 3 は親 2 のページ P
  expect(a.log).toContain("point 3");
  expect(P.waiting()).toBe(true);
  expect(P.status("a")).toContain("box 3 is shown");
  expect(P.status("b")).toBe("");
  await P.answer("r2", "a", "1");
  expect(sent.at(-1)).toBe("r2 pending");
  reactOf(a);
  expect(P.waiting()).toBe(false);
  expect(P.status("a")).toContain("responded to box 3");
  await P.answer("r3", "a", "1");
  expect(sent.at(-1)).toBe("r3 shown");
});

test("無い箱・開けないブックは error で答える", async () => {
  const a = book("a", NODES);
  const { P } = pointer([a], a);
  await P.answer("r1", "a", "9");
  await P.answer("r2", "zz", "1");
  expect(sent).toEqual([
    "r1 error no box 9 in this diagram (removed boxes can't be shown)",
    "r2 error the diagram could not be opened in the browser",
  ]);
  expect(P.waiting()).toBe(false);
});

test("手すきでない（ダイアログ・説明ツアー・ドラッグ・ボタンを押している・文字の入力中）なら何もせず busy", async () => {
  const a = book("a", NODES);
  const { P } = pointer([a], a);
  const busy = async (req: string) => { await P.answer(req, "a", "1"); return sent.at(-1); };
  document.body.appendChild(Object.assign(document.createElement("div"), { className: "mz-dlg-overlay" }));
  expect(await busy("d")).toBe("d busy");
  document.body.innerHTML = "";
  document.body.classList.add("touring");
  expect(await busy("t")).toBe("t busy");
  document.body.classList.remove("touring");
  (a.graph as unknown as { dragging(): boolean }).dragging = () => true;
  expect(await busy("g")).toBe("g busy");
  (a.graph as unknown as { dragging(): boolean }).dragging = () => false;
  window.dispatchEvent(new PointerEvent("pointerdown"));
  expect(await busy("p")).toBe("p busy");
  window.dispatchEvent(new PointerEvent("pointerup"));
  const input = document.createElement("textarea");
  document.body.appendChild(input);
  input.focus();
  expect(await busy("i")).toBe("i busy");
  input.blur();
  expect(a.log.filter(l => l.startsWith("point"))).toEqual([]);
  expect(await busy("ok")).toBe("ok shown");
});

test("ほかのブックの箱は、移るかを確かめて asked。答えるまでは反応待ち、キャンセルなら declined を check に出す", async () => {
  const a = book("a", NODES), b = book("b", NODES);
  const { P, moves } = pointer([a, b], a);
  await P.answer("r1", "b", "1");
  expect(sent).toEqual(["r1 asked"]);
  expect(dialog()!.textContent).toContain("ブック「ブックb」の「一」を示しています");
  expect(P.waiting()).toBe(true);
  expect(P.status("b")).toContain("asked the user");
  await P.answer("r2", "a", "1");
  expect(sent.at(-1)).toBe("r2 pending");
  dialog()!.querySelector<HTMLElement>("[data-cancel]")!.click();
  await tick();
  expect(P.status("b")).toBe("focus: the user declined to move to box 1");
  expect(P.waiting()).toBe(false);
  expect(moves).toEqual([]);
});

test("ほかのブックへ移るを選べば、そのブックへ移って枠を出す", async () => {
  const a = book("a", NODES), b = book("b", NODES);
  const { P, moves } = pointer([a, b], a);
  await P.answer("r1", "b", "1");
  dialog()!.querySelector<HTMLElement>("[data-ok]")!.click();
  await tick();
  expect(moves).toEqual(["b null"]);
  expect(b.log).toContain("point 1");
  expect(P.status("b")).toContain("box 1 is shown");
});

test("focus -clear は、確かめのダイアログを閉じ、すべてのブックの枠と吹き出しを消して cleared。状態も消える", async () => {
  const a = book("a", NODES), b = book("b", NODES);
  const { P } = pointer([a, b], a);
  await P.answer("r1", "b", "1");
  await P.answer("r2", null, null);
  await tick();
  expect(sent.at(-1)).toBe("r2 cleared");
  expect(dialog()).toBeNull();
  expect(P.status("b")).toBe(""); // キャンセルの扱い（declined）にしない
  expect(P.waiting()).toBe(false);
  expect(a.log).toContain("bubbles focus ");
});

test("say があれば枠と一緒に簡易メッセージの吹き出しを出し、× で閉じたら枠も消えて反応になる", async () => {
  const a = book("a", NODES);
  const { P } = pointer([a], a);
  await P.answer("r1", "a", "1", "ここです");
  expect(a.log).toContain("bubbles focus ここです");
  bubbleSeen!();
  expect(a.log).toContain("point null");
  expect(P.status("a")).toContain("responded to box 1");
  expect(P.waiting()).toBe(false);
});

test("郵便箱から開いたフォーカスは、反応待ちでも新しい方に替える。ほかのブックの枠は消し、無い箱ならそのブックを開くだけ", async () => {
  const a = book("a", NODES), b = book("b", NODES);
  const { P, moves } = pointer([a, b], a);
  await P.answer("r1", "a", "1");
  await P.fromMail("b", "3");
  expect(a.log).toContain("point null");
  expect(moves.at(-1)).toBe("b P");
  expect(P.status("b")).toContain("box 3 is shown");
  await P.fromMail("a", "99");
  expect(moves.at(-1)).toBe("a null");
});
