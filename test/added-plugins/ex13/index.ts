// ex13: レコードとスクリーンを両方使う追加プラグインの見本（メモ）。自分のレコードの種類（メモ）を索引キー付きで持ち、
// アクションは同じボードのメモの索引キーだけを読んで上限を守り、スクリーンはボード 1 枚分の済んでいないメモを条件で読んで並べる
import { definePlugin, z } from "matomezu"
import { kit } from "./kit"

// メモ: ボードの名前・本文・ボードごとの番号・済んだ時点。索引キーは、探す・並べるのに使う 3 つ
export const MEMO = kit.defineSubject({
  id: "memo",
  title: "memo",
  aiDescription: "A short memo on a board. Add one with ex13:memo-add.",
  record: z.strictObject({
    id: z.string(),
    board: z.string(),
    text: z.string().max(2000),
    order: z.number().int(),
    doneAt: z.string().optional(),
  }),
  keys: {
    board: { type: "text", of: m => m.board },
    order: { type: "number", of: m => m.order },
    doneAt: { type: "text", of: m => m.doneAt },
  },
  numbered: true,
  aiBrief: m => m.text,
  aiList: { order: { key: "order", dir: "desc" }, limit: 20 },
})

// ボード 1 枚に残すメモの数
const MEMO_MAX = 100

// メモを足す。読むのは、同じボードのメモの索引キーだけ（中身は開けない）。上限を超えたら古い物から消す

export const MEMO_ADD = kit.defineAction({
  id: "memo-add",
  title: "add memo",
  aiDescription: "Add a memo to a board. The board keeps the newest 100 memos.",
  target: MEMO.id,
  args: z.strictObject({ board: z.string().min(1), text: z.string().min(1).max(2000) }),
  // 条件に書けるのは宣言した索引キーと、その値の型だけ（宣言に無い名前や、型の違う値は型の誤り）
  reads: args => [{ subject: MEMO.id, where: [{ key: "board", eq: args.board }], keysOnly: true }],
  run: (now, args, ctx) => {
    if (now !== "none" || !ctx.number) return null
    const next = { id: ctx.newId(), board: args.board, text: args.text, order: ctx.number(args.board) }
    // 索引キーの値は宣言どおりの型（order は数）
    const old = Object.entries(ctx.keys?.[MEMO.id] ?? {}).sort(([, a], [, b]) => (a.order ?? 0) - (b.order ?? 0))
    const over = old.slice(0, Math.max(0, old.length + 1 - MEMO_MAX))
    return { next, others: over.map(([id]) => ({ id, record: "removed" as const })), result: { memo: next.id } }
  },
})

// 済みにする。読むのは宛先の 1 件だけなので、reads は書かない
export const MEMO_DONE = kit.defineAction({
  id: "memo-done",
  title: "done memo",
  aiDescription: "Mark the memo named by on.record done.",
  target: MEMO.id,
  args: z.strictObject({}),
  run: (now, _, ctx) => (now === "none" || now.doneAt ? null : { next: { ...now, doneAt: ctx.now }, result: {} }),
})

// ボード 1 枚分のメモを見せるスクリーン（渡す値はボードの名前。同じ定義から何枚でも開ける）
export const MEMO_SCREEN = kit.defineScreen({
  id: "memo-screen",
  title: "memos",
  aiDescription: "The memos of one board, newest first.",
  props: z.strictObject({ board: z.string().min(1) }),
})

export const EX13 = definePlugin(
  kit.plugin({ subjects: [MEMO], actions: [MEMO_ADD, MEMO_DONE], screens: [MEMO_SCREEN] }),
)
export default EX13

declare module "matomezu/catalog" {
  interface MessageTable extends Readonly<typeof kit.messages> {}
  interface SubjectTable {
    "ex13:memo": typeof MEMO
  }
  interface ActionTable {
    "ex13:memo-add": typeof MEMO_ADD
    "ex13:memo-done": typeof MEMO_DONE
  }
  interface ScreenTable {
    "ex13:memo-screen": typeof MEMO_SCREEN
  }
}
