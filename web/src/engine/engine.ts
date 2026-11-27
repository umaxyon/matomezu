// 常駐（Go）の中で動くアクションの入口: ビルトインプラグインで機能台帳を組み、JSON で受けた世界（ブックと設定）にアクションを行い、変わったものを JSON で返す。
// 常駐は、これをまとめたファイル（internal/engine/engine.js。bun run build:engine）を埋め込み、goja で動かす。
// 追加プラグインは、常駐が変換した JS を同じ goja で動かして受け取り、matomezuUse でビルトインプラグインに足して組み直す。
// 追加プラグインが借りる実物（plugin-modules）は、読み込んだときに globalThis.__matomezuModules に置く（変換した JS はここから取り出す）
// 画面と同じ performIn を使うので、画面で先に行ったアクションを常駐で行い直すと同じ結果になる（振る id は ids で受ける）
// 計算は同じフォルダの役割ごとのファイルにあり、ここは台帳アセンブルの結果（assembled）を渡して呼ぶ。常駐が呼ぶ口（globalThis に置く matomezu で始まる関数）は、全部ここに置く

import { talkActions } from "../core/annotation"
import { assetsInUse } from "../core/assets"
import { hostActions } from "../core/hosts"
import { endActions, joinActions } from "../core/participant"
import { checkRecords, restoreRecords } from "../core/records"
import {
  aiSettings,
  connectHostsOn,
  disabledPluginsOf,
  hostNameOf,
  isParticipantAlive,
  listedWorkroomsOf,
  participantLapsesAt,
  restoreSettings,
  updateCheckOn,
  userNameOf,
} from "../core/settings"
import { warningText } from "../core/warnings"
import { MODULES, UI_NAMES } from "../plugin-modules"
import { BUILTIN, BUILTIN_CONTROL_CENTER } from "../plugins"
import { assemble, type Plugin, warningsOf, withoutParts } from "../store/plugin"
import { aiCatalog } from "./ai-catalog"
import { itemForAi, pageForAi, pagePlacedForAi, placedForAi } from "./ai-page"
import { aiAnnotationsOf, aiBriefsOf, annotationsWithout, checkAnnotationLines, unexpiredOf } from "./annotations"
import { type Input, perform } from "./host-perform"
import {
  checkBookLines,
  checkLibraryLine,
  checkOutsidePageLines,
  movedIfOffOf,
  purgedRowsOf,
  settleFailedLine,
  settleLibraryOf,
  systemFolderTitlesOf,
} from "./library"
import {
  aiRecordsOf,
  aiRowsOf,
  keysOf,
  kindsOf,
  parentsOf,
  recordBooksOf,
  recordNeedsOf,
  searchTextsOf,
  subjectRolesOf,
  unlistedOf,
} from "./records"
import {
  isAdminWorkroom,
  joinedText,
  myWorkdesk,
  visitorJoinedText,
  windowWarningLines,
  workroomActivities,
  workShift,
  workTitle,
} from "./texts"

;(globalThis as { __matomezuModules?: unknown }).__matomezuModules = MODULES

let assembled = assemble(BUILTIN, BUILTIN_CONTROL_CENTER)

// 追加プラグインを足して組み直す。新しい組で MCP 公開ツールの actions が返す物まで作り終えてから入れ替える（途中で投げれば、前の組のまま）。
// 返すのは JSON: warnings は warning の 1 行ずつ（常駐がログに書く）、ai は新しい組の MCP 公開ツールの actions が返す物
// settings（利用者の設定の JSON）を渡すと、利用者が有効にしていない追加プラグインは、名乗りと文言だけで組む（無効のプラグイン。disabledPluginsOf）。渡さなければ、全部有効で組む。
// 返す disabled は、無効で組んだプラグインの id
function use(added: readonly Plugin[], settings?: string): string {
  let used = added
  let disabled: string[] = []
  if (settings !== undefined) {
    const all = assemble([...BUILTIN, ...added], BUILTIN_CONTROL_CENTER)
    const off = disabledPluginsOf(
      all.catalog.core,
      restoreSettings(JSON.parse(settings)),
      added.map(p => p.id),
    )
    disabled = [...off]
    used = added.map(p => (off.has(p.id) ? withoutParts(p) : p))
  }
  const next = assemble([...BUILTIN, ...used], BUILTIN_CONTROL_CENTER)
  const ai = aiCatalog(next)
  assembled = next
  lastAdded = added
  return JSON.stringify({ warnings: warningsOf(next.catalog).map(warningText), ai, disabled })
}

// 今足している追加プラグイン（組み直すときの元）
let lastAdded: readonly Plugin[] = []

// 設定 settings で、無効になる追加プラグインの id（今足している物のうち）。設定が変わったあとに、組み直すかを決めるのに使う
;(globalThis as { matomezuDisabledPlugins?: (settings: string) => string }).matomezuDisabledPlugins = settings =>
  JSON.stringify([
    ...disabledPluginsOf(
      assembled.catalog.core,
      restoreSettings(JSON.parse(settings)),
      lastAdded.map(p => p.id),
    ),
  ])

;(globalThis as { matomezuModuleNames?: () => string }).matomezuModuleNames = () =>
  JSON.stringify({ engine: Object.keys(MODULES), ui: UI_NAMES })

;(globalThis as { matomezuUse?: (added: readonly Plugin[], settings?: string) => string }).matomezuUse = use

;(globalThis as { matomezuAiCatalog?: () => string }).matomezuAiCatalog = () => JSON.stringify(aiCatalog(assembled))

// AI が読む設定（MCP 公開ツールの read_settings）: 残した設定から、利用者だけが変える項目と機能台帳に無い項目を除き、値が無いか形に合わない項目は既定にする
;(globalThis as { matomezuReadSettings?: (settings: string) => string }).matomezuReadSettings = settings =>
  JSON.stringify(aiSettings(assembled.catalog.core, restoreSettings(JSON.parse(settings))))

// 残したブックを今の機能台帳で確かめ、warning のあるブック（ブックごと読めない W005・W006・読めないページを持つ W027〜W029、一部に無い物がある W007）の
// id・番号・warning の 1 行と、ブックごと読めないか（unreadable）を返す（常駐が一覧に持つ）
;(globalThis as { matomezuCheckBooks?: (books: string) => string }).matomezuCheckBooks = books =>
  checkBookLines(assembled, books)

// ブックの外のページを今の機能台帳で確かめ、読めるが機能台帳に無い物を持つページ（W007）の id → warning の 1 行を返す（常駐が一覧に持つ）
;(globalThis as { matomezuCheckOutsidePages?: (pages: string) => string }).matomezuCheckOutsidePages = pages =>
  checkOutsidePageLines(assembled, pages)

// ページの行の全部が指すアセットの id と、全部のページで答えられたか（{ ids, sure }。常駐が起動のときに、指されないアセットを消すのに使う。core/assets.ts）
;(globalThis as { matomezuAssetsInUse?: (pages: string) => string }).matomezuAssetsInUse = pages =>
  JSON.stringify(assetsInUse(assembled.catalog.core, JSON.parse(pages) as unknown[]))

// 残したフォルダの行の全部（書庫ホーム・フォルダ・ブック・バインダ）とページの行の id の全部が木の決まりを守るかを確かめ、破れていれば warning（W030）の 1 行を、守っていれば空の文字列を返す
// （常駐が一覧に持つ。データには手を付けない）
;(globalThis as { matomezuCheckLibrary?: (folders: string, pages: string) => string }).matomezuCheckLibrary = (
  folders,
  pages,
) => checkLibraryLine(folders, pages)

// 残したアノテーションを今の機能台帳で確かめ、効かないもの（種類が無い W018・形が合わない W019）の warning の 1 行ずつを返す（常駐がログに書く）。
// 受けるのは、ブックと、そのページごとのアノテーション（ページの id → 並び）の組。読めないブックのアノテーションは確かめない
;(globalThis as { matomezuCheckAnnotations?: (pairs: string) => string }).matomezuCheckAnnotations = pairs =>
  checkAnnotationLines(assembled, pairs)

// 常駐が初めて起動したときに 1 度だけ行うアクション（ActionDef の runsOnceAtStart）の id の並び
;(globalThis as { matomezuRunOnceActions?: () => string }).matomezuRunOnceActions = () =>
  JSON.stringify([...assembled.catalog.core.actions.values()].filter(a => a.runsOnceAtStart).map(a => a.id))

// システムフォルダの定義の id → AI に見せる名前（英語の文言）。read_folder でシステムフォルダの名前に使う
;(globalThis as { matomezuSystemFolderTitles?: () => string }).matomezuSystemFolderTitles = () =>
  systemFolderTitlesOf(assembled)

// AI に見せる種類 kind のレコードの一覧（read_records）の、種類の全部を読む道: where（項目 → 値）に合う物を、載せる物と載せない物（aiListed）に分け、unlisted（hide・include・only）の物の id と 1 行（aiBrief）を、
// 並びの鍵（aiOrder。無ければ id）の順に返す（core/ai-list.ts）。hide のときは、載せなかった数も返す。指す先のレコードは、ホストの読み口から引く。AI に見せない種類・無い種類は null
;(
  globalThis as {
    matomezuAiRecords?: (kind: string, records: string, where: string, unlisted: string) => string
  }
).matomezuAiRecords = (kind, records, where, unlisted) => aiRecordsOf(assembled, kind, records, where, unlisted)

// 種類 kind のレコード ids（JSON の並び）の id → AI に見せるバックヤードのブックの並び（read_records の全文に添える。folders は書庫のフォルダの行の全部〈JSON の並び〉）
;(globalThis as { matomezuRecordBooks?: (kind: string, ids: string, folders: string) => string }).matomezuRecordBooks =
  (kind, ids, folders) => recordBooksOf(assembled, kind, ids, folders)

// 種類 subject のレコード records（JSON。id → レコード）のうち、一覧の既定の目次に載せない物の id の並び（core/ai-list.ts の isAIListed）。横断検索が、横断検索の当たりを分けるのに引く。指す先は、ホストの読み口から引く
;(globalThis as { matomezuUnlistedOf?: (subject: string, records: string) => string }).matomezuUnlistedOf = (
  subject,
  records,
) => unlistedOf(assembled, subject, records)

// 今の機能台帳の、レコードの種類と索引キーの宣言（常駐が置き場所に伝える。索引キーは宣言の順）
;(globalThis as { matomezuKinds?: () => string }).matomezuKinds = () => kindsOf(assembled)

// AI に見せる種類 kind のレコードの並び records（JSON。常駐が索引キーで探して並べた、その件数だけ）の、一覧の行: id・種類が添えるフィールド（aiRow）・題（brief）。
// 並びは受けた順のまま。形に合わない・種類の関数が投げたレコードは id だけの行にする（数と続きが食い違わないように）
;(globalThis as { matomezuAiRows?: (kind: string, records: string) => string }).matomezuAiRows = (kind, records) =>
  aiRowsOf(assembled, kind, records)

// 種類 subject のレコード records（JSON。id → レコード）の、索引キーの値（id → 名前 → 値）。常駐が、宣言が変わったあとに置き場所へ入れ直すのに引く
;(globalThis as { matomezuKeysOf?: (subject: string, records: string) => string }).matomezuKeysOf = (
  subject,
  records,
) => keysOf(assembled, subject, records)

// 種類 subject のレコード records（JSON。id → レコード）の、横断検索に使う文字（id → 題と本文）。常駐が、探す文字を入れ直すのに引く（形に合わないレコードは含めない）
;(globalThis as { matomezuSearchTextsOf?: (subject: string, records: string) => string }).matomezuSearchTextsOf = (
  subject,
  records,
) => searchTextsOf(assembled, subject, records)

// 種類 subject のレコード records（JSON。id → レコード）の、親（refers の先頭 1 件。id → {subject, id}）。refers を書かない種類・指す先の無いレコード・形に合わないレコードは含めない
;(globalThis as { matomezuParentsOf?: (subject: string, records: string) => string }).matomezuParentsOf = (
  subject,
  records,
) => parentsOf(assembled, subject, records)

// 常駐と core が種類で引く役（参加者・ワークルーム。core/def/subject.ts の SUBJECT_ROLE_FIELDS）ごとの、対象の定義の id（役を名乗る定義が無ければ入れない）
;(globalThis as { matomezuSubjectRoles?: () => string }).matomezuSubjectRoles = () => subjectRolesOf(assembled)

// 残したレコードを今の機能台帳で確かめ、効かないレコード（種類が無い W024・形が合わない W025。形のほかの確かめを書いた種類はその warning。郵便なら、郵便の種類が無い W022・形が合わない W023）の warning の 1 行ずつを返す（常駐がログに書く）
;(globalThis as { matomezuCheckRecords?: (records: string) => string }).matomezuCheckRecords = records =>
  JSON.stringify(checkRecords(assembled.catalog.core, restoreRecords(JSON.parse(records))).map(warningText))

// ステージエントリ（ブックか、ブックの外のページ）とそのページごとのアノテーションの組ごとに、AI に見せる並び（annotationsForAi。付いているページと、AI の応えを待っているか。ブックのページの順）を返す。
// 読めないブックのアノテーションは、待たないものとして返す
;(globalThis as { matomezuAiAnnotations?: (pairs: string) => string }).matomezuAiAnnotations = pairs =>
  aiAnnotationsOf(assembled, pairs)

// ステージエントリとそのページごとのアノテーションの組ごとに、待っている物を AI に知らせる 1 行（annotationBriefs。ページの id → アノテーションの id → 1 行）を返す。読めないブックは空
;(globalThis as { matomezuAiBriefs?: (pairs: string) => string }).matomezuAiBriefs = pairs =>
  aiBriefsOf(assembled, pairs)

// ブックのページごとの、形の描いた位置と大きさ（base の aiPlacedOf。AI の read_page に添える）。読めないブックか、プレゼンテーションが答えなければ null
;(globalThis as { matomezuAiPlaced?: (book: string) => string }).matomezuAiPlaced = book => placedForAi(assembled, book)

// ページ 1 枚（ブックの中のページでも、ブックの外のページでも）の、形の描いた位置と大きさ（base の aiPlacedOfPage。AI の read_page に添える）。読めないページか、プレゼンテーションが答えなければ null
;(globalThis as { matomezuAiPagePlaced?: (page: string) => string }).matomezuAiPagePlaced = page =>
  pagePlacedForAi(assembled, page)

// AI に見せるページ（read_page の page）: 背景を持つタイプのページの slide（背景の形）は、図形の情報（位置・大きさ・形の種類など）を見せず、
// 背景があることと、背景の形が持つ名前（形の定義の labelOf。文字枠なら書いた文字。重ねの順）だけを background に入れる。背景を持たないタイプと、背景の無いページはそのまま返す
;(globalThis as { matomezuAiPage?: (page: string) => string }).matomezuAiPage = page => pageForAi(assembled, page)

// ページ page（JSON）の中の、どの深さの形も、つなぐものも、id で探した物と、その物と子の形の id の全部（AI の read_page の item）。無ければ null
;(globalThis as { matomezuAiItem?: (page: string, id: string) => string }).matomezuAiItem = (page, id) =>
  itemForAi(page, id)

// アノテーションの並びから、プラグイン plugin が足した種類（種類の id の持ち主が plugin）の物を除く（利用者がプラグインを外したときに常駐が消す）
;(globalThis as { matomezuAnnotationsWithout?: (plugin: string, list: string) => string }).matomezuAnnotationsWithout =
  (plugin, list) => annotationsWithout(plugin, list)

// 利用者トリガートークのときに行うアクション（runsWhenUserTalks）の id（常駐が、アノテーションのある読めるページごとに行う）
;(globalThis as { matomezuTalkActions?: () => string }).matomezuTalkActions = () =>
  JSON.stringify(talkActions(assembled.catalog.core))

// AI が参加を頼むときに行うアクション（runsWhenAIJoins）と、要求をキャンセルとして終えるアクション（cancelsJoinRequest。無くてもよい）の id（参加者を作るアクションが無ければ null。常駐が MCP の join と、窓のアクションの知らせで使う）
;(globalThis as { matomezuJoinActions?: () => string }).matomezuJoinActions = () =>
  JSON.stringify(joinActions(assembled.catalog.core))

// 参加者のセッションが終わったときに行うアクション（runsWhenAIEnds）の id（無ければ null。常駐が、セッションの終わった参加者を退室させるのに行う）
;(globalThis as { matomezuEndActions?: () => string }).matomezuEndActions = () =>
  JSON.stringify(endActions(assembled.catalog.core))

// ほかのホストに応じて常駐が利用者として行うアクション（runsBetweenHosts）の、役ごとの id（常駐が、ホストどうしの入口で使う）
;(globalThis as { matomezuHostActions?: () => string }).matomezuHostActions = () =>
  JSON.stringify(hostActions(assembled.catalog.core))

// 参加者が時点 nowMs（ミリ秒）で生きているか（wake は起こす知らせを渡せる matomezu watch がつながっているか。利用者の設定の参加の有効時間で決まる。
// 常駐が、同じ名前の参加者を引き継げるかと、ワークルームの一覧の生きているかを決めるのに読む）
;(
  globalThis as {
    matomezuParticipantAlive?: (settings: string, calledAt: string, wake: string, nowMs: number) => boolean
  }
).matomezuParticipantAlive = (settings, calledAt, wake, nowMs) =>
  isParticipantAlive(
    assembled.catalog.core,
    restoreSettings(JSON.parse(settings)),
    { calledAt: calledAt || undefined, wake: wake === "reaches" ? "reaches" : "none" },
    nowMs,
  )

// 最後に呼ばれた時刻 calledAt から有効時間が過ぎる時点（ミリ秒。無ければ 0。常駐が、ワークルームの一覧を直す時点を決めるのに読む）
;(
  globalThis as { matomezuParticipantLapsesAt?: (settings: string, calledAt: string) => number }
).matomezuParticipantLapsesAt = (settings, calledAt) =>
  participantLapsesAt(assembled.catalog.core, restoreSettings(JSON.parse(settings)), calledAt || undefined) ?? 0

// 常駐が新しい版を自分で確かめるか（利用者の設定で決まる。常駐が、確かめる前に読む）
;(globalThis as { matomezuUpdateCheck?: (settings: string) => boolean }).matomezuUpdateCheck = settings =>
  updateCheckOn(assembled.catalog.core, restoreSettings(JSON.parse(settings)))

// ほかのホストとつなぐか・ホスト名・利用者名・AI 用ホストリストに載せるこのホストのワークルーム（利用者の設定で決まる。常駐が、ホストどうしの入口を開け閉めする前と、
// AI にワークルームの一覧を答える前に読む。ホスト名は無ければ空）
;(globalThis as { matomezuHostSettings?: (settings: string) => string }).matomezuHostSettings = settings => {
  const s = restoreSettings(JSON.parse(settings))
  return JSON.stringify({
    connect: connectHostsOn(assembled.catalog.core, s),
    name: hostNameOf(assembled.catalog.core, s) ?? "",
    userName: userNameOf(assembled.catalog.core, s),
    listedWorkrooms: listedWorkroomsOf(assembled.catalog.core, s),
  })
}

// 参加を利用者に伝える文（利用者の言語。常駐が、UserPromptSubmit のフックの systemMessage に使う）
;(globalThis as { matomezuJoinedText?: (settings: string, workroom: string) => string }).matomezuJoinedText = (
  settings,
  workroom,
) => joinedText(assembled, settings, workroom)

// ワークルーム（id）が、このホストの管理者のワークルームか（管理者の印が指す。常駐が、同じホストの管理者の AI 間メッセージに利用者の頼みの印を付けるかに読む。読み口を置いている間に呼ぶ）
;(globalThis as { matomezuIsAdminWorkroom?: (workroom: string) => boolean }).matomezuIsAdminWorkroom = workroom =>
  isAdminWorkroom(assembled, workroom)

// ワークルーム（id と名前）に参加している AI のセッションの作業名（利用者の設定が書くのを止めていれば off。常駐が、話しかけとターンの終わりのフックに答える）
// 作業はレコードから決まるので、常駐が読み口を置いている間に呼ぶ
;(
  globalThis as { matomezuWorkTitle?: (settings: string, workroom: string, name: string) => string }
).matomezuWorkTitle = (settings, workroom, name) => workTitle(assembled, settings, workroom, name)

// ワークルームの今の作業が替わったか（常駐が、ターンの終わりに AI のプログラムの部品に答える。before は前のターンの終わりの印）。作業はレコードから決まるので、常駐が読み口を置いている間に呼ぶ
;(
  globalThis as { matomezuWorkShift?: (settings: string, workroom: string, before: string) => string }
).matomezuWorkShift = (settings, workroom, before) => workShift(assembled, settings, workroom, before)

// ワークルームそれぞれの作業の様子（working・idle・unknown。常駐が、ほかのホストに見せるワークルームの一覧に使う）。作業はレコードから決まるので、常駐が読み口を置いている間に呼ぶ
;(globalThis as { matomezuWorkroomActivities?: (workrooms: string) => string }).matomezuWorkroomActivities =
  workrooms => workroomActivities(assembled, workrooms)

// AI のワークルームの作業机（AI の read_folder と参加の文に出す。folders は書庫のフォルダの行の全部〈JSON の並び〉）。作業はレコードから決まるので、常駐が読み口を置いている間に呼ぶ
;(globalThis as { matomezuMyWorkdesk?: (workroom: string, folders: string) => string }).matomezuMyWorkdesk = (
  workroom,
  folders,
) => myWorkdesk(assembled, workroom, folders)

// ビジターとして参加したことを利用者に伝える文（利用者の言語。matomezuJoinedText と同じく、フックの systemMessage に使う）
;(globalThis as { matomezuVisitorJoinedText?: (settings: string) => string }).matomezuVisitorJoinedText = settings =>
  visitorJoinedText(assembled, settings)

// アクションがレコードを対象にするとき、常駐が渡す物: 対象の種類（レコードが対象でなければ null）と、読むだけのブックの id（アクションの readsBooks が引数 args〈JSON〉から答えた物。
// 引数が形に合わなければ空）。常駐が、行う前にどのレコードとブックを渡すかを決めるのに引く
;(globalThis as { matomezuRecordNeeds?: (action: string, args: string) => string }).matomezuRecordNeeds = (
  action,
  args,
) => recordNeedsOf(assembled, action, args)

// アノテーションの並びから、期限（種類の expiresAt）が時点 now より前の物を除く（kept の id の物は除かない。利用者が直している物）。常駐が時間で消す
;(
  globalThis as { matomezuUnexpired?: (list: string, settings: string, now: string, kept: string) => string }
).matomezuUnexpired = (list, settings, now, kept) => unexpiredOf(assembled, list, settings, now, kept)

// 窓が見つけて送ってきた warning（{code, plugin, params} の並び）を、warning の表の 1 行ずつにする（常駐が集めてログと AI に出す）。
// 表に無い番号・形の合わないものは捨てる（窓が作った文は使わない）
;(globalThis as { matomezuWarningLines?: (warnings: string) => string }).matomezuWarningLines = warnings =>
  windowWarningLines(warnings)

// 書庫を今の機能台帳に合わせて整える: 読めない物を読めない物のフォルダへ移し、読めるようになった物を戻す（core/unreadable.ts の settleLibrary。名前は利用者の設定 settings の言語で比べる。移した時刻は now）。
// 常駐が起動したときと機能台帳が変わったときに、置き場所の行の全部 pages・folders で呼ぶ。返すのは、書く行の変わり（engine の Output の pages・folders と同じ形）と、
// 移した物（id と理由の番号）と戻した物の id と、名前に番号を付けた物（id と付けた名前）と、そのあとの warning W032 の 1 行（読めない物が無ければ空）。
// 読めない物のフォルダの行が形に合わなければ broken（何も書かない）
;(
  globalThis as { matomezuSettleLibrary?: (pages: string, folders: string, settings: string, now: string) => string }
).matomezuSettleLibrary = (pages, folders, settings, now) => settleLibraryOf(assembled, pages, folders, settings, now)

// 設定 settings で無効の追加プラグインに加えて ids の追加プラグインも無効にしたら、読めない物のフォルダへ移る物（移す順。書かない）。今の組は替えずに別に組み、
// 常駐が移すときと同じ settleLibrary で決める。読めない物のフォルダの行が形に合わなければ broken
;(
  globalThis as {
    matomezuMovedIfOff?: (ids: string, pages: string, folders: string, settings: string, now: string) => string
  }
).matomezuMovedIfOff = (ids, pages, folders, settings, now) => {
  const off = new Set(JSON.parse(ids) as string[])
  const restored = restoreSettings(JSON.parse(settings))
  for (const id of disabledPluginsOf(
    assembled.catalog.core,
    restored,
    lastAdded.map(p => p.id),
  ))
    off.add(id)
  const catalog = assemble(
    [...BUILTIN, ...lastAdded.map(p => (off.has(p.id) ? withoutParts(p) : p))],
    BUILTIN_CONTROL_CENTER,
  ).catalog.core
  return movedIfOffOf(catalog, pages, folders, restored, now)
}

// 書庫を整えるのに失敗した訳 reason（library.ts の SETTLE_FAILURES の鍵）の warning W033 の 1 行。常駐が、失敗している間だけ持つ
;(globalThis as { matomezuSettleFailed?: (reason: string) => string }).matomezuSettleFailed = reason =>
  settleFailedLine(reason)

// 読めない物のフォルダの直下の物 id を完全に消す行の変わり（core/unreadable.ts の purgedRows）と、そのあとの warning W032 の 1 行。直下に無ければ none
;(globalThis as { matomezuPurgedRows?: (pages: string, folders: string, id: string) => string }).matomezuPurgedRows = (
  pages,
  folders,
  id,
) => purgedRowsOf(pages, folders, id)

// 常駐が呼ぶ口: JSON の文字列で受けて返す
;(globalThis as { matomezuPerform?: (input: string) => string }).matomezuPerform = input =>
  JSON.stringify(perform(assembled, JSON.parse(input) as Input))
