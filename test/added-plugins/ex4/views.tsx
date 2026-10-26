// 関係線の層と〇: 関係線を点線で描き、ポインタを乗せた形と関係のある形のほかを薄くするよう求める（ShapeMarks）。
// 〇は形ごとに右上の小さな点（引く操作は持たない。ビルトインの線の〇と重なるかを見るため）
import { connectorsOf } from "matomezu"
import { ShapeMarksContext, type ShapeScene } from "matomezu/ui"
import type { ReactNode } from "react"
import { RELATION } from "./relation"

const relationsIn = (scene: ShapeScene) => connectorsOf(scene.page).filter(c => c.item === RELATION.id)

export function RelationLayer({ scene, children }: { scene: ShapeScene; children: ReactNode }) {
  const relations = relationsIn(scene)
  const { hover } = scene
  const keep = hover
    ? new Set([hover, ...relations.flatMap(r => (r.from === hover ? [r.to] : r.to === hover ? [r.from] : []))])
    : null
  const center = (id: string) => {
    const r = scene.rects.get(id)
    return r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : null
  }
  return (
    <ShapeMarksContext.Provider value={{ keep, target: null }}>
      {children}
      <svg
        aria-hidden="true"
        data-ex4-relations
        style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
      >
        {relations.map(r => {
          const a = center(r.from)
          const b = center(r.to)
          return a && b ? (
            <line
              key={r.id}
              data-ex4-relation={r.id}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="var(--relation-stroke)"
              strokeDasharray="2 4"
            />
          ) : null
        })}
      </svg>
    </ShapeMarksContext.Provider>
  )
}

export function RelationPort({ id }: { scene: ShapeScene; id: string }) {
  return <span data-ex4-port={id} style={{ position: "absolute", right: -3, top: -3, width: 6, height: 6 }} />
}
