// 画面の外に覚えること（app.ts から使う）。どちらも覚えられなくても動く
// - 開いているブックの並び: localStorage
// - 表示中のブックとページ: URL（?d=<ブックの id>&p=<ページの箱の id>）

const STORE_KEY = "matomezu.tabs";

// 開いていたブックの id。ページのタブは、ブックを開けば全部並ぶので覚えない（以前の形 { d, p } も読める）
export function loadSavedBooks(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY) ?? "[]");
    if (!Array.isArray(v)) return [];
    return v.flatMap((x): string[] => (typeof x === "string" ? [x] : x && typeof x.d === "string" ? [x.d] : []));
  } catch {
    return [];
  }
}

export function saveBooks(ids: string[]) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(ids));
  } catch { /* 覚えられなくても動く */ }
}

// URL で頼まれたブックとページ（開いたとき）
export function wantedFromUrl(): { book: string | null; page: string | null } {
  const params = new URLSearchParams(location.search);
  return { book: params.get("d"), page: params.get("p") };
}

export function writeUrl(book: string, page: string | null) {
  try {
    const url = new URL(location.href);
    url.searchParams.set("d", book);
    if (page != null) url.searchParams.set("p", page);
    else url.searchParams.delete("p");
    history.replaceState(null, "", url);
  } catch { /* URL を変えられなくても動く */ }
}
