// 道具の定義: ステージでポインタが何をするか。道具は組（ToolSetDef）にまとめ、ブックのタイプが使う組を id で名指す（BookTypeDef の tools）。
// 道具で何をするかは、ステージを描くビュー（見せ方・アイテム）が今の道具の定義を見て決める。土台が見るのは pans と places だけ:
// pans はステージをドラッグすると紙をずらす道具、places はアイテムを置く道具（置こうとすると、組のこの道具に替える）。
// ほかのプラグインが道具ごとに読むものは、読む側が ToolExtras（定義オブジェクトの拡張ポイント）に書き足す。
// アイコンは、見た目を結ぶとき（ui/plugin.ts の toolIcons）にこの id で結ぶ
import type { ToolExtras, ToolSetExtras } from "../catalog"
import type { MessageKey } from "../i18n/i18n"

export interface ToolDef<Tt extends string = MessageKey> extends ToolExtras {
  id: string // 本当の id（例: @matomezu/base:hand）
  title: Tt
  pans?: boolean
  places?: boolean
}

// 道具の組。並びは回す順で、先頭が初めの道具（ほかのプラグインの道具も、本当の id で並べられる）
export interface ToolSetDef extends ToolSetExtras {
  id: string
  tools: readonly string[]
}

export function defineTool<const Id extends string>(def: ToolDef & { id: Id }): ToolDef & { id: Id } {
  return def
}

export function defineToolSet<const Id extends string, const T extends readonly string[]>(def: {
  id: Id
  tools: T
}): ToolSetDef & { id: Id; tools: T } {
  return def
}
