// 図（graph.ts）で起きたことの知らせと、それを受けたときの画面の方針（docs/REFACTOR-2.md）。
// graph は何が起きたか（GraphEvent）だけを知らせ、文言とモードの切り替えはここで決める

import type { Graph } from "./graph";
import { t } from "./i18n";

export type GraphEvent =
  // 付け替えた。into は落とし先の箱のキー（null は最上位）、page はほかのページから移したときの今のページの名前
  | { kind: "moved"; into: string | null; page: string | null; cutEdges: number }
  // ページの箱を、ページの中へは移せない
  | { kind: "pageInPage" }
  // 子を持つ箱を、子が子を持てない戦略（フローチャート）の中へ入れようとした（入れなかった）
  | { kind: "leafKids" }
  // 子孫ごと消した
  | { kind: "removed"; key: string; kids: number; cutEdges: number }
  // 消したボックスを戻した。byDrag はサイドバーの一覧からドラッグして戻したか
  | { kind: "restored"; key: string; byDrag: boolean }
  // ほかのブックの箱を移植した。from は元のブックの名前
  | { kind: "pasted"; key: string; from: string | null; kids: number; edges: number }
  // 箱を足した（追加モード）
  | { kind: "added"; key: string }
  // 消したボックスを完全に削除した
  | { kind: "purged"; key: string; kids: number }
  // 子を持つ箱をクラスにして、子孫を消した（消したものの一覧へ移した。docs/CLASS-plan.md）
  | { kind: "classKids"; key: string; kids: number }
  // 子のサイズをそろえた
  | { kind: "aligned"; count: number; what: "width" | "height" | "both"; partial: boolean }
  // 読み込んだデータに、知らないテーマの名前があった（標準として描いている）
  | { kind: "unknownTheme"; names: string[] };

// 知らせの文言。添える項目（子の数、線の数など）は「、」でつないで括弧に入れる
export function noticeOf(ev: GraphEvent): string {
  const list = (parts: (string | false)[]) => parts.filter(Boolean).join(t("、"));
  const also = (parts: (string | false)[]) => (list(parts) ? t("（{list}）", { list: list(parts) }) : "");
  const kids = (n: number) => n > 0 && t("子 {n} 個", { n });
  const lines = (n: number) => n > 0 && t("線 {n} 本", { n });
  switch (ev.kind) {
    case "moved": {
      const where = ev.page != null
        ? (ev.into ? t("「{into}」の中（{page}）へ移しました", { into: ev.into, page: ev.page }) : t("最上位（{page}）へ移しました", { page: ev.page }))
        : (ev.into ? t("「{into}」の中へ移しました", { into: ev.into }) : t("最上位へ移しました"));
      return where + (ev.cutEdges ? t("（階層が変わったため、線を {n} 本外しました）", { n: ev.cutEdges }) : "");
    }
    case "pageInPage":
      return t("ページの中には、ページの箱を入れられません");
    case "leafKids":
      return t("フローチャートの中の箱は子を持てないので、子を持つ箱は入れられません");
    case "removed": {
      const parts = list([kids(ev.kids), lines(ev.cutEdges)]);
      return t("「{key}」を消しました", { key: ev.key }) + (parts ? t("（{list}も）", { list: parts }) : "");
    }
    case "restored":
      return t("「{key}」を戻しました", { key: ev.key });
    case "added":
      return t("「{key}」を追加しました", { key: ev.key });
    case "classKids":
      return t("「{key}」をクラスにして、子 {n} 個を消したものの一覧へ移しました", { key: ev.key, n: ev.kids });
    case "purged":
      return t("「{key}」を完全に削除しました", { key: ev.key }) + also([kids(ev.kids)]);
    case "pasted":
      return t("「{key}」を移植しました", { key: ev.key }) +
        also([ev.from ? t("{from} から", { from: ev.from }) : false, kids(ev.kids), lines(ev.edges)]);
    case "unknownTheme":
      return t("知らないテーマ（{names}）があります。標準として描いています", { names: ev.names.join(t("、")) });
    case "aligned": {
      const done = ev.what === "width" ? t("子 {n} 個の幅をそろえました", { n: ev.count })
        : ev.what === "height" ? t("子 {n} 個の高さをそろえました", { n: ev.count })
        : t("子 {n} 個の幅と高さをそろえました", { n: ev.count });
      return done + (ev.partial ? t("（中身の都合で狭められない子があります）") : "");
    }
  }
}

// 図の知らせを受けたときの画面の方針: 文言を出す（status）。
// 一覧からドラッグして戻したら、削除モードのままだと戻した箱をすぐ動かせないので、選択モードにする
export function handleGraphEvent(graph: Graph, ev: GraphEvent, status: (text: string) => void) {
  status(noticeOf(ev));
  if (ev.kind === "restored" && ev.byDrag && graph.mode() === "remove") graph.setMode("move");
}
