// ex2: 自分のブックのタイプと形と自分のアクションを持つ追加プラグイン（React なし）。
// ダイアログはコマンドを通してアクションを行う（追加のダイアログは置き、編集のダイアログは答える）
import { defineCommand, definePlugin, type Point } from "matomezu"
import { ANSWER, DIAMOND, DIAMOND_ADD_DIALOG, DIAMOND_EDIT_DIALOG, FLOW, FLOW_DIRECTION } from "./flow"
import { EX2_MESSAGES } from "./messages"

// 判断のひし形を置いて、ダイアログを閉じる
export const ADD = defineCommand({
  id: "ex2/add",
  title: "ex2/addDecision",
  run: (ctx, a, args: { page: string; at: Point; caption: string }) => {
    if (!ctx.book) return
    a.perform(
      "item.place",
      { page: args.page, item: "ex2/diamond", at: args.at, props: { caption: args.caption } },
      { book: ctx.book.id },
    )
    a.closeDialog()
  },
  when: ctx => ctx.book !== null,
})

// 判断に答えて、ダイアログを閉じる
export const ANSWER_COMMAND = defineCommand({
  id: "ex2/answer",
  title: "ex2/answerDecision",
  run: (ctx, a, args: { page: string; item: string; answer: "yes" | "no" }) => {
    if (!ctx.book) return
    a.perform("ex2/diamond.answer", args, { book: ctx.book.id })
    a.closeDialog()
  },
  when: ctx => ctx.book !== null,
})

export const EX2 = definePlugin({
  id: "ex2",
  bookTypes: [FLOW],
  items: [DIAMOND],
  actions: [ANSWER],
  settings: [FLOW_DIRECTION],
  commands: [ADD, ANSWER_COMMAND],
  dialogs: [DIAMOND_ADD_DIALOG, DIAMOND_EDIT_DIALOG],
  messages: EX2_MESSAGES,
})

export default EX2

declare module "matomezu/catalog" {
  interface BookTypeTable {
    "ex2/flow": typeof FLOW
  }
  interface ItemTable {
    "ex2/diamond": typeof DIAMOND
  }
  interface ActionTable {
    "ex2/diamond.answer": typeof ANSWER
  }
  interface SettingTable {
    "ex2/flow.direction": typeof FLOW_DIRECTION
  }
  interface CommandTable {
    "ex2/add": typeof ADD
    "ex2/answer": typeof ANSWER_COMMAND
  }
  interface DialogTable {
    "ex2/diamond.add": typeof DIAMOND_ADD_DIALOG
    "ex2/diamond.edit": typeof DIAMOND_EDIT_DIALOG
  }
  interface MessageTable extends Readonly<typeof EX2_MESSAGES> {}
}
