// ex1: 自分のブックのタイプを持たず、画面に足すだけの追加プラグイン（React なし）
// コマンド（引数なし・あり・右クリックされたアイテムを受け取る）・置いてほしいメニュー・キーの既定の割り当て・ダイアログ・文言と言語
import { defineKeys, defineLanguagePack, definePlugin } from "matomezu"
import { kit } from "./kit"
import { EX1_FRENCH } from "./messages"

export const HELLO_DIALOG = kit.defineDialog({ id: "hello" })
export const INSPECT_DIALOG = kit.defineDialogWith<{ item: string }>()({ id: "inspect" })

// あいさつのダイアログを開く。ステージのメニューに入れてほしい
export const HELLO = kit.defineCommand({
  id: "hello",
  title: "sayHello",
  run: (ctx, a) => a.openDialog(ctx.stage.id, HELLO_DIALOG.id),
  when: () => true,
  place: { menus: ["@matomezu/base:stage-menu"] },
})

// 引数のあるコマンド: 言語を変える（ビルトインプラグインのコマンドも型のまま呼べる）
export const SWITCH_LANG = kit.defineCommand({
  id: "lang",
  title: "switchLanguage",
  run: (ctx, a, lang: "ja" | "en" | "fr") => {
    a.command(ctx.stage.id, "@matomezu/base:settings-lang", lang)
  },
  when: () => true,
})

// 右クリックされたアイテムを受け取るコマンド。アイテムの右クリックのメニューに入れてほしい
export const INSPECT = kit.defineCommand({
  id: "inspect",
  title: "inspectItem",
  run: (ctx, a, target: { item: string }) => a.openDialog(ctx.stage.id, INSPECT_DIALOG.id, target),
  when: () => true,
  place: { contextMenus: ["@matomezu/paper:item-context"] },
})

// 既定のキー。結べるのは自分のコマンドだけで、引数のあるコマンドには args に決まった値を書く
export const EX1_KEYS = defineKeys([
  { key: "Mod+Shift+H", command: HELLO.id, scope: "stage" },
  { key: "Mod+Shift+J", command: SWITCH_LANG.id, scope: "global", args: "ja" },
])

export const EX1 = definePlugin(
  kit.plugin({
    commands: [HELLO, SWITCH_LANG, INSPECT],
    keys: EX1_KEYS,
    dialogs: [HELLO_DIALOG, INSPECT_DIALOG],
    languages: [defineLanguagePack(EX1_FRENCH)],
  }),
)

export default EX1

declare module "matomezu/catalog" {
  interface MessageTable extends Readonly<typeof kit.messages> {}
  interface CommandTable {
    "ex1:hello": typeof HELLO
    "ex1:lang": typeof SWITCH_LANG
    "ex1:inspect": typeof INSPECT
  }
  interface DialogTable {
    "ex1:hello": typeof HELLO_DIALOG
    "ex1:inspect": typeof INSPECT_DIALOG
  }
}
