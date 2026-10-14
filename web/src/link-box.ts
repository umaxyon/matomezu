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
  // 窓のまわりの余白は狭く（2026-10-12 ユーザー）。箱の幅は 200。余白は 4 の倍数にする（125% 表示でも画素に割り切れ、左右で 1px ずれない）
  window: { handle: 22, win: { w: 192, h: 92 }, gap: 4, textW: null },
  side:   { handle: 10, win: { w: 116, h: 88 }, gap: 4, textW: { min: 80, max: 160 } },
};
// リストの子が子を持つときに横に出す縮図（D13）。大きさは横に分ける窓と同じ（2026-10-14 ユーザー）。持ち手は無い（行の文字の所でつかむ）
export const PREVIEW_ROW_DEF: LinkLookDef = { ...LINK_LOOK_DEFS.side, handle: 0 };
// 窓枠の箱の幅（窓の幅 + 両側の余白）
export const linkBoxWidth = (d: LinkLookDef) => d.win.w + 2 * d.gap;

export interface Rect { x: number; y: number; w: number; h: number }
// 窓の大きさ（絵を映す所。窓の線は内側に引く（graph-style.ts の .mz-link-win）ので、窓の大きさそのまま）
export const windowOf = (d: LinkLookDef) => ({ w: d.win.w, h: d.win.h });
// 窓に映すページの範囲（ページの座標。縦横比は窓と同じ）。段階 4（docs/PATTERN-plan.md の D27）:
// ページ全体（scene の w × h）が窓に収まる縮尺で映す。縮尺は 1 を超えない（小さなページを拡大しない）。
// 縮尺が minScale を下回るなら minScale にし、はみ出す分は切り取る（clip があればその四角が収まるように、無ければ左上から）。
// clip（ユーザーが設定で選んだ四角）があれば、縮尺に関わらずその四角を映す
export function previewRegion(scene: { w: number; h: number }, win: { w: number; h: number }, minScale: number, clip: Rect | null): Rect {
  const around = (cx: number, cy: number, scale: number): Rect => {
    const w = win.w / scale, h = win.h / scale;
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  };
  if (clip) return around(clip.x + clip.w / 2, clip.y + clip.h / 2, Math.min(win.w / Math.max(1, clip.w), win.h / Math.max(1, clip.h)));
  const fit = Math.min(1, win.w / Math.max(1, scene.w), win.h / Math.max(1, scene.h));
  if (fit >= minScale) return around(scene.w / 2, scene.h / 2, fit);
  return { x: 0, y: 0, w: win.w / minScale, h: win.h / minScale };
}
// 切り取る四角の値が正しいか（ページの座標の四角。w, h は正）
export const isRect = (v: unknown): v is Rect =>
  typeof v === "object" && v !== null && ["x", "y", "w", "h"].every(k => Number.isFinite((v as Record<string, unknown>)[k]))
  && (v as Rect).w > 0 && (v as Rect).h > 0;
