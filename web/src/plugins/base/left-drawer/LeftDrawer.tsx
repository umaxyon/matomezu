// 左ドロワーの入れ物: ステージの列の左に、下の行の上まで被せて出す（ステージの列は狭めない）。上にタブの行と閉じるボタンを置き、
// 中身は、配置がスロットに置いたウィジェットのうち開いているタブの 1 つだけを描く。タブの名前はウィジェットの定義の leftDrawer.title。
// 開いたら中にフォーカスを入れ、Esc は左ドロワーのキーの範囲で閉じる。外を左ボタンで押したら閉じる（ダイアログ・メニュー・トースト・開くボタンを押したときは閉じない）。
// 開いたステージで開いているブックが替わったときも閉じる
import { type ReactNode, useEffect, useRef } from "react"
import { useMessages, useT } from "../../../ui/i18n"
import { useMatomezuState } from "../../../ui/store-context"
import { useUiCatalog } from "../../../ui/view-hooks"
import { kit } from "../kit"
import type { StageSlotProps } from "../workspace/ui"
import { useLeftDrawer, useLeftDrawerTabs, useSetLeftDrawer } from "./hooks"
import styles from "./LeftDrawer.module.css"
import { LEFT_DRAWER } from "./slots"
import { drawerPressCloses } from "./state"

// 押しても左ドロワーを閉じない所（ダイアログ・メニュー・トースト・左ドロワーを開くボタン）
const KEEPS = "[role=dialog], [role=menu], [role=status], [role=alert], [data-left-drawer-opener]"

export function LeftDrawer({ stage }: StageSlotProps) {
  const tab = useLeftDrawer(stage)
  const tabs = useLeftDrawerTabs()
  const open = tab !== null && tabs.includes(tab) ? tab : null
  return open ? <Opened stage={stage} tab={open} tabs={tabs} /> : null
}

function Opened({ stage, tab, tabs }: { stage: string; tab: string; tabs: readonly string[] }) {
  const t = useMessages(kit)
  const tr = useT()
  const ref = useRef<HTMLElement>(null)
  const set = useSetLeftDrawer()
  const widgets = useUiCatalog().widgets
  const book = useMatomezuState(s => s.workspace.stages.find(st => st.id === stage)?.opened?.book ?? null)
  // 開いたら中にフォーカスを入れる（Esc を左ドロワーのキーの範囲で受けるため）
  useEffect(() => {
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus({ preventScroll: true })
  }, [])
  // 開いたときのブックから替わったら閉じる
  const first = useRef(book)
  useEffect(() => {
    if (book !== first.current) set(stage, null)
  }, [book, stage, set])
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target instanceof Element ? e.target : null
      if (!target) return
      const inside = ref.current?.contains(target) ?? false
      if (drawerPressCloses({ button: e.button, inside, kept: !!target.closest(KEEPS) })) set(stage, null)
    }
    document.addEventListener("pointerdown", onPointerDown, true)
    return () => document.removeEventListener("pointerdown", onPointerDown, true)
  }, [stage, set])
  return (
    <aside ref={ref} className={styles.drawer} tabIndex={-1} aria-label={t("Left drawer")} data-key-scope={LEFT_DRAWER}>
      <div className={styles.head}>
        <div className={styles.tabs} role="tablist">
          {tabs.map(id => {
            const title = widgets.get(id)?.leftDrawer?.title
            return (
              <button
                key={id}
                type="button"
                role="tab"
                className={styles.tab}
                aria-selected={id === tab}
                onClick={() => set(stage, id)}
              >
                {title ? tr(title) : id}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          className={styles.close}
          aria-label={t("Close the left drawer")}
          onClick={() => set(stage, null)}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
      <div className={styles.body} role="tabpanel">
        <Content stage={stage} widget={tab} />
      </div>
    </aside>
  )
}

// 開いているタブの中身: 配置が左ドロワーのスロットに置いたウィジェットのうち、開いている 1 つだけを描く
function Content({ stage, widget }: { stage: string; widget: string }) {
  const View = useUiCatalog().widgets.get(widget)?.view as ((props: StageSlotProps) => ReactNode) | undefined
  return View ? <View stage={stage} /> : null
}
