// ブックのダイアログ（book-dialog.ts。D26）と、ページの設定を書き換える graph.updatePage
import { afterEach, expect, test } from "bun:test";
import { openBookDialog } from "../web/src/book-dialog";
import { closeEditDialog } from "../web/src/edit-dialog";
import { createGraph, type Graph } from "../web/src/graph";
import type { Diagram } from "../web/src/types";
import { DEFAULT_PAPER, PAPER_NAMES, PAPERS } from "../web/src/validate";
import { fakeMeasure } from "./helpers";

const graphs: Graph[] = [];
afterEach(() => {
  closeEditDialog();
  for (const g of graphs.splice(0)) g.destroy();
  document.body.innerHTML = "";
});

function setup(data: Diagram) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const graph = createGraph(el, data, { measureText: fakeMeasure });
  graphs.push(graph);
  return graph;
}

const book = (): Diagram => ({
  world: { title: "設計" },
  pages: [{ id: "p1", title: "流れ", world: { childView: "flow" } }],
  nodes: [
    { id: 1, caption: "表", x: 40, y: 40 },
    { id: 3, caption: "開始", page: "p1", shape: "circle", x: 20, y: 20 },
    { id: 4, caption: "処理", page: "p1", x: 300, y: 20 },
  ],
  edges: [{ id: "e1", from: 3, to: 4 }],
});

const dlg = () => document.querySelector<HTMLElement>(".mz-dlg")!;
const tab = (key: string) => dlg().querySelector<HTMLElement>(`[data-tab="${key}"]`)!;
const pane = (key: string) => dlg().querySelector<HTMLElement>(`[data-tab-pane="${key}"]`)!;
const ok = () => dlg().querySelector<HTMLElement>("[data-ok]")!.click();

test("updatePage は今描いていないページの題名と設定を書き換え、既定の値は書かない。1 件の履歴に残る", () => {
  const g = setup(book());
  g.updatePage("p1", { title: "処理の流れ", theme: "sticky", route: "straight" });
  expect(g.toJSON().pages).toEqual([{ id: "p1", title: "処理の流れ", world: { childView: "flow", theme: "sticky", route: "straight" } }]);
  g.updatePage("p1", { route: "elbow", title: "" });
  expect(g.toJSON().pages).toEqual([{ id: "p1", world: { childView: "flow", theme: "sticky" } }]);
  g.undo();
  expect(g.toJSON().pages![0]!.title).toBe("処理の流れ");
  expect(() => g.updatePage("nope", { theme: "sticky" })).toThrow();
});

test("ブックのダイアログは今のページのタブを選んで開き、ブックの題名とページの設定をまとめて 1 件の変更として書く", () => {
  const g = setup(book());
  openBookDialog(g, "design.json");
  expect(tab("").getAttribute("aria-selected")).toBe("true"); // 最初のページを描いている
  expect(pane("").hidden).toBe(false);
  expect([...dlg().querySelectorAll("[data-tab]")].map(b => b.textContent)).toEqual(["ブック", "最初のページ", "流れ"]);
  // 大きさはタブを切り替えても変わらない（高さを決めてある）
  expect(dlg().classList.contains("mz-dlg-book")).toBe(true);

  tab("\u0000book").click();
  dlg().querySelector<HTMLInputElement>('[name="book-title"]')!.value = "設計メモ";
  tab("p1").click();
  pane("p1").querySelector<HTMLInputElement>('[name="title"]')!.value = "処理";
  pane("p1").querySelector<HTMLSelectElement>('[name="theme"]')!.value = "sticky";
  // 今描いていないページの一回きりの操作（自動で整列）は押せない
  expect(pane("p1").querySelector<HTMLButtonElement>("[data-auto-align]")!.disabled).toBe(true);
  ok();
  const d = g.toJSON();
  expect(d.world?.title).toBe("設計メモ");
  expect(d.pages).toEqual([{ id: "p1", title: "処理", world: { childView: "flow", theme: "sticky" } }]);
  g.undo();
  expect(g.toJSON().world?.title).toBe("設計");
  expect(g.toJSON().pages![0]!.title).toBe("流れ");
});

test("今描いているページの一回きりの操作は、押すと印が付き、確定のときに行う。キャンセルなら何もしない", () => {
  const g = setup(book());
  g.setPage("p1");
  openBookDialog(g, "design.json");
  expect(tab("p1").getAttribute("aria-selected")).toBe("true");
  const size = (v: string) => pane("p1").querySelector<HTMLButtonElement>(`[data-kid-size="${v}"]`)!;
  size("L").click();
  size("S").click(); // どれか 1 つ
  expect([size("L"), size("S")].map(b => b.getAttribute("aria-pressed"))).toEqual(["false", "true"]);
  dlg().querySelector<HTMLElement>("[data-cancel]")!.click();
  expect(g.toJSON().pages![0]!.world?.kidSize).toBeUndefined();

  openBookDialog(g, "design.json");
  size("S").click();
  ok();
  expect(g.toJSON().pages![0]!.world?.kidSize).toBe("S");
  expect(g.toJSON().nodes.filter(n => n.page === "p1").map(n => n.size)).toEqual(["S", "S"]);
});

test("紙の型: 今のページを小さな紙にして収まらなければ閉じずに知らせ、紙は変わらない。見ていないページは縦横とも今以上の紙だけ選べる（D33）", () => {
  // 横に 7 つ並んだ箱（A4 横には入るが、A5 横には間隔を詰めても入らない。docs/PAPER-plan.md の 4.6 の 7）
  const row = Array.from({ length: 7 }, (_, i) => ({ id: 10 + i, caption: `横${i + 1}`, x: 40 + i * 140, y: 40 }));
  const g = setup({ pages: [{ id: "p2", title: "二枚目" }], nodes: [...row, { id: 2, caption: "二枚目の箱", page: "p2" }] } as Diagram);
  expect(g.misfits()).toEqual([]);
  openBookDialog(g, "design.json");
  // 見ていないページ（二枚目、既定の紙）: 縦横とも今の紙以上の型だけ。今のページは全部の型
  const now = PAPERS[DEFAULT_PAPER];
  const choices = (key: string) => [...pane(key).querySelectorAll<HTMLOptionElement>('[name="paper"] option')].map(o => o.value);
  expect(choices("p2")).toEqual(PAPER_NAMES.filter(n => PAPERS[n].w >= now.w && PAPERS[n].h >= now.h));
  expect(choices("p2")).not.toContain("a5-landscape");
  expect(choices("")).toEqual([...PAPER_NAMES]);
  // 今のページを A5 横にすると、7 つの並びが入らないので確定できない
  pane("").querySelector<HTMLSelectElement>('[name="paper"]')!.value = "a5-landscape";
  ok();
  expect(dlg()).not.toBeNull();
  expect(dlg().closest(".mz-dlg-overlay")!.querySelector(".mz-dlg-refused")!.textContent).toContain("紙に収まらない");
  dlg().querySelector<HTMLElement>("[data-cancel]")!.click();
  expect(document.querySelector(".mz-dlg")).toBeNull();
  expect(g.paper()).toEqual({ name: DEFAULT_PAPER, w: now.w, h: now.h });
  expect(g.toJSON().world?.paper).toBeUndefined();
});
