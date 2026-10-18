// 大きさの決まりの層（D44。docs/BOX-SIZE-plan.md の 3.5・4.8・4.9・6.1）。箱ごとの大きさの決まり（SizeRule）を、層を順に当てて 1 つに決める。
// 大きさを測る所（layout/node-kinds.ts など）は、この結果だけを読む（サイズの段の名前や値を直接読まない）。
//
// 層（弱い順に当て、強いものが上書きする。2026-10-18 ユーザー）:
//   全オブジェクトの既定（DEFAULT_RULE）→ 形のローカルなルール（ふつうの形の段の表 STEPS など）→ 親のルール（リスト・フローチャートの子）
//   JSON の値（width など）は、決まった範囲の中での求めとして、測る所が使う。最後に土台の最小（BASE_MIN）を下回らない
// 土台は上限を持たない。最小を下回らないことだけを保証する（4.8）
//
// 純粋な関数: 箱（Box）は読まず、形・データの段・置かれ方を受け取る（model.ts の sizeRuleOf が箱から集めて呼ぶ）。テーマも読まない（CLAUDE.md の 9）
import { type ShapeDef, shapeDef } from "./shapes";
import type { Shape, Size } from "./types";

// 土台の最小の大きさ（どの種類も、一旦今の S の大きさ。固定で変更不可。2026-10-18 ユーザー）
export const BASE_MIN = { w: 64, h: 44 } as const;

export interface SizeRule {
  textW: { min: number; max: number }; // 中身に合わせるときの幅の範囲（土台の大きさ。テーマの補正値は測る所が足す）
  minH: number;      // 高さの最小
  fixedH: boolean;   // 高さを決まった値にする（文字に合わせて伸ばさない）
  titleMax: number;  // タイトル（キャプション）の文字数の上限（Infinity は無し。超えた分は … で切る）
  bodyMax: number;   // 本文の文字数の上限（Infinity は無し）
  wrap: boolean;     // 折り返してよいか
  body: boolean;     // 本文を持てるか
  look: "normal" | "small"; // 文字の見た目（small は小さい文字と狭い余白。graph-style.ts）
  outset: boolean;   // テーマの補正値（足跡を広げる）を効かせるか
  slant: number;     // 斜めの辺が横に食い込む幅（形のローカルな値）
  artScale: number;  // 絵の形の絵の倍率（形のローカルな値）
}

// 全オブジェクトの既定（層 2。2026-10-18 ユーザー: 文字数の上限は項目別、折り返しは可）
export const DEFAULT_RULE: SizeRule = {
  textW: { min: BASE_MIN.w, max: Infinity }, minH: BASE_MIN.h, fixedH: false,
  titleMax: Infinity, bodyMax: Infinity, wrap: true, body: true, look: "normal", outset: true, slant: 0, artScale: 1,
};

// ふつうの形（と、文字の大きさから形を決めるひし形・円・絵の形）のローカルな段の表。データの size を読むのはここだけ。
// 段の名前は形のローカルなもので、土台・ほかの層には出てこない（4.8）
export const STEPS: Record<Size, { minW: number; maxW: number; h: number; fixedH: boolean; titleMax: number; body: boolean; look: SizeRule["look"] }> = {
  L: { minW: 120, maxW: 400, h: 64, fixedH: false, titleMax: Infinity, body: true, look: "normal" },
  M: { minW: 120, maxW: 240, h: 64, fixedH: false, titleMax: Infinity, body: true, look: "normal" },
  S: { minW: 64, maxW: 96, h: 44, fixedH: true, titleMax: 10, body: false, look: "small" },
};

// 段を当てる形のローカルなルール（形の表の値と合わせる）
function shapeRule(def: ShapeDef, step: Size, r: SizeRule): SizeRule {
  const z = STEPS[step];
  return {
    ...r,
    textW: { min: z.minW, max: z.maxW }, minH: z.h, fixedH: z.fixedH, titleMax: z.titleMax,
    body: def.body && z.body, look: z.look,
    outset: def.kind === "normal",
    slant: def.slant[step], artScale: def.art?.scale[step] ?? 1,
  };
}

// 親のルール（層の一番上）は、親の並べ方が子に強制する見せ方（model.ts の LOOKS・lookOf。戦略の表の側に書く）から受け取る
// （2026-10-18 ユーザー: 子に強制的に影響を与える箱に入ったときは親のルールに沿う）:
//   shared   … 段を使わず、ふつうの大きさ（M の段）で測る（リストの葉の子。子を自由に置く箱・リンクの箱も段を使わない）
//   fullText … キャプションを切らず、高さは折り返した文字に合わせる（リスト・フローチャートの子）
export interface SizeInput {
  shape: Shape;      // 形（見せ方の上書き plainShape をしたあとの形）
  step: Size;        // データの段（無ければ M）
  shared: boolean;
  fullText: boolean;
}

export function resolveSize(o: SizeInput): SizeRule {
  let r = DEFAULT_RULE;
  r = shapeRule(shapeDef(o.shape), o.shared ? "M" : o.step, r);
  if (o.fullText) r = { ...r, titleMax: Infinity, fixedH: false };
  // 土台: 最小を下回らない
  return { ...r, textW: { min: Math.max(BASE_MIN.w, r.textW.min), max: Math.max(BASE_MIN.w, r.textW.max) }, minH: Math.max(BASE_MIN.h, r.minH) };
}
