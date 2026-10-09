// テーマ（theme.ts、docs/THEME-plan.md 11 章）のテスト
import { afterEach, expect, test } from "bun:test";
import { createGraph, type Graph } from "../web/src/graph";
import { createPanel, type Panel } from "../web/src/panel";
import { themeById } from "../web/src/theme";
import type { BoxInfo, Diagram } from "../web/src/types";
import { problems } from "../web/src/validate";
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
  graph = createGraph(stage, data, { measureText: fakeMeasure, onSelect: i => panel?.show(i) });
  panel = createPanel(side, graph);
  const head = (id: number) => stage.querySelector<HTMLElement>(`.mz-node[data-id="${id}"] > .mz-head`)!;
  const node = (id: number) => stage.querySelector<HTMLElement>(`.mz-node[data-id="${id}"]`)!;
  return { g: graph, stage, side, head, node };
}

const sticky = themeById("sticky");
const mono = themeById("mono");

test("図全体のテーマで箱の色が決まり、箱ごとの色は使わないがデータには残る", () => {
  const { g, head, stage } = setup({
    world: { theme: "sticky" },
    nodes: [{ id: 1, caption: "A", color: "#3b82f6", x: 40, y: 40 }],
  });
  expect(head(1).style.background).toBe(sticky.box);
  expect(head(1).classList.contains("mz-t-sticky")).toBe(true);
  // 背景はテーマの背景で固定する
  expect(stage.querySelector<HTMLElement>(".mz-world")!.style.background).toBe(sticky.background!);
  expect(g.toJSON().nodes[0]!.color).toBe("#3b82f6");
  expect((g.info(1) as BoxInfo).usesColor).toBe(false);
  // default に戻すと箱ごとの色が効く
  g.update(null, { theme: null });
  expect(head(1).style.background).toBe("#3b82f6");
  expect(g.toJSON().world?.theme).toBeUndefined();
});

test("箱に書いたテーマはその箱と子孫に効き、兄弟には効かない。子孫で別のテーマに戻せる", () => {
  const { g, head, node } = setup({
    nodes: [
      { id: 1, caption: "枠", theme: "mono", x: 40, y: 40 },
      { id: 2, caption: "子", parent: 1, color: "#ef4444" },
      { id: 3, caption: "戻す", parent: 1, theme: "default", color: "#22c55e" },
      { id: 4, caption: "兄弟", color: "#eab308", x: 600, y: 40 },
    ],
  });
  expect(head(2).style.background).toBe(mono.box);
  expect(head(3).style.background).toBe("#22c55e");
  expect(head(4).style.background).toBe("#eab308");
  expect((g.info(2) as BoxInfo).themeUsed).toBe("mono");
  expect((g.info(2) as BoxInfo).theme).toBeNull();
  // テーマを書いた箱に角の丸みを付け、default に戻した子は initial にして祖先の値を受け継がない
  expect(node(1).style.getPropertyValue("--mz-radius")).toBe(`${mono.radius}px`);
  expect(node(3).style.getPropertyValue("--mz-radius")).toBe("initial");
  expect(node(2).style.getPropertyValue("--mz-radius")).toBe("");
  // 枠のテーマを外すと、子は図全体（default）を受け継ぐ
  g.update(1, { theme: null });
  expect(head(2).style.background).toBe("#ef4444");
  expect(node(1).style.getPropertyValue("--mz-radius")).toBe("");
});

test("知らないテーマの名前は検査で弾く", () => {
  expect(problems({ world: { theme: "neon" }, nodes: [] })[0]).toContain("theme の値が不正です");
  expect(problems({ nodes: [{ id: 1, theme: "neon" }] })[0]).toContain("theme の値が不正です");
  expect(problems({ world: { theme: "sticky" }, nodes: [{ id: 1, theme: "mono" }] })).toEqual([]);
  const { g } = setup({ nodes: [{ id: 1, x: 40, y: 40 }] });
  expect(() => g.update(1, { theme: "neon" })).toThrow();
});

test("サイドバーでテーマを選ぶとデータに書き、受け継いでいるテーマと、色を使わないことを見せる", () => {
  const { g, side } = setup({ nodes: [{ id: 1, caption: "A", x: 40, y: 40 }] });
  const pick = (value: string) => {
    const input = side.querySelector<HTMLInputElement>(`input[name="mzp-theme"][value="${value}"]`)!;
    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };
  g.select(null);
  pick("sticky");
  expect(g.toJSON().world?.theme).toBe("sticky");
  g.select(1);
  expect(side.textContent).toContain("「付箋紙」を受け継いでいます");
  expect(side.textContent).toContain("箱ごとの色は使いません");
  pick("mono");
  expect(g.toJSON().nodes[0]!.theme).toBe("mono");
  pick("");
  expect(g.toJSON().nodes[0]!.theme).toBeUndefined();
});

test("モノクロでは、塗りのある文字の箱に枠線を引き、塗りの無い箱の枠はテーマの枠の色で引く", () => {
  const { head } = setup({
    world: { theme: "mono" },
    nodes: [
      { id: 1, caption: "塗り", x: 40, y: 40 },
      { id: 2, caption: "枠だけ", fill: false, border: true, color: "#ffffff", x: 300, y: 40 },
    ],
  });
  expect(head(1).style.boxShadow).toContain("inset 0 0 0 1.5px");
  expect(head(2).style.boxShadow).toContain(mono.border!);
});
