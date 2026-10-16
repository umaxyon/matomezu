// AI の問い（D36）: 吹き出しと印（ask-bubbles.ts）、ドロワー（ask-drawer.ts）、話題の画面の側の判断（app-ask.ts）
import { afterEach, beforeEach, expect, test } from "bun:test";
import { type AskItem, type Topic, createAsker } from "../web/src/app-ask";
import { type BubbleHandlers, type BubbleItem, createAskBubbles } from "../web/src/ask-bubbles";
import { type DrawerItem, createAskDrawer } from "../web/src/ask-drawer";
import { closeEditDialog } from "../web/src/edit-dialog";
import type { Graph } from "../web/src/graph";

afterEach(() => {
  closeEditDialog();
  document.body.innerHTML = "";
});
const frame = () => new Promise(r => requestAnimationFrame(r));
const tick = () => new Promise(r => setTimeout(r, 5));
function place(el: Element, left: number, top: number, w: number, h: number) {
  el.getBoundingClientRect = () => ({ left, top, right: left + w, bottom: top + h, width: w, height: h, x: left, y: top, toJSON() {} }) as DOMRect;
}

// ---- 吹き出しと印（ask-bubbles.ts） ----

// happy-dom には配置の計算が無いので、吹き出しの大きさ（offsetWidth・offsetHeight）だけ決めておく（100×50）
const proto = HTMLElement.prototype;
const realOW = Object.getOwnPropertyDescriptor(proto, "offsetWidth"), realOH = Object.getOwnPropertyDescriptor(proto, "offsetHeight");
function bubbleSize(on: boolean) {
  if (!on) {
    Object.defineProperty(proto, "offsetWidth", realOW!);
    Object.defineProperty(proto, "offsetHeight", realOH!);
    return;
  }
  Object.defineProperty(proto, "offsetWidth", { configurable: true, get(this: HTMLElement) { return this.classList.contains("mz-ask-bubble") ? 100 : 0; } });
  Object.defineProperty(proto, "offsetHeight", { configurable: true, get(this: HTMLElement) { return this.classList.contains("mz-ask-bubble") ? 50 : 0; } });
}

function bubblesSetup() {
  const container = document.createElement("div");
  const canvasEl = document.createElement("div");
  const worldEl = document.createElement("div");
  container.appendChild(canvasEl);
  canvasEl.appendChild(worldEl);
  document.body.appendChild(container);
  place(container, 0, 0, 1000, 700);
  place(canvasEl, 0, 0, 1000, 700);
  place(worldEl, 0, 0, 1000, 700);
  const boxes = new Map<string, HTMLElement>();
  const addBox = (id: string, l: number, t: number, w = 100, h = 40) => {
    const el = boxes.get(id) ?? document.createElement("div");
    worldEl.appendChild(el);
    place(el, l, t, w, h);
    boxes.set(id, el);
    return el;
  };
  const B = createAskBubbles({
    container, worldEl, canvasEl, zoom: () => 1,
    drawnEl: id => boxes.get(id) ?? null,
    obstacles: id => [...boxes].filter(([k]) => k !== id).map(([, v]) => v),
  });
  const log: string[] = [];
  const h: BubbleHandlers = {
    answer: (id, c) => log.push(`answer ${id} ${c}`), seen: id => log.push(`seen ${id}`),
    hide: id => log.push(`hide ${id}`), open: id => log.push(`open ${id}`),
  };
  return { B, h, log, worldEl, addBox, boxes };
}
const bubble = (id: string) => document.querySelector<HTMLElement>(`.mz-ask-bubble[data-ask="${id}"]`);
const mark = (id: string) => document.querySelector<HTMLElement>(`.mz-ask-mark[data-ask="${id}"]`);
const q = (o: Partial<BubbleItem> & { id: string }): BubbleItem => ({ box: "1", view: "bubble", state: "open", ...o });

test("ボタンのある吹き出しは「–」で隠し、最初のボタンを主にする。ボタンの無い吹き出しは「×」で閉じる。2 つ以上なら A・B の札", async () => {
  const { B, h, addBox } = bubblesSetup();
  addBox("1", 400, 300);
  B.set([q({ id: "a", text: "どちら？", choices: ["はい", "いいえ"], letter: "A" }), q({ id: "b", text: "見てください", letter: "B" })], h);
  expect(bubble("a")!.querySelector("[data-hide]")!.textContent).toBe("–");
  expect([...bubble("a")!.querySelectorAll(".mz-ask-btn")].map(b => [b.textContent, b.classList.contains("mz-ask-primary")])).toEqual([["はい", true], ["いいえ", false]]);
  expect(bubble("a")!.querySelector(".mz-ask-id")!.textContent).toBe("A");
  expect(bubble("b")!.querySelector("[data-seen]")!.textContent).toBe("×");
  expect(bubble("b")!.querySelector(".mz-ask-btns")).toBeNull();
  B.destroy();
});

test("文字は HTML として解釈しない", () => {
  const { B, h, addBox } = bubblesSetup();
  addBox("1", 400, 300);
  B.set([q({ id: "a", text: "<b>x</b>", choices: ["<i>y</i>"] })], h);
  expect(bubble("a")!.querySelector(".mz-ask-text")!.textContent).toBe("<b>x</b>");
  expect(bubble("a")!.querySelector("i")).toBeNull();
  B.destroy();
});

test("押したボタンで答え・隠す・閉じるを知らせ、押した操作は図に届けない", () => {
  const { B, h, log, worldEl, addBox } = bubblesSetup();
  addBox("1", 400, 300);
  B.set([q({ id: "a", choices: ["はい", "いいえ"] }), q({ id: "b", text: "見て" })], h);
  let reached = 0;
  worldEl.addEventListener("pointerdown", () => { reached++; });
  worldEl.addEventListener("click", () => { reached++; });
  bubble("a")!.querySelector<HTMLElement>(".mz-ask-btn:nth-child(2)")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  bubble("a")!.querySelectorAll<HTMLElement>(".mz-ask-btn")[1]!.click();
  bubble("a")!.querySelector<HTMLElement>("[data-hide]")!.click();
  bubble("b")!.querySelector<HTMLElement>("[data-seen]")!.click();
  expect(log).toEqual(["answer a いいえ", "hide a", "seen b"]);
  expect(reached).toBe(0);
  B.destroy();
});

test("隠した吹き出しとドロワーの問いは印だけを出し、印を押すと開く（ドロワーの印は ≡）", async () => {
  const { B, h, log, addBox } = bubblesSetup();
  addBox("1", 400, 300);
  addBox("2", 100, 100);
  B.set([q({ id: "a", text: "x", state: "hidden" }), q({ id: "d", box: "2", view: "drawer", text: "長い問い" })], h);
  await frame();
  expect(bubble("a")?.hidden ?? true).toBe(true); // 隠した吹き出しは層に出さない
  expect(mark("a")!.hidden).toBe(false);
  expect(bubble("d")).toBeNull();
  expect(mark("d")!.textContent).toBe("≡");
  // 印は見えている部分の右上の角の外
  expect([mark("d")!.style.left, mark("d")!.style.top]).toEqual(["196px", "88px"]);
  mark("a")!.click();
  mark("d")!.click();
  expect(log).toEqual(["open a", "open d"]);
  B.destroy();
});

test("吹き出しは、ほかの箱に一番かからない側に置き、一度置いた側は（ほかの箱が動いても）変えない", async () => {
  bubbleSize(true);
  try {
    const { B, h, addBox } = bubblesSetup();
    addBox("1", 400, 300);
    addBox("2", 520, 300); // 右の側をふさぐ
    B.set([q({ id: "a", text: "x" })], h);
    await frame();
    expect(bubble("a")!.dataset.side).toBe("left");
    expect([bubble("a")!.style.left, bubble("a")!.style.top]).toEqual(["290px", "300px"]);
    addBox("2", 280, 300); // 今度は左をふさぐ
    await frame();
    await frame();
    expect(bubble("a")!.dataset.side).toBe("left");
    B.destroy();
  } finally {
    bubbleSize(false);
  }
});

test("同じ箱の 2 つの吹き出しは、重ならない側にそれぞれ置く", async () => {
  bubbleSize(true);
  try {
    const { B, h, addBox } = bubblesSetup();
    addBox("1", 400, 300);
    B.set([q({ id: "a", text: "x", letter: "A" }), q({ id: "b", text: "y", letter: "B" })], h);
    await frame();
    const sides = [bubble("a")!.dataset.side, bubble("b")!.dataset.side];
    expect(sides[0]).not.toBe(sides[1]);
    expect([bubble("a")!.hidden, bubble("b")!.hidden]).toEqual([false, false]);
    B.destroy();
  } finally {
    bubbleSize(false);
  }
});

test("箱が描かれていなければ、吹き出しも印も隠す。空にすると層ごと外す", async () => {
  const { B, h, worldEl } = bubblesSetup();
  B.set([q({ id: "a", box: "9", text: "x" })], h);
  await frame();
  expect(bubble("a")?.hidden ?? true).toBe(true);
  expect(mark("a")?.hidden ?? true).toBe(true);
  B.set([], h);
  expect(worldEl.querySelector(".mz-ask-layer")).toBeNull();
  expect(bubble("a")).toBeNull();
});

test("同じ問いを出し直しても要素は作り直さない（文字・ボタンが変われば作り直す）", async () => {
  const { B, h, addBox } = bubblesSetup();
  addBox("1", 400, 300);
  B.set([q({ id: "a", text: "x" })], h);
  const first = bubble("a");
  B.set([q({ id: "a", text: "x" })], h);
  expect(bubble("a")).toBe(first);
  B.set([q({ id: "a", text: "y" })], h);
  await frame();
  expect(bubble("a")).not.toBe(first);
  expect(document.querySelectorAll(".mz-ask-bubble").length).toBe(1);
  B.destroy();
});

// ---- ドロワー（ask-drawer.ts） ----

function drawerSetup() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const log: string[] = [];
  const D = createAskDrawer(host, {
    answer: (id, a, n) => log.push(`answer ${id} [${a.join(",")}] ${JSON.stringify(n)}`),
    decline: id => log.push(`decline ${id}`),
    seen: id => log.push(`seen ${id}`),
    reveal: box => log.push(`reveal ${box}`),
    shown: (r, b) => log.push(`shown ${r} ${b}`),
  });
  const el = host.querySelector<HTMLElement>(".mz-ask-drawer")!;
  return { D, log, el };
}
const it = (o: Partial<DrawerItem> = {}): DrawerItem => ({ id: "q1", box: "5", text: "問い", ...o });
const choose = (el: HTMLElement, i: number) => {
  const input = el.querySelectorAll<HTMLInputElement>('[name="mz-ask-choice"]')[i]!;
  input.checked = true;
  input.dispatchEvent(new Event("change", { bubbles: true }));
};
const btn = (el: HTMLElement, sel: string) => el.querySelector<HTMLButtonElement>(sel)!;

test("1 つ選ぶ問いはラジオで、選ぶまで「答える」は押せない。答えたら閉じて知らせる", () => {
  const { D, log, el } = drawerSetup();
  D.open(it({ choices: ["A 案", "B 案"] }), { caption: "箱" });
  expect(el.hidden).toBe(false);
  expect(D.showing()).toBe("q1");
  expect(el.querySelector<HTMLInputElement>('[name="mz-ask-choice"]')!.type).toBe("radio");
  expect(btn(el, "[data-ok]").disabled).toBe(true);
  btn(el, "[data-ok]").click();
  expect(log.filter(l => l.startsWith("answer"))).toEqual([]);
  choose(el, 1);
  expect(btn(el, "[data-ok]").disabled).toBe(false);
  btn(el, "[data-ok]").click();
  expect(log.slice(-2)).toEqual(["shown 0 0", 'answer q1 [B 案] ""']);
  expect(el.hidden).toBe(true);
  expect(D.showing()).toBeNull();
});

test("複数選択はチェックボックスで、選んだものと補足（前後の空白を除く）を返す", () => {
  const { D, log, el } = drawerSetup();
  D.open(it({ choices: ["a", "b", "c"], multi: true, input: true }), { caption: "箱" });
  expect(el.querySelector<HTMLInputElement>('[name="mz-ask-choice"]')!.type).toBe("checkbox");
  choose(el, 0);
  choose(el, 2);
  el.querySelector<HTMLTextAreaElement>("#mz-ask-note")!.value = "  補足  ";
  btn(el, "[data-ok]").click();
  expect(log.at(-1)).toBe('answer q1 [a,c] "補足"');
});

test("文字の入力だけの問いは、書けば答えられる（空白だけでは押せない）", () => {
  const { D, log, el } = drawerSetup();
  D.open(it({ input: true }), { caption: "箱" });
  const note = el.querySelector<HTMLTextAreaElement>("#mz-ask-note")!;
  note.value = "   ";
  note.dispatchEvent(new Event("input", { bubbles: true }));
  expect(btn(el, "[data-ok]").disabled).toBe(true);
  note.value = "答え";
  note.dispatchEvent(new Event("input", { bubbles: true }));
  btn(el, "[data-ok]").click();
  expect(log.at(-1)).toBe('answer q1 [] "答え"');
});

test("答えを求める問いには「答えない」がいつもあり、押すと閉じて decline", () => {
  const { D, log, el } = drawerSetup();
  D.open(it({ choices: ["x"] }), { caption: "箱" });
  btn(el, "[data-decline]").click();
  expect(log.at(-1)).toBe("decline q1");
  expect(el.hidden).toBe(true);
});

test("選択肢も入力も無い問いは「閉じる」だけで、押すと seen", () => {
  const { D, log, el } = drawerSetup();
  D.open(it(), { caption: "箱" });
  expect(el.querySelector("[data-decline]")).toBeNull();
  btn(el, "[data-seen]").click();
  expect(log.at(-1)).toBe("seen q1");
});

test("× と Esc は答えずに閉じる（あとで答えられる）。キーは図に届けない。閉じたままの close は知らせない", () => {
  const { D, log, el } = drawerSetup();
  let reached = 0;
  document.body.addEventListener("keydown", () => { reached++; });
  D.open(it({ choices: ["x"] }), { caption: "箱" });
  el.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
  expect(reached).toBe(0);
  el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(el.hidden).toBe(true);
  D.open(it({ choices: ["x"] }), { caption: "箱" });
  btn(el, "[data-close]").click();
  const n = log.length;
  D.close();
  expect(log.length).toBe(n);
  expect(log.filter(l => /^(answer|decline|seen)/.test(l))).toEqual([]);
});

test("対象の箱の名前を押すと、その箱を見せる（閉じない）", () => {
  const { D, log, el } = drawerSetup();
  D.open(it(), { caption: "<箱>" });
  expect(btn(el, "[data-reveal]").textContent).toBe("<箱>");
  btn(el, "[data-reveal]").click();
  expect(log.at(-1)).toBe("reveal 5");
  expect(el.hidden).toBe(false);
});

// ---- 話題の画面の側（app-ask.ts） ----

interface FakeBook { id: string; loaded: boolean; data: unknown; graph: Graph; log: string[]; bubbles: BubbleItem[]; h: BubbleHandlers | null }
const realFetch = globalThis.fetch;
let topic: Topic | null = null;
let posted: object[] = []; // api/ask/screen に送ったもの
let answered: string[] = []; // api/point/<req> に答えた state
beforeEach(() => {
  topic = null; posted = []; answered = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (url === "api/ask") return Response.json(topic ? JSON.parse(JSON.stringify(topic)) : {});
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (url === "api/ask/screen") posted.push(body);
    else answered.push(`${url.replace("api/point/", "")} ${body.state}${body.error ? ` ${body.error}` : ""}`);
    return new Response(null, { status: 204 });
  }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; });

function book(id: string, nodes: object[]): FakeBook {
  const b: FakeBook = { id, loaded: true, data: null, graph: null as unknown as Graph, log: [], bubbles: [], h: null };
  b.graph = {
    toJSON: () => ({ nodes }),
    askBubbles: (_owner: string, items: BubbleItem[], h: BubbleHandlers) => { b.bubbles = items; b.h = h; },
    reveal: (box: string) => b.log.push(`reveal ${box}`),
    askReveal: (_o: string, item: string) => b.log.push(`askReveal ${item}`),
    askInset: () => {},
  } as unknown as Graph;
  return b;
}
const NODES = [{ id: 1, caption: "一" }, { id: 2, caption: "二" }, { id: 3, page: "P" }, { id: 4, parent: 3 }];
const ai = (o: Partial<AskItem> & { id: string; box: string }): AskItem => ({ view: "bubble", state: "open", ...o });

function asker(books: FakeBook[], current: FakeBook | null, o: { busy?: boolean; waiting?: boolean } = {}) {
  const moves: string[] = [], frames: string[] = [];
  let cur = current;
  const palette = document.createElement("div"), drawerHost = document.createElement("div");
  document.body.append(palette, drawerHost);
  const A = createAsker({
    books: () => books,
    current: () => (cur ? { book: cur, page: null } : null),
    openBook: async id => books.find(b => b.id === id) ?? null,
    activate: (b, page) => { cur = b; moves.push(`${b.id} ${page}`); },
    title: b => `ブック${b.id}`,
    busy: () => !!o.busy,
    focusWaiting: () => !!o.waiting,
    palette, drawerHost,
    frame: (b, box) => frames.push(`${b.id} ${box}`),
  });
  return { A, moves, frames, palette, drawer: () => drawerHost.querySelector<HTMLElement>(".mz-ask-drawer")! };
}
const paletteBtn = (p: HTMLElement, id: string) => p.querySelector<HTMLElement>(`[data-ask="${id}"]`)!;

test("フォーカスの反応待ちなら pending、手すきでなければ busy で断り、話題を読みにも行かない", async () => {
  const a = book("a", NODES);
  topic = { doc: "a", path: "", state: "open", items: [ai({ id: "x", box: "1" })] };
  await asker([a], a, { waiting: true }).A.answer("r1", "a");
  await asker([a], a, { busy: true }).A.answer("r2", "a");
  expect(answered).toEqual(["r1 pending", "r2 busy"]);
  expect(a.bubbles).toEqual([]);
});

test("話題が無い・別のブック・無い箱・ページをまたぐ箱は error", async () => {
  const a = book("a", NODES);
  const { A } = asker([a], a);
  await A.answer("r1", "a");
  topic = { doc: "a", path: "", state: "open", items: [ai({ id: "x", box: "9" })] };
  await A.answer("r2", "a");
  await A.answer("r3", "b");
  topic.items = [ai({ id: "x", box: "1" }), ai({ id: "y", box: "4" })];
  await A.answer("r4", "a");
  expect(answered).toEqual([
    "r1 error the topic is gone",
    "r2 error no box 9 in this diagram (removed boxes can't be asked about)",
    "r3 error the topic is gone",
    "r4 error the boxes are on different pages; ask about one page at a time",
  ]);
});

test("今のブックなら、そのページへ移って吹き出しを出し shown。最初の箱を見せる（focus なら枠を出す）", async () => {
  const a = book("a", NODES);
  topic = { doc: "a", path: "", state: "open", items: [ai({ id: "x", box: "4", text: "これ？", choices: ["はい"], letter: "A" }), ai({ id: "y", box: "3", state: "hidden", letter: "B" })] };
  const { A, moves, frames, palette } = asker([a], a);
  await A.answer("r1", "a");
  expect(answered).toEqual(["r1 shown"]);
  expect(moves).toEqual(["a P"]);
  expect(a.log).toEqual(["reveal 4"]);
  expect(a.bubbles.map(b => [b.id, b.state])).toEqual([["x", "open"], ["y", "hidden"]]);
  expect(palette.hidden).toBe(false);
  expect(palette.querySelector(".ask-count")!.textContent).toBe("0 / 2");
  await A.answer("r2", "a", true);
  expect(frames).toEqual(["a 4"]);
});

test("答えた・見た・答えない問いは吹き出しから外し、パレットの数に入れる。操作はすぐ画面に映してからサーバーへ送る", async () => {
  const a = book("a", NODES);
  topic = { doc: "a", path: "", state: "open", items: [ai({ id: "x", box: "1", choices: ["はい", "いいえ"] }), ai({ id: "y", box: "2", text: "見て" }), ai({ id: "z", box: "2" })] };
  const { A, palette } = asker([a], a);
  await A.answer("r1", "a");
  a.h!.answer("x", "いいえ");
  expect(a.bubbles.map(b => b.id)).toEqual(["y", "z"]);
  a.h!.seen("y");
  a.h!.hide("z");
  expect(a.bubbles.map(b => [b.id, b.state])).toEqual([["z", "hidden"]]);
  expect(palette.querySelector(".ask-count")!.textContent).toBe("2 / 3");
  expect(paletteBtn(palette, "x").classList.contains("ask-done")).toBe(true);
  expect(posted).toEqual([
    { item: "x", state: "answered", answer: ["いいえ"] },
    { item: "y", state: "seen" },
    { item: "z", state: "hidden" },
  ]);
  a.h!.open("z");
  expect(a.bubbles.map(b => [b.id, b.state])).toEqual([["z", "open"]]);
  a.h!.answer("nope", "x"); // 無い問いは何もしない
  expect(posted.length).toBe(4);
});

test("サーバーで答えない（declined）になった問いも、終わった問いとして吹き出しから外す", async () => {
  const a = book("a", NODES);
  topic = { doc: "a", path: "", state: "open", items: [ai({ id: "x", box: "1", state: "declined" }), ai({ id: "y", box: "2", state: "seen" }), ai({ id: "z", box: "2" })] };
  const { A, palette } = asker([a], a);
  await A.refresh();
  expect(a.bubbles.map(b => b.id)).toEqual(["z"]);
  expect(palette.querySelector(".ask-count")!.textContent).toBe("2 / 3");
});

test("パレットを押すと、その問いのページへ移り、隠していれば開いて見せる。答えた問いは箱を見せるだけ", async () => {
  const a = book("a", NODES);
  topic = { doc: "a", path: "", state: "open", items: [ai({ id: "x", box: "4", state: "hidden", letter: "A" }), ai({ id: "y", box: "3", state: "answered", letter: "B" })] };
  const { A, moves, palette } = asker([a], a);
  await A.answer("r1", "a");
  a.log = [];
  paletteBtn(palette, "x").click();
  expect(moves.at(-1)).toBe("a P");
  expect(posted.at(-1)).toEqual({ item: "x", state: "open" });
  expect(a.log).toEqual(["askReveal x"]);
  paletteBtn(palette, "y").click();
  expect(a.log.at(-1)).toBe("reveal 3");
});

test("パレットはその話題のブックを見ているときだけ出す", async () => {
  const a = book("a", NODES), b = book("b", NODES);
  topic = { doc: "a", path: "", state: "open", items: [ai({ id: "x", box: "1" })] };
  const { A, palette } = asker([a, b], b);
  await A.refresh();
  expect(palette.hidden).toBe(true);
  expect(a.bubbles.length).toBe(1); // 吹き出しは話題のブックの図に出しておく
  expect(b.bubbles).toEqual([]);
});

test("「終える」で、ユーザーが話題を終える（吹き出しを消し、ended を送る）", async () => {
  const a = book("a", NODES);
  topic = { doc: "a", path: "", state: "open", items: [ai({ id: "x", box: "1" })] };
  const { A, palette } = asker([a], a);
  await A.answer("r1", "a");
  palette.querySelector<HTMLElement>("[data-ask-end]")!.click();
  expect(posted.at(-1)).toEqual({ state: "ended" });
  expect(a.bubbles).toEqual([]);
  expect(palette.hidden).toBe(true);
  expect(A.topic()).toBeNull();
  expect(A.open()).toBe(false);
});

test("ほかのブックの話題は、移るかを確かめて asked。キャンセルなら declined、移動なら open を送って移る", async () => {
  const a = book("a", NODES), b = book("b", NODES);
  topic = { doc: "b", path: "", state: "asking", items: [ai({ id: "x", box: "1" }), ai({ id: "y", box: "2" })] };
  const { A, moves } = asker([a, b], a);
  await A.answer("r1", "b");
  expect(answered).toEqual(["r1 asked"]);
  const dlg = () => document.querySelector<HTMLElement>(".mz-dlg-overlay")!;
  expect(dlg().textContent).toContain("ブック「ブックb」の箱について、AI が 2 件の問いを出しています");
  dlg().querySelector<HTMLElement>("[data-cancel]")!.click();
  await tick();
  expect(posted).toEqual([{ state: "declined" }]);
  expect(moves).toEqual([]);
  await A.answer("r2", "b");
  dlg().querySelector<HTMLElement>("[data-ok]")!.click();
  await tick();
  expect(posted.slice(1)).toEqual([{ state: "open" }]); // 移ったら declined は送らない
  expect(moves).toEqual(["b null"]);
  expect(b.log).toEqual(["reveal 1"]);
  expect(b.bubbles.map(x => x.id)).toEqual(["x", "y"]);
});

test("話題のブックを閉じたら closed を送る。ほかのブック・終わった話題では送らない", async () => {
  const a = book("a", NODES);
  topic = { doc: "a", path: "", state: "open", items: [ai({ id: "x", box: "1" })] };
  const { A } = asker([a], a);
  await A.refresh();
  expect(A.open()).toBe(true);
  A.bookClosed("b");
  expect(posted).toEqual([]);
  A.bookClosed("a");
  A.bookClosed("a");
  expect(posted).toEqual([{ state: "closed" }]);
  expect(A.open()).toBe(false);
});

test("ドロワーの問いは、パレットで開いて答えられる。答えたらドロワーを閉じ、話題が終われば開いていたドロワーも閉じる", async () => {
  const a = book("a", NODES);
  topic = { doc: "a", path: "", state: "open", items: [ai({ id: "x", box: "1", view: "drawer", choices: ["a", "b"], multi: true }), ai({ id: "y", box: "2", view: "drawer", text: "長い" })] };
  const { A, palette, drawer } = asker([a], a);
  await A.answer("r1", "a");
  paletteBtn(palette, "x").click();
  expect(drawer().hidden).toBe(false);
  expect(drawer().querySelector("[data-reveal]")!.textContent).toBe("一"); // 対象の箱の名前
  const box = drawer().querySelector<HTMLInputElement>('[name="mz-ask-choice"]')!;
  box.checked = true;
  box.dispatchEvent(new Event("change", { bubbles: true }));
  drawer().querySelector<HTMLElement>("[data-ok]")!.click();
  expect(posted.at(-1)).toEqual({ item: "x", state: "answered", answer: ["a"], note: "" });
  expect(drawer().hidden).toBe(true);
  // 開いている間に AI が話題を終えた
  paletteBtn(palette, "y").click();
  expect(drawer().hidden).toBe(false);
  topic = { ...topic!, state: "closed" };
  await A.refresh();
  expect(drawer().hidden).toBe(true);
});
