// リンクの箱（docs/PATTERN-plan.md。2026-10-12 ユーザー: パターンはページ単位。ページの箱は、ほかのページへの窓）。
// 箱に link: ページの id を書くと、そのページをのぞく窓を持つ箱になる。形・サイズ・子の見せ方は使わず、子を持てない。
// 文字の所（キャプション・本文）と持ち手は普通の箱と同じ操作（選ぶ・動かす・線・編集）で、窓を押すとそのページのタブへ移る。
// 窓の中身（縮小プレビュー）は段階 4 で入れる（まずは空の枠）。
// 見せ方（linkLook）は窓枠（window。上の帯が持ち手）と横に分ける（side。左の縦の帯が持ち手）の 2 つ。
// 見せ方ごとの数値はここにだけ書く（CSS は render.ts が変数で渡し、大きさの計算は layout/node-kinds.ts が読む。CLAUDE.md のルール 11）。
// DOM に依存しない
import { t } from "./i18n";
import type { LinkLook } from "./types";

export const LINK_LOOKS = ["window", "side"] as const satisfies readonly LinkLook[];
export const DEFAULT_LINK_LOOK: LinkLook = "window";
export const isLinkLook = (v: unknown): v is LinkLook => (LINK_LOOKS as readonly unknown[]).includes(v);
// 画面での名前（サイドバーと編集ダイアログの選択肢）
export const LINK_LOOK_LABELS: Record<LinkLook, string> = { window: t("窓枠"), side: t("横に分ける") };
export const LINK_LOOK_OPTIONS: [LinkLook, string][] = LINK_LOOKS.map(v => [v, LINK_LOOK_LABELS[v]]);

export interface LinkLookDef {
  handle: number;          // 持ち手の帯の太さ（px。窓枠は上の帯の高さ、横に分けるは左の帯の幅）
  win: { w: number; h: number }; // 窓の大きさ（px。窓枠の w は箱の幅から余白を引いたものなので使わない）
  gap: number;             // 窓のまわりの余白（px）
  textW: { min: number; max: number } | null; // 文字の列の幅の範囲（横に分ける。窓枠は箱の幅いっぱいで null）
}
export const LINK_LOOK_DEFS: Record<LinkLook, LinkLookDef> = {
  window: { handle: 22, win: { w: 180, h: 92 }, gap: 10, textW: null },
  side:   { handle: 10, win: { w: 112, h: 84 }, gap: 6, textW: { min: 80, max: 160 } },
};
// 窓枠の箱の幅（窓の幅 + 両側の余白）
export const linkBoxWidth = (d: LinkLookDef) => d.win.w + 2 * d.gap;
