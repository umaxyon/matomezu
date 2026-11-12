// スクリーンを作る関数: 枠の上に重ねて出す画面 1 つ（枠は ScreenOverlay を置く画面）。ウィジェットで、どのスロットにも置かない（開く側が useOpenScreen で開く）。
// props は、ビューが受け取る物（オブジェクト）の形（URL から来る値を確かめる）。view は props を受ける
import type { ReactNode } from "react"
import { defineWidget, type WidgetDef } from "../../../ui/layout"

// ビューが受け取る物（オブジェクト）の形（zod の形がそのまま入る。型は、確かめて通った値 P だけに絞る）
export interface ScreenProps<P> {
  safeParse(value: unknown): { success: true; data: P } | { success: false }
}

export const defineScreen = <const Id extends string, P extends object>(def: {
  id: Id
  props: ScreenProps<P>
  view: (props: P) => ReactNode
}) =>
  defineWidget({
    id: def.id,
    slots: [] as readonly never[],
    screen: { props: def.props },
    view: def.view,
  }) as WidgetDef<never> & { id: Id; view: (props: P) => ReactNode }
