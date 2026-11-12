// 常駐（Go）の中で動くアクションの入口: ビルトインプラグインで機能台帳を組み、JSON で受けた世界（ブックと設定）にアクションを行い、変わったものを JSON で返す。
// 常駐は、これをまとめたファイル（internal/engine/engine.js。bun run build:engine）を埋め込み、goja で動かす。
// 追加プラグインは、常駐が変換した JS を同じ goja で動かして受け取り、matomezuUse でビルトインプラグインに足して組み直す。
// 追加プラグインが借りる実物（plugin-modules）は、読み込んだときに globalThis.__matomezuModules に置く（変換した JS はここから取り出す）
// 画面と同じ performIn を使うので、画面で先に行ったアクションを常駐で行い直すと同じ結果になる（振る id は ids で受ける）
import { z } from "zod"
import { actorOfWire, type WireActor } from "../core/actor"
import {
  type Annotations,
  annotationBriefs,
  annotationsForAi,
  checkAnnotations,
  restoreAnnotations,
  talkActions,
  unexpired,
} from "../core/annotation"
import { checkBooks, restoreBooks } from "../core/book"
import { PALETTE, PALETTE_MEANINGS } from "../core/color"
import { bookType, type CoreCatalog } from "../core/core-catalog"
import { type ActionOn, type AIEditTicketChange, stopsOnEditLock } from "../core/def/action"
import { slideIsBackground } from "../core/def/book-type"
import { detectLang, translate } from "../core/i18n/i18n"
import { changedIn } from "../core/ids"
import { checkMailbox, type Mailbox, type MailQuery, mailForAi, restoreMailbox } from "../core/mail"
import { splitId } from "../core/names"
import { joinActions } from "../core/participant"
import { type PerformedIn, performIn } from "../core/perform"
import { findShape, type ItemPage, pageItemsOf, walkShapes } from "../core/placed"
import { checkRecords, type RecordChange, restoreCounters, restoreRecords } from "../core/records"
import type { Book, Page } from "../core/schema/book"
import { aiSettings, isParticipantAlive, langOf, restoreSettings, settingSchema } from "../core/settings"
import { WARNINGS, warning, warningText } from "../core/warnings"
import { MODULES, UI_NAMES } from "../plugin-modules"
import { BUILTIN, BUILTIN_CONTROL_CENTER } from "../plugins"
import { aiPlacedOf, type GrowRule, JOINED_MESSAGE, textColorRef, themesFor } from "../plugins/base"
import { type Assembled, assemble, type Plugin, warningsOf } from "../store/plugin"

;(globalThis as { __matomezuModules?: unknown }).__matomezuModules = MODULES

let assembled = assemble(BUILTIN, BUILTIN_CONTROL_CENTER)

// 追加プラグインを足して組み直す。新しい組で MCP 公開ツールの actions が返す物まで作り終えてから入れ替える（途中で投げれば、前の組のまま）。
// 返すのは JSON: warnings は warning の 1 行ずつ（常駐がログに書く）、ai は新しい組の MCP 公開ツールの actions が返す物
function use(added: readonly Plugin[]): string {
  const next = assemble([...BUILTIN, ...added], BUILTIN_CONTROL_CENTER)
  const ai = aiCatalog(next)
  assembled = next
  return JSON.stringify({ warnings: warningsOf(next.catalog).map(warningText), ai })
}

// 受けるもの。books は対象のアクションが要るブック（一覧のアクションなら全部）、ids は振る id のもと（画面で先に行ったときの値。尽きたら randomUUID）
interface Input {
  action: string
  args: unknown
  on?: ActionOn
  lang?: string // 画面で先に行ったときの言語。無ければ（AI が頼んだときなど）設定の言語の項目で決める
  ids?: string[]
  now?: string // 画面で先に行った時点。無ければ（AI が頼んだときなど）ここで決める
  books?: unknown[]
  settings: unknown
  annotations?: Readonly<Record<string, unknown>> // 要るブックのアノテーション（ブックの id → 並び）
  mailbox?: unknown // 利用者の郵便箱（郵便箱が対象のアクションのとき）
  counters?: unknown // 番号を振る種類の、区切りごとの次の番号（種類の id → 区切り → 次の番号。対象がその種類のアクションのとき）
  records?: unknown // 対象の定義が足した種類のレコード（種類の id → id → レコード。レコードが対象のアクションのとき、宛先と読むだけの種類）
  actor?: WireActor // 頼んだ者（無ければ利用者。AI は入っているワークルームの id を持つ）
  watched?: Readonly<Record<string, readonly string[]>> // 利用者が直している物（ブックの id → 物の id。編集ロック）
  watchedRecords?: Readonly<Record<string, readonly string[]>> // 利用者が直しているレコード（対象の種類の id → レコードの id。編集ロック）
}

// 返すもの。aiEditTicket は郵便箱が対象のアクションが返した AI 編集チケットの変え方、books は変わった・足したブック、removed は一覧から無くなったブック、annotations はアノテーションが変わったブックの id → 新しい並び（空なら全部無くなった）、mailbox は変わった郵便箱、record は変わったレコード 1 件。
// AI のアクションと lockedForUser のアクションが、受けた watched の物（ブックの中の物とアノテーションの id）を変えるか消すなら、何も変えずに being-edited で断る。
// 断ったら、detail に AI への説明（MCP 公開ツールが理由に添えて AI に返す）。認可ステップが止めたら（denied）、permission にそのステップの id
type Output =
  | {
      ok: true
      result: unknown
      books: Book[]
      removed: string[]
      settings?: unknown
      annotations?: Annotations
      mailbox?: Mailbox
      record?: RecordChange // 変わったレコード 1 件（消したなら record は removed）
      notice?: string
      aiEditTicket?: AIEditTicketChange
    }
  | { ok: false; reason: string; permission?: string; detail?: string }

declare const crypto: { randomUUID(): string }

// 理由ごとの AI への説明
const AI_REFUSALS: Record<Exclude<PerformedIn, { ok: true }>["reason"], string> = {
  unknown: "there is no action with that id (see actions)",
  "bad-args": "the args do not match the action's args (see actions)",
  "not-allowed":
    "this book's type (or, for the library, the settings, the mailbox and the records, the control center) does not allow it",
  refused: "the action's rules refuse it (for example the page or item does not exist); read_page to check",
  denied: "a permission step stopped it",
  "no-book": "there is no book with that id (see list_books)",
  "no-record": "there is no record with that id (on.record is the id of a record of the action's subject)",
}

// 断りに、AI への説明を添える
function refusal(catalog: CoreCatalog, done: Exclude<PerformedIn, { ok: true }>): Output {
  if ("permission" in done)
    return {
      ...done,
      detail: `by ${done.permission}: ${catalog.permissions.get(done.permission)?.aiDescription ?? AI_REFUSALS.denied}`,
    }
  if ("because" in done && done.because === "not-joined")
    return {
      ok: false,
      reason: done.reason,
      detail:
        "you have not joined matomezu yet (not accepted by the user, or not told by the hook): until then you can read and change books, but not use the actions of the control center; ask the user in the chat",
    }
  if ("setting" in done && done.setting !== undefined) {
    const detail =
      done.because === "user-only"
        ? `the setting ${done.setting} is changed only by the user; ask the user in the chat`
        : `the control center keeps the setting ${done.setting} fixed`
    return { ok: false, reason: done.reason, detail }
  }
  if ("detail" in done && done.detail !== undefined) return { ok: false, reason: done.reason, detail: done.detail }
  return { ok: false, reason: done.reason, detail: AI_REFUSALS[done.reason] }
}

function perform(input: Input): Output {
  const { controlCenter } = assembled
  const catalog = assembled.catalog.core
  const settings = restoreSettings(input.settings)
  const lang = input.lang ? detectLang([input.lang], [...catalog.languages.keys()]) : langOf(catalog, settings, "en")
  const ids = [...(input.ids ?? [])]
  const books = Object.fromEntries(restoreBooks(catalog, input.books ?? []).map(b => [b.id, b]))
  const annotations = Object.fromEntries(
    Object.entries(input.annotations ?? {}).map(([book, list]) => [book, restoreAnnotations(list)]),
  )
  const mailbox = restoreMailbox(input.mailbox)
  const records = restoreRecords(input.records)
  const counters = restoreCounters(input.counters)
  const actor = actorOfWire(input.actor)
  const done = performIn(
    { books, settings, annotations, mailbox, records, counters },
    input.action,
    input.args,
    input.on,
    {
      catalog,
      controlCenter,
      lang,
      newId: () => ids.shift() ?? crypto.randomUUID(),
      now: input.now ?? new Date().toISOString(),
      actor,
    },
  )
  if (!done.ok) return refusal(catalog, done)
  const next = done.books
  const changed = done.book ? [done.book] : Object.values(next ?? {}).filter(b => books[b.id] !== b)
  const removed = next ? Object.keys(books).filter(id => !(id in next)) : []
  const notice = shiftNotice(books, changed)
  const touched = Object.entries(input.watched ?? {}).flatMap(([id, watched]) => {
    const book = removed.includes(id) ? undefined : (changed.find(b => b.id === id) ?? books[id])
    const list = done.annotations && id in done.annotations ? done.annotations[id] : annotations[id]
    return changedIn({ book: books[id], annotations: annotations[id] }, { book, annotations: list }, watched)
  })
  // AI のアクションと、利用者でも編集ロックで断るアクションは、利用者が直している物を変えも消しもしない（あとでやり直す）
  // レコードが対象のアクションは、直しているレコードを変えるか消すなら、同じように断る（作るレコードは宛先に無いので断らない）
  const editedRecord =
    done.record !== undefined &&
    input.on !== undefined &&
    "record" in input.on &&
    (input.watchedRecords?.[done.record.subject] ?? []).includes(done.record.id)
  if ((touched.length > 0 || editedRecord) && stopsOnEditLock(catalog.actions.get(input.action), actor))
    return { ok: false, reason: "being-edited" }
  return {
    ok: true,
    result: done.result,
    books: changed,
    removed,
    ...(done.settings ? { settings: done.settings } : {}),
    ...(done.annotations ? { annotations: done.annotations } : {}),
    ...(done.mailbox ? { mailbox: done.mailbox } : {}),
    ...(done.record ? { record: done.record } : {}),
    ...(notice ? { notice } : {}),
    ...(done.aiEditTicket ? { aiEditTicket: done.aiEditTicket } : {}),
  }
}

// 中身をずらした可変ページ（ページの shift が変わった）があれば、AI への知らせ（位置が変わったので読み直す）
function shiftNotice(before: Readonly<Record<string, Book>>, changed: readonly Book[]): string | null {
  const shiftOf = (b: Book | undefined, page: string) =>
    (b && "pages" in b ? (b.pages as readonly Page[]).find(p => p.id === page)?.shift : undefined) ?? { x: 0, y: 0 }
  const moved = changed.flatMap(b =>
    "pages" in b
      ? (b.pages as readonly Page[]).flatMap(p => {
          const was = shiftOf(before[b.id], p.id)
          const now = shiftOf(b, p.id)
          const dx = now.x - was.x
          const dy = now.y - was.y
          return dx || dy ? [`page ${p.id} of book ${b.id} by ${dx} paper(s) right and ${dy} down`] : []
        })
      : [],
  )
  return moved.length
    ? `The contents of a variable page were shifted by whole papers, so every position there changed (${moved.join("; ")}); read_page before using positions.`
    : null
}
// ブックのタイプのページの可変ページの決め方（aiCatalog）: 利用者が選べる増やす向きの一覧（最初のものが既定）、タイプが向きを決める by-type、
// どのページもいつも可変ページの always、可変ページを作れない none
const growsOf = (rule: GrowRule | undefined): readonly string[] | "by-type" | "always" | "none" =>
  !rule ? "none" : "always" in rule ? "always" : "choices" in rule ? rule.choices : "by-type"

// MCP 公開ツールの actions の元になる物: 表ごとの全文（アクション・アイテム・設定などの args・props の JSON Schema まで）に、目次 index を添える。
// 全文は、機能台帳から AI に見せる物（利用者だけのアクションと、利用者だけが変える設定の項目は除く）を書き出したもの。名前は英語。
// 目次は、AI が最初に受け取る物: 大きい表（アクション・アイテム・設定）は id と題名だけにし、全文は id を渡して取る。小さい表は全文のまま入れる
function aiCatalog(of: Assembled = assembled) {
  const tables = aiTables(of)
  const { actions, items, settings, subjects, ...whole } = tables
  return {
    ...tables,
    index: {
      actions: actions.map(a => ({ id: a.id, target: a.target, title: a.title })),
      items: items.map(i => ({ id: i.id, kind: i.kind, title: i.title })),
      settings: settings.map(s => ({ id: s.id, title: s.title })),
      subjects: subjects.map(s => ({ id: s.id, title: s.title })),
      ...whole,
    },
  }
}

function aiTables(of: Assembled) {
  const catalog = of.catalog.core
  const en = (key: string) => translate(catalog.messages, "en", key as never)
  return {
    actions: [...catalog.actions.values()]
      .filter(a => !a.userOnly)
      .map(a => ({
        id: a.id,
        target: a.target,
        title: en(a.title),
        description: a.aiDescription,
        args: z.toJSONSchema(a.describeArgs?.(catalog) ?? a.args, { io: "input", unrepresentable: "any" }),
      })),
    bookTypes: [...catalog.bookTypes.values()].map(t => ({
      id: t.id,
      title: en(t.title),
      pages: t.pages !== null,
      grows: t.pages ? growsOf(t.grow) : "none", // 可変ページの決め方
      items: t.items.allowed, // ページに置けるアイテム
      // ページの slide（形だけの並び）に置けるアイテムと、その並びがページの背景か本体か（無ければ null）。read_page には、背景は有無と文字だけが見える（page.background.texts）
      slide: t.slide ? { items: t.slide.allowed, role: slideIsBackground(t) ? "background" : "body" } : null,
      themes: themesFor(catalog, t.id).map(th => th.id), // そのタイプのブックと中の形に当てられるテーマ（テーマタイプの重なりは、ここで計算して出す）
    })),
    items: [...catalog.items.values()].map(i => ({
      id: i.id,
      kind: i.kind, // shape は置く形、connector は 2 つの形をつなぐもの
      title: en(i.title),
      size: i.kind === "shape" ? i.size : null,
      props: z.toJSONSchema(i.props, { io: "input", unrepresentable: "any" }),
    })),
    // 利用者の設定の項目（settings-set で変え、read_settings で読む）
    settings: [...catalog.userSettings.values()]
      .filter(d => !d.userOnly)
      .map(d => ({
        id: d.id,
        title: en(d.title),
        schema: z.toJSONSchema(settingSchema(catalog, d, "user"), { io: "input", unrepresentable: "any" }),
      })),
    // アノテーションの種類（read_book・read_page の annotations と view の awaiting の annotation は、この id）
    annotations: [...catalog.annotations.values()].map(a => ({
      id: a.id,
      title: en(a.title),
      description: a.aiDescription,
      props: z.toJSONSchema(a.props, { io: "input", unrepresentable: "any" }),
    })),
    // 対象の定義（レコードの種類。アクションの target はこの id のとき、perform の on は { record: レコードの id }（作るときは on を書かない））
    subjects: [...catalog.subjects.values()]
      .filter(s => s.aiBrief !== undefined)
      .map(s => ({
        id: s.id,
        title: en(s.title),
        description: s.aiDescription,
        record: z.toJSONSchema(s.record, { io: "input", unrepresentable: "any" }),
      })),
    // 郵便の種類（read_mail の郵便の mail は、この id）
    mails: [...catalog.mails.values()].map(m => ({
      id: m.id,
      title: en(m.title),
      description: m.aiDescription,
      props: z.toJSONSchema(m.props, { io: "input", unrepresentable: "any" }),
    })),
    themes: [...catalog.themes.values()].map(th => ({ id: th.id, title: en(th.title) })),
    // 言語パック（言語の項目の値は、この id）とスキン
    languages: [...catalog.languagePacks.values()].map(p => ({ id: p.id, lang: p.lang, name: p.name })),
    skins: [...catalog.skins.keys()],
    colors: PALETTE.map(id => ({ id, meaning: PALETTE_MEANINGS[id] })),
    // 本文の装飾の文字の色（name は本文に書く名前: {name:文字}）
    textColors: [...catalog.textColors.values()].map(c => ({
      id: c.id,
      name: textColorRef(c.id),
      meaning: c.aiDescription,
    })),
  }
}

;(globalThis as { matomezuModuleNames?: () => string }).matomezuModuleNames = () =>
  JSON.stringify({ engine: Object.keys(MODULES), ui: UI_NAMES })

;(globalThis as { matomezuUse?: (added: readonly Plugin[]) => string }).matomezuUse = use

;(globalThis as { matomezuAiCatalog?: () => string }).matomezuAiCatalog = () => JSON.stringify(aiCatalog())

// AI が読む設定（MCP 公開ツールの read_settings）: 残した設定から、利用者だけが変える項目と機能台帳に無い項目を除き、値が無いか形に合わない項目は既定にする
;(globalThis as { matomezuReadSettings?: (settings: string) => string }).matomezuReadSettings = settings =>
  JSON.stringify(aiSettings(assembled.catalog.core, restoreSettings(JSON.parse(settings))))

// 残したブックを今の機能台帳で確かめ、warning のあるブック（読めない W004〜W006・一部に無い物がある W007）の id・番号・warning の 1 行と、
// 読めないか（unreadable）を返す（常駐が一覧に持つ）
;(globalThis as { matomezuCheckBooks?: (books: string) => string }).matomezuCheckBooks = books => {
  const { warnings, partial } = checkBooks(assembled.catalog.core, JSON.parse(books) as unknown[])
  return JSON.stringify(
    [...warnings.map(n => [n, true] as const), ...partial.map(n => [n, false] as const)].map(([n, unreadable]) => ({
      book: n.params.book ?? "",
      code: n.code,
      warning: warningText(n),
      unreadable,
    })),
  )
}

// 残したアノテーションを今の機能台帳で確かめ、効かないもの（種類が無い W018・形が合わない W019）の warning の 1 行ずつを返す（常駐がログに書く）。
// 読めないブックのアノテーションは確かめない
;(globalThis as { matomezuCheckAnnotations?: (pairs: string) => string }).matomezuCheckAnnotations = pairs => {
  const catalog = assembled.catalog.core
  const lines = (JSON.parse(pairs) as { book: unknown; annotations: unknown }[]).flatMap(p => {
    const [book] = restoreBooks(catalog, [p.book])
    return book ? checkAnnotations(catalog, book, restoreAnnotations(p.annotations)).map(warningText) : []
  })
  return JSON.stringify(lines)
}

// 残した郵便箱を今の機能台帳で確かめ、効かない郵便（種類が無い W022・形が合わない W023）の warning の 1 行ずつを返す（常駐がログに書く）
;(globalThis as { matomezuCheckMailbox?: (list: string) => string }).matomezuCheckMailbox = list =>
  JSON.stringify(checkMailbox(assembled.catalog.core, restoreMailbox(JSON.parse(list))).map(warningText))

// 常駐が初めて起動したときに 1 度だけ行うアクション（ActionDef の runsOnceAtStart）の id の並び
;(globalThis as { matomezuRunOnceActions?: () => string }).matomezuRunOnceActions = () =>
  JSON.stringify([...assembled.catalog.core.actions.values()].filter(a => a.runsOnceAtStart).map(a => a.id))

// 常駐が読む種類の役（参加者・ワークルーム）ごとの、対象の定義の id（役を名乗る定義が無ければ入れない）
;(globalThis as { matomezuSubjectRoles?: () => string }).matomezuSubjectRoles = () =>
  JSON.stringify(
    Object.fromEntries([...assembled.catalog.core.subjects.values()].flatMap(s => (s.role ? [[s.role, s.id]] : []))),
  )

// 残したレコードを今の機能台帳で確かめ、効かないレコード（種類が無い W024・形が合わない W025）の warning の 1 行ずつを返す（常駐がログに書く）
;(globalThis as { matomezuCheckRecords?: (records: string) => string }).matomezuCheckRecords = records =>
  JSON.stringify(checkRecords(assembled.catalog.core, restoreRecords(JSON.parse(records))).map(warningText))

// ブックとそのアノテーションの並びごとに、AI に見せる並び（annotationsForAi。結び付く物の最後のあるページと、AI の応えを待っているか）を返す。
// 読めないブックのアノテーションは、ページが分からず待たないものとして返す
;(globalThis as { matomezuAiAnnotations?: (pairs: string) => string }).matomezuAiAnnotations = pairs => {
  const catalog = assembled.catalog.core
  const out = (JSON.parse(pairs) as { book: unknown; annotations: unknown }[]).map(p => {
    const list = restoreAnnotations(p.annotations)
    const [book] = restoreBooks(catalog, [p.book])
    return book ? annotationsForAi(catalog, book, list) : list.map(a => ({ ...a, page: null, awaits: false }))
  })
  return JSON.stringify(out)
}

// ブックとそのアノテーションの並びごとに、待っている物を AI に知らせる 1 行（annotationBriefs。アノテーションの id → 1 行）を返す。読めないブックは空
;(globalThis as { matomezuAiBriefs?: (pairs: string) => string }).matomezuAiBriefs = pairs => {
  const catalog = assembled.catalog.core
  const out = (JSON.parse(pairs) as { book: unknown; annotations: unknown }[]).map(p => {
    const [book] = restoreBooks(catalog, [p.book])
    return book ? annotationBriefs(catalog, book, restoreAnnotations(p.annotations)) : {}
  })
  return JSON.stringify(out)
}

// 郵便箱を、AI の取り方（read_mail の引数）で AI に見せる形にする（mailForAi）。{ok, answer} か、断る理由の {ok: false, reason}
;(globalThis as { matomezuAiMail?: (input: string) => string }).matomezuAiMail = input => {
  const { mailbox, query } = JSON.parse(input) as { mailbox: unknown; query: MailQuery }
  return JSON.stringify(mailForAi(assembled.catalog.core, restoreMailbox(mailbox), query))
}

// ブックのページごとの、形の描いた位置と大きさ（base の aiPlacedOf。AI の read_page に添える）。読めないブックか、見せ方が答えなければ null
;(globalThis as { matomezuAiPlaced?: (book: string) => string }).matomezuAiPlaced = book => {
  const catalog = assembled.catalog.core
  const [read] = restoreBooks(catalog, [JSON.parse(book)])
  return JSON.stringify(read ? aiPlacedOf(catalog, read) : null)
}

// AI に見せるページ（read_page の page）: 背景を持つタイプのページの slide（背景の形）は、図形の情報（位置・大きさ・形の種類など）を見せず、
// 背景があることと、背景の形が持つ名前（形の定義の labelOf。文字枠なら書いた文字。重ねの順）だけを background に入れる。背景を持たないタイプと、背景の無いページはそのまま返す
;(globalThis as { matomezuAiPage?: (book: string, page: string) => string }).matomezuAiPage = (book, page) => {
  const catalog = assembled.catalog.core
  const [read] = restoreBooks(catalog, [JSON.parse(book)])
  const body = JSON.parse(page) as { slide?: { id: string; item: string }[] }
  if (
    !read ||
    !Array.isArray(body.slide) ||
    body.slide.length === 0 ||
    !slideIsBackground(bookType(catalog, read.type))
  )
    return page
  const { slide, ...rest } = body
  const texts = slide.flatMap(s => {
    const def = catalog.items.get(s.item)
    const text = def?.kind === "shape" ? def.labelOf?.(s as never, s.id) : undefined
    return text ? [text] : []
  })
  return JSON.stringify({ ...rest, background: { texts } })
}

// ページ page（JSON）の中の、どの深さの形も、つなぐものも、id で探した物と、その物と子の形の id の全部（AI の read_page の item）。無ければ null
;(globalThis as { matomezuAiItem?: (page: string, id: string) => string }).matomezuAiItem = (page, id) => {
  const body = JSON.parse(page) as ItemPage
  const shape = findShape(body, id)?.shape
  const item = shape ?? pageItemsOf(body).find(i => i.id === id)
  if (!item) return JSON.stringify(null)
  const ids = shape ? walkShapes({ ...body, items: [shape] }).map(s => s.shape.id) : [id]
  return JSON.stringify({ item, ids })
}

// アノテーションの並びから、プラグイン plugin が足した種類（種類の id の持ち主が plugin）の物を除く（利用者がプラグインを外したときに常駐が消す）
;(globalThis as { matomezuAnnotationsWithout?: (plugin: string, list: string) => string }).matomezuAnnotationsWithout =
  (plugin, list) => {
    const all = restoreAnnotations(JSON.parse(list))
    const kept = all.filter(a => splitId(String(a.annotation)).owner !== plugin)
    return JSON.stringify({ annotations: kept, changed: kept.length !== all.length })
  }

// 利用者が AI に話しかけたときに行うアクション（runsWhenUserTalks）の id（常駐が、アノテーションのあるブックごとに行う）
;(globalThis as { matomezuTalkActions?: () => string }).matomezuTalkActions = () =>
  JSON.stringify(talkActions(assembled.catalog.core))

// AI が参加を頼むときに行うアクション（runsWhenAIJoins）の id（役 participant と notice。役が揃わなければ null。常駐が MCP の join で行う）
;(globalThis as { matomezuJoinActions?: () => string }).matomezuJoinActions = () =>
  JSON.stringify(joinActions(assembled.catalog.core))

// 参加者が時点 nowMs（ミリ秒）で生きているか（利用者の設定の参加の有効時間で決まる。常駐が、同じ名前の参加者を引き継げるかを決めるのに読む）
;(
  globalThis as { matomezuParticipantAlive?: (settings: string, calledAt: string, nowMs: number) => boolean }
).matomezuParticipantAlive = (settings, calledAt, nowMs) =>
  isParticipantAlive(assembled.catalog.core, restoreSettings(JSON.parse(settings)), calledAt || undefined, nowMs)

// 参加を利用者に伝える文（利用者の言語。常駐が、話しかけのフックの systemMessage に使う）
;(globalThis as { matomezuJoinedText?: (settings: string, workroom: string) => string }).matomezuJoinedText = (
  settings,
  workroom,
) =>
  translate(
    assembled.catalog.core.messages,
    langOf(assembled.catalog.core, restoreSettings(JSON.parse(settings)), "en"),
    JOINED_MESSAGE,
    { name: workroom },
  )

// アクションがレコードを対象にするとき、常駐が渡すレコード: 対象の種類（レコードが対象でなければ null）と、読むだけの種類。常駐が、行う前にどのレコードを渡すかを決めるのに引く
;(globalThis as { matomezuRecordNeeds?: (action: string) => string }).matomezuRecordNeeds = action => {
  const def = assembled.catalog.core.actions.get(action)
  const subject = def && assembled.catalog.core.subjects.has(def.target) ? def.target : null
  return JSON.stringify({ subject, reads: subject === null ? [] : [...(def?.reads ?? [])] })
}

// アノテーションの並びから、期限（種類の expiresAt）が時点 now より前の物を除く（kept の id の物は除かない。利用者が直している物）。常駐が時間で消す
;(
  globalThis as { matomezuUnexpired?: (list: string, settings: string, now: string, kept: string) => string }
).matomezuUnexpired = (list, settings, now, kept) => {
  const all = restoreAnnotations(JSON.parse(list))
  const live = unexpired(
    assembled.catalog.core,
    all,
    restoreSettings(JSON.parse(settings)),
    now,
    new Set(JSON.parse(kept) as string[]),
  )
  return JSON.stringify({ annotations: live, changed: live !== all })
}

// 窓が見つけて送ってきた warning（{code, plugin, params} の並び）を、warning の表の 1 行ずつにする（常駐が集めてログと AI に出す）。
// 表に無い番号・形の合わないものは捨てる（窓が作った文は使わない）
const WindowWarningSchema = z.object({
  code: z.string(),
  plugin: z.string(),
  params: z.record(z.string(), z.string()),
})
;(globalThis as { matomezuWarningLines?: (warnings: string) => string }).matomezuWarningLines = warnings => {
  const lines: string[] = []
  for (const raw of z.array(z.unknown()).catch([]).parse(JSON.parse(warnings))) {
    const n = WindowWarningSchema.safeParse(raw)
    if (n.success && Object.hasOwn(WARNINGS, n.data.code))
      lines.push(warningText(warning(n.data.code as keyof typeof WARNINGS, n.data.plugin, n.data.params)))
  }
  return JSON.stringify(lines)
}

// 常駐が呼ぶ口: JSON の文字列で受けて返す
;(globalThis as { matomezuPerform?: (input: string) => string }).matomezuPerform = input =>
  JSON.stringify(perform(JSON.parse(input) as Input))
