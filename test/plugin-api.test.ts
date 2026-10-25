// プラグイン API の入口（と、アプリを組む側の入口）が出す名前（値）の一覧。外のプラグインとの約束なので、足す・消すときはここも直して、わざと変えたと分かるようにする
import { expect, test } from "bun:test"
import * as app from "../web/src/plugin-api/app"
import * as api from "../web/src/plugin-api/index"
import * as ui from "../web/src/plugin-api/ui"

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
  ])
})

test("matomezu/ui が出す名前", () => {
  expect(names(ui)).toEqual(["Confirm", "Dialog", "definePluginUi", "defineWidget", "useCommand", "useT"])
})

test("matomezu/app が出す名前", () => {
  expect(names(app)).toEqual([
    "App",
    "BUILTIN",
    "BUILTIN_UI",
    "DEFAULT_LAYOUT",
    "MatomezuProvider",
    "SAMPLE_BOOKS",
    "createMatomezu",
    "defineLayout",
  ])
})
