// ボックスを短く示すキー（情報タブのチップや知らせに使う）
import { afterEach, expect, test } from "bun:test";
import { keyOf, truncateWidth } from "../web/src/dom";
import { createGraph, type Graph } from "../web/src/graph";
import { createPanel, type Panel } from "../web/src/panel";
import { fakeMeasure } from "./helpers";

let graph: Graph | null = null;
afterEach(() => {
  graph?.destroy();
  graph = null;
  document.body.innerHTML = "";
});

test("全角 8 文字分（半角 16 文字）までならそのまま、超えたら入るだけ残して … を付ける", () => {
  expect(keyOf(3, "ユーザー")).toBe("3_ユーザー");
  expect(keyOf(12, "東京都新宿区〇〇")).toBe("12_東京都新宿区〇〇");
  expect(keyOf(12, "東京都新宿区〇〇〇町のAさん")).toBe("12_東京都新宿区〇〇…");
  expect(keyOf(7, "Authentication Service")).toBe("7_Authentication S…");
  expect(keyOf(8, "API サーバー")).toBe("8_API サーバー"); // 半角 4 + 全角 4 = 12
  expect(truncateWidth("ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁ", 16)).toBe("ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀ…"); // 半角カナは半角
  expect(truncateWidth("😀😀😀😀😀😀😀😀😀", 16)).toBe("😀😀😀😀😀😀😀😀…"); // サロゲートペアも 1 文字
});

test("改行や続く空白は 1 つの空白にする", () => {
  expect(keyOf(1, "  上の段\n  下の段  ")).toBe("1_上の段 下の段");
});

test("情報タブの子・親・つながりのチップはキーで出し、全文はポインタを乗せると出る", () => {
  const stage = document.createElement("div");
  const side = document.createElement("aside");
  document.body.append(side, stage);
  let panel: Panel | null = null;
  const long = "3階層のサンプル（ワールド → グループ → グループ → ボックス）";
  graph = createGraph(stage, {
    nodes: [{ id: 1, caption: "親" }, { id: 2, caption: long, parent: 1 }, { id: 3, caption: "子", parent: 1 }],
    edges: [[2, 3]],
  }, { measureText: fakeMeasure, onSelect: i => panel?.show(i) });
  panel = createPanel(side, graph);
  graph.select(1);
  const chips = [...side.querySelectorAll<HTMLElement>(".mzp-chip[data-select]")];
  // 「3」が半角 1、「階層のサンプル」が全角 7 で 15。次の「（」は全角なので入らない
  expect(chips.map(c => c.textContent)).toEqual(["2_3階層のサンプル…", "3_子"]);
  expect(chips[0]!.title).toBe(long);
  graph.select(3);
  const labels = [...side.querySelectorAll<HTMLElement>(".mzp-chip[data-select]")].map(c => c.textContent);
  expect(labels).toEqual(["1_親", "2_3階層のサンプル…"]); // 親とつながり
});
