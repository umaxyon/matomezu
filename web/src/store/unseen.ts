// まだ見ていない変更（AI とほかの窓の変更のうち、この窓でまだ見えていない物）を持ち、ブックと書庫を見張って、見えたら画面の履歴に差し込む。
// インスタンスごとに 1 つ作る（createMatomezuInstance）。組み直しで差し替わる機能台帳は、呼ぶたびに getter から読む

import type { CoreCatalog } from "../core/core-catalog"
import type { PluginStateRead } from "../core/def/plugin-state"
import { isOpenRole, type Library } from "../core/folders"
import { libraryOf, tablesOf } from "../core/folders-books"
import { changesBetween } from "../core/folders-changes"
import { withRowsPatched } from "../core/folders-restore"
import { NO_OUTERMOST, outermostOf } from "../core/folders-tree"
import {
  changeSeen,
  foldersNear,
  HISTORY_LIMIT,
  type HistoryStep,
  insertStep,
  LIBRARY_HISTORY,
  NO_HISTORY,
  type RowChange,
  rowChangesOf,
  type SeenTest,
} from "../core/history"
import type { Books } from "../core/library"
import { splitId } from "../core/names"
import { type Patch, patchOf, undoneIn } from "../core/patch"
import { sameData } from "../core/same"
import type { Book } from "../core/schema/book"
import { type Stage, shownPageId, shownType, toPaper } from "../core/stage"
import { shownBookScreens, shownScreens } from "../core/window"
import type { StoreCatalog } from "./plugin"
import { ownedPluginState, pluginValueOf } from "./plugin-state"
import type { ForeignChange, ForeignLibraryRows, LostValue, MatomezuState, RowSides, StoreOptions } from "./state"

// まだ見ていない変更を持つ所。checkSeen は見えた物を画面の履歴に差し込み、dropOverwritten はこの窓の利用者の、画面の履歴に入れない変更が
// 消した物を捨て、addForeign はよその変更を足し、reset は持っている物を全部捨てる
export interface UnseenChanges {
  checkSeen(): void
  dropOverwritten(was: Library, now: Library): void
  addForeign(change: ForeignChange | undefined, tables: Library): void
  reset(): void
}

// まだ見ていない変更を持つ所を作る。catalog と storeCatalog は、組み直しのあとの機能台帳を返す getter
export function createUnseenChanges(deps: {
  getState: () => MatomezuState
  setState: (next: Partial<MatomezuState>) => void
  catalog: () => CoreCatalog
  storeCatalog: () => StoreCatalog
  nextSeq: () => number // 画面の履歴の段に、この窓で始めた順の番号を振る（HistoryStep.seq）
  options: Pick<StoreOptions, "visible" | "aiEditTicket">
}): UnseenChanges {
  const { getState, setState, nextSeq, options } = deps
  // まだ見ていない、AI とほかの窓の変更（古い順。ブックごとに 1 つの画面の履歴の段で、見えたらそのブックの画面の履歴に入る）。act は常駐が 1 回の perform に振った印。
  // step の、ページとフォルダの行の前と後から、見えたか・消えたかを決める。book は変えたブック、
  // places は変えた・足した・無くしたページとフォルダの id（常駐に、見えた・消えたと知らせる範囲）
  type Unseen = {
    step: HistoryStep
    act: string
    book: string
    places: readonly string[]
  }
  let unseen: Unseen[] = []
  // 確かめた世界の、最後に知っているブック（よその変更の前の値）
  let known: Books = {}
  // ステージ st で物が見えているかの答え（プレゼンテーションの seen と、ステージの表示領域の紙の上の四角から。プレゼンテーションが答えなければ undefined。
  // 印刷プレビューの間と、表示領域を測るまでは、どの物も見えていない）
  const seenTestOf = (st: Stage): SeenTest | undefined => {
    const catalog = deps.catalog()
    const opened = st.opened
    const type = shownType(opened)
    const def = type && catalog.presentations.get(catalog.pageTypes.get(type)?.presentation ?? "")
    if (!def?.seen) return undefined
    const a = st.view && toPaper(st, { x: 0, y: 0 })
    const b = st.view && toPaper(st, { x: st.view.w, y: st.view.h })
    const shown = st.mode.kind === "edit" && a && b ? { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y } : null
    return (page, item) => !!shown && !!def.seen?.(deps.catalog(), page, item, shown)
  }
  // 見えているブックスクリーンのステージで見えたか
  const seenIn = (u: Unseen) =>
    shownBookScreens(deps.catalog(), getState().window)
      .flatMap(s => s.stages.stages)
      .some(st => st.opened?.outermost === u.book && changeSeen(u.step, shownPageId(st.opened), seenTestOf(st)))
  // まだ見ていない変更のうち、どこかのステージで見えた物を、そのブックの画面の履歴に届いた順の位置で差し込む（窓が見えていない間は差し込まない）
  const checkSeen = () => {
    checkSeenInLibrary()
    if (unseen.length === 0 || options.visible?.() === false) return
    const now = unseen.filter(seenIn)
    if (now.length === 0) return
    unseen = unseen.filter(u => !now.includes(u))
    const history = { ...getState().history }
    for (const { step, act, book, places } of now) {
      history[book] = insertStep(history[book] ?? NO_HISTORY, step)
      if (step.by === "ai") options.aiEditTicket?.({ act, places, outcome: "seen" })
    }
    setState({ history })
  }
  // まだ見ていない、AI とほかの窓の書庫の変更（古い順。1 回の変更で 1 つの画面の履歴の段で、見えたら書庫の履歴に入る）。near はその変更の近くのフォルダ
  // （foldersNear が出す。どれかを、見えているスクリーンの書庫アピアランスが見せたら見えた）、places は常駐に見えた・消えたと知らせる範囲（変えたページと、ブック・バインダ）
  type UnseenInLibrary = { step: HistoryStep; act: string; near: readonly string[]; places: readonly string[] }
  let unseenInLibrary: UnseenInLibrary[] = []
  // 確かめた世界の、最後に知っている表（よその変更の前の値）
  let knownTables: Library = { pages: {}, folders: {} }
  // 最後に知っている表に、よその変更のうち書庫の履歴に入るアクションの分 rows だけを行った表と、その分が変えたページとフォルダの id
  // （知らせの前と後の違いを、最後に知っている行に当てる。同じ物をほかのアクションも変えていても、その分は入らない）
  const afterLibraryActions = (rows: ForeignLibraryRows) => {
    const side = (v: unknown) => (v === "none" ? undefined : v)
    const patchesOf = (changed: Readonly<Record<string, RowSides>>) =>
      Object.fromEntries(
        Object.entries(changed).flatMap(([id, r]) => {
          const p = patchOf(side(r.before), side(r.after))
          return p ? [[id, p] as const] : []
        }),
      )
    const patches = { pages: patchesOf(rows.pages), folders: patchesOf(rows.folders) }
    return {
      tables: withRowsPatched(knownTables, patches),
      rows: { pages: Object.keys(patches.pages), folders: Object.keys(patches.folders) },
    }
  }
  // 見えているスクリーンが、今見せているフォルダ: スクリーンの定義が今見せていると答えた書庫アピアランス（libraryAppearances に並べた物だけ）に、見せているフォルダを聞く。
  // どちらも、聞かれたスクリーンの、持ち主のプラグイン状態だけを読む
  const foldersShownNow = (): ReadonlySet<string> => {
    const catalog = deps.catalog()
    const { window: win, pluginValues, folders } = getState()
    const shown = new Set<string>()
    const readFor =
      (owner: string | null, screen: string): PluginStateRead =>
      def =>
        pluginValueOf(pluginValues, screen, ownedPluginState(owner ?? "", def))
    for (const id of shownScreens(catalog, win)) {
      const def = catalog.screens.get(win.screens.find(s => s.id === id)?.def ?? "")
      const named = def?.libraryAppearances ?? []
      if (!def || named.length === 0) continue
      const now = def.shownLibraryAppearances?.(readFor(splitId(def.id).owner, id)) ?? named
      for (const appearance of now) {
        const display = (named as readonly string[]).includes(appearance)
          ? deps.storeCatalog().libraryAppearances.get(appearance)
          : undefined
        for (const folder of display?.shownFolders(folders, readFor(splitId(display.id).owner, id)) ?? [])
          shown.add(folder)
      }
    }
    return shown
  }
  // まだ見ていない書庫の変更のうち、近くのフォルダを、見えているスクリーンの書庫アピアランスが見せている物を、書庫の履歴に届いた順の位置で差し込む（窓が見えていない間は差し込まない）
  const checkSeenInLibrary = () => {
    if (unseenInLibrary.length === 0 || options.visible?.() === false) return
    const shown = foldersShownNow()
    const now = unseenInLibrary.filter(u => u.near.some(id => shown.has(id)))
    if (now.length === 0) return
    unseenInLibrary = unseenInLibrary.filter(u => !now.includes(u))
    let history = getState().history[LIBRARY_HISTORY] ?? NO_HISTORY
    for (const { step, act, places } of now) {
      history = insertStep(history, step)
      if (step.by === "ai" && places.length > 0) options.aiEditTicket?.({ act, places, outcome: "seen" })
    }
    setState({ history: { ...getState().history, [LIBRARY_HISTORY]: history } })
  }
  // よその変更 change のうち、書庫の履歴に入るアクションが変えたページとフォルダ rows を、まだ見ていない書庫の変更に足す（HISTORY_LIMIT まで。古い物から捨てる）
  const addUnseenInLibrary = (
    change: { by: "ai" | "window"; act: string },
    rows: { pages: readonly string[]; folders: readonly string[] },
    was: Library,
    to: Library,
  ) => {
    const of = <T>(ids: readonly string[], before: Readonly<Record<string, T>>, after: Readonly<Record<string, T>>) =>
      Object.fromEntries(
        ids
          .map(id => [id, { before: before[id] ?? "none", after: after[id] ?? "none" }] as const)
          .filter(([, r]) => !sameData(r.before, r.after)),
      ) as Record<string, RowChange<T>>
    const step: HistoryStep = {
      seq: nextSeq(),
      by: change.by,
      books: [LIBRARY_HISTORY],
      pages: of(rows.pages, was.pages, to.pages),
      folders: of(rows.folders, was.folders, to.folders),
    }
    if (Object.keys(step.pages).length + Object.keys(step.folders).length === 0) return
    // 常駐が AI 編集チケットに入れるのは、変えたページと、ブック・バインダ（書庫ホーム・ゴミ箱・フォルダは入れない）
    const ticketed = (id: string) => !isOpenRole((to.folders[id] ?? was.folders[id])?.folderRole ?? "folder")
    const places = [...Object.keys(step.pages), ...Object.keys(step.folders).filter(ticketed)]
    const near = foldersNear(step, was.folders, to.folders)
    unseenInLibrary = [...unseenInLibrary, { step, act: change.act, near, places }].slice(-HISTORY_LIMIT)
  }
  // まだ見ていない変更の段 step が書いた値のうち、表が was から now になって消えた所と値（行ごと。無ければ空）。
  // 段が足した行は、行が残っていれば、書いたフィールドごとに比べる（ロックなど、ほかのフィールドが変わっただけなら消えていない）。行が無くなったら、足した行まるごと 1 つ
  const lostIn = (step: HistoryStep, was: Library, now: Library): LostValue[] => {
    const of = <T extends object>(
      rows: Readonly<Record<string, RowChange<T>>>,
      before: Readonly<Record<string, T>>,
      after: Readonly<Record<string, T>>,
    ) =>
      Object.entries(rows).flatMap(([entry, r]): LostValue[] => {
        const added = r.before === "none" && r.after !== "none" ? r.after : undefined
        if (added && !Object.hasOwn(after, entry))
          return Object.hasOwn(before, entry) ? [{ entry, at: "", value: added }] : []
        const made = added
          ? ({ fields: Object.fromEntries(Object.entries(added).map(([k, set]) => [k, { set }])) } satisfies Patch)
          : patchOf(r.before === "none" ? undefined : r.before, r.after === "none" ? undefined : r.after)
        return made ? undoneIn(made, before[entry], after[entry]).map(l => ({ entry, ...l })) : []
      })
    return [...of(step.pages, was.pages, now.pages), ...of(step.folders, was.folders, now.folders)]
  }
  // この窓の利用者の、画面の履歴に入れない変更（表を was から now にした。ロックの掛け外し・完全に消す・ゴミ箱を空にする・置き直しなど）が、
  // まだ見ていない変更が書いた値を消したら、それを捨てる（あとで見えても差し込まない。AI の物は、消えた所と値を、その物のステージエントリごとに知らせる）。
  // 画面の履歴に入れる操作が上書きした物は捨てない（その画面の履歴の段の前に値が残り、見えたら差し込まれ、戻せば戻る）
  const dropOverwritten = (was: Library, now: Library) => {
    unseen = unseen.filter(u => {
      const lost = lostIn(u.step, was, now)
      if (lost.length > 0 && u.step.by === "ai")
        options.aiEditTicket?.({ entry: u.book, act: u.act, places: u.places, outcome: "lost", lost })
      return lost.length === 0
    })
    // 物 id のステージエントリの id（無ければ undefined）
    const entryOf = (id: string) => {
      const o = outermostOf(was, id)
      if (o === NO_OUTERMOST) return undefined
      return o.kind === "book" ? o.book : o.kind === "page" ? o.page : o.binder
    }
    unseenInLibrary = unseenInLibrary.filter(u => {
      const lost = lostIn(u.step, was, now)
      if (lost.length === 0) return true
      // AI の物は、段ごと捨てるので、変えたページとフォルダ places のステージエントリごとに、消えたと知らせる（消えた所と値は、そのステージエントリの分だけ。
      // 消えたのがその外の並びだけなら、値は空）
      if (u.step.by === "ai")
        for (const entry of new Set(u.places.flatMap(id => entryOf(id) ?? []))) {
          const places = u.places.filter(id => entryOf(id) === entry)
          const values = lost.filter(l => entryOf(l.entry) === entry)
          options.aiEditTicket?.({ entry, act: u.act, places, outcome: "lost", lost: values })
        }
      return false
    })
  }
  // よその変更 change（ブックを、確かめた世界で before から after にした）を、まだ見ていない変更に足す（ブックごとに HISTORY_LIMIT まで。古い物から捨てる）
  const addUnseen = (change: { by: "ai" | "window"; act: string }, before: Book, after: Book) => {
    if (!patchOf(before, after)) return
    const mine = unseen.filter(u => u.book === after.id)
    const over = mine.length >= HISTORY_LIMIT ? mine[0] : undefined
    const changes = changesBetween([before], [after])
    const step: HistoryStep = {
      seq: nextSeq(),
      by: change.by,
      books: [after.id],
      ...rowChangesOf(tablesOf([before]), changes),
    }
    const places = [...Object.keys(changes.pages), ...Object.keys(changes.folders)]
    unseen = [...unseen.filter(u => u !== over), { step, act: change.act, book: after.id, places }]
  }
  // よその変更 change（by が host なら、画面の履歴に入れない）を、確かめた世界の表 tables と最後に知っている表から比べて、まだ見ていない変更に足し、
  // tables を最後に知っている表にする
  const addForeign = (change: ForeignChange | undefined, tables: Library) => {
    const catalog = deps.catalog()
    const library = libraryOf(tables)
    const by = change?.by === "host" ? undefined : change?.by
    const recorded = change && by && change.actions.some(a => catalog.actions.get(a)?.history !== false)
    // よその変更のうち、書庫の履歴に入るアクションの分は、まだ見ていない書庫の変更に足す。ブックごとのまだ見ていない変更は、その分だけを行った後の表から比べる
    // （書庫の分を、ブックの画面の履歴に入れない）
    const split = change?.library && by ? afterLibraryActions(change.library) : undefined
    if (change && by && split) addUnseenInLibrary({ by, act: change.act }, split.rows, knownTables, split.tables)
    const before = split ? libraryOf(split.tables) : known
    // よその変更が変えたブックごとに、まだ見ていない変更に足す
    for (const id of change?.books ?? []) {
      const was = before[id]
      const to = library[id]
      if (change && by && recorded && was && to && !sameData(was, to)) addUnseen({ by, act: change.act }, was, to)
    }
    known = library
    knownTables = tables
  }
  const reset = () => {
    unseen = []
    unseenInLibrary = []
    known = {}
    knownTables = { pages: {}, folders: {} }
  }
  return { checkSeen, dropOverwritten, addForeign, reset }
}
