// OS のクリップボードの、matomezu の写し: コマンドの定義が clipboard（"copy" | "cut" | "paste"）を名乗ると、土台はそのコマンドを、
// キーを押した時ではなく、続いてブラウザが起こすクリップボードのイベント（copy・cut・paste）の中で行い、操作の clipboard でクリップボードを渡す。
// 写しは独自の形式 CLIP_FORMAT 1 つに、どの常駐の物か（host）・どのプラグインの何か（kind。書いたプラグインの id が頭に付く）・中身（data）を包んで書く。
// 読むときは、ほかの常駐の物なら OTHER_HOST、無いか形が違えば NO_CLIP_DATA。中身は古い版の窓や外のページからも来るので、読んだ側が形を確かめる

// 独自の形式（MIME の type）
export const CLIP_FORMAT = "application/x-matomezu"

// 読んだ物が無い（クリップボードのイベントの外・matomezu の写しでない・種類が違う・形が違う）
export const NO_CLIP_DATA: unique symbol = Symbol("no clip data")
// ほかの常駐の matomezu で写した物（画像などのページを指せないので、貼らない）
export const OTHER_HOST: unique symbol = Symbol("other host")

// コマンドが名乗る、クリップボードの使い方
export type ClipboardUse = "copy" | "cut" | "paste"

// コマンドの操作が渡す、クリップボード
export interface Clipboard {
  // 写しを書く（copy・cut のイベントの中だけ。ほかでは何もしない）。kind は自分のプラグインの中の名前
  write(kind: string, data: unknown): void
  // 写しを読む（paste のイベントの中だけ）。中身か、NO_CLIP_DATA・OTHER_HOST
  read(kind: string): unknown
  // 貼ったファイル（paste のイベントの中だけ）を、コマンドを呼んだステージのビュー（ui の useFilePaste で受ける物）に渡す。ファイルか受ける物が無ければ false
  passFiles(): boolean
}

// クリップボードのイベントの外で呼んだコマンドが受けるクリップボード
export const NO_CLIPBOARD: Clipboard = {
  write: () => {},
  read: () => NO_CLIP_DATA,
  passFiles: () => false,
}

// クリップボードのイベントが運ぶ物（ブラウザの DataTransfer の、使う所だけ）
export interface ClipTransfer {
  getData(format: string): string
  setData(format: string, data: string): void
  readonly files: ArrayLike<File>
}

// イベントの運ぶ物 transfer を、常駐 host（窓の源）のプラグイン owner のクリップボードにする。passFiles は貼ったファイルをビューに渡す
export function clipboardOn(
  transfer: ClipTransfer,
  host: string,
  owner: string,
  passFiles: (files: readonly File[]) => boolean,
): Clipboard {
  const files = Array.from(transfer.files)
  return {
    write: (kind, data) => transfer.setData(CLIP_FORMAT, JSON.stringify({ host, kind: `${owner}:${kind}`, data })),
    read: kind => {
      const text = transfer.getData(CLIP_FORMAT)
      if (text === "") return NO_CLIP_DATA
      let wrapped: unknown
      try {
        wrapped = JSON.parse(text)
      } catch {
        return NO_CLIP_DATA
      }
      if (typeof wrapped !== "object" || wrapped === null || !("host" in wrapped) || !("kind" in wrapped))
        return NO_CLIP_DATA
      if (wrapped.kind !== `${owner}:${kind}`) return NO_CLIP_DATA
      if (wrapped.host !== host) return OTHER_HOST
      return "data" in wrapped ? wrapped.data : NO_CLIP_DATA
    },
    passFiles: () => files.length > 0 && passFiles(files),
  }
}
