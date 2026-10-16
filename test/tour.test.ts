// 説明ツアー（D38）: 幕と吹き出し（tour-view.ts）と、始め方・段の進み・終え方の判断（app-tour.ts）
import { afterEach, beforeEach, expect, test } from "bun:test";
import { createTourer } from "../web/src/app-tour";
import { closeEditDialog } from "../web/src/edit-dialog";
import type { Graph } from "../web/src/graph";
import type { MailNote } from "../web/src/mailbox";
import { clearToasts } from "../web/src/toast";
import { createTourView } from "../web/src/tour-view";

const frame = () => new Promise(r => requestAnimationFrame(r));
const wait = (ms = 30) => new Promise(r => setTimeout(r, ms));
function place(el: Element, left: number, top: number, w: number, h: number) {
  el.getBoundingClientRect = () => ({ left, top, right: left + w, bottom: top + h, width: w, height: h, x: left, y: top, toJSON() {} }) as DOMRect;
}
const dialogTitle = () => document.querySelector(".mz-dlg-overlay #mz-dlg-title")?.textContent ?? null;
const dlgBtn = (label: string) => [...document.querySelectorAll<HTMLElement>(".mz-dlg-overlay button")].find(b => b.textContent === label) ?? null;
const toasts = () => [...document.querySelectorAll(".mz-toast")].map(t => t.textContent!.slice(1));

let cleanup: (() => Promise<void> | void) | null = null;
afterEach(async () => {
  await cleanup?.();
  cleanup = null;
  closeEditDialog();
  clearToasts();
  document.body.innerHTML = "";
  document.body.classList.remove("touring");
});

// ---- 幕と吹き出し（tour-view.ts） ----

function viewSetup() {
  const log: string[] = [];
  const V = createTourView({ prev: () => log.push("prev"), next: () => log.push("next"), close: () => log.push("close"), lost: () => log.push("lost") });
  cleanup = () => V.destroy();
  const box = document.createElement("div");
  document.body.appendChild(box);
  place(box, 100, 100, 50, 20);
  let found: HTMLElement | null = box;
  const step = (index: number, count = 3) => V.show({ find: () => found, color: "#0a0", say: `段 ${index + 1}`, index, count });
  return { V, log, box, step, lose: () => { found = null; } };
}
const bubbleEl = () => document.querySelector<HTMLElement>(".mz-tour-bubble")!;
const nav = (sel: string) => bubbleEl().querySelector<HTMLButtonElement>(sel)!;
const key = (k: string, o: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...o });
  document.body.dispatchEvent(e);
  return e;
};

test("幕をかけている間は body に touring を付け、外すと幕ごと消す", () => {
  const { V } = viewSetup();
  expect(document.querySelector(".mz-tour")).not.toBeNull();
  expect(document.body.classList.contains("touring")).toBe(true);
  V.destroy();
  expect(document.querySelector(".mz-tour")).toBeNull();
  expect(document.body.classList.contains("touring")).toBe(false);
});

test("最初の段は［前へ］を押せず、最後の段は［次へ］が［終わる］になる。何段目かを出す", () => {
  const { step } = viewSetup();
  step(0);
  expect(nav("[data-prev]").disabled).toBe(true);
  expect(nav("[data-next]").textContent).toBe("次へ →");
  expect(bubbleEl().querySelector(".mz-tour-count")!.textContent).toBe("1 / 3");
  expect(bubbleEl().querySelector(".mz-tour-say")!.textContent).toBe("段 1");
  step(2);
  expect(nav("[data-prev]").disabled).toBe(false);
  expect(nav("[data-next]").textContent).toBe("終わる");
});

test("吹き出しのボタンで前へ・次へ・×（押せない［前へ］は何もしない）", () => {
  const { log, step } = viewSetup();
  step(0);
  nav("[data-prev]").click();
  nav("[data-next]").click();
  step(1);
  nav("[data-prev]").click();
  nav("[data-close]").click();
  expect(log).toEqual(["next", "prev", "close"]);
});

test("キーは ← → と Esc だけを受け、ほかのキーは図に届けない。最初の段の ← と、押し続け（repeat）は何もしない", () => {
  const { log, step } = viewSetup();
  let reached = 0;
  const listen = () => { reached++; };
  window.addEventListener("keydown", listen);
  try {
    step(0);
    key("ArrowLeft");
    key("ArrowRight");
    key("ArrowRight", { repeat: true });
    step(1);
    key("ArrowLeft");
    expect(key("z", { ctrlKey: true }).defaultPrevented).toBe(true);
    key("Escape");
    expect(log).toEqual(["next", "prev", "close"]);
    expect(reached).toBe(0);
  } finally {
    window.removeEventListener("keydown", listen);
  }
});

test("ダイアログ（終えるかの確かめなど）が開いている間は、キーをダイアログに任せる", () => {
  const { log, step } = viewSetup();
  step(1);
  const overlay = document.createElement("div");
  overlay.className = "mz-dlg-overlay";
  document.body.appendChild(overlay);
  expect(key("Escape").defaultPrevented).toBe(false);
  key("ArrowLeft");
  expect(log).toEqual([]);
});

test("幕の上を押しても図に届けない（吹き出しのボタンは効く）", () => {
  const { step } = viewSetup();
  step(0);
  let reached = 0;
  document.addEventListener("pointerdown", () => { reached++; });
  document.addEventListener("click", () => { reached++; });
  const curtain = document.querySelector<HTMLElement>(".mz-tour")!;
  curtain.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
  curtain.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  expect(reached).toBe(0);
  const wheel = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 100 });
  curtain.dispatchEvent(wheel);
  expect(wheel.defaultPrevented).toBe(true);
});

test("枠は箱の 6px 外に描き、吹き出しは入るなら箱の右に、上下は箱の真ん中にそろえる", async () => {
  const { step } = viewSetup();
  step(0);
  await frame();
  const hole = document.querySelector<HTMLElement>(".mz-tour-hole")!;
  expect([hole.style.left, hole.style.top, hole.style.width, hole.style.height]).toEqual(["94px", "94px", "62px", "32px"]);
  expect(bubbleEl().style.left).toBe("168px"); // 枠の右 156 + 12
});

test("段の箱が無くなったら lost。段を移る間（hold）は箱を追わない", async () => {
  const { V, log, step, lose } = viewSetup();
  step(0);
  V.hold();
  lose();
  await frame();
  await frame();
  expect(log).toEqual([]);
  expect(document.querySelector<HTMLElement>(".mz-tour-hole")!.hidden).toBe(true);
  step(1);
  await frame();
  expect(log).toContain("lost");
});

// ---- 始め方・段の進み・終え方（app-tour.ts） ----

interface Step { doc: string; box: string; say: string }
interface FakeBook { id: string; loaded: boolean; data: unknown; graph: Graph; stage: HTMLElement; log: string[]; zoom: number }
const realFetch = globalThis.fetch;
let tour: { id: string; title: string; steps: Step[]; state: string } | null = null;
let screen: string[] = [];   // api/tour/screen に送った state
let answered: string[] = []; // api/point/<req> に答えた state
let mailCalls: string[] = [];
beforeEach(() => {
  tour = null; screen = []; answered = []; mailCalls = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (url === "api/tour") return Response.json(tour ?? {});
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (url === "api/tour/screen") screen.push(body.state);
    else if (url.startsWith("api/point/")) answered.push(`${url.slice(10)} ${body.state}${body.error ? ` ${body.error}` : ""}`);
    else if (url.includes("/api/mail")) {
      mailCalls.push(`${method} ${url}`);
      if (method === "POST" && url.endsWith("/api/mail")) return Response.json({ id: 42 });
    }
    return new Response(null, { status: 204 });
  }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; });

function book(id: string, nodes: { id: number; page?: string }[], boxSize = { w: 100, h: 40 }): FakeBook {
  const b = { id, loaded: true, data: null, stage: document.createElement("div"), log: [] as string[], zoom: 1, graph: null as unknown as Graph } as FakeBook;
  b.graph = {
    toJSON: () => ({ nodes }),
    zoom: () => b.zoom,
    tourTarget: (box: string) => {
      if (!nodes.some(n => String(n.id) === box)) return null;
      const el = document.createElement("div");
      document.body.appendChild(el);
      place(el, 100, 100, boxSize.w * b.zoom, boxSize.h * b.zoom);
      return { el, color: "#0a0" };
    },
    center: (box: string) => b.log.push(`center ${box}`),
  } as unknown as Graph;
  return b;
}
const NODES = [{ id: 1 }, { id: 2, page: "P" }];

function tourer(books: FakeBook[], current: FakeBook | null, o: { busy?: boolean; waiting?: boolean } = {}) {
  const moves: string[] = [], zooms: number[] = [], queued: MailNote[] = [];
  let cur = current, sideClosed = 0;
  const T = createTourer({
    books: () => books,
    current: () => (cur ? { book: cur, page: "start" } : null),
    openBook: async id => books.find(b => b.id === id) ?? null,
    activate: (b, page) => { cur = b; moves.push(`${b.id} ${page}`); },
    title: b => b.id,
    busy: () => !!o.busy,
    focusWaiting: () => !!o.waiting,
    setZoom: z => { zooms.push(z); for (const b of books) b.zoom = z; },
    closeSide: () => { sideClosed++; },
    queue: (note, _into, _sent, show) => { queued.push(note); show(); },
  });
  // テストの終わりに出しているツアーを止める（幕のキーの受け取りを次のテストへ残さない）
  cleanup = async () => { if (T.running()) { tour = null; await T.refresh(); } };
  return { T, moves, zooms, queued, side: () => sideClosed };
}
const TOUR = (steps: Step[]) => ({ id: "t1", title: "設計の説明", steps, state: "waiting" });
const S = (doc: string, box: string, say = `箱 ${box}`): Step => ({ doc, box, say });

test("ツアー中・手すきでない・フォーカスの反応待ちなら案内を断る（pending・busy・pending）", async () => {
  const a = book("a", NODES);
  tour = TOUR([S("a", "1")]);
  await tourer([a], a, { busy: true }).T.answer("r1", "t1", false);
  await tourer([a], a, { waiting: true }).T.answer("r2", "t1", false);
  expect(answered).toEqual(["r1 busy", "r2 pending"]);
});

test("ツアーが無い・違う・段の箱が無い・開けないブックは error（何段目かを添える）", async () => {
  const a = book("a", NODES);
  const { T, queued } = tourer([a], a);
  await T.answer("r1", "t1", false);
  tour = TOUR([S("a", "1"), S("a", "9")]);
  await T.answer("r2", "other", false);
  await T.answer("r3", "t1", false);
  tour = TOUR([S("zz", "1")]);
  await T.answer("r4", "t1", false);
  expect(answered).toEqual([
    "r1 error the tour is gone",
    "r2 error the tour is gone",
    "r3 error step 2: no box 9 in that diagram (removed boxes can't be shown)",
    "r4 error step 1: the diagram could not be opened in the browser",
  ]);
  expect(queued).toEqual([]);
});

test("ダイアログで届いた案内は郵便箱に入れず、［拒否］［開始］だけ（キャンセル・Esc なし）。拒否は interrupt", async () => {
  const a = book("a", NODES);
  tour = TOUR([S("a", "1"), S("a", "2")]);
  const { T } = tourer([a], a);
  await T.answer("r1", "t1", false);
  await wait();
  expect(answered).toEqual(["r1 offered"]);
  expect(mailCalls).toEqual([]);
  expect(document.querySelector(".mz-dlg-overlay")!.textContent).toContain("「設計の説明」の説明ツアーを開始してもいいですか？（2 ステップ）");
  expect(dlgBtn("キャンセル")).toBeNull();
  document.querySelector(".mz-dlg-overlay")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(dialogTitle()).toBe("説明ツアー");
  dlgBtn("拒否")!.click();
  await wait();
  expect(screen).toEqual(["interrupt"]);
  expect(T.running()).toBe(false);
});

test("郵便（-mail）の案内は今見ているブックの郵便箱にだけ入れる。郵便箱から開くとキャンセルもあり、キャンセルなら郵便箱に残る", async () => {
  const a = book("a", NODES);
  tour = TOUR([S("a", "1")]);
  const { T, queued } = tourer([a], a);
  await T.answer("r1", "t1", true);
  expect(mailCalls).toEqual(["POST d/a/api/mail"]);
  expect(queued).toEqual([]);
  expect(answered).toEqual(["r1 offered"]);
  await T.offer("t1", "a", "42");
  dlgBtn("キャンセル")!.click();
  expect(mailCalls.length).toBe(1);
  await T.offer("t1", "a", "42");
  dlgBtn("開始")!.click();
  await wait();
  expect(mailCalls.at(-1)).toBe("DELETE d/a/api/mail/42");
  expect(T.running()).toBe(true);
});

test("終わったツアーの案内を郵便箱から開いたら、知らせて郵便箱から取り除く", async () => {
  const a = book("a", NODES);
  tour = { ...TOUR([S("a", "1")]), state: "complete" };
  const { T } = tourer([a], a);
  await T.offer("t1", "a", "42");
  expect(dialogTitle()).toBeNull();
  expect(toasts()).toEqual(["このツアーはもう終わっています"]);
  expect(mailCalls).toEqual(["DELETE d/a/api/mail/42"]);
});

test("開始すると running を送り、サイドバーを閉じ、段の箱のブック・ページへ移って真ん中に寄せる。段はブックをまたぐ", async () => {
  const a = book("a", NODES), b = book("b", NODES);
  tour = TOUR([S("a", "2", "ここが入口"), S("b", "1")]);
  const { T, moves, side } = tourer([a, b], a);
  await T.answer("r1", "t1", false);
  await wait(); // 案内のダイアログはツアーを読み直してから出る
  dlgBtn("開始")!.click();
  await wait();
  expect(screen).toEqual(["running"]);
  expect(side()).toBe(1);
  expect(moves).toEqual(["a P"]);
  expect(a.log).toEqual(["center 2"]);
  expect(document.querySelector(".mz-tour-say")!.textContent).toBe("ここが入口");
  nav("[data-next]").click();
  await wait();
  expect(moves.at(-1)).toBe("b null");
  expect(b.log).toEqual(["center 1"]);
  expect(nav("[data-next]").textContent).toBe("終わる");
  nav("[data-prev]").click();
  await wait();
  expect(moves.at(-1)).toBe("a P");
});

test("最後の段の［終わる］で complete を送り、［開始前の場所に戻る］で開始前のブック・ページ・倍率へ戻る", async () => {
  const a = book("a", NODES), b = book("b", NODES);
  a.zoom = 1.25;
  tour = TOUR([S("b", "1")]);
  const { T, moves, zooms } = tourer([a, b], a);
  await T.answer("r1", "t1", false);
  await wait(); // 案内のダイアログはツアーを読み直してから出る
  dlgBtn("開始")!.click();
  await wait();
  nav("[data-next]").click();
  expect(screen).toEqual(["running", "complete"]);
  expect(T.running()).toBe(false);
  expect(document.querySelector(".mz-tour")).toBeNull();
  expect(dialogTitle()).toBe("ツアーが終わりました");
  expect(dlgBtn("キャンセル")).toBeNull();
  dlgBtn("開始前の場所に戻る")!.click();
  expect(moves.at(-1)).toBe("a start");
  expect(zooms.at(-1)).toBe(1.25);
});

test("× で終えるかを確かめる。キャンセルなら続け、［ここに留まる］なら interrupt を送ってその場で終える", async () => {
  const a = book("a", NODES);
  tour = TOUR([S("a", "1"), S("a", "2")]);
  const { T, moves } = tourer([a], a);
  await T.answer("r1", "t1", false);
  await wait(); // 案内のダイアログはツアーを読み直してから出る
  dlgBtn("開始")!.click();
  await wait();
  nav("[data-close]").click();
  expect(dialogTitle()).toBe("ツアーを終えますか？");
  dlgBtn("キャンセル")!.click();
  await wait();
  expect(T.running()).toBe(true);
  nav("[data-close]").click();
  const n = moves.length;
  dlgBtn("ここに留まる")!.click();
  expect(screen).toEqual(["running", "interrupt"]);
  expect(T.running()).toBe(false);
  expect(moves.length).toBe(n); // 戻らない
});

test("× の［開始前の場所に戻る］は interrupt を送って戻る", async () => {
  const a = book("a", NODES), b = book("b", NODES);
  tour = TOUR([S("b", "1")]);
  const { T, moves } = tourer([a, b], a);
  await T.answer("r1", "t1", false);
  await wait(); // 案内のダイアログはツアーを読み直してから出る
  dlgBtn("開始")!.click();
  await wait();
  nav("[data-close]").click();
  dlgBtn("開始前の場所に戻る")!.click();
  expect(screen).toEqual(["running", "interrupt"]);
  expect(moves.at(-1)).toBe("a start");
});

test("箱が今の倍率で収まらなければ、収まる段まで倍率を下げる（一番小さい段より下げない）", async () => {
  const a = book("a", NODES, { w: 1000, h: 40 }); // 見える幅 1000 の 8 割に収まらない
  tour = TOUR([S("a", "1")]);
  const { T, zooms } = tourer([a], a);
  await T.answer("r1", "t1", false);
  await wait(); // 案内のダイアログはツアーを読み直してから出る
  dlgBtn("開始")!.click();
  await wait();
  expect(zooms).toEqual([0.75]);
  const b = book("b", NODES, { w: 5000, h: 40 });
  tour = { ...TOUR([S("b", "1")]), id: "t2" };
  await T.refresh(); // t1 は取り下げられた
  const t2 = tourer([b], b);
  await t2.T.answer("r2", "t2", false);
  await wait(); // 案内のダイアログはツアーを読み直してから出る
  dlgBtn("開始")!.click();
  await wait();
  expect(t2.zooms).toEqual([0.5]);
});

test("段の箱が無くなったら、その場で止めて interrupt を送り、知らせる", async () => {
  const nodes = [{ id: 1 }, { id: 2 }];
  const a = book("a", nodes);
  tour = TOUR([S("a", "1"), S("a", "2")]);
  const { T } = tourer([a], a);
  await T.answer("r1", "t1", false);
  await wait(); // 案内のダイアログはツアーを読み直してから出る
  dlgBtn("開始")!.click();
  await wait();
  nodes.pop(); // AI の set で箱 2 が消えた
  nav("[data-next]").click();
  await wait();
  expect(T.running()).toBe(false);
  expect(screen).toEqual(["running", "interrupt"]);
  expect(toasts()).toEqual(["示す箱が無くなったので、ツアーを終えました"]);
});

test("サーバーのツアーが取り下げられたら止めて知らせる。続いていれば何もしない", async () => {
  const a = book("a", NODES);
  tour = TOUR([S("a", "1")]);
  const { T } = tourer([a], a);
  await T.answer("r1", "t1", false);
  await wait(); // 案内のダイアログはツアーを読み直してから出る
  dlgBtn("開始")!.click();
  await wait();
  tour = { ...tour!, state: "running" };
  await T.refresh();
  expect(T.running()).toBe(true);
  tour = null;
  await T.refresh();
  expect(T.running()).toBe(false);
  expect(document.querySelector(".mz-tour")).toBeNull();
  expect(toasts()).toEqual(["AI がツアーを取り下げました"]);
  expect(screen).toEqual(["running"]); // 取り下げたのは AI なので interrupt は送らない
});

test("ツアー中に届いた次の案内は pending で断る", async () => {
  const a = book("a", NODES);
  tour = TOUR([S("a", "1")]);
  const { T } = tourer([a], a);
  await T.answer("r1", "t1", false);
  await wait(); // 案内のダイアログはツアーを読み直してから出る
  dlgBtn("開始")!.click();
  await wait();
  await T.answer("r2", "t1", false);
  expect(answered.at(-1)).toBe("r2 pending");
});
