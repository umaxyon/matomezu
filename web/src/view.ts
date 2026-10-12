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

const shapeLabel = (s: Shape) => SHAPE_LABELS[s] ?? s;

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
    onAddRequest: req => openAddDialog(graph, req),
  });
  const minimap = createMinimap(stage, graph);
  // 道具入れを出している入れ物（箱の id。ワールドなら null）。出していなければ undefined。toolSize は足す箱のサイズ
  let toolHost: string | null | undefined;
  let toolSize: Size = "M";
  const hostEl = (id: string | null) => (id == null ? null : stage.querySelector<HTMLElement>(`.mz-node[data-id="${CSS.escape(id)}"]`));
  const toolbox = createToolbox(stage, (key, at) => {
    if (toolHost === undefined) return;
    const el = hostEl(toolHost);
    if (toolHost != null && !el) return;
    if (!at) return openAddDialog(graph, { parentId: toolHost }, key as Shape, toolSize);
    // 離した所が道具入れを出している箱（ワールドなら図）の中なら、そこ（入れ物の中での位置。ポインタの少し左上を新しい箱の左上に）
    const r = (el ?? stage.querySelector<HTMLElement>(".mz-world")!).getBoundingClientRect();
    const view = stage.getBoundingClientRect();
    if (at.x < Math.max(r.left, view.left) || at.x > Math.min(r.right, view.right) || at.y < Math.max(r.top, view.top) || at.y > Math.min(r.bottom, view.bottom)) return;
    openAddDialog(graph, { parentId: toolHost, at: { x: at.x - r.left - 16, y: at.y - r.top - 12 } }, key as Shape, toolSize);
  });
  panel = createPanel(sidebar, graph, panelOptions);
  graph.onDataChange(() => showTools(graph.info(graph.selected())));
  graph.onModeChange(() => showTools(graph.info(graph.selected())));
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

  // 道具入れ（docs/PATTERN-plan.md の 3.7 章）: 選んだ箱か、その親が道具を持つ戦略（フローチャート）なら、その箱の脇に出す。
  // 道具を押すと、その形で新しい箱を足すダイアログを開く（足す所は自動）。図へドラッグして離したら、離した所に足す
  // ワールド（ページ）がフローチャートなら、図の見えている範囲の左上に出す（2026-10-11 ユーザー）
  function showTools(info: Info | null) {
    const host = info && info.kind !== "edge" ? info.tools : null;
    const el = host ? hostEl(host.id) : null;
    if (!host || (host.id != null && !el) || graph.mode() !== "move" || graph.preview() != null) { toolbox.hide(); toolHost = undefined; return; }
    toolHost = host.id;
    toolSize = host.size;
    toolbox.show(el, host.shapes.filter(s => SHAPE_ICONS[s]).map((s): Tool => ({ key: s, label: shapeLabel(s), icon: SHAPE_ICONS[s]! })));
  }
}
