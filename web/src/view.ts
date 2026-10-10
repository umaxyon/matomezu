// 図 1 つ分の画面の組み立て。描画領域に図と全体像（ミニマップ）を、サイドバーにパネルを置いてつなぐ。
// main.ts（サーバーなしで開いたとき）と app.ts（サーバーから開いたときのブックごと）で共通

import { createGraph, type Graph, type GraphOptions } from "./graph";
import { createMinimap, type Minimap } from "./minimap";
import { openEditDialog } from "./edit-dialog";
import { createPanel, type Panel, type PanelOptions } from "./panel";

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
    onSelect: info => { panel?.show(info); options.onSelect?.(info); },
  });
  panel = createPanel(sidebar, graph, panelOptions);
  const minimap = createMinimap(stage, graph);
  // 図の上でボックスを押したら、その情報を見せる（削除モードでは押すと消えるので切り替えない）
  stage.addEventListener("pointerdown", e => {
    if (e.target instanceof Element && e.target.closest(".mz-head, .mz-hit") && graph.mode() !== "remove") panel?.tab("info");
  });
  // 選択モードで箱をダブルクリックしたら、キャプションと本文の編集ダイアログを開く（見る用のモードでは開かない）
  stage.addEventListener("dblclick", e => {
    const node = e.target instanceof Element && e.target.closest(".mz-head") ? e.target.closest<HTMLElement>(".mz-node") : null;
    if (!node?.dataset.id || graph.mode() !== "move" || graph.preview() != null) return;
    openEditDialog(graph, node.dataset.id);
  });
  return { graph, panel, minimap };
}
