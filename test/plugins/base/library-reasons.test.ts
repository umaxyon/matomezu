// 読めない訳: 番号と無いタイプと入れた追加プラグイン・有効の設定から、形・決まり・無効・無いのどれかを決める
import { expect, test } from "bun:test"
import { NO_TYPE } from "../../../web/src/plugins/base/library/outline"
import { NO_OWNER, reasonOf } from "../../../web/src/plugins/base/library/reasons"

const ADDED = [{ id: "@ex/stamps", title: undefined }]

test("形が合わない（W005・W028）・決まりに合わない（W006・W029）・入れてあるが無効・入っていない（持ち主の分からないタイプも）を分ける", () => {
  expect(reasonOf("W005", NO_TYPE, ADDED, []).word).toBe("shape")
  expect(reasonOf("W028", NO_TYPE, ADDED, []).word).toBe("shape")
  expect(reasonOf("W006", NO_TYPE, ADDED, []).word).toBe("rules")
  expect(reasonOf("W029", NO_TYPE, ADDED, []).word).toBe("rules")
  expect(reasonOf("W027", "@ex/stamps:stamp", ADDED, [])).toEqual({ word: "disabled", plugin: ADDED[0] })
  expect(reasonOf("W027", "@ex/stamps:stamp", ADDED, ["@ex/stamps"])).toEqual({ word: "absent", plugin: "@ex/stamps" })
  expect(reasonOf("W027", "@foo/board:card", ADDED, [])).toEqual({ word: "absent", plugin: "@foo/board" })
  expect(reasonOf("W027", NO_TYPE, ADDED, [])).toEqual({ word: "absent", plugin: NO_OWNER })
})
