// プラグイン API の入口と、テストで組む入口 matomezu/testing が出す名前（値）の一覧と、プラグインに見せるステージ（StageView）とコマンドが受け取る文脈のフィールドの一覧と、base の入口の名前がプラグイン API にもあること。
// 追加プラグインとの約束なので、足す・消すときはここも直して、わざと変えたと分かるようにする
import { expect, test } from "bun:test"
import { newStage } from "../web/src/core/stage"
import { stageView, toolOf } from "../web/src/core/workspace"
import * as api from "../web/src/plugin-entry/index"
import * as ui from "../web/src/plugin-entry/ui"
import * as plugin from "../web/src/plugins/base"
import * as pluginUi from "../web/src/plugins/base/ui"
import { commandContext } from "../web/src/store/commands"
import * as testing from "../web/src/testing"
import { CORE_CATALOG, newStore } from "./support"

const names = (m: object) => Object.keys(m).sort()

test("matomezu が出す名前", () => {
  expect(names(api)).toEqual([
    "AlignSchema",
    "BODY_MAX",
    "BOOK_PAPER_COLOR",
    "BOOK_TEXT_COLORS",
    "BOOK_THEME",
    "CHILD_AREA",
    "EDGE_MAX",
    "EDGE_ZONE",
    "HEX",
    "LEN",
    "NEST_PADDING",
    "PALETTE",
    "PAPER_IDS",
    "PLACE_LINES",
    "TEXT_LOOK",
    "actionsOf",
    "adaptPage",
    "addPageIn",
    "apart",
    "bodyColumn",
    "bodyMinWidth",
    "bodyText",
    "bodyWidthAfter",
    "bookItems",
    "bookType",
    "captionTextWidth",
    "changeWithLock",
    "childOrigin",
    "clampLines",
    "clampRich",
    "commitChildren",
    "connectableShape",
    "connectorSchema",
    "connectorsOf",
    "contentIdMaker",
    "creatableTypes",
    "createBook",
    "createBookIn",
    "defineAction",
    "defineBookType",
    "defineCommand",
    "defineConnector",
    "defineDialog",
    "defineDialogWith",
    "defineMessages",
    "definePaper",
    "definePlugin",
    "definePresentation",
    "defineSetting",
    "defineShape",
    "defineSkin",
    "defineTextColor",
    "defineTheme",
    "edgePanner",
    "edgeScroll",
    "edgeSpeed",
    "elapsedOf",
    "evenGap",
    "extentOf",
    "findShape",
    "fitsPaper",
    "frameAround",
    "frameOf",
    "gapOf",
    "hasPages",
    "inPaper",
    "isLight",
    "isPaletteName",
    "itemSize",
    "keepApart",
    "knownTheme",
    "minSize",
    "newClash",
    "nextItemId",
    "pageContext",
    "pageFieldsWay",
    "pageItemsOf",
    "pagedOf",
    "paperOf",
    "paperSize",
    "parseRich",
    "placeChild",
    "placeItem",
    "placedAt",
    "placedSize",
    "placement",
    "plainOf",
    "pluginKit",
    "portAreasOf",
    "putPage",
    "rectsOf",
    "refusalMessage",
    "removeItems",
    "replaceChild",
    "replacePushing",
    "replaceShape",
    "replaceShapePushing",
    "resizedBy",
    "resolveTokens",
    "richWidth",
    "settingValue",
    "settleChildren",
    "shapeDefOf",
    "shapeDialogs",
    "shapeSchema",
    "shapesOf",
    "shownRects",
    "textBlock",
    "textBlockHeight",
    "textNew",
    "textPatch",
    "textProps",
    "textWidth",
    "themeVar",
    "toData",
    "toPaper",
    "toPaperDelta",
    "tooClose",
    "toolOf",
    "unpinPage",
    "walkShapes",
    "widenForCaption",
    "withPage",
    "withSettings",
    "wrap",
    "wrapRich",
    "z",
  ])
})

test("ビルトインの印（defineBuiltin）は外に出さない（追加プラグインがキーの割り当てでビルトインとして扱われないように）", () => {
  expect("defineBuiltin" in api).toBe(false)
})

test("matomezu/ui が出す名前", () => {
  expect(names(ui)).toEqual([
    "ALIGN_ICONS",
    "ActionButton",
    "Choices",
    "ColorPicker",
    "Confirm",
    "Dialog",
    "Field",
    "Form",
    "InheritChoices",
    "LockToggle",
    "PageProblemsView",
    "PaperFrame",
    "Problem",
    "RichBar",
    "RichBody",
    "RichInput",
    "RichText",
    "STAGE_BASE_SLOTS",
    "Section",
    "SelectButton",
    "ShapeMarksProvider",
    "Slot",
    "Stand",
    "Switch",
    "SwitchPanel",
    "TextBlockView",
    "TokenScope",
    "UserSettings",
    "controlClass",
    "defineLayout",
    "definePluginUi",
    "defineWidget",
    "defineWorkspace",
    "dividerClass",
    "inlineClass",
    "pairClass",
    "rowClass",
    "themeVars",
    "useActions",
    "useAligns",
    "useAllowed",
    "useAnchorRef",
    "useBook",
    "useBookOf",
    "useBookTheme",
    "useCommand",
    "useContextMenu",
    "useCoreCatalog",
    "useDrawnMinimap",
    "useElapsed",
    "useItem",
    "useLatestPan",
    "useLayoutWarnings",
    "useMenu",
    "useMenuCommand",
    "useMessages",
    "usePage",
    "usePageProblems",
    "usePerform",
    "useReadStageState",
    "useResize",
    "useSetStageState",
    "useSettingControls",
    "useSettings",
    "useShapeMarks",
    "useShownBook",
    "useShownPage",
    "useStage",
    "useStagePan",
    "useStageState",
    "useSwatches",
    "useT",
    "useThemeVars",
    "useToPaper",
    "useTokenScope",
    "useUiCatalog",
    "useUserSetting",
    "useZoomMotion",
  ])
})

test("matomezu/testing が出す名前", () => {
  expect(names(testing)).toEqual([
    "BUILTIN",
    "BUILTIN_UI",
    "DEFAULT_LAYOUT",
    "MatomezuProvider",
    "Screen",
    "createMatomezu",
    "defineLayout",
    "placeAdded",
  ])
})

test("プラグインに見せるステージ（StageView）のフィールド", () => {
  expect(names(stageView(CORE_CATALOG, newStage("s1"), null))).toEqual([
    "editing",
    "id",
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
  const stage = state.workspace.stages.find(s => s.id === "s1")!
  const tool = toolOf(store.catalog.core, state.workspace, "s1", state.books)
  expect(commandContext(store.catalog.core, null, state, "s1")?.stage).toEqual(
    stageView(store.catalog.core, stage, tool),
  )
})

test("コマンドが受け取る文脈（CommandContext）のフィールド（ステージの並び・表示領域の大きさなどは渡さない）", () => {
  const store = newStore()
  expect(names(commandContext(store.catalog.core, null, store.state.getState(), "s1")!)).toEqual([
    "book",
    "bookHistory",
    "catalog",
    "contextMenu",
    "dialog",
    "home",
    "settings",
    "stage",
    "toPaper",
  ])
})

test("base の入口が出す名前は、どれもプラグイン API からも出る（ビルトインと追加プラグインが同じ名前を使えるように。base のプラグインそのものは除く）", () => {
  const shown = new Set([...names(api), ...names(ui)])
  const own = ["BASE", "BASE_UI"]
  expect([...names(plugin), ...names(pluginUi)].filter(n => !own.includes(n) && !shown.has(n))).toEqual([])
})
