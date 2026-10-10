// 図（graph.ts）で起きたことの知らせと、それを受けたときの画面の方針（docs/REFACTOR-2.md）。
// graph は何が起きたか（GraphEvent）だけを知らせ、文言とモードの切り替えはここで決める

import type { Graph } from "./graph";

export type GraphEvent =
  // 付け替えた。into は落とし先の箱のキー（null は最上位）、page はほかのページから移したときの今のページの名前
  | { kind: "moved"; into: string | null; page: string | null; cutEdges: number }
  // ページの箱を、ページの中へは移せない
  | { kind: "pageInPage" }
  // 子孫ごと消した
  | { kind: "removed"; key: string; kids: number; cutEdges: number }
  // 消したボックスを戻した。byDrag はサイドバーの一覧からドラッグして戻したか
  | { kind: "restored"; key: string; byDrag: boolean }
  // ほかのブックの箱を移植した。from は元のブックの名前
  | { kind: "pasted"; key: string; from: string | null; kids: number; edges: number }
  // 子のサイズをそろえた
  | { kind: "aligned"; count: number; what: "width" | "height" | "both"; partial: boolean }
  // 読み込んだデータに、知らないテーマの名前があった（標準として描いている）
  | { kind: "unknownTheme"; names: string[] };

// 知らせの文言
export function noticeOf(ev: GraphEvent): string {
  const also = (parts: string[]) => (parts.length ? `（${parts.join("、")}）` : "");
  switch (ev.kind) {
    case "moved":
      return (ev.into ? `「${ev.into}」の中` : "最上位") + (ev.page != null ? `（${ev.page}）` : "") + "へ移しました" +
        (ev.cutEdges ? `（階層が変わったため、線を ${ev.cutEdges} 本外しました）` : "");
    case "pageInPage":
      return "ページの中には、ページの箱を入れられません";
    case "removed": {
      const parts = [ev.kids ? `子 ${ev.kids} 個` : "", ev.cutEdges ? `線 ${ev.cutEdges} 本` : ""].filter(Boolean);
      return `「${ev.key}」を消しました` + (parts.length ? `（${parts.join("、")}も）` : "");
    }
    case "restored":
      return `「${ev.key}」を戻しました`;
    case "pasted":
      return `「${ev.key}」を移植しました` +
        also([ev.from ? `${ev.from} から` : "", ev.kids ? `子 ${ev.kids} 個` : "", ev.edges ? `線 ${ev.edges} 本` : ""].filter(Boolean));
    case "unknownTheme":
      return `知らないテーマ（${ev.names.join("、")}）があります。標準として描いています`;
    case "aligned": {
      const label = ev.what === "width" ? "幅" : ev.what === "height" ? "高さ" : "幅と高さ";
      return `子 ${ev.count} 個の${label}をそろえました` + (ev.partial ? "（中身の都合で狭められない子があります）" : "");
    }
  }
}

// 図の知らせを受けたときの画面の方針: 文言を出す（status）。
// 一覧からドラッグして戻したら、線モードや削除モードのままだと戻した箱をすぐ動かせないので、選択モードにする
export function handleGraphEvent(graph: Graph, ev: GraphEvent, status: (text: string) => void) {
  status(noticeOf(ev));
  if (ev.kind === "restored" && ev.byDrag && (graph.mode() === "link" || graph.mode() === "remove")) graph.setMode("move");
}
