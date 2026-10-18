// 開くときの判定で紙に収まらなかったページ（docs/PAPER-plan.md の 4.6 の 7）。形を変えずに押し込んでも入らなかった向きと、
// 端から端へつながった最上位の箱の列、足りない px。graph.ts の load が見つけ、画面（sync.ts・app.ts）と LLM（matomezu open・set・check）へ伝える
import { t } from "./i18n";

export interface Misfit {
  page: string | null; // null は最初のページ
  paper: string;       // 紙の型と大きさ（例 "a4-landscape 1123x794"）
  axis: "x" | "y";
  short: number;
  boxes: { id: string; caption: string }[];
}

// 紙に収まらないファイルを開こうとした（graph.load の refuse）。表示は前のまま残っている
export class PaperMisfit extends Error {
  constructor(readonly misfits: Misfit[], message: string) {
    super(message);
  }
}

// 画面に出す原因（ページごとに 1 行。2026-10-18 ユーザー: 文章にせず簡潔に）。pageName はページの名前（最初のページには付けない）
export function misfitText(misfits: Misfit[], pageName: (p: string | null) => string): string {
  return misfits.map(m => t("原因：{page}{side}オーバー（{short}px）", {
    page: m.page == null ? "" : pageName(m.page) + " ", side: m.axis === "x" ? t("ページ幅") : t("ページ高さ"), short: Math.ceil(m.short),
  })).join("\n");
}
