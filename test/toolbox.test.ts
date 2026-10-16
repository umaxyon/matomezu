// 道具箱（toolbox.ts）と、マスターの追加削除（cross-list.ts）
import { afterEach, expect, test } from "bun:test";
import { CROSS_MIME, type CrossPayload, createCrossList } from "../web/src/cross-list";
import { createToolbox } from "../web/src/toolbox";
import type { Diagram } from "../web/src/types";

afterEach(() => { document.body.innerHTML = ""; });
const tick = () => new Promise(r => setTimeout(r, 0));
function place(el: Element, left: number, top: number, w: number, h: number) {
  el.getBoundingClientRect = () => ({ left, top, right: left + w, bottom: top + h, width: w, height: h, x: left, y: top, toJSON() {} }) as DOMRect;
}

// ---- 道具箱 ----

const TOOLS = [{ key: "add", label: "追加 <箱>", icon: "<rect/>" }, { key: "circle", label: "円", icon: "<circle/>" }];
function toolSetup() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const picks: string[] = [];
  const box = createToolbox(container, (key, by) => picks.push(`${key} ${by}`));
  const el = container.querySelector<HTMLElement>(".mz-toolbox")!;
  return { container, box, el, picks };
}
const buttons = (el: HTMLElement) => [...el.querySelectorAll<HTMLButtonElement>("button[data-tool]")];

test("渡された道具を並べ、名前は title と読み上げに文字として使う。出すまでは隠す", () => {
  const { box, el } = toolSetup();
  expect(el.hidden).toBe(true);
  box.show(null, TOOLS);
  expect(el.hidden).toBe(false);
  expect(buttons(el).map(b => [b.dataset.tool, b.title, b.getAttribute("aria-label")])).toEqual([["add", "追加 <箱>", "追加 <箱>"], ["circle", "円", "円"]]);
  expect(buttons(el)[0]!.querySelector("svg rect")).not.toBeNull();
  box.hide();
  expect(el.hidden).toBe(true);
});

test("押した道具を、ポインタかキーボードかと一緒に知らせる（detail が 0 ならキーボード）", () => {
  const { box, el, picks } = toolSetup();
  box.show(null, TOOLS);
  buttons(el)[1]!.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
  buttons(el)[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
  expect(picks).toEqual(["circle pointer", "add key"]);
});

test("押している道具を示し、同じ道具で出し直しても、違う道具に並べ替えても印を保つ", () => {
  const { box, el } = toolSetup();
  box.show(null, TOOLS);
  box.press("circle");
  const pressed = () => buttons(el).map(b => b.getAttribute("aria-pressed"));
  expect(pressed()).toEqual(["false", "true"]);
  const first = buttons(el)[0];
  box.show(null, TOOLS);
  expect(buttons(el)[0]).toBe(first); // 同じ道具なら作り直さない
  box.show(null, [TOOLS[1]!]);
  expect(pressed()).toEqual(["true"]);
  box.press(null);
  expect(pressed()).toEqual(["false"]);
});

test("道具箱の上の操作は図（スクロールする要素）に届けない", () => {
  const { container, box, el } = toolSetup();
  box.show(null, TOOLS);
  let reached = 0;
  for (const type of ["pointerdown", "click", "dblclick"]) container.addEventListener(type, () => { reached++; });
  for (const type of ["pointerdown", "click", "dblclick"]) buttons(el)[0]!.dispatchEvent(new MouseEvent(type, { bubbles: true }));
  expect(reached).toBe(0);
});

test("箱を渡せば箱の右の縁の 8px 右に、渡さなければ見えている範囲の左端の上下の真ん中に置き、スクロールについていく", () => {
  const { container, box, el } = toolSetup();
  place(container, 10, 20, 1000, 700);
  const anchor = document.createElement("div");
  place(anchor, 110, 70, 50, 30);
  container.scrollLeft = 0;
  box.show(anchor, TOOLS);
  expect([el.style.left, el.style.top]).toEqual(["158px", "50px"]);
  box.show(null, TOOLS);
  expect(el.style.left).toBe(`${container.scrollLeft + 8}px`);
  expect(el.style.top).toBe(`${container.scrollTop + 350}px`); // (700 - 道具箱の高さ 0) / 2
});

test("destroy で道具箱を外す", () => {
  const { container, box } = toolSetup();
  box.destroy();
  expect(container.querySelector(".mz-toolbox")).toBeNull();
});

// ---- マスターの追加削除（cross-list.ts） ----

// 消した箱（data.removed）は並べない
const BOOK = { nodes: [{ id: 1, caption: "親" }, { id: 2, parent: 1, caption: "子" }], removed: [{ id: 3, caption: "消した" }], edges: [[1, 2]] } as Diagram;
function crossSetup(load: (id: string) => Promise<Diagram | null>) {
  const pane = document.createElement("div");
  document.body.appendChild(pane);
  const loads: string[] = [];
  const list = createCrossList(pane, {
    books: () => [{ id: "a", title: "ブック A" }, { id: "b", title: "ブック B" }],
    load: id => { loads.push(id); return load(id); },
  });
  list.render();
  return { pane, list, loads };
}
const section = (pane: HTMLElement, id: string) => pane.querySelector<HTMLDetailsElement>(`[data-cross-book="${id}"]`)!;
function toggle(pane: HTMLElement, id: string, open: boolean) {
  const d = section(pane, id);
  d.open = open;
  d.dispatchEvent(new Event("toggle"));
}

test("ブックの見出しを並べ、開いたときだけそのブックを読みに行く（読む間は「読み込んでいます…」）", async () => {
  let resolve!: (d: Diagram) => void;
  const { pane, loads } = crossSetup(() => new Promise(r => { resolve = r; }));
  expect([...pane.querySelectorAll("summary h3")].map(h => h.textContent)).toEqual(["ブック A", "ブック B"]);
  expect(loads).toEqual([]);
  toggle(pane, "a", true);
  expect(loads).toEqual(["a"]);
  expect(section(pane, "a").textContent).toContain("読み込んでいます…");
  resolve(BOOK);
  await tick();
  expect([...section(pane, "a").querySelectorAll(".mzp-row-cap")].map(e => e.textContent)).toEqual(["1_親", "2_子"]);
  expect(section(pane, "a").open).toBe(true);
});

test("一度読んだブックは、閉じて開き直しても読み直さない。読めなかったら「読み込めませんでした」", async () => {
  const { pane, loads } = crossSetup(async id => (id === "a" ? BOOK : null));
  toggle(pane, "a", true);
  await tick();
  toggle(pane, "a", false);
  toggle(pane, "a", true);
  expect(loads).toEqual(["a"]);
  toggle(pane, "b", true);
  await tick();
  expect(section(pane, "b").textContent).toContain("読み込めませんでした");
});

test("描き直しで届いた toggle（覚えている状態と同じ）では何もしない", async () => {
  const { pane, loads } = crossSetup(async () => BOOK);
  toggle(pane, "a", true);
  await tick();
  const before = section(pane, "a");
  before.dispatchEvent(new Event("toggle")); // 描き直しの open で届いた
  expect(loads).toEqual(["a"]);
  expect(section(pane, "a")).toBe(before); // 描き直さない（描き直すとまた toggle が届いて続く）
});

test("行をドラッグすると、元のブックの名前・パターン・子と中の線ごとの写しを持つ", async () => {
  const { pane } = crossSetup(async () => BOOK);
  toggle(pane, "a", true);
  await tick();
  const data = new Map<string, string>();
  const e = new Event("dragstart", { bubbles: true });
  Object.defineProperty(e, "dataTransfer", { value: { setData: (k: string, v: string) => data.set(k, v), effectAllowed: "" } });
  section(pane, "a").querySelector<HTMLElement>('[data-cross="1"]')!.dispatchEvent(e);
  const p = JSON.parse(data.get(CROSS_MIME)!) as CrossPayload;
  expect([p.from, p.caption, p.pattern]).toEqual(["ブック A", "1_親", "nest"]);
  expect(p.copy.nodes.map(n => n.caption)).toEqual(["親", "子"]);
  expect(p.copy.edges?.length).toBe(1);
});
