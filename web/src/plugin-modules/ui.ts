// 追加プラグインが借りる、名前から実物を引く表（画面用）: ホストのエンジン用の表に、見た目を結ぶのに使うものを足す（React が 2 つになるとフックが動かないため、React も借りる）
import * as react from "react"
import * as jsxRuntime from "react/jsx-runtime"
import * as matomezuUi from "../plugin-api/ui"
import { MODULES, type UI_NAMES } from "."

export const UI_MODULES: Readonly<Record<(typeof UI_NAMES)[number], object>> = {
  ...MODULES,
  "matomezu/ui": matomezuUi,
  react,
  "react/jsx-runtime": jsxRuntime, // .tsx を変換すると、JSX はこの名前の import になる
}
