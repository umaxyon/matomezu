// テーマ（theme.ts、docs/THEME-plan.md 11 章）のテスト
import { afterEach, expect, test } from "bun:test";
import { createGraph, type Graph } from "../web/src/graph";
import { createPanel, type Panel } from "../web/src/panel";
import { themeById } from "../web/src/theme";
import type { GraphEvent } from "../web/src/notices";
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
const simple = themeById("simple");

test("図全体のテーマで既定の色と背景が決まり、色の値はテーマの上の上書きとしてその色で描く", () => {
  const { g, head, stage } = setup({
    world: { theme: "sticky" },
    nodes: [{ id: 1, caption: "A", x: 40, y: 40 }, { id: 2, caption: "B", color: "#3b82f6", x: 300, y: 40 }],
  });
  expect(head(1).style.background).toContain(sticky.box); // 付箋は角を折り返すのでグラデーションの中の色
  expect(head(2).style.background).toContain("#3b82f6");
  expect(head(1).classList.contains("mz-t-sticky")).toBe(true);
  // 背景はテーマの背景で固定する
  expect(stage.querySelector<HTMLElement>(".mz-world")!.style.background).toBe(sticky.background!);
  g.update(null, { theme: null });
  expect(head(1).style.background).toBe("#ffffff");
  expect(head(2).style.background).toBe("#3b82f6");
  expect(g.toJSON().world?.theme).toBeUndefined();
});

test("箱に書いたテーマはその箱と子孫に効き、兄弟には効かない。子孫で別のテーマに戻せる", () => {
  const { g, head, node } = setup({
    nodes: [
      { id: 1, caption: "枠", theme: "simple", x: 40, y: 40 },
      { id: 2, caption: "子", parent: 1, color: "#ef4444" },
      { id: 3, caption: "戻す", parent: 1, theme: "default", color: "#22c55e" },
      { id: 4, caption: "兄弟", color: "#eab308", x: 600, y: 40 },
    ],
  });
  expect(head(2).style.background).toBe("#ef4444"); // 色の値は、どのテーマでもその色
  expect(head(3).style.background).toBe("#22c55e");
  expect(head(4).style.background).toBe("#eab308");
  expect((g.info(2) as BoxInfo).themeUsed).toBe("simple");
  expect((g.info(2) as BoxInfo).theme).toBeNull();
  // テーマを書いた箱に角の丸みを付け、default に戻した子は initial にして祖先の値を受け継がない
  expect(node(1).style.getPropertyValue("--mz-radius")).toBe(`${simple.radius}px`);
  expect(node(3).style.getPropertyValue("--mz-radius")).toBe("initial");
  expect(node(2).style.getPropertyValue("--mz-radius")).toBe("");
  // 枠のテーマを外すと、子は図全体（default）を受け継ぐ
  g.update(1, { theme: null });
  expect(head(2).style.background).toBe("#ef4444");
  expect(node(1).style.getPropertyValue("--mz-radius")).toBe("");
});

test("知らないテーマの名前は、検査（matomezu validate）では誤り。画面では開けて標準として描き、知らせる。書き込みは断る", () => {
  expect(problems({ world: { theme: "neon" }, nodes: [] })[0]).toContain("theme の値が不正です");
  expect(problems({ nodes: [{ id: 1, theme: "neon" }] })[0]).toContain("theme の値が不正です");
  expect(problems({ world: { theme: "sticky" }, nodes: [{ id: 1, theme: "simple" }] })).toEqual([]);

  const events: GraphEvent[] = [];
  const stage = document.createElement("div");
  const side = document.createElement("aside");
  document.body.append(side, stage);
  let panel: Panel | null = null;
  graph = createGraph(stage, { world: { theme: "mono" }, nodes: [{ id: 1, caption: "A", x: 40, y: 40 }] },
    { measureText: fakeMeasure, onSelect: i => panel?.show(i), onEvent: ev => events.push(ev) });
  panel = createPanel(side, graph);
  expect(stage.querySelector<HTMLElement>('.mz-node[data-id="1"] > .mz-head')!.style.background).toBe("#ffffff");
  expect(events).toContainEqual({ kind: "unknownTheme", names: ["mono"] });
  expect(graph.toJSON().world?.theme).toBe("mono"); // データはそのまま
  graph.select(null);
  expect(side.textContent).toContain("「mono」というテーマはありません");
  expect(() => graph!.update(1, { theme: "neon" })).toThrow();
});

test("サイドバーでテーマを選ぶとデータに書き、受け継いでいるテーマを見せる。色のポップアップでは、どのテーマでも灰色も選べる", () => {
  const { g, side } = setup({ nodes: [{ id: 1, caption: "A", color: "#ef4444", x: 40, y: 40 }] });
  const pick = (value: string) => {
    const select = side.querySelector<HTMLSelectElement>('select[name="mzp-theme"]')!;
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  };
  g.select(null);
  pick("sticky");
  expect(g.toJSON().world?.theme).toBe("sticky");
  g.select(1);
  expect(side.textContent).toContain("「付箋紙」を受け継いでいます");
  const open = () => side.querySelector<HTMLElement>("[data-color-open]")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  open();
  expect(document.querySelector(".mz-cp-sv")).not.toBeNull(); // 好きな色を選ぶ四角は、付箋紙でも使える
  open(); // もう一度押すと閉じる
  expect(document.querySelector(".mz-cp")).toBeNull();
  pick("simple");
  expect(g.toJSON().nodes[0]!.theme).toBe("simple");
  open();
  expect(document.querySelector(".mz-cp-sv")).not.toBeNull();
  const range = document.querySelector<HTMLInputElement>(".mz-cp-light")!;
  range.value = "50";
  range.dispatchEvent(new Event("change", { bubbles: true }));
  expect(g.toJSON().nodes[0]!.color).toMatch(/^#([0-9a-f]{2})\1\1$/);
  pick("");
  expect(g.toJSON().nodes[0]!.theme).toBeUndefined();
});

test("シンプルでは、塗りのある文字の箱に枠線を引き、塗りの無い箱の枠はテーマの枠の色（色を書けばその色）で引く", () => {
  const { head } = setup({
    world: { theme: "simple" },
    nodes: [
      { id: 1, caption: "塗り", x: 40, y: 40 },
      { id: 2, caption: "枠だけ", fill: false, border: true, x: 300, y: 40 },
      { id: 3, caption: "色の枠", fill: false, border: true, color: "#a855f7", x: 600, y: 40 },
    ],
  });
  expect(head(1).style.boxShadow).toContain("inset 0 0 0 1.5px");
  expect(head(2).style.boxShadow).toContain(simple.border!);
  expect(head(3).style.boxShadow).toContain("#a855f7");
});

test("付箋紙では、塗りのある文字の箱だけ角を折り返し、影は折り返しに沿って付ける", () => {
  const { g, head } = setup({
    world: { theme: "sticky" },
    nodes: [
      { id: 1, caption: "枠", x: 40, y: 40 },
      { id: 2, caption: "付箋", parent: 1 },
      { id: 3, caption: "塗り無し", fill: false, border: true, x: 600, y: 40 },
    ],
  });
  expect(head(2).classList.contains("mz-style-sticky")).toBe(true);
  expect(head(2).style.background).toContain("linear-gradient");
  expect(head(2).style.filter).toContain("drop-shadow");
  expect(head(2).style.boxShadow).not.toContain(sticky.shadow!);
  expect(head(1).classList.contains("mz-style-sticky")).toBe(false); // グループの枠は付箋にしない
  expect(head(3).classList.contains("mz-style-sticky")).toBe(false);
  g.update(null, { theme: null });
  expect(head(2).classList.contains("mz-style-sticky")).toBe(false);
  expect(head(2).style.filter).toBe("");
});

test("色の名前はどのテーマでも、そのテーマの色で塗る。サイドバーで名前を選べる", () => {
  const { g, head, side } = setup({ nodes: [{ id: 1, caption: "A", color: "danger", x: 40, y: 40 }] });
  expect(head(1).style.background).toBe(themeById("default").palette.danger);
  g.update(null, { theme: "simple" });
  expect(head(1).style.background).toBe(simple.palette.danger);
  g.update(null, { theme: "sticky" });
  expect(head(1).style.background).toContain(sticky.palette.danger);
  expect(g.toJSON().nodes[0]!.color).toBe("danger");
  // 名前の色を押すと名前を書き、「なし」で消す
  g.select(1);
  side.querySelector<HTMLElement>("[data-color-open]")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  document.querySelector<HTMLElement>('.mz-cp [data-name="warn"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(g.toJSON().nodes[0]!.color).toBe("warn");
  expect(head(1).style.background).toContain(sticky.palette.warn);
  document.querySelector<HTMLElement>(".mz-cp [data-none]")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  expect(g.toJSON().nodes[0]!.color).toBeUndefined();
});

test("図の背景に書いた色は、背景を持つテーマでもその色で描く（テーマの上の上書き）", () => {
  const { stage } = setup({ world: { theme: "simple", background: "#1e3a8a" }, nodes: [{ id: 1, x: 40, y: 40 }] });
  expect(stage.querySelector<HTMLElement>(".mz-world")!.style.background).toBe("#1e3a8a");
});
