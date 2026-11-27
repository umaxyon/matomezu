// プラグイン API の入口と、テストで組む入口 matomezu/testing が出す名前（値）の一覧と、プラグインに見せるステージ（StageView）とコマンドの run が受け取る文脈と操作（CommandActions）のフィールドの一覧と、base の入口の名前がプラグイン API にもあること。
// 追加プラグインとの約束なので、足す・消すときはここも直して、わざと変えたと分かるようにする

import { expect, test } from "bun:test"
import type { CSSProperties, ReactElement, ReactNode, RefObject, SyntheticEvent } from "react"
import type { ZodType } from "zod"
import type { ActionId, SlotTable, SubjectId, WidgetTable } from "../web/src/core/catalog"
import type { CoreCatalog } from "../web/src/core/core-catalog"
import type { RecordOf } from "../web/src/core/def/action"
import { NO_CONTROL_CENTER } from "../web/src/core/def/action"
import type { ItemDef } from "../web/src/core/def/item"
import type { PageTypeDef } from "../web/src/core/def/page-type"
import type { PluginStateDef } from "../web/src/core/def/plugin-state"
import type { ThemeDef } from "../web/src/core/def/theme"
import type { ArgsOf, Refused } from "../web/src/core/perform"
import type { ItemPage, PlacedItem } from "../web/src/core/placed"
import type { BinderEntry, Book, LineupEntry, StageLineup } from "../web/src/core/schema/book"
import type { Opened, Placing, StageMode } from "../web/src/core/stage"
import { NO_PAPER, NO_PLACING, NOTHING_OPENED, newStage, shownPageId } from "../web/src/core/stage"
import { NO_TOOL } from "../web/src/core/tools"
import { screenOf } from "../web/src/core/window"
import type { StageView } from "../web/src/core/workspace"
import { stageView, toolOf } from "../web/src/core/workspace"
import * as api from "../web/src/plugin-entry/index"
import * as ui from "../web/src/plugin-entry/ui"
import * as plugin from "../web/src/plugins/base"
import type { MarkdownBlock } from "../web/src/plugins/base/markdown/parse"
import type { PaperPatch } from "../web/src/plugins/base/page-tabs/PaperControls"
import type { PageProblem } from "../web/src/plugins/base/pages/page-problems"
import type { PrintMeasureProps, PrintSheetProps } from "../web/src/plugins/base/print-preview/PrintPreviewView"
import type { Run } from "../web/src/plugins/base/text/rich"
import * as pluginUi from "../web/src/plugins/base/ui"
import { boundActions, windowActionsOf } from "../web/src/store/actions"
import { commandContext, commandDef } from "../web/src/store/commands"
import type { CalledScreen, CommandContext, ScreenCommandContext } from "../web/src/store/commands/def"
import { NO_BOOK, NO_PAGE } from "../web/src/store/commands/def"
import type { OpenedContextMenu } from "../web/src/store/context-menus"
import type { OpenedDialog } from "../web/src/store/dialogs"
import { NO_DIALOG } from "../web/src/store/dialogs"
import * as testing from "../web/src/testing"
import type { ShapeScene } from "../web/src/ui/connector"
import type {
  DialogProps,
  ItemViewProps,
  PresentationViewProps,
  SettingControlProps,
  UserSettingControlProps,
} from "../web/src/ui/plugin"
import { CORE_CATALOG, newStore, pageOf } from "./support"

const names = (m: object) => Object.keys(m).sort()

test("matomezu が出す名前", () => {
  expect(names(api)).toEqual([
    "ANY_PAGE_TYPE",
    "AlignSchema",
    "AnchorsArg",
    "BACKGROUND_PRINT",
    "BODY_MAX",
    "CANNOT_PLACE",
    "CANNOT_RESIZE",
    "CHILD_AREA",
    "ColorSchema",
    "DIAGRAM_THEME_TYPE",
    "DOCUMENT_THEME_TYPE",
    "DRAG_START",
    "EDGE_MAX",
    "EDGE_ZONE",
    "FULL_WIDTH",
    "HEX",
    "HOME_ID",
    "IN_BACKYARD",
    "LEN",
    "LISTED_WORKROOMS",
    "MARKDOWN_DOCUMENT_TOKENS",
    "MARKDOWN_PANE_MODES",
    "MY_WORKDESK",
    "NEST_PADDING",
    "NOTHING_OPENED",
    "NOT_CALLED",
    "NOT_DRAWN",
    "NOT_REQUESTED",
    "NOT_SET",
    "NO_AI_PLACED",
    "NO_AI_UI",
    "NO_ANCHORS",
    "NO_AREA",
    "NO_ASSET_URL",
    "NO_BINDER",
    "NO_BOOK",
    "NO_BRANCH",
    "NO_CATEGORY",
    "NO_CONTROL_CENTER",
    "NO_DIALOG",
    "NO_DIALOG_PREVIEW",
    "NO_DRAFT",
    "NO_EXTENT",
    "NO_FRAME",
    "NO_GROW",
    "NO_HOLDER",
    "NO_ITEM",
    "NO_MODEL",
    "NO_NAME",
    "NO_OCCUPANT",
    "NO_ORIGIN",
    "NO_OUTERMOST",
    "NO_OUTSIDE_BINDER",
    "NO_PAGE",
    "NO_PAGE_TYPE",
    "NO_PAPER",
    "NO_PLACING",
    "NO_PROPS",
    "NO_RECORD",
    "NO_SHAPE_DEF",
    "NO_SHIFT",
    "NO_SIZE",
    "NO_SPOT",
    "NO_STAGE",
    "NO_STATE",
    "NO_TOOL",
    "NO_VIEW_AREA",
    "NO_WORKER_BOOK",
    "NO_WORKROOM",
    "PAGE_ITSELF",
    "PAGE_PAPER_COLOR",
    "PAGE_THEME",
    "PAIRED_HOST_LISTED",
    "PAIRED_HOST_RALLY_LIMIT",
    "PAIRED_HOST_REQUESTS",
    "PALETTE",
    "PAPER_IDS",
    "PLACE_LINES",
    "READS_ADMIN",
    "READS_WORKROOM_KEYS",
    "SOFT_BREAK",
    "ScrapSchema",
    "TEXT_LOOK",
    "TITLE_TAKEN",
    "TRASH_ID",
    "actionsOfPage",
    "adaptPage",
    "addBinder",
    "addPage",
    "addPageIn",
    "adminWorkroom",
    "aiPlacedOf",
    "aiPlacedOfPage",
    "aiUiText",
    "alignPadding",
    "allRectsOf",
    "allowedItems",
    "amongSelected",
    "anchorsOf",
    "apart",
    "areaOf",
    "binderOf",
    "bindersOf",
    "blockBodyHeight",
    "blockBodyLines",
    "blockEmpty",
    "blockLabel",
    "bodyColumn",
    "bodyMinWidth",
    "bodyText",
    "bodyWidthAfter",
    "breakShift",
    "captionTextWidth",
    "changeWithLock",
    "childOrigin",
    "clampLines",
    "clampRich",
    "colorPaint",
    "commitChildren",
    "connectableShape",
    "connectorSchema",
    "connectorsOf",
    "contentIdMaker",
    "createBookIn",
    "defineMessages",
    "definePlugin",
    "drawsMarkdownImage",
    "edgePanner",
    "edgeScroll",
    "edgeSpeed",
    "elapsedOf",
    "endInPlace",
    "enumValuesOf",
    "evenGap",
    "extentOf",
    "findBinder",
    "findPage",
    "findShape",
    "foldersOver",
    "followConnectors",
    "frameAround",
    "frameOf",
    "freeSpotIn",
    "freeTitle",
    "gapOf",
    "growKindOf",
    "growOf",
    "grownArea",
    "hasOpenedPage",
    "inPaper",
    "inPlaceText",
    "isAI",
    "isAdminActor",
    "isLight",
    "isPaletteName",
    "isUser",
    "isVisitor",
    "itemAiPlaced",
    "itemMinimapMarks",
    "itemSize",
    "joinMessages",
    "keepApart",
    "lastAnchor",
    "lineupOf",
    "minSize",
    "moveEntry",
    "newClash",
    "nextItemId",
    "onlySelected",
    "openedPage",
    "pageContext",
    "pageFieldsWay",
    "pageItemsOf",
    "pageType",
    "pagesIn",
    "pagesOf",
    "paperOf",
    "paperSize",
    "parseMarkdown",
    "parseRich",
    "participantCategory",
    "placeChild",
    "placeItem",
    "placedAt",
    "placedSize",
    "placement",
    "plainOf",
    "pluginKit",
    "portAreasOf",
    "printSheetsOf",
    "putBinder",
    "putPage",
    "rectsOf",
    "refusalMessage",
    "removeBinder",
    "removeItems",
    "removePage",
    "renewedIds",
    "replaceChild",
    "replacePushing",
    "replaceShape",
    "replaceShapePushing",
    "resizedBy",
    "resolveTokens",
    "richWidth",
    "roomOf",
    "scrapSize",
    "settingOr",
    "settingValue",
    "settleChildren",
    "shapeDefOf",
    "shapeDialogs",
    "shapeSchema",
    "shapeThemeFits",
    "shapesOf",
    "sheetShapes",
    "sheetsOfShape",
    "shownPageId",
    "shownRects",
    "shownType",
    "siblingsOf",
    "sizedTo",
    "slideIsBackground",
    "slideOf",
    "slideOffsetOf",
    "softBreakOf",
    "splitWords",
    "stagePageId",
    "survivesRenewedIds",
    "textBlock",
    "textBlockHeight",
    "textColorId",
    "textColorRef",
    "textNew",
    "textPatch",
    "textProps",
    "textWidth",
    "themeFits",
    "themeVar",
    "themesFor",
    "tidyPage",
    "toData",
    "toPaper",
    "toPaperDelta",
    "toggledSelection",
    "tooClose",
    "translate",
    "unpinPage",
    "visitorName",
    "walkShapes",
    "widenForCaption",
    "withSettings",
    "wordLinksOf",
    "workroomOfActor",
    "wrap",
    "wrapRich",
    "writesSize",
    "z",
  ])
})

test("matomezu/ui の Stand は角（side の corner）に立てられない（角に出す物はコーナーステータスで出す）", () => {
  type Side = NonNullable<Parameters<typeof ui.Stand>[0]["side"]>
  // @ts-expect-error 角は Stand の side に書けない
  const corner: Side = "corner"
  const edge: Side = "edge"
  expect([String(corner), String(edge)]).toEqual(["corner", "edge"])
})

test("ビルトインの印（defineBuiltin）は外に出さない（追加プラグインがキーバインドでビルトインとして扱われないように）", () => {
  expect("defineBuiltin" in api).toBe(false)
})

test("matomezu/ui が出す名前", () => {
  expect(names(ui)).toEqual([
    "ALIGN_ICONS",
    "ANNOTATION_ICON",
    "ActionButton",
    "AdminCrown",
    "AtCorner",
    "BOOKMARKS",
    "BOOK_SCREEN",
    "BY_KEY",
    "Band",
    "BirdFaceView",
    "BirdWalk",
    "BodyField",
    "BookIcon",
    "BookOpenIcon",
    "CORNER_STATUSES",
    "CaptionField",
    "ChevronIcon",
    "ChoiceBubble",
    "ChoiceSetting",
    "ChoiceText",
    "Choices",
    "ColorPicker",
    "Confirm",
    "CrownIcon",
    "Dialog",
    "DividerField",
    "Elapsed",
    "Field",
    "FolderIcon",
    "FolderOpenIcon",
    "Form",
    "GearIcon",
    "GhostArea",
    "HelpButton",
    "IconButton",
    "InheritChoices",
    "KEEP_ALL",
    "KEEP_DRAWN",
    "KindSlot",
    "LEFT_SIDE_PANEL",
    "LETTER_ICON",
    "LIBRARY_CONTEXT_MENUS",
    "LeftSidePanelOpenButton",
    "LibraryView",
    "LineIcon",
    "LockToggle",
    "MAIL_ACTIONS",
    "MARKDOWN_PANE_MODE_ICONS",
    "MailboxView",
    "MarkdownDocumentView",
    "MaxButton",
    "MultiChoices",
    "NOT_ASKED",
    "NOT_AWAY",
    "NOT_CHECKED",
    "NOT_COMPOSING",
    "NOT_FAILED",
    "NOT_MEASURED",
    "NOT_PRESSED",
    "NOT_TOLD",
    "NO_CHOICE",
    "NO_COLOR",
    "NO_FOLDER",
    "NO_HELP",
    "NO_HOST_PEERS",
    "NO_HOST_STATUS",
    "NO_HOVER",
    "NO_KIND",
    "NO_KIND_VIEW",
    "NO_LATEST",
    "NO_LEFT_SIDE_PANEL",
    "NO_LINEUP",
    "NO_MARQUEE",
    "NO_MENU_COMMAND",
    "NO_MOTION",
    "NO_PAIRING",
    "NO_PERMISSION",
    "NO_POINT",
    "NO_PORT",
    "NO_RIGHT_SIDE_PANEL",
    "NO_SCREEN",
    "NO_SWATCHES",
    "NO_TARGET",
    "NO_THEME",
    "NO_UPDATE_STATUS",
    "NO_WRITING",
    "Notice",
    "PAN_NOT_WATCHED",
    "PageProblemsView",
    "PageSettingsDialogView",
    "Panel",
    "PaperFrame",
    "PendingBalloon",
    "Problem",
    "RIGHT_SIDE_PANEL",
    "RichBar",
    "RichBody",
    "RichInput",
    "RichText",
    "SCREEN_FOOTER",
    "SEARCH_CURRENT_HIGHLIGHT",
    "SEARCH_HIGHLIGHT",
    "SEPARATOR",
    "STAGE_BASE_SLOTS",
    "ScrapForm",
    "ScrapView",
    "ScreenView",
    "Section",
    "SelectButton",
    "SettingRow",
    "ShapeMarksProvider",
    "SideTabs",
    "Slot",
    "SplitHandle",
    "Stand",
    "Switch",
    "SwitchPanel",
    "TextAround",
    "TextBlockView",
    "TextSettingControl",
    "Tip",
    "TitledArea",
    "TokenScope",
    "UserSettings",
    "VisitorIcon",
    "WIDE_SEARCH_LIMIT_MAX",
    "WIDE_SEARCH_MODES",
    "WIDE_SEARCH_OPENERS",
    "WIDE_SEARCH_OPENS",
    "WorkerBookPages",
    "belowOf",
    "controlClass",
    "defineAnnotationIcon",
    "defineBookmarks",
    "defineCornerStatus",
    "defineLayout",
    "defineLeftSidePanelTab",
    "defineMailActions",
    "definePluginUi",
    "defineSettingsCategory",
    "defineWideSearchMode",
    "defineWideSearchOpener",
    "defineWidget",
    "defineWorkspace",
    "dividerClass",
    "highlightCode",
    "inlineClass",
    "markdownDocumentOnSkin",
    "modPressed",
    "opensOf",
    "pairClass",
    "rowClass",
    "tabEntry",
    "themeVars",
    "useActions",
    "useAligns",
    "useAliveNow",
    "useAllowed",
    "useAllowedOn",
    "useAnchorRef",
    "useAnchorShapeRef",
    "useArrangedScreens",
    "useArrivalMarquee",
    "useAskHosts",
    "useAssetUrl",
    "useAtCornerBubble",
    "useBodyGrips",
    "useBook",
    "useBookOpenChoice",
    "useBrowserBack",
    "useClickOrDouble",
    "useCloseLeftSidePanel",
    "useCloseRightSidePanel",
    "useCommand",
    "useContextMenu",
    "useControlCenterMaximize",
    "useControlCenterMaximized",
    "useCopyText",
    "useCoreCatalog",
    "useCreatePageAsking",
    "useDrawnMinimap",
    "useEditLock",
    "useElapsed",
    "useEndWhenBlocked",
    "useFolderEntries",
    "useFollowsSelection",
    "useHighlightRanges",
    "useHostPeers",
    "useHostStatus",
    "useImportAsset",
    "useInPlaceInput",
    "useItem",
    "useKindView",
    "useLatestPan",
    "useLayoutWarnings",
    "useLeftSidePanel",
    "useMailboxScreen",
    "useMarkdownDocument",
    "useMatomezuCommand",
    "useMenu",
    "useMenuCommand",
    "useMessages",
    "useNewPage",
    "useOpenDialogInRecentStage",
    "useOpenLeftSidePanel",
    "useOpenRightSidePanel",
    "useOpenSettings",
    "useOutermostOf",
    "useOutsideBinder",
    "useOwnBookPages",
    "usePage",
    "usePageById",
    "usePageProblems",
    "usePageTheme",
    "usePageThemes",
    "usePaperControls",
    "usePaperDrag",
    "usePerform",
    "usePluginState",
    "usePrintHold",
    "useReadPluginState",
    "useRecord",
    "useRecordEditLock",
    "useRecords",
    "useReplaceHistory",
    "useResetPluginState",
    "useResize",
    "useRevealable",
    "useRightSidePanel",
    "useRowSlide",
    "useScreen",
    "useScreenArrangement",
    "useScreenHere",
    "useScreenSplit",
    "useScreens",
    "useSearchHits",
    "useSearchPick",
    "useSetPluginState",
    "useSetPluginStateById",
    "useSetPluginStates",
    "useSetRightSidePanelCurrent",
    "useSettingControls",
    "useSettings",
    "useShapeMarks",
    "useShowBook",
    "useShowBookmarks",
    "useShowControlCenter",
    "useShownBook",
    "useShownPage",
    "useStage",
    "useStageArea",
    "useStagePan",
    "useStandAway",
    "useSwatches",
    "useT",
    "useThemeVars",
    "useToPaper",
    "useTokenScope",
    "useUiCatalog",
    "useUpdatePluginState",
    "useUpdateStatus",
    "useUserName",
    "useUserSetting",
    "useVisitorRows",
    "useWideSearch",
    "useWideSearchPanel",
    "useWindowTitle",
    "useWorkerBook",
    "useWorkroomActions",
    "useWorkroomRows",
    "useWorkroomWorkerBook",
    "useZoomMotion",
  ])
})

test("matomezu/testing が出す名前", () => {
  expect(names(testing)).toEqual([
    "BUILTIN",
    "BUILTIN_CONTROL_CENTER",
    "BUILTIN_UI",
    "DEFAULT_LAYOUT",
    "MatomezuProvider",
    "WINDOW_PLACE",
    "WindowRoot",
    "createMatomezu",
    "defineLayout",
    "openedIn",
    "placeAdded",
    "stagePlacesOf",
    "withStagePlaces",
  ])
})

// 型 T（ユニオンなら、そのどれか）の、任意のフィールド（?:）と、値の型に null か undefined を含むフィールドの名前（値が unknown のフィールドは、渡す値の形を決めないので除く。
// React が描く物 ReactNode のフィールドも、描かない null は無いことの値ではないので除く）
type NoneKeys<T> = T extends unknown
  ? {
      [K in keyof T]-?: string extends K
        ? never
        : {} extends Pick<T, K>
          ? K
          : unknown extends T[K]
            ? never
            : ReactNode extends T[K]
              ? never
              : null extends T[K]
                ? K
                : undefined extends T[K]
                  ? K
                  : never
    }[keyof T]
  : never
// 型 T のどのフィールドも、無いことを null・undefined・任意のフィールドで表していなければ true（していれば、そのフィールドの名前の型になり、true を置けない）
type NoneFree<T> = [NoneKeys<T>] extends [never] ? true : NoneKeys<T>

// コマンドの文脈と、プラグインに見せるステージ（と、その中のステージの物）のフィールドは、無いことを名前の付いた定数で表す（型の確かめ。違えば typecheck が通らない）
const noneFree: readonly true[] = [
  true satisfies NoneFree<ScreenCommandContext>,
  true satisfies NoneFree<CommandContext>,
  true satisfies NoneFree<CalledScreen>,
  true satisfies NoneFree<OpenedDialog>,
  true satisfies NoneFree<OpenedContextMenu>,
  true satisfies NoneFree<StageView>,
  true satisfies NoneFree<Opened>,
  true satisfies NoneFree<StageMode>,
  true satisfies NoneFree<Placing>,
]

// 値 v の中（配列・オブジェクトをたどる。関数と、ブック・台帳など、たどらない物 skip は除く）に null か undefined があれば、その所の名前
function noneAt(v: unknown, at: string, skip: ReadonlySet<unknown>): string[] {
  if (v === null || v === undefined) return [at]
  if (typeof v !== "object" || skip.has(v)) return []
  return Object.entries(v).flatMap(([k, x]) => noneAt(x, `${at}.${k}`, skip))
}

test("コマンドの文脈とプラグインに見せるステージのフィールドは、null・undefined・任意のフィールドにしない（無いことは名前の付いた定数）", () => {
  expect(noneFree.length).toBe(9)
  for (const books of [undefined, []] as const) {
    const store = newStore(books === undefined ? {} : { books })
    const state = store.state.getState()
    const ctx = commandContext(store.catalog.core, NO_CONTROL_CENTER, state, "s1", "@matomezu/base:stage-split")!
    // ブック・ページ・台帳・設定・フォルダの表は、プラグインのデータの形（任意のフィールドを持つ）なので、たどらない
    const skip = new Set<unknown>([ctx.catalog, ctx.book, ctx.page, ctx.outsideBinder, ctx.settings, ctx.folders])
    expect(noneAt(ctx, "ctx", skip)).toEqual([])
  }
})

// プラグイン API の関数とフックが返す値と、プラグインのコンポーネントに渡る値も、無いこと・できないことを名前の付いた定数で表す（型の確かめ。違えば typecheck が通らず、名前が出る）。
// 返す値は、Promise と並びはその中を、オブジェクトはフィールドと、関数のフィールド（メソッド）の返す値を 2 段目まで見る。除くのは次の物:
// - 定義を作る関数（define…・kit の plugin・pageFieldsWay・pluginKit の作る kit の define… と plugin）: 返すのはプラグインが書く定義で、任意のフィールドを持つ
// - プラグイン API が出すコンポーネント（名前が大文字で始まる）: 受け取る props は、プラグインが渡す値
// - 返す値のうち、プラグインのデータの形（ブック・ページ・アイテム・レコード・文字の並び）と定義（タイプ・テーマ・アイテムの定義）と、
//   CSS の値・zod の形・台帳・マークダウンを読んだ形・ページのタイプが知らせる問題・紙の変えた項目: どれも任意のフィールドを、データや定義の形として持つ
// - アクションの断り（Refused）と引数: AI にも同じ形の JSON で渡す結果と引数の形
// - 決まった形の入れ物（Map・Set）: get などが undefined を返すのは JavaScript の決まり
// - React の要素を返す関数（コンポーネント）: 描かない null は無いことの値ではない
type Fn = (...args: never[]) => unknown
type DataShape =
  | Book
  | LineupEntry
  | BinderEntry
  | ItemPage
  | PlacedItem
  | Run
  | RecordOf<SubjectId>
  | ItemDef
  | PageTypeDef
  | ThemeDef
  | CSSProperties
  | ZodType
  | CoreCatalog
  | StageLineup
  | ArgsOf<ActionId>
  | MarkdownBlock
  | PageProblem
  | PaperPatch
  | Refused
  | ReadonlyMap<unknown, unknown>
  | ReadonlySet<unknown>
type Unwrapped<R> = R extends Promise<infer X> ? Unwrapped<X> : R extends readonly (infer E)[] ? Unwrapped<E> : R
// 返す値そのものが null か undefined を含めば、その印（何も返さない void は除く）
// biome-ignore lint/suspicious/noConfusingVoidType: 何も返さない関数の返す型 void を見分ける
type NoneReturn<R> = [R] extends [void] ? never : [Extract<R, ReactElement>] extends [never] ? NoneValue<R> : never
type NoneValue<R> = unknown extends R ? never : null extends R ? "(null)" : undefined extends R ? "(undefined)" : never
type Plain = string | number | boolean | symbol | bigint | null | undefined | ReactElement
// 値 X（ユニオンなら、そのどれか）の、段の数 D まで（D は長さで数える）の、決まりに合わない所の名前: オブジェクトはその NoneKeys と、
// フィールドの中（オブジェクトのフィールドは 1 段下、関数のフィールドは返す値を 1 段下）。データの形・プリミティブは見ない
type Deep<X, D extends readonly unknown[]> = D extends readonly [unknown, ...infer Rest extends unknown[]]
  ? X extends DataShape | Plain
    ? never
    : X extends readonly (infer E)[]
      ? Deep<E, D>
      : X extends Fn
        ? never
        : NoneKeys<X> | FieldsDeep<X, Rest>
  : never
type FieldsDeep<X, D extends readonly unknown[]> = D extends readonly []
  ? never
  : {
      [K in keyof X]-?: string extends K
        ? never
        : K extends `define${string}` | "plugin"
          ? never
          : unknown extends X[K]
            ? never
            : ReactNode extends X[K]
              ? never
              : Inside<`${K & string}`, Exclude<X[K], null | undefined>, D>
    }[keyof X]
// フィールド K の値 V の中の、決まりに合わない所の名前（関数は返す値を見て K() と書く）
type Inside<K extends string, V, D extends readonly unknown[]> = V extends Fn
  ? Named<`${K}()`, ReturnNone<V, D>>
  : Named<K, Deep<V, D>>
type Named<K extends string, N> = [N] extends [never] ? never : `${K}.${N & string}`
type ReturnNone<F, D extends readonly unknown[] = [1, 1]> = F extends (...args: never[]) => infer R
  ? NoneReturn<Unwrapped<R>> | Deep<Unwrapped<R>, D>
  : never
// 型 T の、2 段目までの決まりに合わない所が無ければ true（あれば、その名前の型になり、true を置けない）
type DeepFree<T> = [Deep<T, [1, 1]>] extends [never] ? true : Deep<T, [1, 1]>
type Component<K> = K extends `${infer C}${string}` ? (C extends Lowercase<C> ? false : true) : false
// 入口 M の、確かめる関数とフック（名前 → 当たったフィールドの名前）
type Checked<M> = {
  [K in keyof M as K extends `define${string}` | "pageFieldsWay" | "pluginKit"
    ? never
    : Component<K> extends true
      ? never
      : M[K] extends Fn
        ? K
        : never]: ReturnNone<M[K]>
}
// 入口 M の、決まりに合わない関数とフックの名前
type ReturnOffenders<M> = {
  [K in keyof Checked<M>]: [Checked<M>[K]] extends [never] ? never : K
}[keyof Checked<M>]
type Offenders<M> = [ReturnOffenders<M>] extends [never] ? true : `${ReturnOffenders<M> & string}`
// プラグインが API の関数とフックに渡す値（引数）も、無いことを null・undefined で表さない。省ける引数（x?: T）と省けるフィールドは、省けばよい。
// 見るのは、引数の型と、オブジェクトの引数の 1 段目のフィールドと、引数に渡す関数（replaceShape の f など）の返す値と、その関数を API が呼ぶときに渡す値（onChange の値・updater の now など）。
// 除くのは、返す値と同じく、定義を作る関数と、データの形・定義の形と、外のライブラリの型（CSS モジュール・zod）
type ArgNone<V> = unknown extends V
  ? never
  : null extends V
    ? "(null)"
    : undefined extends V
      ? "(undefined)"
      : V extends Fn
        ? Named<"()", ReturnNoneOnly<V>> | CallbackParamsNone<V>
        : V extends DataShape | Plain | readonly unknown[] | Element | RefObject<unknown> | Date
          ? never
          : ArgFields<V>
// 引数に渡す関数 F（onChange・updater の now・replaceShape の f など）を、API が呼ぶときに渡す値の、決まりに合わない所の名前（(0) は 1 番目の引数）。
// 渡す値そのものが null・undefined を含むか、オブジェクトなら 1 段目のフィールドが null・undefined・任意のフィールドか。データの形・定義の形（プラグイン状態の宣言も）・DOM と React のイベント・Date は見ない
type CallbackParamsNone<F> = F extends (...args: infer P) => unknown
  ? { [I in keyof P]-?: Named<`(${I & string})`, CallbackValueNone<P[I]>> }[number]
  : never
type CallbackValueNone<V> = unknown extends V
  ? never
  : null extends V
    ? "(null)"
    : undefined extends V
      ? "(undefined)"
      : V extends
            | DataShape
            | Plain
            | readonly unknown[]
            | Fn
            | Element
            | Event
            | SyntheticEvent
            | Date
            | PluginStateDef<unknown>
        ? never
        : NoneKeys<V>
type ReturnNoneOnly<F> = F extends (...args: never[]) => infer R ? NoneReturn<Unwrapped<R>> : never
// オブジェクトの引数 V の、省けないのに null・undefined を含むフィールドと、関数のフィールドの返す値の名前
type ArgFields<V> = {
  [K in keyof V]-?: string extends K
    ? never
    : K extends `define${string}` | "plugin"
      ? never
      : unknown extends V[K]
        ? never
        : ReactNode extends V[K]
          ? never
          : Exclude<V[K], undefined> extends Fn
            ?
                | Named<`${K & string}()`, ReturnNoneOnly<Exclude<V[K], undefined>>>
                | Named<K & string, CallbackParamsNone<Exclude<V[K], undefined>>>
            : // biome-ignore lint/complexity/noBannedTypes: 省けるフィールドかを、空のオブジェクトの型 {} で見分ける
              {} extends Pick<V, K>
              ? never
              : null extends V[K]
                ? K
                : undefined extends V[K]
                  ? K
                  : never
}[keyof V]
// 関数 F の引数の、決まりに合わない所の名前（何番目の引数か）
type ParamsNone<F> = F extends (...args: infer P) => unknown
  ? {
      // biome-ignore lint/complexity/noBannedTypes: 省ける引数かを、空のオブジェクトの型 {} で見分ける
      [I in keyof P]-?: Named<I & string, ArgNone<{} extends Pick<P, I> ? Exclude<P[I], undefined> : P[I]>>
    }[number]
  : never
type ArgsChecked<M> = {
  [K in keyof M as K extends `define${string}` | "pageFieldsWay" | "pluginKit"
    ? never
    : M[K] extends Fn
      ? K
      : never]: ParamsNone<M[K]>
}
type ArgOffenders<M> = {
  [K in keyof ArgsChecked<M>]: [ArgsChecked<M>[K]] extends [never] ? never : K
}[keyof ArgsChecked<M>]
type ArgsFree<M> = [ArgOffenders<M>] extends [never] ? true : `${ArgOffenders<M> & string}`
const argsNoneFree: readonly true[] = [true satisfies ArgsFree<typeof api>, true satisfies ArgsFree<typeof ui>]

// 土台と base が、プラグインのコンポーネント（定義の view・control など）に渡す値
type SlotPropsOf = SlotTable[keyof SlotTable]
type WidgetPropsOf = {
  [W in keyof WidgetTable]: WidgetTable[W] extends { view: (props: infer P) => unknown } ? P : never
}[keyof WidgetTable]
const returnsNoneFree: readonly true[] = [
  true satisfies Offenders<typeof api>,
  true satisfies Offenders<typeof ui>,
  true satisfies DeepFree<UserSettingControlProps>,
  true satisfies DeepFree<SettingControlProps>,
  true satisfies DeepFree<DialogProps<unknown>>,
  true satisfies DeepFree<ItemViewProps<unknown, unknown>>,
  true satisfies DeepFree<PresentationViewProps>,
  true satisfies DeepFree<ShapeScene>,
  true satisfies DeepFree<PrintSheetProps>,
  true satisfies DeepFree<PrintMeasureProps>,
  true satisfies DeepFree<SlotPropsOf>,
  true satisfies DeepFree<WidgetPropsOf>,
]

// 土台と base が、プラグインのコンポーネントを受ける定義のフィールドの、渡す値の型（ComponentType<…> に書く型）。足したら、上の確かめにも足す
const COMPONENT_PROPS_FILES = [
  "web/src/ui/plugin.ts",
  "web/src/ui/connector.ts",
  "web/src/plugins/base/print-preview/PrintPreviewView.tsx",
]
test("プラグイン API の関数とフックが返す値と、プラグインのコンポーネントに渡る値は、null・undefined・任意のフィールドにしない", async () => {
  expect(returnsNoneFree.length).toBe(12)
  expect(argsNoneFree.length).toBe(2)
  const given = new Set<string>()
  for (const file of COMPONENT_PROPS_FILES)
    for (const m of (await Bun.file(file).text()).matchAll(/ComponentType<([A-Za-z]+)/g)) given.add(m[1] as string)
  expect([...given].sort()).toEqual([
    "DialogProps",
    "ItemViewProps",
    "PresentationViewProps",
    "PrintMeasureProps",
    "PrintSheetProps",
    "SettingControlProps",
    "UserSettingControlProps",
  ])
})

test("プラグインに見せるステージ（StageView）のフィールド", () => {
  expect(names(stageView(CORE_CATALOG, newStage("s1"), null))).toEqual([
    "editing",
    "edits",
    "mode",
    "opened",
    "pans",
    "placing",
    "selection",
    "tool",
    "zoom",
  ])
})

test("コマンドに見せるステージは、プラグインに見せるステージと同じ物", () => {
  const store = newStore()
  const state = store.state.getState()
  const stage = screenOf(state.window).stages.find(s => s.id === "s1")!
  const tool = toolOf(store.catalog.core, screenOf(state.window), "s1", state)
  expect(
    commandContext(store.catalog.core, NO_CONTROL_CENTER, state, "s1", "@matomezu/base:stage-split")?.stage,
  ).toEqual(stageView(store.catalog.core, stage, tool))
})

test("コマンドが受け取る文脈（CommandContext）のフィールド（ステージの並び・表示領域の大きさなどは渡さない）", () => {
  const store = newStore()
  expect(
    names(
      commandContext(
        store.catalog.core,
        NO_CONTROL_CENTER,
        store.state.getState(),
        "s1",
        "@matomezu/base:stage-split",
      )!,
    ),
  ).toEqual([
    "annotations",
    "arrangement",
    "book",
    "catalog",
    "contextMenuOpen",
    "controlCenter",
    "dialog",
    "folders",
    "history",
    "libraryHistory",
    "outsideBinder",
    "page",
    "pageTitle",
    "pluginState",
    "read",
    "screen",
    "settings",
    "stage",
    "toPaper",
  ])
})

test("コマンドの文脈の page は、開いているページ（ブックの並びの中のページと同じ物）", () => {
  const state = newStore().state.getState()
  const ctx = commandContext(CORE_CATALOG, NO_CONTROL_CENTER, state, "s1", "@matomezu/base:stage-split")!
  const page = shownPageId(ctx.stage.opened)
  expect(page).not.toBe(NO_PAGE)
  expect(ctx.book).not.toBe(NO_BOOK)
  expect(ctx.page).toBe(pageOf(ctx.book as Book, page))
})

test("何も開いていないステージのコマンドの文脈は、開いている物・置こうとしている物・道具・book・page・ダイアログ・右クリックのメニューも none", () => {
  const ctx = commandContext(
    CORE_CATALOG,
    NO_CONTROL_CENTER,
    newStore({ books: [] }).state.getState(),
    "s1",
    "@matomezu/base:stage-split",
  )!
  expect(ctx.stage.opened).toBe(NOTHING_OPENED)
  expect([ctx.stage.placing, ctx.stage.tool]).toEqual([NO_PLACING, NO_TOOL])
  expect([ctx.book, ctx.page]).toEqual([NO_BOOK, NO_PAGE])
  expect([ctx.dialog, ctx.contextMenuOpen]).toEqual([NO_DIALOG, false])
  expect(ctx.controlCenter).toBe(NO_CONTROL_CENTER)
  expect(ctx.toPaper({ x: 0, y: 0 })).toBe(NO_PAPER)
})

test("コマンドの run が受け取る操作（CommandActions）は、useActions の操作と、自分のプラグイン状態を変える updatePluginState・resetPluginState（インスタンスだけが持つ receive・locate・setOffline・setLastWindow・setCanGoBack・setPluginState・setPluginStates は渡さない）", () => {
  const store = newStore()
  const def = commandDef(store, "@matomezu/base:mark-new")
  const run = def.run
  let got: object = {}
  def.run = ((_ctx: unknown, actions: object) => {
    got = actions
  }) as typeof def.run
  try {
    store.actions.command("s1", "@matomezu/base:mark-new" as never, "x" as never)
  } finally {
    def.run = run
  }
  expect(names(got)).toEqual([
    "closeContextMenu",
    "closeDialog",
    "closePicker",
    "closePrintPreview",
    "closeScreen",
    "closeStage",
    "command",
    "continueStep",
    "dismissToast",
    "dropHistory",
    "endBackground",
    "evenDivider",
    "focusStage",
    "moveDivider",
    "moveHistory",
    "openBinder",
    "openBook",
    "openContextMenu",
    "openDialog",
    "openPage",
    "openPageById",
    "openPicker",
    "openPrintPreview",
    "openReference",
    "openScreen",
    "panStageBy",
    "perform",
    "performConfirmed",
    "pressKey",
    "previewDialog",
    "replaceHistory",
    "requestBack",
    "requestPrint",
    "resetPluginState",
    "resetStageView",
    "resizeStage",
    "select",
    "setEditing",
    "setPreviewArea",
    "setReferenceArea",
    "setScreenArrangement",
    "setScreenProps",
    "setStageArea",
    "setStageStart",
    "setTool",
    "showBook",
    "showToast",
    "split",
    "startBackground",
    "stopPlacing",
    "submitDialog",
    "togglePlacing",
    "unsplit",
    "updatePluginState",
    "zoomStage",
  ])
  // useActions の操作は、そこから updatePluginState と resetPluginState を除いた物（store の素の操作のうち、ほかのスクリーン・ステージを名指す FrameActions と、
  // 行わずに確かめる ProbeActions は渡さない）
  const given = { ...windowActionsOf(store.actions), ...boundActions(store.actions, "s1") }
  expect(names(given)).toEqual(names(got).filter(n => n !== "updatePluginState" && n !== "resetPluginState"))
  expect(names(store.actions).filter(n => !names(given).includes(n))).toEqual([
    "makeScreenCurrent",
    "openOutsideBinder",
    "openOutsidePage",
    "openScreenId",
    "openToStage",
    "showBookStage",
    "showOutsideBinderStage",
    "showOutsidePageStage",
    "showStage",
    "splitStage",
    "tryPerform",
  ])
})

test("base の入口が出す名前は、どれもプラグイン API からも出る（ビルトインと追加プラグインが同じ名前を使えるように。base のプラグインそのものは除く）", () => {
  const shown = new Set([...names(api), ...names(ui)])
  // base のプラグインそのものと、ホストのエンジンだけが読む名前（プラグイン API には出さない）
  const own = [
    "BASE",
    "BASE_UI",
    "JOINED_MESSAGE",
    "VISITOR_JOINED_MESSAGE",
    "workTitleIn",
    "workShiftIn",
    "myWorkdeskIn",
    "workroomActivitiesFrom",
  ]
  expect([...names(plugin), ...names(pluginUi)].filter(n => !own.includes(n) && !shown.has(n))).toEqual([])
})
