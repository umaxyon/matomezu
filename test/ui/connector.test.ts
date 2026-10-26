import { expect, test } from "bun:test"
import { mergeMarks } from "../../web/src/ui/connector"

const marks = (keep: string[] | null, target: string | null = null) => ({ keep: keep && new Set(keep), target })

test("つなぐものの求めを合わせる: どちらかが薄くする形は薄く、何も求めない側は相手の求めのまま。強調は内側が先", () => {
  expect(mergeMarks(marks(null), marks(null))).toEqual(marks(null))
  expect(mergeMarks(marks(["a", "b"]), marks(null))).toEqual(marks(["a", "b"]))
  expect(mergeMarks(marks(null), marks(["a"], "a"))).toEqual(marks(["a"], "a"))
  expect(mergeMarks(marks(["a", "b"], "b"), marks(["b", "c"], "c"))).toEqual(marks(["b"], "c"))
  expect(mergeMarks(marks(null, "b"), marks(null))).toEqual(marks(null, "b"))
})
