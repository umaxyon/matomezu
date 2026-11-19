// Tip と ColorPicker（base）の使い方: Tip は吹き出しを出す側（既定は下、above で上）を data-side に持つ。
// ColorPicker は none を渡したときだけ「なし」を選べ、渡さなければ「なし」を出さず、値が無いときは見本の最初の色を見せる
import { afterEach, expect, test } from "bun:test"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { BUILTIN_CONTROL_CENTER } from "../../../web/src/plugins"
import { ColorPicker } from "../../../web/src/plugins/base/dialog-host/ColorPicker"
import { Tip } from "../../../web/src/plugins/base/utils/Tip"
import { BUILTIN_UI, DEFAULT_LAYOUT } from "../../../web/src/plugins/ui"
import { createMatomezu } from "../../../web/src/store/create"
import { MatomezuProvider } from "../../../web/src/ui/store-context"

afterEach(cleanup)

// ポップアップの文言（None）を引くので、画面の文脈の中に置く
const inContext = (children: React.ReactNode) => {
  const instance = createMatomezu({
    plugins: BUILTIN_UI,
    controlCenter: BUILTIN_CONTROL_CENTER,
    lang: "en",
  })
  return render(
    <MatomezuProvider instance={instance} layout={DEFAULT_LAYOUT}>
      {children}
    </MatomezuProvider>,
  )
}

const palette = [
  { name: "primary", hex: "#3b82f6", label: "Primary" },
  { name: "danger", hex: "#ef4444", label: "Danger" },
]

test("Tip は吹き出しを出す側を data-side に持つ（既定は下）", () => {
  const { container } = render(
    <>
      <Tip text="下">
        <button type="button">a</button>
      </Tip>
      <Tip text="上" side="above">
        <button type="button">b</button>
      </Tip>
    </>,
  )
  expect([...container.querySelectorAll("span[data-side]")].map(e => e.getAttribute("data-side"))).toEqual([
    "below",
    "above",
  ])
})

test("ColorPicker は none を渡したときだけ「なし」を出し、押すと undefined を渡す", () => {
  const picked: (string | undefined)[] = []
  inContext(<ColorPicker label="色" value="primary" palette={palette} none="#cccccc" onChange={v => picked.push(v)} />)
  fireEvent.click(screen.getByRole("button", { name: "色" }))
  fireEvent.click(screen.getByRole("button", { name: "None" }))
  expect(picked).toEqual([undefined])
})

test("ColorPicker は none を渡さなければ「なし」を出さず、値が無いときのボタンは見本の最初の色になる", () => {
  inContext(<ColorPicker label="色" value={undefined} palette={palette} onChange={() => {}} />)
  const button = screen.getByRole("button", { name: "色" })
  expect(button.style.getPropertyValue("--color")).toBe("#3b82f6")
  expect(button.dataset.none).toBe("false") // 「なし」を選べないので、テーマに任せている印（点線の縁）は付けない
  fireEvent.click(button)
  expect(screen.queryByRole("button", { name: "None" })).toBeNull()
  expect(screen.getAllByRole("button").length).toBeGreaterThan(2) // 見本は出ている
})

test("ColorPicker は swatchesOnly なら見本だけを出し（四角・スライダー・値のテキストFormは無い）、見本の色に CSS の変数を使える", () => {
  const picked: (string | undefined)[] = []
  const vars = [
    { name: "primary", hex: "var(--skin-palette-primary)", label: "Primary" },
    { name: "danger", hex: "var(--skin-palette-danger)", label: "Danger" },
  ]
  inContext(<ColorPicker label="色" value="primary" palette={vars} swatchesOnly onChange={v => picked.push(v)} />)
  const button = screen.getByRole("button", { name: "色" })
  expect(button.style.getPropertyValue("--color")).toBe("var(--skin-palette-primary)")
  fireEvent.click(button)
  expect(screen.queryByRole("slider")).toBeNull()
  expect(screen.queryByRole("textbox")).toBeNull()
  fireEvent.click(screen.getByRole("button", { name: "Danger" }))
  expect(picked).toEqual(["danger"])
})
