// 型が誤りにする場面（tsc -p でこのプロジェクトを確かめる。@ts-expect-error の行が誤りにならなければ、確かめが落ちる）
import { definePluginUi } from "matomezu/ui"
import { EX8 } from ".."
import { CARDS } from "../deck"

// @ts-expect-error 自分の見せ方のビューを結んでいない
definePluginUi(EX8, { presentationViews: {} })
definePluginUi(EX8, {
  presentationViews: {
    [CARDS.id]: {
      view: () => null,
      // @ts-expect-error 印刷区画 1 つのビューは、印刷区画の位置（column）を数で受ける
      printSheet: ({ column }: { column: string }) => column,
    },
  },
})
