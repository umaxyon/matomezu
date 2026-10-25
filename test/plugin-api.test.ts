// プラグイン API の入口と、テストで組む入口 matomezu/testing が出す名前（値）の一覧。追加プラグインとの約束なので、足す・消すときはここも直して、わざと変えたと分かるようにする
import { expect, test } from "bun:test"
import * as api from "../web/src/plugin-api/index"
import * as ui from "../web/src/plugin-api/ui"
import * as testing from "../web/src/testing"

const names = (m: object) => Object.keys(m).sort()

test("matomezu が出す名前", () => {
  expect(names(api)).toEqual([
    "BookLookSchema",
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
    "z",
  ])
})

test("matomezu/ui が出す名前", () => {
  expect(names(ui)).toEqual(["Confirm", "Dialog", "definePluginUi", "defineWidget", "useCommand", "useT"])
})

test("matomezu/testing が出す名前", () => {
  expect(names(testing)).toEqual([
    "App",
    "BUILTIN",
    "BUILTIN_UI",
    "DEFAULT_LAYOUT",
    "MatomezuProvider",
    "createMatomezu",
    "defineLayout",
  ])
})
