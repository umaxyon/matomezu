// アクションが読んだ、種類 subject の索引キーの行（id と索引キーの値。読んでいなければ空）
import type { SubjectId } from "../../../core/catalog"
import type { ActionContext } from "../../../core/def/action"
import type { KeyValuesOf } from "../../../core/record-keys"

export const keyRowsIn = <S extends SubjectId>(
  ctx: Pick<ActionContext, "keys">,
  subject: S,
): { id: string; keys: KeyValuesOf<S> }[] =>
  Object.entries<KeyValuesOf<S>>(ctx.keys?.[subject] ?? {}).map(([id, keys]) => ({ id, keys }))
