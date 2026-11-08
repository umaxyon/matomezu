// 押してもサイドパネルを閉じない、重なって出る物（ダイアログ・メニュー・トースト）のセレクタ。ネイティブの dialog 要素は role を書かないので、要素名でも拾う
export const POPUP_KEEPS = "[role=dialog], dialog, [role=menu], [role=status], [role=alert]"
