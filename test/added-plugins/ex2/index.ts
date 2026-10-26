// ex2: 自分のブックのタイプと形と自分のアクションを持つ追加プラグイン（React なし）。
// ダイアログはコマンドを通してアクションを行う（追加のダイアログは置き、編集のダイアログは答える）
import { definePlugin, type Point } from "matomezu"
import { ANSWER, DIAMOND, DIAMOND_ADD_DIALOG, DIAMOND_EDIT_DIALOG, FLOW, FLOW_DIRECTION } from "./flow"
import { kit } from "./kit"

// 判断のひし形を置いて、ダイアログを閉じる
export const ADD = kit.defineCommand({
  id: "add",
  title: "addDecision",
  run: (ctx, a, args: { page: string; at: Point; caption: string }) => {
    if (!ctx.book) return
    a.perform(
      "@matomezu/paper:item-place",
      { page: args.page, item: "ex2:diamond", at: args.at, props: { caption: args.caption } },
      { book: ctx.book.id },
    )
    a.closeDialog()
  },
  when: ctx => ctx.book !== null,
})

// 判断に答えて、ダイアログを閉じる
export const ANSWER_COMMAND = kit.defineCommand({
  id: "answer",
  title: "answerDecision",
  run: (ctx, a, args: { page: string; item: string; answer: "yes" | "no" }) => {
    if (!ctx.book) return
    a.perform("ex2:diamond-answer", args, { book: ctx.book.id })
    a.closeDialog()
  },
  when: ctx => ctx.book !== null,
})

export const EX2 = definePlugin(
  kit.plugin({
    bookTypes: [FLOW],
    items: [DIAMOND],
    actions: [ANSWER],
    settings: [FLOW_DIRECTION],
    commands: [ADD, ANSWER_COMMAND],
    dialogs: [DIAMOND_ADD_DIALOG, DIAMOND_EDIT_DIALOG],
  }),
)

export default EX2

declare module "matomezu/catalog" {
  interface BookTypeTable {
    "ex2:flow": typeof FLOW
  }
  interface ItemTable {
    "ex2:diamond": typeof DIAMOND
  }
  interface ActionTable {
    "ex2:diamond-answer": typeof ANSWER
  }
  interface SettingTable {
    "ex2:flow-direction": typeof FLOW_DIRECTION
  }
  interface CommandTable {
    "ex2:add": typeof ADD
    "ex2:answer": typeof ANSWER_COMMAND
  }
  interface DialogTable {
    "ex2:diamond-add": typeof DIAMOND_ADD_DIALOG
    "ex2:diamond-edit": typeof DIAMOND_EDIT_DIALOG
  }
  interface MessageTable extends Readonly<typeof kit.messages> {}
}
