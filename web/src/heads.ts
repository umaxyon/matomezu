/*
 * 線の端の形（D17、docs/HEADS-plan.md）。DOM に依存しない。
 * - 端ごとの種類は startHead / endHead に書く（書けばその端に付く）。今までの arrow（"start" / "end" / "both"）は、
 *   書いた端に塗りの三角（"arrow"）を付ける読み方のまま残す。両方あれば startHead / endHead が優先
 * - 描き方: 塗る形（fill）と線で描く形（stroke）の path と、見える線を端から縮める長さ（trim。形の付け根で線を止める）
 */

import { t } from "./i18n";
import type { Arrow, EdgeData } from "./types";

export const HEADS = ["arrow", "open", "hollow", "diamond", "hollowDiamond", "one", "many", "zeroOne", "zeroMany", "oneMany"] as const;
export type Head = typeof HEADS[number];
export const isHead = (v: unknown): v is Head => HEADS.includes(v as Head);

// 画面の選択肢（線の編集ダイアログとサイドバー）。"" は無し。記号は形の見当（option には絵を入れられないため）
export const headOptions = (): [string, string][] => [
  ["", t("なし")],
  ["arrow", t("▶ 塗りの三角")],
  ["open", t("> 開いた矢じり")],
  ["hollow", t("▷ 白抜きの三角")],
  ["diamond", t("◆ 塗りのひし形")],
  ["hollowDiamond", t("◇ 白抜きのひし形")],
  ["one", t("ER: 1")],
  ["many", t("ER: 多")],
  ["zeroOne", t("ER: 0 か 1")],
  ["zeroMany", t("ER: 0 以上")],
  ["oneMany", t("ER: 1 以上")],
];

export type Side = "start" | "end";
const KEY = { start: "startHead", end: "endHead" } as const;

// 端 side の形（無ければ null）
export function headOf(src: EdgeData, side: Side): Head | null {
  const h = src[KEY[side]];
  if (isHead(h)) return h;
  const a = src.arrow;
  return a === side || a === "both" ? "arrow" : null;
}

// 両端を start / end（null は無し）にする変更。塗りの三角は今までどおり arrow に書き、ほかの種類は startHead / endHead に書く
// （データを短く保ち、今までの図の書き方と変えない）
export function headsPatch(start: Head | null, end: Head | null): { arrow: Arrow | null; startHead: Head | null; endHead: Head | null } {
  const arrow: Arrow | null = start === "arrow" && end === "arrow" ? "both" : start === "arrow" ? "start" : end === "arrow" ? "end" : null;
  const custom = (h: Head | null) => (h && h !== "arrow" ? h : null);
  return { arrow, startHead: custom(start), endHead: custom(end) };
}

// 端 side だけを kind にする変更。heads は今の両端の形（EdgeInfo の startHead / endHead）
export function headPatch(heads: { startHead: Head | null; endHead: Head | null }, side: Side, kind: Head | null) {
  return headsPatch(side === "start" ? kind : heads.startHead, side === "end" ? kind : heads.endHead);
}

export interface HeadDraw { fill: string; stroke: string; trim: number }

const r = (n: number) => Math.round(n * 10) / 10;

// f から tip へ向かう区間の、tip の側の形。区間が短すぎれば何も描かない
export function headDraw(kind: Head, [fx, fy]: [number, number], [tx, ty]: [number, number]): HeadDraw {
  const len = Math.hypot(tx - fx, ty - fy);
  if (len < 1) return { fill: "", stroke: "", trim: 0 };
  const ux = (tx - fx) / len, uy = (ty - fy) / len;
  // 先端から軸に沿って d 戻り、横へ w ずれた点（w は進む向きの左が正）
  const at = (d: number, w = 0) => `${r(tx - ux * d - uy * w)},${r(ty - uy * d + ux * w)}`;
  const tri = `M${at(0)}L${at(10, 6)}L${at(10, -6)}Z`;
  const dia = `M${at(0)}L${at(8, 5)}L${at(16)}L${at(8, -5)}Z`;
  const bar = (d: number) => `M${at(d, 6)}L${at(d, -6)}`;
  const crow = (d: number) => `M${at(0, 7)}L${at(d)}L${at(0, -7)}M${at(0)}L${at(d)}`;
  // 輪（中心は先端から d、半径 4）。線は輪の手前で止め、輪の先から先端までは stroke に描く
  const ring = (d: number) => `M${at(d - 4)}A4,4 0 1 1 ${at(d + 4)}A4,4 0 1 1 ${at(d - 4)}`;
  switch (kind) {
    case "arrow": return { fill: tri, stroke: "", trim: 9 };
    case "hollow": return { fill: "", stroke: tri, trim: 10 };
    case "open": return { fill: "", stroke: `M${at(10, 6)}L${at(0)}L${at(10, -6)}`, trim: 0 };
    case "diamond": return { fill: dia, stroke: "", trim: 15 };
    case "hollowDiamond": return { fill: "", stroke: dia, trim: 16 };
    case "one": return { fill: "", stroke: bar(8), trim: 0 };
    case "many": return { fill: "", stroke: crow(11), trim: 11 };
    case "oneMany": return { fill: "", stroke: crow(11) + bar(15), trim: 11 };
    case "zeroOne": return { fill: "", stroke: bar(6) + `M${at(0)}L${at(12)}` + ring(16), trim: 20 };
    case "zeroMany": return { fill: "", stroke: crow(11) + `M${at(11)}L${at(13)}` + ring(17), trim: 21 };
  }
}
