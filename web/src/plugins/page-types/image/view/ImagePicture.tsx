// 画像のページの中身: アセットの画像を、紙の余白の内側に収めて真ん中に描く（小さな画像は大きくしない）。<img> で描き、HTML・SVG として中に入れない。
// アセットが無い・読めない・ホストの無い窓では「画像がありません」の絵を描く。onDone は、画像を読み終えたか、描く画像が無いと分かったときに呼ぶ
import { type CSSProperties, useEffect, useState } from "react"
import { NO_ASSET_URL } from "../../../../plugin-api"
import { useMessages } from "../../../../plugin-api/ui"
import { useAssetUrl } from "../../../base/ui"
import { IMAGE_MARGIN } from "../image"
import { kit } from "../kit"
import styles from "./ImagePicture.module.css"

export function ImagePicture({ asset, onDone }: { asset: string; onDone?: () => void }) {
  const url = useAssetUrl()(asset)
  const [broken, setBroken] = useState<string>(NO_ASSET_URL) // 読めなかった URL
  const shown = asset !== "" && url !== NO_ASSET_URL && broken !== url
  // 描く画像が無ければ、描き終えている
  useEffect(() => {
    if (!shown) onDone?.()
  }, [shown, onDone])
  return (
    <div className={styles.box} style={{ "--image-margin": `${IMAGE_MARGIN}px` } as CSSProperties}>
      {shown ? (
        <img
          className={styles.image}
          src={url}
          alt=""
          draggable={false}
          onLoad={onDone}
          onError={() => {
            setBroken(url)
            onDone?.()
          }}
        />
      ) : (
        <MissingImage />
      )}
    </div>
  )
}

// 画像が無いときの絵（アセットは要らない。コードで描く）
export function MissingImage() {
  const t = useMessages(kit)
  return (
    <div className={styles.missing} data-image-missing="">
      <svg viewBox="0 0 24 24" width={48} height={48} aria-hidden="true" fill="none" stroke="currentColor">
        <rect x="2.5" y="4.5" width="19" height="15" rx="2" strokeWidth="1.5" />
        <path d="m4 4 16 16" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <span>{t("No image")}</span>
    </div>
  )
}
