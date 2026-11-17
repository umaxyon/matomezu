// ex13 の見た目: メモのスクリーンを描くウィジェット。自分のスクリーンの定義の id のスロットに置ける（place を書かなくても置かれる）
import { definePluginUi, defineWidget, useActions, useMessages, useRecords, useScreen, useScreens } from "matomezu/ui"
import { EX13, MEMO, MEMO_DONE, MEMO_SCREEN } from "."
import { kit } from "./kit"

// メモのスクリーン: 渡されたボードの、まだ済んでいないメモを新しい順に 50 件。× で閉じ、+ で隣のボードのスクリーンを開き、✓ で済みにする
function MemoScreenView() {
  const t = useMessages(kit)
  const me = useScreen(MEMO_SCREEN) // 自分の 1 枚: 渡された値・見えているか・カレントスクリーンか
  const { open, close } = useScreens() // スクリーンを開く・自分の 1 枚を閉じる
  const { perform } = useActions()
  // 読む: このボードの、まだ済んでいないメモを、新しい順に 50 件
  const memos = useRecords(MEMO.id, {
    where: [
      { key: "board", eq: me.props.board },
      { key: "doneAt", is: "absent" },
    ],
    order: { key: "order", dir: "desc" },
    limit: 50,
  })
  return (
    <section>
      <h1>
        {t("memos")} {me.props.board}
      </h1>
      <button type="button" onClick={() => close()}>
        ×
      </button>
      <button type="button" onClick={() => open(MEMO_SCREEN, { board: `${me.props.board}-2` })}>
        +
      </button>
      <ul>
        {memos.map(m => (
          <li key={m.id}>
            {m.text}
            <button type="button" onClick={() => perform(MEMO_DONE.id, {}, { record: m.id })}>
              ✓
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

export const EX13_SCREEN_VIEW = defineWidget({
  id: kit.name("memo-screen-view"),
  slots: [MEMO_SCREEN.id],
  view: MemoScreenView,
})

export const EX13_UI = definePluginUi(EX13, { widgets: [EX13_SCREEN_VIEW] })

export default EX13_UI

declare module "matomezu/catalog" {
  interface WidgetTable {
    "ex13:memo-screen-view": typeof EX13_SCREEN_VIEW
  }
}
