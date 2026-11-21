// アノテーションの結び付く物の id の並び（core の Anchors。1 つ以上）を、base の機能が扱う所
import { z } from "zod"
import { type Anchors, anchorsOf } from "../../../core/annotation"

// 並びから作る関数は core の物を、プラグイン API にも出す
export { anchorsOf }

// アクションの引数の、結び付く物の id: id の並び（1 つ以上）で受け、同じ id を 1 つにまとめる（AI には id の並びとして見せる）
export const AnchorsArg = z
  .array(z.string().min(1))
  .min(1)
  .transform((ids, ctx) => {
    const anchors = anchorsOf([...new Set(ids)])
    if (anchors) return anchors
    ctx.issues.push({ code: "custom", message: "anchors must not be empty", input: ids })
    return z.NEVER
  })

// 結び付く物の最後の 1 つ（吹き出しや目印はその傍に立つ）
export const lastAnchor = (anchors: Readonly<Anchors>): string => anchors[anchors.length - 1] ?? anchors[0]
