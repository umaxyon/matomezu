// 図 1 つ分の画面の組み立て。描画領域に図と全体像（ミニマップ）と道具箱を、サイドバーに追加削除の一覧を置いてつなぐ。
// main.ts（サーバーなしで開いたとき）と app.ts（サーバーから開いたときのブックごと）で共通

import { createGraph, type Graph, type GraphOptions } from "./graph";
import { layoutScene } from "./offscreen-scene";
import { createMinimap, type Minimap } from "./minimap";
import { openAddDialog, openEdgeEditDialog, openEditDialog } from "./edit-dialog";
import { createPanel, type Panel } from "./panel";
import { createToolbox, type Tool } from "./toolbox";
import type { Info, Shape, Size, ToolKey } from "./types";
import { SHAPE_LABELS, isShape } from "./validate";
import { STRATEGIES } from "./model";
import { SHAPE_ICONS } from "./shape-icons";
import { t } from "./i18n";

const shapeLabel = (s: Shape) => SHAPE_LABELS[s] ?? s;
// 形でない道具（追加と、マスターの操作）の名前と絵。マスターの操作は、押すと呼ぶ側（app.ts）へ知らせる
export type ToolCommand = Exclude<ToolKey, Shape | "add">;
const OTHER_TOOLS: Record<Exclude<ToolKey, Shape>, { label: string; icon: string }> = {
  add: { label: t("追加: 押した所に箱を足す（箱の上ならその子、リストの上なら子と子の間。Esc で選択モードに戻る）"),
    icon: '<path d="M11.5 5.5H5A2.5 2.5 0 0 0 2.5 8v10.5A2.5 2.5 0 0 0 5 21h11a2.5 2.5 0 0 0 2.5-2.5v-6"/><path d="M18.5 1.5v8M14.5 5.5h8"/>' },
  newBook: { label: t("ブック追加: 新しい図を作る"), icon: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5"/><path d="M11.5 7v6M8.5 10h6"/>' },
  crossMove: { label: t("追加削除: ブックごとの箱の一覧を左に出す。窓へドラッグすると、そのブックの郵便箱へ送る"), icon: '<path d="M3 7h18"/><path d="M5 7l1.5 13h11L19 7"/><path d="M12 11v6M9 14h6"/>' },
  settings: { label: t("設定"), icon: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>' },
};
export interface ViewOptions {
  onCommand?: (key: ToolCommand) => void; // マスターの道具（ブック追加・追加削除・設定）を押した
}

export interface DiagramView {
  graph: Graph;
  panel: Panel;
  minimap: Minimap;
}

// options の onSelect は、道具箱を合わせたあとに呼ぶ
export function mountDiagram(stage: HTMLElement, sidebar: HTMLElement, data: unknown,
  options: GraphOptions = {}, panelOptions: ViewOptions = {}): DiagramView {
  let panel: Panel | null = null;
  const graph = createGraph(stage, data, {
    sceneLayout: layoutScene, // 描いていないページの窓の縮図は、画面の外で並べて作る
    ...options,
    onSelect: info => { if (panel) showTools(info); options.onSelect?.(info); },
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
    if (key === "add") {
      if (by === "key") return openAddDialog(graph, { parentId: toolHost }, "box", toolSize);
      picked = key;
      graph.setMode(graph.mode() === "add" ? "move" : "add");
    } else if (!isShape(key)) {
      return panelOptions.onCommand?.(key as ToolCommand);
    } else {
      if (by === "key") return openAddDialog(graph, { parentId: toolHost }, key as Shape, toolSize);
      picked = key;
      graph.startAdd(key as Shape, toolSize);
    }
    showTools(graph.info(graph.selected())); // 追加モードのまま別の道具に替えたとき（モードの知らせは来ない）
  });
  panel = createPanel(sidebar, graph);
  graph.onDataChange(() => showTools(graph.info(graph.selected())));
  graph.onModeChange(m => { if (m !== "add") picked = null; showTools(graph.info(graph.selected())); });
  // ▼ を押すと子を見せる戦略（マスターの「その他のブック」。STRATEGIES の openMore）なら、非表示の箱をその見せ方（マスターはリスト）にする
  // （箱を選ぶ・つかむ処理より先に受け取る）
  stage.addEventListener("pointerdown", e => {
    const more = e.target instanceof Element ? e.target.closest(".mz-more") : null;
    const id = more?.closest<HTMLElement>(".mz-node")?.dataset.id;
    const to = STRATEGIES[(graph.info(null) as { childView: keyof typeof STRATEGIES }).childView].openMore;
    if (!id || e.button !== 0 || graph.preview() != null || !to) return;
    e.stopPropagation();
    e.preventDefault();
    graph.update(id, { childView: to });
  }, true);
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

  // 道具箱（docs/PATTERN-plan.md の 3.7 章。D26）: ページのパターンの道具（STRATEGIES の tools）を、図の見えている範囲の左端に出す。
  // どのモードでも出し（押している道具を示す）、見る用のモードでは隠す。道具を押したときの動きは上の createToolbox
  function showTools(info: Info | null) {
    const host = info ? (info.kind === "edge" ? graph.info(null).tools : info.tools) : null;
    const el = host ? hostEl(host.id) : null;
    if (!host || (host.id != null && !el) || graph.preview() != null) { toolbox.hide(); toolHost = undefined; return; }
    toolHost = host.id;
    toolSize = host.size;
    const tools = host.tools.flatMap((k): Tool[] => isShape(k)
      ? (SHAPE_ICONS[k] ? [{ key: k, label: shapeLabel(k), icon: SHAPE_ICONS[k]! }] : [])
      : [{ key: k, ...OTHER_TOOLS[k] }]);
    toolbox.show(el, tools);
    const hasAdd = host.tools.includes("add");
    toolbox.press(graph.mode() === "add" ? (picked && tools.some(x => x.key === picked) ? picked : hasAdd ? "add" : null) : null);
  }
}
