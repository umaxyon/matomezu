// サイドバーの操作のテスト
import { afterEach, expect, test } from "bun:test";
import { createGraph, type Graph } from "../web/src/graph";
import { createPanel, type Panel } from "../web/src/panel";
import type { BoxInfo, Diagram } from "../web/src/types";
import { fakeMeasure } from "./helpers";

let graph: Graph | null = null;
afterEach(() => {
  graph?.destroy();
  graph = null;
  document.body.innerHTML = "";
});

function setup(data: Diagram) {
  const stage = document.createElement("div");
  const side = document.createElement("aside");
  document.body.append(side, stage);
  let panel: Panel | null = null;
  const notices: string[] = [];
  graph = createGraph(stage, data, { measureText: fakeMeasure, onSelect: i => panel?.show(i), onNotice: t => notices.push(t) });
  panel = createPanel(side, graph);
  const $ = <T extends Element>(sel: string) => side.querySelector<T>(sel);
  const click = (sel: string) => $<HTMLElement>(sel)!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  // 入力欄の値を変えて確定する（ブラウザでは Enter やフォーカスが外れたときに change が起きる）
  const change = (sel: string, value?: string | boolean) => {
    const input = $<HTMLInputElement>(sel)!;
    if (typeof value === "boolean") input.checked = value;
    else if (value != null) input.value = value;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };
  return { g: graph, side, $, click, change, notices };
}

const box = (g: Graph, id: number) => g.info(id) as BoxInfo;

test("選んだボックスの情報を出し、キャプションと色を変える", () => {
  const { g, $, change } = setup({ nodes: [{ id: 1, caption: "API" }] });
  g.select(1);
  expect($(".mzp-title")!.textContent).toBe("API");
  change('[data-edit="caption"]', "API ゲートウェイ");
  expect(box(g, 1).caption).toBe("API ゲートウェイ");
  change('[data-edit="color"]', "#3b82f6");
  expect(box(g, 1).color).toBe("#3b82f6");
});

test("Esc で入力を取り消す", () => {
  const { g, $ } = setup({ nodes: [{ id: 1, caption: "API" }] });
  g.select(1);
  const input = $<HTMLInputElement>('[data-edit="caption"]')!;
  input.value = "書きかけ";
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  expect($<HTMLInputElement>('[data-edit="caption"]')!.value).toBe("API");
  expect(box(g, 1).caption).toBe("API");
});

// 解釈できない色を受け付けない動き（panel.ts の CSS.supports での確認）は、ここでは確かめられない。
// この DOM の CSS.supports は何でも true を返し、しかも置き換えられないため。実際のブラウザでのテストで確かめる

test("色の候補と、塗りつぶし・枠線", () => {
  const { g, click, change } = setup({ nodes: [{ id: 1 }] });
  g.select(1);
  click('[data-color="#22c55e"]');
  expect(box(g, 1).color).toBe("#22c55e");
  change('[data-field="fill"]', false);
  change('[data-field="border"]', true);
  expect([box(g, 1).fill, box(g, 1).border]).toEqual([false, true]);
});

test("サイズを押すと、今と同じサイズでも大きさの指定を外す", () => {
  const { g, click } = setup({ nodes: [{ id: 1, x: 40, y: 40, width: 312 }] });
  g.select(1);
  click('input[name="mzp-size"][value="M"]');
  expect(box(g, 1).w).toBe(120);
  expect("width" in g.toJSON().nodes[0]!).toBe(false);
  click('input[name="mzp-size"][value="S"]');
  expect(box(g, 1).size).toBe("S");
});

test("形と子の見せ方、ツリーのときだけ向きを選べる", () => {
  const { g, $, change } = setup({ nodes: [{ id: 1 }, { id: 2, parent: 1 }, { id: 3 }] });
  g.select(3);
  change('input[name="mzp-shape"][value="db"]', true);
  expect(box(g, 3).shape).toBe("db");

  g.select(1);
  expect($('input[name="mzp-shape"]')).toBeNull(); // 内包しているグループは形を選べない
  expect($('input[name="mzp-treedir"]')).toBeNull();
  change('input[name="mzp-view"][value="tree"]', true);
  expect(box(g, 1).childView).toBe("tree");
  change('input[name="mzp-treedir"][value="left"]', true);
  expect(box(g, 1).treeDirection).toBe("left");
});

test("子のサイズのボタンは、そろえられる子が2つ以上あるときだけ出る", () => {
  const { g, $, click, notices } = setup({
    nodes: [
      { id: 1, x: 40, y: 40 },
      { id: 2, parent: 1, x: 12, y: 30, width: 300 }, { id: 3, parent: 1, x: 12, y: 110 },
      { id: 4, x: 600, y: 40 }, { id: 5, parent: 4 },
    ],
  });
  g.select(4);
  expect($("[data-fit]")).toBeNull();
  g.select(1);
  click('[data-fit="width"]');
  expect([box(g, 2).w, box(g, 3).w]).toEqual([120, 120]);
  expect(notices.at(-1)).toBe("子 2 個の幅をそろえました");
});

test("中身の扱い: ワールドでは伸ばすを選べない", () => {
  const { g, $, change } = setup({ nodes: [{ id: 1 }] });
  g.select(null);
  expect($<HTMLInputElement>('input[name="mzp-overflow"][value="grow"]')!.disabled).toBe(true);
  change('input[name="mzp-overflow"][value="clip"]', true);
  expect(g.info(null).overflow).toBe("clip");
});

test("中身の扱い: 文字のボックスには伸ばすを出さない（グループには出す）", () => {
  const { g, $ } = setup({ nodes: [{ id: 1, caption: "グループ" }, { id: 2, caption: "文字", parent: 1 }] });
  g.select(2);
  expect($('input[name="mzp-overflow"][value="wrap"]')).not.toBeNull();
  expect($('input[name="mzp-overflow"][value="grow"]')).toBeNull();
  g.select(1);
  expect($<HTMLInputElement>('input[name="mzp-overflow"][value="grow"]')!.disabled).toBe(false);
});

test("背景の候補と「なし」", () => {
  const { g, click } = setup({ nodes: [{ id: 1 }] });
  g.select(null);
  click('[data-bg="#0f172a"]');
  expect(g.toJSON().world?.background).toBe("#0f172a");
  click('[data-bg=""]');
  expect(g.toJSON().world?.background).toBeUndefined();
});

test("親・子・つながりのボタンで、そのボックスを選ぶ", () => {
  const { g, click } = setup({ nodes: [{ id: 1, caption: "親" }, { id: 2, caption: "子", parent: 1 }, { id: 3 }], edges: [[1, 3]] });
  g.select(2);
  click('[data-select="1"]');
  expect(g.selected()).toBe("1");
  click('[data-select="3"]'); // つながり
  expect(g.selected()).toBe("3");
});
