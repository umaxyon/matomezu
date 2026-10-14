// 図 1 つ分の画面の組み立て。描画領域に図と全体像（ミニマップ）を、サイドバーにパネルを置いてつなぐ。
// main.ts（サーバーなしで開いたとき）と app.ts（サーバーから開いたときのブックごと）で共通

import { createGraph, type Graph, type GraphOptions } from "./graph";
import { createMinimap, type Minimap } from "./minimap";
import { openAddDialog, openEdgeEditDialog, openEditDialog } from "./edit-dialog";
import { createPanel, type Panel, type PanelOptions } from "./panel";
import { createToolbox, type Tool } from "./toolbox";
import type { Info, Shape, Size } from "./types";
import { SHAPE_LABELS } from "./validate";
import { SHAPE_ICONS } from "./shape-icons";
import { t } from "./i18n";

const shapeLabel = (s: Shape) => SHAPE_LABELS[s] ?? s;
// 道具箱の「追加」（形の名前と重ならない鍵）と、その絵（追加モードの絵）
const ADD_TOOL = "+add";
const ADD_ICON = '<path d="M11.5 5.5H5A2.5 2.5 0 0 0 2.5 8v10.5A2.5 2.5 0 0 0 5 21h11a2.5 2.5 0 0 0 2.5-2.5v-6"/><path d="M18.5 1.5v8M14.5 5.5h8"/>';

export interface DiagramView {
  graph: Graph;
  panel: Panel;
  minimap: Minimap;
}

// options の onSelect は、パネルに選んだものを見せたあとに呼ぶ
export function mountDiagram(stage: HTMLElement, sidebar: HTMLElement, data: unknown,
  options: GraphOptions = {}, panelOptions: PanelOptions = {}): DiagramView {
  let panel: Panel | null = null;
  const graph = createGraph(stage, data, {
    ...options,
    onSelect: info => { panel?.show(info); if (panel) showTools(info); options.onSelect?.(info); },
    // 追加モードで図を押したら、新しい箱の中身を聞くダイアログを開く
    onAddRequest: ({ shape, size, ...req }) => openAddDialog(graph, req, shape, size),
  });
  const minimap = createMinimap(stage, graph);
  // 道具箱を出している入れ物（箱の id。ワールドなら null）。出していなければ undefined。toolSize は足す箱のサイズ
  let toolHost: string | null | undefined;
  let toolSize: Size = "M";
  let picked: string | null = null; // 追加モードに入った道具（追加か形）
  const hostEl = (id: string | null) => (id == null ? null : stage.querySelector<HTMLElement>(`.mz-node[data-id="${CSS.escape(id)}"]`));
  // 「追加」を押したら追加モード（押した所に箱を足す。もう一度押すと選択モードに戻る）。
  // 形を押したら、その形を足す追加モードに入る（影に形の絵が付き、置きたい所を押すとダイアログ。2026-10-12 ユーザー）。
  // キーボードで押したときは置く所を指せないので、道具箱を出している入れ物に足すダイアログをすぐ開く
  const toolbox = createToolbox(stage, (key, by) => {
    if (toolHost === undefined) return;
    if (key === ADD_TOOL) {
      if (by === "key") return openAddDialog(graph, { parentId: toolHost }, "box", toolSize);
      picked = key;
      graph.setMode(graph.mode() === "add" ? "move" : "add");
    } else {
      if (by === "key") return openAddDialog(graph, { parentId: toolHost }, key as Shape, toolSize);
      picked = key;
      graph.startAdd(key as Shape, toolSize);
    }
    showTools(graph.info(graph.selected())); // 追加モードのまま別の道具に替えたとき（モードの知らせは来ない）
  });
  panel = createPanel(sidebar, graph, panelOptions);
  graph.onDataChange(() => showTools(graph.info(graph.selected())));
  graph.onModeChange(m => { if (m !== "add") picked = null; showTools(graph.info(graph.selected())); });
  // 図の上でボックスを押したら、その情報を見せる（削除モードでは押すと消えるので切り替えない）
  stage.addEventListener("pointerdown", e => {
    if (e.target instanceof Element && e.target.closest(".mz-head, .mz-hit") && graph.mode() !== "remove") panel?.tab("info");
  });
  // 選択モードで箱をダブルクリックしたら、キャプションと本文の編集ダイアログを開く。線（かキャプションの札）なら線の編集ダイアログ
  // （見る用のモードでは開かない）
  stage.addEventListener("dblclick", e => {
    if (!(e.target instanceof Element) || graph.mode() !== "move" || graph.preview() != null) return;
    // 本文の幅のつまみなら本文の幅を、リストの幅のつまみならリストの幅を自動に戻す（箱の編集は開かない）
    const grip = e.target.closest(".mz-body-grip, .mz-width-grip");
    if (grip) {
      const id = grip.closest<HTMLElement>(".mz-node")?.dataset.id;
      if (id) graph.update(id, grip.classList.contains("mz-width-grip") ? { width: null } : { bodyWidth: null });
      return;
    }
    // 線の当たり・札・ドラッグできる途中の区間（腹）・端の丸のどれでも、線の編集を開く
    const edge = e.target.closest(".mz-hit, .mz-label, .mz-bend, .mz-ends") ? e.target.closest<SVGElement>(".mz-edge") : null;
    if (edge?.dataset.id) return openEdgeEditDialog(graph, edge.dataset.id);
    const node = e.target.closest(".mz-head") ? e.target.closest<HTMLElement>(".mz-node") : null;
    if (node?.dataset.id) openEditDialog(graph, node.dataset.id);
  });
  return { graph, panel, minimap };

  // 道具箱（docs/PATTERN-plan.md の 3.7 章。D26）: ページのパターンの道具（追加か、フローチャートの形）を、図の見えている範囲の左上に出す。
  // どのモードでも出し（押している道具を示す）、見る用のモードでは隠す。道具を押したときの動きは上の createToolbox
  function showTools(info: Info | null) {
    const host = info ? (info.kind === "edge" ? graph.info(null).tools : info.tools) : null;
    const el = host ? hostEl(host.id) : null;
    if (!host || (host.id != null && !el) || graph.preview() != null) { toolbox.hide(); toolHost = undefined; return; }
    toolHost = host.id;
    toolSize = host.size;
    const tools: Tool[] = host.add ? [{ key: ADD_TOOL, label: t("追加: 押した所に箱を足す（箱の上ならその子、リストの上なら子と子の間。Esc で選択モードに戻る）"), icon: ADD_ICON }] : [];
    tools.push(...host.shapes.filter(s => SHAPE_ICONS[s]).map((s): Tool => ({ key: s, label: shapeLabel(s), icon: SHAPE_ICONS[s]! })));
    toolbox.show(el, tools);
    toolbox.press(graph.mode() === "add" ? (picked && tools.some(x => x.key === picked) ? picked : host.add ? ADD_TOOL : null) : null);
  }
}
