// アセット（画像のバイト列。ホストがブックのデータとは別に、中身の sha256 を id にして持つ）を、ホストに置く・読む口のフック（base の ui.tsx が出す）
import type { AssetPut } from "../../../core/assets"
import { useInstance } from "../../../ui/store-context"

// 画像のバイト列をホストのアセットの置き場に置く関数（アクションの外。答えの id をページが指す）。ホストが無いか、頼めなければ投げる
export function useImportAsset(): (bytes: Blob) => Promise<AssetPut> {
  return useInstance().putAsset
}

// アセット id の中身を読む URL を返す関数（ホストの無い窓では NO_ASSET_URL）
export function useAssetUrl(): (id: string) => string {
  return useInstance().assetUrl
}
