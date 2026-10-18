// 大きさの決まりの層（size-rules.ts。D44 の段階 2）: 層に載せ替えても、今の挙動（validate.ts の SIZES と形の表の値）と同じ決まりになる
import { expect, test } from "bun:test";
import { BASE_MIN, DEFAULT_RULE, GROUP_MIN, resolveSize } from "../web/src/size-rules";
import { SHAPE_DEFS } from "../web/src/shapes";
import { SHAPES } from "../web/src/validate";
import type { Size } from "../web/src/types";

const steps = ["L", "M", "S"] as const satisfies readonly Size[];
// D44 の前の値（validate.ts の SIZES。層に載せ替えても同じになること）
const SIZES: Record<Size, { minW: number; maxW: number; h: number; fixedH?: boolean; limit?: number }> = {
  L: { minW: 120, maxW: 400, h: 64 },
  M: { minW: 120, maxW: 240, h: 64 },
  S: { minW: 64, maxW: 96, h: 44, fixedH: true, limit: 10 },
};

test("形 × 段 × 置かれ方の全組で、幅の範囲・高さ・高さの固定・文字数の上限・本文・斜めの辺・絵の倍率が今と同じ", () => {
  for (const shape of SHAPES) {
    const def = SHAPE_DEFS[shape];
    for (const step of steps) {
      for (const shared of [false, true]) {
        for (const fullText of [false, true]) {
          const r = resolveSize({ shape, step, shared, fullText, group: false });
          const z = SIZES[shared ? "M" : step]; // 今は sizeOf が、ふつうの大きさにする箱を M にしていた
          const at = `${shape} ${step} shared=${shared} fullText=${fullText}`;
          expect([at, r.textW.min, r.textW.max, r.minH]).toEqual([at, z.minW, z.maxW, z.h]);
          // 今は fitHead が「S の高さの固定は、キャプションを切らない並べ方では使わない」、displayCaption が「切らない並べ方では上限なし」
          expect([at, r.fixedH]).toEqual([at, !!z.fixedH && !fullText]);
          expect([at, r.titleMax]).toEqual([at, fullText ? Infinity : z.limit ?? Infinity]);
          // 今は canBody が「形が本文を持て、S でない」
          expect([at, r.body]).toEqual([at, def.body && (shared ? "M" : step) !== "S"]);
          expect([at, r.look]).toEqual([at, (shared ? "M" : step) === "S" ? "small" : "normal"]);
          expect([at, r.slant, r.artScale]).toEqual([at, def.slant[shared ? "M" : step], def.art?.scale[shared ? "M" : step] ?? 1]);
          // テーマの補正値は、ノーマルの形のふつうの段だけ（今の付箋紙は S に 0 を持っていた）
          expect([at, r.outset]).toEqual([at, def.kind === "normal" && (shared ? "M" : step) !== "S"]);
          expect([at, r.oneLine, r.alignable]).toEqual([at, (shared ? "M" : step) !== "S", (shared ? "M" : step) !== "S"]);
        }
      }
    }
  }
});

test("全オブジェクトの既定は、文字数の上限なし・折り返し可・本文を持てる。土台の最小（64 × 44）を下回らない", () => {
  expect([DEFAULT_RULE.titleMax, DEFAULT_RULE.bodyMax, DEFAULT_RULE.wrap, DEFAULT_RULE.body]).toEqual([Infinity, Infinity, true, true]);
  expect(BASE_MIN).toEqual({ w: 64, h: 44 });
  for (const shape of SHAPES) for (const step of steps) {
    const r = resolveSize({ shape, step, shared: false, fullText: false, group: false });
    expect(r.textW.min).toBeGreaterThanOrEqual(BASE_MIN.w);
    expect(r.minH).toBeGreaterThanOrEqual(BASE_MIN.h);
  }
});

test("箱の種類の層: 子を並べる箱の最小は今の 120 × 64、ほかの箱は土台の最小（64 × 44）", () => {
  expect(resolveSize({ shape: "box", step: "M", shared: true, fullText: false, group: true }).min).toEqual(GROUP_MIN);
  expect(GROUP_MIN).toEqual({ w: 120, h: 64 });
  expect(resolveSize({ shape: "box", step: "S", shared: false, fullText: false, group: false }).min).toEqual(BASE_MIN);
});
