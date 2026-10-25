// プラグイン API の入口と、テストで組む入口 matomezu/testing が出す名前（値）の一覧。追加プラグインとの約束なので、足す・消すときはここも直して、わざと変えたと分かるようにする
import { expect, test } from "bun:test"
import * as api from "../web/src/plugin-entry/index"
import * as ui from "../web/src/plugin-entry/ui"
import * as testing from "../web/src/testing"

const names = (m: object) => Object.keys(m).sort()

test("matomezu が出す名前", () => {
  expect(names(api)).toEqual([
    "AlignSchema",
    "BODY_MAX",
    "BookLookSchema",
    "HEX",
    "LEN",
    "PALETTE",
    "PLACE_LINES",
    "TEXT_LOOK",
    "actionsOf",
    "apart",
    "bookItems",
    "bookType",
    "captionTextWidth",
    "clampLines",
    "connectableShape",
    "connectorSchema",
    "connectorsOf",
    "creatableTypes",
    "createBook",
    "defineAction",
    "defineBookType",
    "defineCommand",
    "defineConnector",
    "defineDialog",
    "defineDialogWith",
    "defineKeys",
    "defineLanguagePack",
    "defineMessages",
    "definePaper",
    "definePlugin",
    "definePresentation",
    "defineSetting",
    "defineShape",
    "defineSkin",
    "defineTheme",
    "evenGap",
    "fitsPaper",
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
    "pageItemsOf",
    "pagedOf",
    "paperOf",
    "paperSize",
    "placeItem",
    "placedAt",
    "placedSize",
    "placement",
    "putPage",
    "rectsOf",
    "removeItems",
    "replacePushing",
    "resizedBy",
    "resolveTokens",
    "settingValue",
    "shapeDefOf",
    "shapeDialogs",
    "shapeSchema",
    "shapesOf",
    "shownRects",
    "textNew",
    "textPatch",
    "textProps",
    "themeVar",
    "toPaper",
    "toPaperDelta",
    "tooClose",
    "toolOf",
    "widenForCaption",
    "withPage",
    "wrap",
    "z",
  ])
})

test("ビルトインの印（defineBuiltin）は外に出さない（追加プラグインが短い id と頭の検査の抜けを使えないように）", () => {
  expect("defineBuiltin" in api).toBe(false)
})

test("matomezu/ui が出す名前", () => {
  expect(names(ui)).toEqual([
    "Confirm",
    "Dialog",
    "ShapeMarksContext",
    "defineLayout",
    "definePluginUi",
    "defineWidget",
    "themeVars",
    "useActions",
    "useCommand",
    "useContextMenu",
    "useShapeMarks",
    "useT",
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
