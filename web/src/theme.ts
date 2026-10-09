// テーマ: 名前の付いた見た目の組（docs/THEME-plan.md）。図全体（world.theme）か箱（theme）に名前で書き、
// 書かれた箱とその子孫に効く。書かなければ親（無ければ図全体、それも無ければ default）を受け継ぐ。
// 段階 1 は色・角の丸み・影・箱の中の余白。default は今の見た目そのままで、箱ごとの color を使う。
// ほかのテーマは見た目をテーマが決め、箱ごとの color は使わない（データには残す。docs/THEME-plan.md 11 章）

export interface Theme {
  id: string;
  label: string;       // 画面に出す名前
  describe: string;    // LLM が選ぶための短い説明
  useBoxColor: boolean; // 箱ごとの color を使うか
  box: string;         // 箱の塗り（color を使わないとき、color が無いとき）
  group?: string;      // 内包の枠の色（無ければ box）
  border?: string;     // 文字の箱の枠線の色（無ければ塗りを暗くした色）
  outline?: boolean;   // 塗りのある文字の箱に、枠線の指定が無くても細い枠線を引く（白い背景に白い箱が溶けないように）
  text?: string;       // 塗りの上の文字の色（無ければ塗りの明るさで白か黒）
  shadow?: string;     // 箱の影（無ければ画面の既定。"none" で影なし）
  background?: string; // 図の背景。あれば配色をこの背景で固定する（ブラウザのダーク・ライトによらない）。world.background が優先
  // 図全体の CSS 変数として流す値（テーマを書いた要素から子孫へ受け継ぐ）
  radius?: number;     // 箱の角の丸み（px）
  padding?: [number, number]; // 文字の箱の中の余白（上下, 左右。px）。S サイズと形（人・DB）は使わない
}

export const DEFAULT_THEME = "default";

export const THEMES: Theme[] = [
  {
    id: "default", label: "標準", describe: "今までの見た目。箱ごとの色を使う。背景はブラウザのダーク・ライトに合わせる",
    useBoxColor: true, box: "#ffffff",
  },
  {
    id: "sticky", label: "付箋紙", describe: "明るい紙の上に、淡い黄色の付箋を貼った見た目。角は小さく、影は薄い",
    useBoxColor: false, box: "#fff3a6", group: "#b9ad8f", border: "#d9c873", text: "#3b3524",
    shadow: "0 3px 6px rgba(70, 55, 20, 0.22)", background: "#f4efe4", radius: 3, padding: [8, 12],
  },
  {
    id: "mono", label: "モノクロ", describe: "白い背景に、白い箱と黒い枠線だけ。資料に貼る・印刷する向け",
    useBoxColor: false, box: "#ffffff", group: "#6b6b6b", border: "#262626", outline: true, text: "#1a1a1a",
    shadow: "none", background: "#ffffff", radius: 4,
  },
];

const byId = new Map(THEMES.map(t => [t.id, t]));

export const isTheme = (v: unknown): v is string => typeof v === "string" && byId.has(v);
export const themeById = (id: string | undefined | null): Theme => byId.get(id ?? "") ?? byId.get(DEFAULT_THEME)!;

// テーマを書いた要素に付ける CSS 変数（子孫へ受け継ぐ）。値の無いものは initial にして、CSS の既定の値（var() の 2 つめ）を使わせる
// （外すと、祖先のテーマの値を受け継いでしまうため）
export function themeVars(t: Theme): Record<string, string> {
  return {
    "--mz-radius": t.radius != null ? `${t.radius}px` : "initial",
    "--mz-pad-y": t.padding ? `${t.padding[0]}px` : "initial",
    "--mz-pad-x": t.padding ? `${t.padding[1]}px` : "initial",
  };
}

// el に theme の変数を付ける。null なら外す（祖先のテーマを受け継ぐ）
export function setThemeVars(el: HTMLElement, t: Theme | null) {
  for (const [k, v] of Object.entries(themeVars(t ?? themeById(DEFAULT_THEME)))) {
    if (t) el.style.setProperty(k, v);
    else el.style.removeProperty(k);
  }
}
