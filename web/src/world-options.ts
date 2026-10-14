// ページ（ワールド）の設定の選択肢と説明。新しい図・新しいページのダイアログ（new-book.ts・new-page.ts）と、
// ブックのダイアログ（book-dialog.ts）で同じものを使う
import { t } from "./i18n";
import { THEMES } from "./theme";
import type { PagePattern } from "./types";
import { PATTERN_LABELS } from "./validate";

export const ROUTE_OPTIONS: [string, string][] = [["elbow", t("折れ線")], ["straight", t("直線")]];
// ページのパターン（docs/PATTERN-plan.md。2026-10-12 ユーザー: パターンはページ単位。作るときに決め、後から切り替えない）
export const WORLD_VIEW_HELP = t("このページの一番上に置いた箱の並べ方です。ページを作るときに決めます。\n内包: 自由に置きます。箱の中に子を入れ、子の見せ方（内包・リスト・非表示）を選べます\nツリー: 根の箱の子孫を、何段でも木に並べます。根の外の箱は葉として自由に置けます\nフローチャート: 自由に置き、図の左上に道具入れが出ます。箱は子を持てません");
export const PATTERN_OPTIONS: [PagePattern, string][] = (["nest", "tree", "flow"] as const).map(v => [v, PATTERN_LABELS[v]]);
export const TREE_DIR_OPTIONS: [string, string][] = [["down", t("↓ 下")], ["up", t("↑ 上")], ["left", t("← 左")], ["right", t("→ 右")]];
// 中の箱のサイズ（フローチャート。押すと中の箱を全部そのサイズにし、その間隔で整列し直す）
export const KID_SIZE_HELP = t("中の箱を全部このサイズにして、箱の間隔もサイズに合わせて整列し直します。そのあとも箱ごとにサイズを変えられます（元に戻すで戻せます）");
export const ALIGN_HELP = t("本筋（開始の箱から線をたどった並び）を中央の縦の線にそろえ、分岐の枝を左右に置きます。そろえたあとも自由に動かせます（元に戻すで戻せます）");
export const FLATTEN_HELP = t("ツリーを平らにして、親子のつながりを線で引き直し、このページを内包のページにします（見た目はそのまま。元のツリーには戻せません）");
// ワールドの背景によく使う色（明るい色と暗い色）
export const BG_PRESETS = ["#ffffff", "#f8fafc", "#fefce8", "#f0fdf4", "#eff6ff", "#1e1e1e", "#0f172a", "#1c1917"];
export const THEME_HELP = THEMES.map(th => `${th.label}: ${th.describe}`).join("\n");
