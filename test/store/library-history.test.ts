// 書庫の履歴: 書庫が対象のアクション（フォルダを作る・動かす・名前を変える・ゴミ箱に入れる・戻す・ブックを作る）は、ブックの履歴とは別の、書庫の履歴の段に入る。
// library-revert は、その段を前へ戻し、後へやり直す。消す・空にするは入らない。戻すと決まりを破るなら断る

import { expect, test } from "bun:test"
import { HOME_ID, TRASH_ID } from "../../web/src/core/folders"
import { LIBRARY_HISTORY } from "../../web/src/core/history"
import { libraryRevertArgs } from "../../web/src/plugins/base/library/revert"
import { newStore } from "../support"

const settled = () => Promise.resolve()

function setup() {
  const store = newStore({ now: () => "2026-11-18T01:00:00.000Z" })
  const { perform } = store.actions
  const history = () => store.state.getState().history[LIBRARY_HISTORY] ?? { undo: [], redo: [] }
  const lineup = (id: string) => store.state.getState().folders[id]?.lineup.map(r => r.id)
  const title = (id: string) => (store.state.getState().folders[id] as { title?: string } | undefined)?.title
  const move = (from: "undo" | "redo") => {
    const step = history()[from].at(-1)
    if (!step) return { ok: false as const }
    const done = perform("@matomezu/base:library-revert", libraryRevertArgs(step, from === "undo" ? "before" : "after"))
    if (done.ok) store.actions.moveHistory(LIBRARY_HISTORY, from)
    return done
  }
  const made = async (action: "folder-create" | "book-create", args: { title: string; into?: string }) => {
    const done = perform(`@matomezu/base:${action}`, args)
    if (!done.ok) throw new Error(JSON.stringify(done))
    await settled()
    const result = done.result as { folder?: string; book?: string }
    return (result.folder ?? result.book) as string
  }
  return { store, perform, history, lineup, title, move, made }
}

test("フォルダを作る・動かす・名前を変えるは、書庫の履歴に 1 段ずつ入り、ブックの履歴には入らない。戻すと前の形に、やり直すと後の形になる", async () => {
  const { store, perform, history, lineup, title, move, made } = setup()
  const home = lineup(HOME_ID)
  const a = await made("folder-create", { title: "仕事" })
  perform("@matomezu/base:entry-move", { entry: "b1", into: a })
  await settled()
  perform("@matomezu/base:entry-rename", { entry: a, title: "しごと" })
  await settled()
  expect(history().undo).toHaveLength(3)
  expect(store.state.getState().history.b1).toBeUndefined()
  expect(move("undo").ok).toBe(true)
  expect(title(a)).toBe("仕事")
  expect(move("undo").ok).toBe(true)
  expect(lineup(a)).toEqual([])
  expect(lineup(HOME_ID)).toContain("b1")
  expect(move("undo").ok).toBe(true)
  expect(a in store.state.getState().folders).toBe(false)
  expect(lineup(HOME_ID)).toEqual(home)
  expect(history()).toMatchObject({ undo: [], redo: [{}, {}, {}] })
  for (let i = 0; i < 3; i++) expect(move("redo").ok).toBe(true)
  expect(title(a)).toBe("しごと")
  expect(lineup(a)).toEqual(["b1"])
})

test("ゴミ箱に入れる・戻すも戻せる。ブックを作ったのを戻すと、ブックは無くなる", async () => {
  const { store, perform, lineup, move, made } = setup()
  const a = await made("folder-create", { title: "仕事" })
  const book = await made("book-create", { title: "議事録", into: a })
  perform("@matomezu/base:entry-trash", { entry: a })
  await settled()
  expect(book in store.state.getState().trash).toBe(true)
  expect(move("undo").ok).toBe(true)
  expect(lineup(TRASH_ID) ?? []).toEqual([])
  expect(lineup(a)).toEqual([book])
  expect(book in store.state.getState().books).toBe(true)
  expect(move("undo").ok).toBe(true)
  expect(book in store.state.getState().books || book in store.state.getState().trash).toBe(false)
  expect(lineup(a)).toEqual([])
  expect(move("redo").ok).toBe(true)
  expect(store.state.getState().books[book]?.title).toBe("議事録")
})

test("完全に消す・ゴミ箱を空にするは、書庫の履歴に入らない", async () => {
  const { perform, history, made } = setup()
  const a = await made("folder-create", { title: "仕事" })
  perform("@matomezu/base:entry-trash", { entry: a })
  await settled()
  const steps = history().undo.length
  perform("@matomezu/base:entry-purge", { entries: [a] })
  await settled()
  expect(history().undo).toHaveLength(steps)
})

test("名前を戻すと同じ名前が重なるなら、断る（title-taken）。段は動かない", async () => {
  const { perform, history, title, move, made } = setup()
  const a = await made("folder-create", { title: "仕事" })
  perform("@matomezu/base:entry-rename", { entry: a, title: "しごと" })
  await settled()
  await made("folder-create", { title: "仕事" })
  const steps = history().undo.length
  const step = history().undo.at(-2)!
  const done = perform("@matomezu/base:library-revert", libraryRevertArgs(step, "before"))
  expect(done).toMatchObject({ ok: false, reason: "refused", kind: "title-taken" })
  expect(title(a)).toBe("しごと")
  expect(history().undo).toHaveLength(steps)
  expect(move("undo").ok).toBe(true)
})

test("ブックが対象のアクションと同じ処理の中で行っても、書庫の分は書庫の履歴に、ブックの分はブックの履歴に分かれる", async () => {
  const { store, perform, history } = setup()
  perform("@matomezu/base:folder-create", { title: "仕事" })
  perform("@matomezu/base:book-update", { title: "改名" }, { book: "b1" })
  await settled()
  expect(history().undo).toHaveLength(1)
  expect(Object.keys(history().undo[0]!.folders)).not.toContain("b1")
  const inBook = store.state.getState().history.b1
  expect(inBook?.undo).toHaveLength(1)
  expect(inBook?.undo[0]?.outermosts).toEqual(["b1"])
  expect(Object.keys(inBook!.undo[0]!.folders)).toEqual(["b1"])
})

test("上書きの移動は、先の同じ名前の物を中身ごと消して入れ、1 回戻すと両方戻る。種類が違う・ロックした物・動かす物を中に持つ物には上書きできない", async () => {
  const { store, perform, lineup, move, made } = setup()
  const a = await made("folder-create", { title: "仕事" })
  const old = await made("book-create", { title: "議事録", into: a })
  const fresh = await made("book-create", { into: HOME_ID, title: "議事録" })
  // 消えると確かめた物を言わない・違う物を言うと、上書きしない
  expect(perform("@matomezu/base:entry-move-over", { entry: fresh, into: a }).ok).toBe(false)
  expect(perform("@matomezu/base:entry-move-over", { entry: fresh, into: a, replaces: a }).ok).toBe(false)
  expect(perform("@matomezu/base:entry-move-over", { entry: fresh, into: a, replaces: old }).ok).toBe(true)
  await settled()
  expect(lineup(a)).toEqual([fresh])
  const now = store.state.getState()
  expect(old in now.folders || old in now.books || old in now.trash).toBe(false)
  expect(move("undo").ok).toBe(true)
  expect(lineup(a)).toEqual([old])
  expect(store.state.getState().books[old]?.title).toBe("議事録")
  expect(lineup(HOME_ID)).toContain(fresh)
  // 種類が違う
  const other = await made("folder-create", { title: "別" })
  const folder = await made("folder-create", { title: "議事録", into: other })
  expect(perform("@matomezu/base:entry-move-over", { entry: folder, into: a, replaces: old }).ok).toBe(false)
  // ロックした物
  perform("@matomezu/base:book-lock", {}, { book: old })
  expect(perform("@matomezu/base:entry-move-over", { entry: fresh, into: a, replaces: old })).toMatchObject({
    ok: false,
    reason: "denied",
    permission: "@matomezu/base:lock",
  })
  // 前から在った方の中に、動かす物が在る
  const inner = await made("folder-create", { title: "仕事", into: a })
  expect(perform("@matomezu/base:entry-move-over", { entry: inner, into: HOME_ID, replaces: a }).ok).toBe(false)
})

test("ゴミ箱から戻すときの上書きも、在った物を消して戻し、1 回戻すと両方戻る", async () => {
  const { store, perform, lineup, move, made } = setup()
  const old = await made("book-create", { into: HOME_ID, title: "議事録" })
  perform("@matomezu/base:entry-trash", { entry: old })
  await settled()
  const fresh = await made("book-create", { into: HOME_ID, title: "議事録" })
  expect(perform("@matomezu/base:entry-restore", { entry: old, onConflict: "replace" }).ok).toBe(false)
  expect(perform("@matomezu/base:entry-restore", { entry: old, onConflict: "replace", replaces: fresh }).ok).toBe(true)
  await settled()
  expect(lineup(HOME_ID)).toContain(old)
  expect(fresh in store.state.getState().folders).toBe(false)
  expect(move("undo").ok).toBe(true)
  expect(store.state.getState().books[fresh]?.title).toBe("議事録")
  expect(old in store.state.getState().trash).toBe(true)
})

test("何も変えない段（完全に消した物をゴミ箱に入れた段など）は飛ばし、同じ 1 回でその次の段を戻す", async () => {
  const { store, perform, history, lineup, made } = setup()
  const kept = await made("folder-create", { title: "残す物" })
  const gone = await made("folder-create", { title: "消す物" })
  perform("@matomezu/base:entry-trash", { entry: kept })
  await settled()
  perform("@matomezu/base:entry-trash", { entry: gone })
  await settled()
  perform("@matomezu/base:entry-purge", { entries: [gone] })
  await settled()
  // 最後の段（消す物をゴミ箱に入れた）は、消す物がもう無いので何も変えない。その前の段（残す物をゴミ箱に入れた）が戻る
  expect(history().undo).toHaveLength(4)
  expect(store.actions.command("s1", "@matomezu/base:library-undo")).toBe(true)
  expect(lineup(HOME_ID)).toContain(kept)
  expect(history()).toMatchObject({ undo: [{}, {}], redo: [{}, {}] })
  // やり直すと、残す物がまたゴミ箱に入る
  expect(store.actions.command("s1", "@matomezu/base:library-redo")).toBe(true)
  expect(lineup(TRASH_ID)).toEqual([kept])
})

test("書庫の元に戻す・やり直すが、ほかの変更とぶつかって断られたら、トーストで知らせてその画面の履歴の段を捨て、続けてぶつかる前の画面の履歴の段もまとめて捨てる", async () => {
  const { store, perform, history, title, made } = setup()
  const b = await made("folder-create", { title: "メモ" })
  const a = await made("folder-create", { title: "仕事" })
  perform("@matomezu/base:entry-rename", { entry: a, title: "しごと" })
  await settled()
  perform("@matomezu/base:entry-rename", { entry: b, title: "仕事" })
  await settled()
  const renamedB = history().undo.at(-1)!
  expect(store.actions.command("s1", "@matomezu/base:library-undo")).toBe(true)
  // 画面の履歴に入らない置き直しで、B をまた「仕事」にする（A の名前を戻すと、同じ名前が重なる）
  expect(perform("@matomezu/base:library-revert", libraryRevertArgs(renamedB, "after")).ok).toBe(true)
  await settled()
  const toasts = store.state.getState().toasts.length
  expect(store.actions.command("s1", "@matomezu/base:library-undo")).toBe(true)
  expect(title(a)).toBe("しごと")
  expect(store.state.getState().toasts).toHaveLength(toasts + 1)
  expect(store.state.getState().toasts.at(-1)).toMatchObject({ kind: "warn" })
  // A を作った段・B を作った段も、名前が作ったときの名前でない（ぶつかる）ので、まとめて捨てる
  expect(history()).toEqual({ undo: [], redo: [renamedB] })
  expect(a in store.state.getState().folders).toBe(true)
  expect(b in store.state.getState().folders).toBe(true)
})

test("置き直しても変わらない画面の履歴の段を飛ばした直後に、ぶつかって断られたら、飛ばした画面の履歴の段はやり直す側に、断られた画面の履歴の段と続けてぶつかる画面の履歴の段は捨てる", async () => {
  const { store, perform, history, title, made } = setup()
  const b = await made("folder-create", { title: "メモ" })
  const a = await made("folder-create", { title: "仕事" })
  perform("@matomezu/base:entry-rename", { entry: a, title: "しごと" })
  await settled()
  perform("@matomezu/base:entry-rename", { entry: b, title: "仕事" })
  await settled()
  const renamedB = history().undo.at(-1)!
  expect(store.actions.command("s1", "@matomezu/base:library-undo")).toBe(true)
  // 画面の履歴に入らない置き直しで、B をまた「仕事」にする
  expect(perform("@matomezu/base:library-revert", libraryRevertArgs(renamedB, "after")).ok).toBe(true)
  await settled()
  const c = await made("folder-create", { title: "消す物" })
  const createdC = history().undo.at(-1)!
  // 画面の履歴に入らない置き直しで、C を作った段を戻しておく（その段は、置き直しても変わらない）
  expect(perform("@matomezu/base:library-revert", libraryRevertArgs(createdC, "before")).ok).toBe(true)
  await settled()
  expect(c in store.state.getState().folders).toBe(false)
  expect(store.actions.command("s1", "@matomezu/base:library-undo")).toBe(true)
  expect(title(a)).toBe("しごと")
  // A の名前を戻す段はぶつかり、A を作った段・B を作った段も、名前が作ったときの名前でないので、まとめて捨てる
  expect(history()).toEqual({ undo: [], redo: [createdC] })
  expect(a in store.state.getState().folders).toBe(true)
})

test("同じ処理の中で行ったアクションの段は、すぐあとの dropHistory で捨てられる", async () => {
  const { store, perform, history, made } = setup()
  await made("folder-create", { title: "一" })
  const [first] = history().undo
  expect(perform("@matomezu/base:folder-create", { title: "二" }).ok).toBe(true)
  store.actions.dropHistory(LIBRARY_HISTORY, "undo")
  await settled()
  expect(history().undo).toEqual([first!])
})

test("書庫のやり直す: 無かった行を置く画面の履歴の段は、同じ中身の行がもう在れば済んでいるとして飛ばし、次の画面の履歴の段をやり直す", async () => {
  const { store, perform, history, title, move, made } = setup()
  const a = await made("folder-create", { title: "仕事" })
  perform("@matomezu/base:entry-rename", { entry: a, title: "しごと" })
  await settled()
  const [created, renamed] = history().undo
  expect(move("undo").ok).toBe(true)
  expect(move("undo").ok).toBe(true)
  // 画面の履歴に入らない置き直しで、作ったフォルダをまた置く（作ったのをやり直す段は、もう済んでいる）
  expect(perform("@matomezu/base:library-revert", libraryRevertArgs(created!, "after")).ok).toBe(true)
  await settled()
  expect(history().redo).toEqual([renamed!, created!])
  expect(store.actions.command("s1", "@matomezu/base:library-redo")).toBe(true)
  expect(title(a)).toBe("しごと")
  expect(history()).toMatchObject({ undo: [created, renamed], redo: [] })
})

test("書庫の元に戻すを認可ステップが止めたら（ロック中など）、トーストで知らせ、段は動かさない", async () => {
  const { store, perform, history, title, made } = setup()
  const book = await made("book-create", { into: HOME_ID, title: "議事録" })
  perform("@matomezu/base:entry-rename", { entry: book, title: "会議" })
  await settled()
  expect(perform("@matomezu/base:book-lock", {}, { book }).ok).toBe(true)
  await settled()
  const steps = history().undo
  expect(store.actions.command("s1", "@matomezu/base:library-undo")).toBe(true)
  expect(title(book)).toBe("会議")
  expect(store.state.getState().toasts.at(-1)).toMatchObject({ kind: "warn" })
  expect(history().undo).toEqual(steps)
  expect(perform("@matomezu/base:book-unlock", {}, { book }).ok).toBe(true)
  await settled()
  expect(store.actions.command("s1", "@matomezu/base:library-undo")).toBe(true)
  expect(title(book)).toBe("議事録")
})

test("無かった行を置く置き直しは、その行が在れば断り、その間のロックを外さない", async () => {
  const { store, perform, history, move, made } = setup()
  const fresh = await made("book-create", { into: HOME_ID, title: "議事録" })
  const step = history().undo.at(-1)!
  expect(move("undo").ok).toBe(true)
  expect(move("redo").ok).toBe(true)
  expect(perform("@matomezu/base:book-lock", {}, { book: fresh }).ok).toBe(true)
  await settled()
  expect(perform("@matomezu/base:library-revert", libraryRevertArgs(step, "after"))).toMatchObject({ ok: false })
  expect((store.state.getState().folders[fresh] as { locked?: boolean }).locked).toBe(true)
})

test("ホストが戻す・やり直すを断ったら、動かした段を元の側へ戻す（並びは時刻の順のまま）", async () => {
  let at = 0
  const store = newStore({
    now: () => `2026-11-18T01:00:0${at++}.000Z`,
    observe: bulk =>
      Promise.resolve(
        bulk.some(d => d.action === "@matomezu/base:library-revert") ? { ok: false, reason: "refused" } : { ok: true },
      ),
  })
  const history = () => store.state.getState().history[LIBRARY_HISTORY] ?? { undo: [], redo: [] }
  for (const title of ["一", "二"]) {
    store.actions.perform("@matomezu/base:folder-create", { title })
    await settled()
  }
  const [first, second] = history().undo
  // 続けて 2 回戻す（どちらも、答えが届く前に行う）
  store.actions.command("s1", "@matomezu/base:library-undo")
  store.actions.command("s1", "@matomezu/base:library-undo")
  expect(history()).toMatchObject({ undo: [], redo: [second, first] })
  await settled()
  await settled()
  expect(history().undo).toEqual([first!, second!])
  expect(history().redo).toEqual([])
})

test("ホストがぶつかりで断った画面の履歴の段は元の側へ戻り、ぶつかった変更が届いたあとの次の 1 回は、窓でぶつかって断られ（トースト）、その画面の履歴の段を捨てる", async () => {
  const store = newStore({
    now: () => "2026-11-18T01:00:00.000Z",
    observe: bulk =>
      Promise.resolve(
        bulk.some(d => d.action === "@matomezu/base:library-revert") ? { ok: false, reason: "refused" } : { ok: true },
      ),
  })
  const history = () => store.state.getState().history[LIBRARY_HISTORY] ?? { undo: [], redo: [] }
  const done = store.actions.perform("@matomezu/base:folder-create", { title: "一" })
  await settled()
  const folder = (done as { result: { folder: string } }).result.folder
  store.actions.perform("@matomezu/base:entry-rename", { entry: folder, title: "二" })
  await settled()
  const [created, renamed] = history().undo
  expect(store.actions.command("s1", "@matomezu/base:library-undo")).toBe(true)
  await settled()
  await settled()
  expect(history().undo).toEqual([created!, renamed!])
  // ホストに先に届いていた、ほかの窓の名前の変更が、この窓に届く
  const { pages, folders } = store.state.getState()
  const other = { ...folders[folder], title: "三" }
  store.receive(
    { pages: Object.values(pages), folders: Object.values({ ...folders, [folder]: other }), settings: {} },
    [],
  )
  expect(store.actions.command("s1", "@matomezu/base:library-undo")).toBe(true)
  expect((store.state.getState().folders[folder] as { title?: string }).title).toBe("三")
  expect(store.state.getState().toasts.at(-1)).toMatchObject({ kind: "warn" })
  expect(history().undo).not.toContain(renamed!)
})

test("置き直しは、ロックの印を外せない（外せるのは、掛け外しのアクションだけ）", async () => {
  const { store, perform, made } = setup()
  const book = await made("book-create", { into: HOME_ID, title: "議事録" })
  expect(perform("@matomezu/base:book-lock", {}, { book }).ok).toBe(true)
  await settled()
  const unlock = { pages: {}, folders: { [book]: { fields: { locked: { absent: true as const, was: true } } } } }
  expect(perform("@matomezu/base:library-revert", unlock)).toMatchObject({
    ok: false,
    reason: "denied",
    permission: "@matomezu/base:lock",
  })
  expect(
    perform("@matomezu/base:history-revert", { outermosts: [{ kind: "book", id: book }], ...unlock }),
  ).toMatchObject({
    ok: false,
    reason: "denied",
  })
  expect((store.state.getState().folders[book] as { locked?: boolean }).locked).toBe(true)
  expect(perform("@matomezu/base:book-unlock", {}, { book }).ok).toBe(true)
})

test("書庫の元に戻すがぶつかったら、続けてぶつかる画面の履歴の段もまとめて捨て（トーストは 1 つ）、置き直せる画面の履歴の段に当たったら、置き直さずにそこで止める", async () => {
  const { store, perform, history, title, made } = setup()
  const x = await made("folder-create", { title: "外" })
  for (const t of ["一", "二"]) {
    perform("@matomezu/base:entry-rename", { entry: "b1", title: t })
    await settled()
  }
  const [created] = history().undo
  expect(history().undo).toHaveLength(3)
  // ブックの画面の名前の変更は、書庫の履歴に入らず、書庫で変えた名前の段とぶつかる
  expect(perform("@matomezu/base:book-update", { title: "タブで" }, { book: "b1" }).ok).toBe(true)
  await settled()
  const was = store.state.getState()
  expect(store.actions.command("s1", "@matomezu/base:library-undo")).toBe(true)
  const now = store.state.getState()
  expect(now.toasts).toHaveLength(was.toasts.length + 1)
  expect(now.toasts.at(-1)).toMatchObject({ kind: "warn", detail: { message: expect.stringContaining("Clashes") } })
  expect(now.pages).toBe(was.pages)
  expect(now.folders).toBe(was.folders)
  expect(history()).toEqual({ undo: [created!], redo: [] })
  // 次に押すと、残した段を戻す
  expect(store.actions.command("s1", "@matomezu/base:library-undo")).toBe(true)
  expect(x in store.state.getState().folders).toBe(false)
  expect(title("b1")).toBe("タブで")
})

test("書庫の元に戻すがぶつかって捨てたあと、認可ステップが止める画面の履歴の段（ロック中）に当たったら、その画面の履歴の段は残してそこで止める（トーストは 1 つ）", async () => {
  const { store, perform, history, title, made } = setup()
  const book = await made("book-create", { into: HOME_ID, title: "議事録" })
  perform("@matomezu/base:entry-rename", { entry: book, title: "会議" })
  await settled()
  perform("@matomezu/base:entry-rename", { entry: "b1", title: "一" })
  await settled()
  const [createdBook, renamedBook] = history().undo
  expect(perform("@matomezu/base:book-lock", {}, { book }).ok).toBe(true)
  expect(perform("@matomezu/base:book-update", { title: "タブで" }, { book: "b1" }).ok).toBe(true)
  await settled()
  const toasts = store.state.getState().toasts.length
  expect(store.actions.command("s1", "@matomezu/base:library-undo")).toBe(true)
  expect(store.state.getState().toasts).toHaveLength(toasts + 1)
  expect(history()).toEqual({ undo: [createdBook!, renamedBook!], redo: [] })
  expect(title(book)).toBe("会議")
})

test("書庫のやり直すも、続けてぶつかる画面の履歴の段をまとめて捨て、置き直せる画面の履歴の段は残す", async () => {
  const { store, perform, history, made } = setup()
  for (const t of ["一", "二"]) {
    perform("@matomezu/base:entry-rename", { entry: "b1", title: t })
    await settled()
  }
  const x = await made("folder-create", { title: "外" })
  const [, , created] = history().undo
  for (let i = 0; i < 3; i++) expect(store.actions.command("s1", "@matomezu/base:library-undo")).toBe(true)
  expect(history().redo).toHaveLength(3)
  expect(perform("@matomezu/base:book-update", { title: "タブで" }, { book: "b1" }).ok).toBe(true)
  await settled()
  const toasts = store.state.getState().toasts.length
  expect(store.actions.command("s1", "@matomezu/base:library-redo")).toBe(true)
  expect(store.state.getState().toasts).toHaveLength(toasts + 1)
  expect(history()).toEqual({ undo: [], redo: [created!] })
  expect(x in store.state.getState().folders).toBe(false)
  expect(store.actions.command("s1", "@matomezu/base:library-redo")).toBe(true)
  expect(x in store.state.getState().folders).toBe(true)
})
