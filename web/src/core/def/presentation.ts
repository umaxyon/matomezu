// 見せ方の定義: ブックをステージにどう見せ、どう触るか（紙の上に形を置く・一覧にするなど）。ブックのタイプが id で選ぶ。
// 描く部品は、見た目を結ぶとき（ui/plugin.ts の presentationViews）にこの id で結ぶ
export interface PresentationDef {
  id: string
}

export function definePresentation<const Id extends string>(def: { id: Id }): PresentationDef & { id: Id } {
  return def
}
