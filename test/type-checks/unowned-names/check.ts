// 型の表だけで作る名前（キーの範囲・スロット・メニュー・右クリックのメニュー・能力）に、渡したプラグインの id の頭が無ければ、
// createMatomezu の型が誤りにする（@ts-expect-error の行が誤りにならなければ、確かめが落ちる）
import { definePlugin } from "matomezu"
import { BUILTIN_UI, createMatomezu } from "matomezu/testing"

const NAMES = definePlugin({ id: "names" })

// @ts-expect-error 頭の無いキーの範囲と能力・別のプラグインの頭のメニュー
createMatomezu({ plugins: [...BUILTIN_UI, NAMES], home: "@matomezu/master:master" })

declare module "matomezu/catalog" {
  interface KeyScopeTable {
    editor: true
    "names:canvas": true
  }
  interface MenuTable {
    "other:menu": true
  }
  interface CapabilityTable {
    stackable: true
  }
}
