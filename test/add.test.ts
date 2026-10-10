// 画面からの箱の追加（docs/ADD-plan.md）のテスト。押した所の判定（ポインタの下の箱、リストの子と子の間）は e2e/add.spec.ts
import { afterEach, expect, test } from "bun:test";
import { openAddDialog } from "../web/src/edit-dialog";
import { createGraph, type Graph } from "../web/src/graph";
import { noticeOf } from "../web/src/notices";
import type { Diagram } from "../web/src/types";
import { fakeMeasure } from "./helpers";

let graph: Graph | null = null;
afterEach(() => {
  graph?.destroy();
  graph = null;
  document.body.innerHTML = "";
});

function setup(data: Diagram) {
  const stage = document.createElement("div");
  document.body.append(stage);
  const notices: string[] = [];
  graph = createGraph(stage, data, { measureText: fakeMeasure, onEvent: ev => notices.push(noticeOf(ev)) });
  return { g: graph, stage, notices };
}
const node = (g: Graph, id: number | string) => g.toJSON().nodes.find(n => String(n.id) === String(id))!;
const order = (g: Graph) => g.toJSON().nodes.map(n => n.id);

test("ワールドに足すと、押した位置に置き、新しい箱を選ぶ。id は消した箱の番号も使わない。Undo 1 回で消える", () => {
  const { g, notices } = setup({ nodes: [{ id: 1, caption: "A", x: 40, y: 40 }], removed: [{ id: 7, caption: "消した" }] });
  const before = g.toJSON();
  const id = g.add({ parentId: null, at: { x: 300, y: 200 } }, { caption: "新しい" });
  expect(id).toBe("8");
  expect([node(g, 8).x, node(g, 8).y, node(g, 8).parent]).toEqual([300, 200, undefined]);
  expect(g.selected()).toBe("8");
  expect(notices.at(-1)).toBe("「8_新しい」を追加しました");
  g.undo();
  expect(g.toJSON()).toEqual(before);
});

test("子の無い箱に足すとその箱の子になり（箱は内包になる）、テーマや色は書かない（親から受け継ぐ）", () => {
  const { g } = setup({ nodes: [{ id: 1, caption: "親", color: "primary", theme: "sticky", x: 40, y: 40 }] });
  g.add({ parentId: "1", at: { x: 20, y: 40 } }, {});
  const n = node(g, 2);
  expect(n.parent).toBe(1);
  expect(["color" in n, "theme" in n, "caption" in n]).toEqual([false, false, false]);
  expect(g.info(1).kind).toBe("group");
});

test("リストへの差し込みは、データの並びで before の箱の前に入れる。無ければ末尾", () => {
  const { g } = setup({
    nodes: [
      { id: 1, caption: "一覧", childView: "list", x: 40, y: 40 },
      { id: 2, caption: "一", parent: 1 }, { id: 3, caption: "二", parent: 1 },
      { id: 9, caption: "外", x: 400, y: 40 },
    ],
  });
  g.add({ parentId: "1", before: "3" }, { caption: "間" });
  expect(order(g)).toEqual([1, 2, 10, 3, 9]);
  expect(g.info(10).y).toBeGreaterThan(g.info(2).y);
  expect(g.info(10).y).toBeLessThan(g.info(3).y);
  g.add({ parentId: "1" }, { caption: "末尾" });
  expect(g.info(11).y).toBeGreaterThan(g.info(3).y);
});

test("追加のダイアログ: 同じ並びで、ボタンは「キャンセル」「追加」。追加すると中身を書いて選択モードに戻り、キャンセルなら追加モードのまま", () => {
  const { g } = setup({ nodes: [] });
  g.setMode("add");
  openAddDialog(g, { parentId: null, at: { x: 100, y: 100 } });
  const dlg = () => document.querySelector<HTMLElement>(".mz-dlg-overlay");
  const field = <T extends HTMLElement>(name: string) => dlg()!.querySelector<T>(`[name="${name}"]`)!;
  expect(dlg()!.querySelector("[data-cancel]")!.textContent).toBe("キャンセル");
  expect(dlg()!.querySelector("[data-ok]")!.textContent).toBe("追加");
  expect(dlg()!.querySelector<HTMLButtonElement>("[data-width-auto]")!.disabled).toBe(true);
  dlg()!.querySelector<HTMLElement>("[data-cancel]")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect([dlg(), g.toJSON().nodes.length, g.mode()]).toEqual([null, 0, "add"]);
  openAddDialog(g, { parentId: null, at: { x: 100, y: 100 } });
  field<HTMLInputElement>("caption").value = "新しい箱";
  expect(field<HTMLButtonElement>("rule").disabled).toBe(true); // 本文が空なら区切り線は押せない
  field<HTMLTextAreaElement>("body").value = "本文";
  field<HTMLTextAreaElement>("body").dispatchEvent(new Event("input", { bubbles: true }));
  field<HTMLElement>("rule").click();
  field<HTMLSelectElement>("lines").value = "3";
  dlg()!.querySelector<HTMLElement>("[data-ok]")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  const n = g.toJSON().nodes[0]!;
  expect([n.caption, n.body, n.bodyRule, n.bodyLines]).toEqual(["新しい箱", "本文", false, 3]);
  expect(g.mode()).toBe("move");
});

test("追加モードは Esc で選択モードに戻る", () => {
  const { g } = setup({ nodes: [] });
  g.setMode("add");
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect(g.mode()).toBe("move");
});

test("編集ダイアログのボタンも「キャンセル」", async () => {
  const { openEditDialog } = await import("../web/src/edit-dialog");
  const { g } = setup({ nodes: [{ id: 1, caption: "A" }] });
  openEditDialog(g, "1");
  expect(document.querySelector(".mz-dlg-overlay [data-cancel]")!.textContent).toBe("キャンセル");
});

test("区切り線: 本文を消すと切って押せなくし、データの区切り線は変えない。本文のある箱を開いたら、データのとおり", async () => {
  const { openEditDialog } = await import("../web/src/edit-dialog");
  const { g } = setup({ nodes: [{ id: 1, caption: "A", body: "本文", bodyRule: false }] });
  openEditDialog(g, "1");
  const field = <T extends HTMLElement>(name: string) => document.querySelector<T>(`.mz-dlg-overlay [name="${name}"]`)!;
  expect([field<HTMLButtonElement>("rule").disabled, field("rule").getAttribute("aria-checked")]).toEqual([false, "false"]);
  field<HTMLTextAreaElement>("body").value = "";
  field<HTMLTextAreaElement>("body").dispatchEvent(new Event("input", { bubbles: true }));
  expect(field<HTMLButtonElement>("rule").disabled).toBe(true);
  document.querySelector<HTMLElement>(".mz-dlg-overlay [data-ok]")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  const n = g.toJSON().nodes[0]!;
  expect([n.body, n.bodyRule]).toEqual([undefined, false]);
});
