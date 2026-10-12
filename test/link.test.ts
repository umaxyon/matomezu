// リンクの箱（link-box.ts。D27 の段階 3）: ほかのページをのぞく窓を持つ箱。形・サイズ・子の見せ方は使わず、子を持てない。窓を押すとそのページを開く
import { afterEach, expect, test } from "bun:test";
import { createGraph, type Graph } from "../web/src/graph";
import { LINK_LOOK_DEFS, linkBoxWidth } from "../web/src/link-box";
import type { BoxInfo, Diagram } from "../web/src/types";
import { validate } from "../web/src/validate";
import { fakeMeasure } from "./helpers";

const graphs: Graph[] = [];
afterEach(() => {
  for (const g of graphs.splice(0)) g.destroy();
  document.body.innerHTML = "";
});

function setup(data: Diagram, onOpenPage?: (page: string) => void) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const graph = createGraph(el, data, { measureText: fakeMeasure, onOpenPage });
  graphs.push(graph);
  return { el, graph };
}

// 最初のページに、ページ p1（フローチャート）をのぞくリンクの箱 2 と普通の箱 1
const book = (): Diagram => ({
  pages: [{ id: "p1", title: "処理の流れ", world: { childView: "flow" } }],
  nodes: [
    { id: 1, caption: "表", x: 40, y: 40 },
    { id: 2, caption: "流れ", body: "注文から発送まで", link: "p1", x: 300, y: 40 },
    { id: 3, caption: "開始", page: "p1", x: 40, y: 40 },
  ],
});

test("データの検査: link は存在するページ、自分のページへはリンクできない、子を持てない、ツリーの根にできない、linkLook は window / side", () => {
  expect(() => validate(book())).not.toThrow();
  expect(() => validate({ ...book(), nodes: [{ id: 1, link: "p9" }] })).toThrow("存在しないページへのリンクです: 1 → p9");
  expect(() => validate({ ...book(), nodes: [{ id: 1, link: "p1", page: "p1" }] })).toThrow("自分の載っているページへはリンクできません: 1");
  expect(() => validate({ ...book(), nodes: [{ id: 1, link: "p1" }, { id: 2, parent: 1 }] })).toThrow("リンクの箱は子を持てません: 1");
  expect(() => validate({ ...book(), nodes: [{ id: 1, link: "p1", linkLook: "huge" }] })).toThrow("linkLook に使えるのは window / side です: 1 (huge)");
  expect(() => validate({ world: { childView: "tree", root: 1 }, pages: [{ id: "p1" }], nodes: [{ id: 1, link: "p1" }] }))
    .toThrow("ツリーの根はリンクの箱にできません: 1");
});

test("リンクの箱の情報: のぞくページの名前とパターン、見せ方。形・サイズ・クラスは選べず、本文は出せる。中へは落とせない", () => {
  const { graph } = setup(book());
  const b = graph.info("2") as BoxInfo;
  expect(b.link).toEqual({ page: "p1", pageName: "処理の流れ", pattern: "flow", look: "window" });
  expect(b.canShape).toBe(false);
  expect(b.canClass).toBe(false);
  expect(b.canBody).toBe(true);
  expect(b.body).toBe("注文から発送まで");
  expect((graph.info("1") as BoxInfo).link).toBeNull();
  expect(() => graph.reparent("1", "2")).toThrow();
  expect(graph.toJSON().nodes.find(n => n.id === 1)!.parent).toBeUndefined();
});

test("描画: 持ち手の帯に札（のぞくページのパターン）と窓を出す。大きさは見せ方の数値と文字で決まり、形とサイズは無視する", () => {
  const { el, graph } = setup({ ...book(), nodes: [...book().nodes.map(n => (n.id === 2 ? { ...n, shape: "diamond", size: "S" } : n))] });
  const head = el.querySelector<HTMLElement>('.mz-node[data-id="2"] > .mz-head')!;
  expect(head.classList.contains("mz-link")).toBe(true);
  expect(head.classList.contains("mz-link-window")).toBe(true);
  expect(head.classList.contains("mz-shape-box")).toBe(true); // ひし形は無視
  expect(head.querySelector(".mz-link-parts")!.hasAttribute("hidden")).toBe(false);
  expect(head.querySelector(".mz-link-badge")!.textContent).toBe("フローチャート");
  expect(head.querySelector<HTMLElement>(".mz-link-win")!.title).toContain("処理の流れ");
  expect(head.style.getPropertyValue("--mz-link-win-h")).toBe(LINK_LOOK_DEFS.window.win.h + "px");
  // 窓枠: 幅は窓の幅 + 余白。高さは持ち手 + 文字 + 窓（余白を含む）
  const d = LINK_LOOK_DEFS.window;
  const w = linkBoxWidth(d);
  const text = fakeMeasure(head, w)[1];
  const g = graph.geometry().boxes.find(b => b.id === "2")!;
  expect(g.w).toBe(w);
  expect(g.h).toBe(d.handle + text + d.win.h + 2 * d.gap);
  // 普通の箱には部品を出さない
  expect(el.querySelector('.mz-node[data-id="1"] .mz-link-parts')!.hasAttribute("hidden")).toBe(true);
});

test("見せ方を横に分ける（side）にすると、左の帯・文字の列・窓が横に並ぶ。既定（window）に戻せばデータから消える", () => {
  const { el, graph } = setup(book());
  graph.update("2", { linkLook: "side" });
  expect(graph.toJSON().nodes.find(n => n.id === 2)!.linkLook).toBe("side");
  const head = el.querySelector<HTMLElement>('.mz-node[data-id="2"] > .mz-head')!;
  expect(head.classList.contains("mz-link-side")).toBe(true);
  const d = LINK_LOOK_DEFS.side;
  const g = graph.geometry().boxes.find(b => b.id === "2")!;
  const fixed = d.handle + d.win.w + 2 * d.gap;
  expect(g.w).toBeGreaterThanOrEqual(fixed + d.textW!.min);
  expect(g.w).toBeLessThanOrEqual(fixed + d.textW!.max);
  expect(g.h).toBeGreaterThanOrEqual(d.win.h + 2 * d.gap);
  graph.update("2", { linkLook: "window" });
  expect(graph.toJSON().nodes.find(n => n.id === 2)!.linkLook).toBeUndefined();
  expect(() => graph.update("1", { linkLook: "side" })).toThrow("linkLook はリンクの箱");
});

test("文字が空のリンクの箱は、窓と持ち手だけ（高さは持ち手 + 窓）", () => {
  const { graph } = setup({ ...book(), nodes: [{ id: 2, link: "p1", x: 300, y: 40 }, { id: 3, caption: "開始", page: "p1" }] });
  const d = LINK_LOOK_DEFS.window;
  const g = graph.geometry().boxes.find(b => b.id === "2")!;
  expect(g.h).toBe(d.handle + d.win.h + 2 * d.gap);
});

test("窓を押してそのまま離すと、のぞいているページを開く（onOpenPage）。持ち手や文字の所を押しても開かない", () => {
  const opened: string[] = [];
  const { el } = setup(book(), p => opened.push(p));
  const head = el.querySelector<HTMLElement>('.mz-node[data-id="2"] > .mz-head')!;
  const press = (target: Element, x: number, y: number) => {
    target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
    target.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
  };
  press(head.querySelector(".mz-link-bar")!, 10, 10);
  expect(opened).toEqual([]);
  press(head.querySelector(".mz-link-win")!, 50, 80);
  expect(opened).toEqual(["p1"]);
});
