// 郵便箱のスクリーン（郵便箱の画面だけを見せる、ステージを並べないスクリーン）と、それを開いて郵便を選ぶコマンド・閉じる・広げる・↑↓で選ぶ行を移すコマンドとキー。
// 開く先は書庫のスクリーンと同じ（base/window/lower-row.ts）: 呼んだスクリーンの下の行（書庫のスクリーンから開けば、下の行を入れ替える）。
// ただし、郵便箱の画面を中に描く（定義の viewsInside。コントロールセンター）スクリーンから開けば、新しく開かずに、そのスクリーンの郵便箱の画面で選ぶ（コンテンツエリアを替えるのは、開く側のフック）。
// ほかのスクリーンから新しく開けば、コントロールセンターのコンテンツエリアが郵便箱を出しているとき、プロジェクトに戻す（viewsInside の away）
import { z } from "zod"
import { NO_STATE } from "../../../core/def/plugin-state"
import { SCREEN_REFUSED } from "../../../store/actions"
import {
  arrangementValueIn,
  type CommandActions,
  calledScreenIdOf,
  resetPluginStateAtOf,
  type ScreenCommandContext,
  screensOf,
  storeActionsOf,
  updatePluginStateAtOf,
} from "../../../store/commands/def"
import { kit } from "../kit"
import { closeInLowerRow, expandLowerRow, openInLowerRow } from "../window/lower-row"
import { MAIL_SEEN } from "./actions"
import { inboxOf, pickMoved } from "./inbox"
import { type Mail, mailsInOrder } from "./mail"
import { MAILBOX_PICKED, MAILBOX_SENDER_TAB } from "./states"
import { MAIL } from "./subject"

export const MAILBOX_SCREEN = kit.defineScreen({
  id: "mailbox-screen",
  title: "Mailbox",
  aiDescription:
    "The user's mailbox alone: the inbox (the letters that came, newest first, in tabs for letters from AIs and from people) on the left and the picked letter on the right, with buttons that open the place it points at. Below a book screen, the place opens in that book screen's current stage, and the mailbox stays open. Over the whole window, it opens in a book screen of its own.",
  props: z.strictObject({}),
  maxOpen: 1,
})

// 郵便箱の画面の中にフォーカスがある間のキー（Esc で閉じる・↑↓で選ぶ行を移す）
export const MAILBOX_SCOPE = kit.name("mailbox")
export const MAILBOX_KEY_SCOPE = kit.defineKeyScope({ id: "mailbox", title: "Mailbox", commandsFrom: "screen" })

// 郵便箱の画面を描いているスクリーン: 郵便箱のスクリーンから呼べばそれ、ほかは openInLowerRow（郵便箱の画面を中に描くスクリーンならそれ。出せなければ SCREEN_REFUSED）
function mailboxScreenOf(ctx: ScreenCommandContext, a: CommandActions): string | typeof SCREEN_REFUSED {
  if (ctx.screen.def === MAILBOX_SCREEN.id) return calledScreenIdOf(ctx)
  return openInLowerRow(ctx, a, MAILBOX_SCREEN.id)
}

// 郵便箱を開く: 郵便箱の画面を出し（開いていれば、それを使う）、mail を渡せば、その郵便のタブに替えて選び、見たことにする。渡さなければ、何も選ばない。
// しおり・フッタの郵便箱のボタン・コントロールセンターの郵便箱のタイルが呼ぶ（開く側のフック useMailboxScreen を通る）
export const MAILBOX_OPEN = kit.defineScreenCommand({
  id: "mailbox-open",
  title: "Open mailbox",
  readsSubjects: () => [MAIL.id],
  performs: [MAIL_SEEN.id],
  run: (ctx, a, args?: { mail?: string }) => {
    const screen = mailboxScreenOf(ctx, a)
    if (screen === SCREEN_REFUSED) return
    const write = updatePluginStateAtOf(a)
    const mail = args?.mail === undefined ? undefined : (ctx.read.record(MAIL.id, args.mail) as Mail | undefined)
    if (!mail || typeof mail !== "object") {
      resetPluginStateAtOf(a)(screen, MAILBOX_PICKED)
      return
    }
    write(screen, MAILBOX_SENDER_TAB, () => mail.senderKind)
    write(screen, MAILBOX_PICKED, () => mail.id)
    if (!mail.seenAt) a.perform(MAIL_SEEN.id, {}, { record: mail.id })
  },
  when: () => true,
})

// 郵便箱の画面の、選んでいる行を上下に移して選び、見たことにする（郵便箱の画面の中の ↑↓）
export const MAILBOX_PICK_MOVE = kit.defineScreenCommand({
  id: "mailbox-pick-move",
  title: "Pick the neighbour",
  readsSubjects: () => [MAIL.id],
  performs: [MAIL_SEEN.id],
  run: (ctx, a, { to }: { to: "up" | "down" }) => {
    const mailbox = mailsInOrder(ctx.read.find(MAIL.id, []))
    const rows = inboxOf(mailbox, ctx.pluginState(MAILBOX_SENDER_TAB))
    const next = pickMoved(rows, ctx.pluginState(MAILBOX_PICKED), to)
    if (next === NO_STATE) return
    a.updatePluginState(MAILBOX_PICKED, () => next)
    if (!rows.find(m => m.id === next)?.seenAt) a.perform(MAIL_SEEN.id, {}, { record: next })
  },
  when: () => true,
})

// 郵便箱のスクリーンを閉じる（帯の閉じるボタン・Esc・フッタの郵便箱のボタンをもう一度押す。コントロールセンターの郵便箱の画面からは出さない）
export const MAILBOX_SCREEN_CLOSE = kit.defineScreenCommand({
  id: "mailbox-screen-close",
  title: "Close mailbox",
  run: (ctx, a) => closeInLowerRow(storeActionsOf(a), screensOf(ctx), arrangementValueIn(ctx), calledScreenIdOf(ctx)),
  when: ctx => ctx.screen.def === MAILBOX_SCREEN.id,
})

// ブックスクリーンと上下に並べている郵便箱のスクリーンを、窓いっぱいに広げる（帯の広げるボタン）
export const MAILBOX_SCREEN_EXPAND = kit.defineScreenCommand({
  id: "mailbox-screen-expand",
  title: "Expand mailbox",
  run: (ctx, a) => expandLowerRow(storeActionsOf(a), calledScreenIdOf(ctx)),
  when: ctx => ctx.screen.def === MAILBOX_SCREEN.id,
})

export const MAILBOX_KEYS = [
  kit.defineKey({
    id: "mailbox-screen-close-escape",
    key: "Escape",
    command: MAILBOX_SCREEN_CLOSE.id,
    scope: MAILBOX_SCOPE,
  }),
  kit.defineKey({
    id: "mailbox-up",
    title: "Row above",
    key: "ArrowUp",
    command: MAILBOX_PICK_MOVE.id,
    args: { to: "up" },
    scope: MAILBOX_SCOPE,
  }),
  kit.defineKey({
    id: "mailbox-down",
    title: "Row below",
    key: "ArrowDown",
    command: MAILBOX_PICK_MOVE.id,
    args: { to: "down" },
    scope: MAILBOX_SCOPE,
  }),
]
