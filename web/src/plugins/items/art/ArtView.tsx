// シェイプのアイテムのビュー: 絵（pictures.ts）を上の真ん中に決まった大きさで描き、足元にキャプションを、形の幅で折り返した行（size.ts）で真ん中に置く。
// 絵は部品の役割で塗り分ける（ArtView.module.css）。色（color）があれば、絵の色のテーマキーをその色で上書きする（色の無いスティックマンは文字の色）
import type { CSSProperties } from "react"
import type { ItemProps } from "../../../plugin-api"
import type { ItemViewProps } from "../../../plugin-api/ui"
import styles from "./ArtView.module.css"
import type { PERSON } from "./art"
import { paintVars } from "./paint"
import type { Picture } from "./pictures"
import { captionLines } from "./size"

type ArtProps = ItemProps<typeof PERSON.item.id>

// 絵の SVG（ビューとアイコンが共に使う）
export function PictureSvg({ picture, className }: { picture: Picture; className?: string }) {
  const { w, h } = picture.size
  return (
    <svg className={className} viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
      {picture.parts.map(([part, tag, attrs], i) => {
        const Tag = tag
        // biome-ignore lint/suspicious/noArrayIndexKey: 部品は絵の描く順の並びで、並べ替えない
        return <Tag key={i} data-part={part} {...attrs} />
      })}
    </svg>
  )
}

export function artView(picture: Picture) {
  return function ArtView({ props, size }: ItemViewProps<ArtProps>) {
    const lines = captionLines(props.caption, size.w)
    return (
      <div className={styles.art} style={paintVars(props.color) as CSSProperties | undefined} data-color={props.color}>
        <PictureSvg picture={picture} className={styles.picture} />
        {lines.length > 0 && (
          <div className={styles.caption}>
            {lines.map((line, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: 行はキャプションの順の並びで、並べ替えない
              <div key={i}>{line}</div>
            ))}
          </div>
        )}
      </div>
    )
  }
}

// ツールボックスのアイコン: 絵を 24×24 の中に縮めて描く
export function artIcon(picture: Picture) {
  return <PictureSvg picture={picture} className={styles.icon} />
}
