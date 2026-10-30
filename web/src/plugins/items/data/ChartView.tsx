// グラフのビュー: 棒・折れ線（cartesian.ts）・円（pie.ts）・散布図（scatter.ts）を、計算した寸法のとおりに SVG で描く。
// 系列の色はテーマキー data-series-1〜8、軸と凡例の文字は data-axis、目盛りの線は data-grid。文字は系列の色で塗らない。
// 棒・扇・点にポインタを乗せると、その値を小さな吹き出しで出す。軸が足りない・円にできない値のときは、真ん中に理由を出す
import { type PointerEvent, type ReactNode, useState } from "react"
import type { Size } from "../../../plugin-api"
import { useMessages } from "../../../plugin-api/ui"
import styles from "./ChartView.module.css"
import { barPath, type CartesianLayout, CHART_LOOK, cartesianLayout } from "./cartesian"
import type { DataProps } from "./data"
import { kit } from "./kit"
import { type PieLayout, pieLayout } from "./pie"
import { type ScatterLayout, scatterLayout } from "./scatter"
import type { Table } from "./table"
import { cartesianTip, pieTip, scatterTip, seriesNames, type TipContent } from "./tips"

const L = CHART_LOOK
// グラフの名前（読み上げ）
const CHART_TITLES = {
  table: "Table",
  bar: "Bar chart",
  line: "Line chart",
  pie: "Pie chart",
  scatter: "Scatter chart",
} as const
const color = (i: number) => `var(--data-series-${(i % 8) + 1})`

// 吹き出し: ポインタの所（枠の左上からの px）に、見出しと、色の印・名前・値の行
interface Tip extends TipContent {
  x: number
  y: number
}

export function ChartView({ table, props, size }: { table: Table; props: DataProps; size: Size }) {
  const t = useMessages(kit)
  const [tip, setTip] = useState<Tip | null>(null)
  const hover = (e: PointerEvent, next: TipContent) => {
    const box = e.currentTarget.closest("svg")?.getBoundingClientRect()
    if (!box) return
    // 画面の倍率で縮んでいても、枠の上の px にする
    const scale = box.width / size.w
    setTip({ ...next, x: (e.clientX - box.left) / scale, y: (e.clientY - box.top) / scale })
  }
  const leave = () => setTip(null)
  let body: ReactNode
  if (props.view === "pie") {
    const pie = pieLayout(table, props, size, t("Other"))
    if (pie && !pie.ok)
      return <Notice>{t(pie.problem === "negative" ? "Pie cannot show negative values" : "All values are 0")}</Notice>
    body = pie ? <PieChart pie={pie} hover={hover} leave={leave} /> : null
  } else if (props.view === "scatter") {
    const sc = scatterLayout(table, props, size)
    body = sc ? <ScatterChart sc={sc} hover={hover} leave={leave} /> : null
  } else {
    const c = cartesianLayout(table, props, size)
    body = c ? <CartesianChart c={c} names={seriesNames(table, props)} hover={hover} leave={leave} /> : null
  }
  if (!body) return <Notice>{t("Choose the axes")}</Notice>
  return (
    <div className={styles.chart}>
      <svg
        className={styles.svg}
        width={size.w}
        height={size.h}
        viewBox={`0 0 ${size.w} ${size.h}`}
        role="img"
        aria-label={t(CHART_TITLES[props.view])}
      >
        {body}
      </svg>
      {tip && (
        <div className={styles.tip} style={{ left: tip.x + 10, top: tip.y + 10 }} role="tooltip">
          <div className={styles.tipTitle}>{tip.title}</div>
          {tip.lines.map(l => (
            <div key={l.name} className={styles.tipLine}>
              {l.color !== undefined && <span className={styles.tipKey} style={{ background: color(l.color) }} />}
              <span>{l.name}</span>
              <span className={styles.tipValue}>{l.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <div className={styles.notice} data-notice>
      {children}
    </div>
  )
}

type Hover = (e: PointerEvent, tip: TipContent) => void

function Legend({
  items,
}: {
  items: readonly { series?: number; color?: number; name?: string; text?: string; x: number; y: number }[]
}) {
  return (
    <g data-legend>
      {items.map(item => (
        <g key={`${item.x},${item.y}`}>
          <rect
            x={item.x}
            y={item.y + (L.legend - L.swatch) / 2}
            width={L.swatch}
            height={L.swatch}
            rx={2}
            fill={color(item.series ?? item.color ?? 0)}
          />
          <text className={styles.text} x={item.x + L.swatch + 4} y={item.y + L.legend / 2 + 4}>
            {item.name ?? item.text}
          </text>
        </g>
      ))}
    </g>
  )
}

function CartesianChart({
  c,
  names,
  hover,
  leave,
}: {
  c: CartesianLayout
  names: readonly string[]
  hover: Hover
  leave: () => void
}) {
  const { plot, horizontal } = c
  const tipOf = (row: string) => cartesianTip(c, row, names)
  return (
    <>
      <g data-grid>
        {c.ticks.map(tk =>
          horizontal ? (
            <line key={tk.text} className={styles.grid} x1={tk.pos} x2={tk.pos} y1={plot.y} y2={plot.y + plot.h} />
          ) : (
            <line key={tk.text} className={styles.grid} x1={plot.x} x2={plot.x + plot.w} y1={tk.pos} y2={tk.pos} />
          ),
        )}
      </g>
      <g data-ticks>
        {c.ticks.map(tk =>
          horizontal ? (
            <text
              key={tk.text}
              className={styles.text}
              x={tk.pos}
              y={plot.y + plot.h + L.tickGap + 11}
              textAnchor="middle"
            >
              {tk.text}
            </text>
          ) : (
            <text key={tk.text} className={styles.text} x={plot.x - L.tickGap} y={tk.pos + 4} textAnchor="end">
              {tk.text}
            </text>
          ),
        )}
      </g>
      <g data-categories>
        {c.categories
          .filter(k => k.shown)
          .map(k =>
            horizontal ? (
              <text key={k.row} className={styles.text} x={plot.x - L.tickGap} y={k.center + 4} textAnchor="end">
                {k.text}
              </text>
            ) : (
              <text
                key={k.row}
                className={styles.text}
                x={k.center}
                y={plot.y + plot.h + L.tickGap + 11}
                textAnchor="middle"
              >
                {k.text}
              </text>
            ),
          )}
      </g>
      <g data-bars>
        {c.bars.map(b => (
          <path
            key={`${b.row}-${b.series}`}
            d={barPath(b, horizontal, c.zero)}
            fill={color(b.series)}
            data-bar
            onPointerMove={e => hover(e, tipOf(b.row))}
            onPointerLeave={leave}
          />
        ))}
      </g>
      {horizontal ? (
        <line className={styles.base} x1={c.zero} x2={c.zero} y1={plot.y} y2={plot.y + plot.h} />
      ) : (
        <line className={styles.base} x1={plot.x} x2={plot.x + plot.w} y1={c.zero} y2={c.zero} />
      )}
      <g data-lines>
        {c.lines.map(l => (
          <g key={l.series}>
            <polyline
              className={styles.line}
              points={l.points.map(p => `${p.x},${p.y}`).join(" ")}
              stroke={color(l.series)}
              data-line
            />
            {l.points.map(p => (
              <circle
                key={p.row}
                className={styles.dot}
                cx={p.x}
                cy={p.y}
                r={L.dot}
                fill={color(l.series)}
                onPointerMove={e => hover(e, tipOf(p.row))}
                onPointerLeave={leave}
              />
            ))}
          </g>
        ))}
      </g>
      <Legend items={c.legend} />
    </>
  )
}

function PieChart({ pie, hover, leave }: { pie: Extract<PieLayout, { ok: true }>; hover: Hover; leave: () => void }) {
  return (
    <>
      <g data-slices>
        {pie.slices.map(s => (
          <path
            key={s.rows.join(",")}
            className={styles.slice}
            d={s.path}
            fill={color(s.color)}
            data-slice
            onPointerMove={e => hover(e, pieTip(s))}
            onPointerLeave={leave}
          />
        ))}
      </g>
      <Legend items={pie.legend} />
    </>
  )
}

function ScatterChart({ sc, hover, leave }: { sc: ScatterLayout; hover: Hover; leave: () => void }) {
  const { plot } = sc
  return (
    <>
      <g data-grid>
        {sc.yTicks.map(tk => (
          <line key={tk.text} className={styles.grid} x1={plot.x} x2={plot.x + plot.w} y1={tk.pos} y2={tk.pos} />
        ))}
        {sc.xTicks.map(tk => (
          <line key={tk.text} className={styles.grid} x1={tk.pos} x2={tk.pos} y1={plot.y} y2={plot.y + plot.h} />
        ))}
      </g>
      <g data-ticks>
        {sc.yTicks.map(tk => (
          <text key={tk.text} className={styles.text} x={plot.x - L.tickGap} y={tk.pos + 4} textAnchor="end">
            {tk.text}
          </text>
        ))}
        {sc.xTicks.map(tk => (
          <text
            key={tk.text}
            className={styles.text}
            x={tk.pos}
            y={plot.y + plot.h + L.tickGap + 11}
            textAnchor="middle"
          >
            {tk.text}
          </text>
        ))}
      </g>
      <g data-dots>
        {sc.dots.map(d => (
          <circle
            key={d.row}
            className={styles.dot}
            cx={d.x}
            cy={d.y}
            r={L.dot}
            fill={color(0)}
            data-dot
            onPointerMove={e => hover(e, scatterTip(sc, d))}
            onPointerLeave={leave}
          />
        ))}
      </g>
    </>
  )
}
