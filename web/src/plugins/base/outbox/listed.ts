// 送信トレイに並べる物の答え: アノテーションの種類の定義に、base が拡張ポイントで書き足すフィールド listed（書かなくてよい）。
// 行の絵は、見た目の側で、スロット annotation-icon に置くウィジェット（defineAnnotationIcon。ui.tsx）が描く
import type { Annotation } from "../../../core/annotation"
import type { CoreCatalog } from "../../../core/core-catalog"

declare module "../../../core/catalog" {
  interface AnnotationExtras {
    // 送信トレイでの出し方（無ければ、付けた時点は無く、文は付けた物の名前、取消は出さない）
    listed?: {
      addedAt(props: never): string // 付けた時点（新しい順に並べる）
      text?(props: never): string // 行の文（無ければ付けた物の名前）
      withdraw?: { action: string; args(id: string): unknown } // 取消で行うアクションと、その引数（アノテーションの id から作る）
      panel?: string // 行を押したときに開く右サイドパネルの中身のウィジェットの id（subject はアノテーションの id。無ければ、付けた物へ移るだけ）
    }
  }
}

type Listed = NonNullable<import("../../../core/catalog").AnnotationExtras["listed"]>

// アノテーション a の種類の、送信トレイでの出し方（props が形に合わなければ無し）
export function listedOf(catalog: CoreCatalog, a: Annotation): { def: Listed; props: unknown } | null {
  const def = catalog.annotations.get(a.annotation)
  if (!def?.listed || !def.props.safeParse(a.props).success) return null
  return { def: def.listed, props: a.props }
}

// アノテーション a を付けた時点（種類が答えなければ null）
export function addedAtOf(catalog: CoreCatalog, a: Annotation): string | null {
  const found = listedOf(catalog, a)
  return found ? found.def.addedAt(found.props as never) : null
}
