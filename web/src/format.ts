// 図のデータを保存する形の文字列にする。最上位のキーを 1 行ずつ、nodes・edges などの配列は要素 1 つを 1 行に書く。
// ドラッグ 1 回の差分が動かした箱の行だけになり、LLM が読む行数も少なくて済む（cmd/matomezu の formatDiagram と同じ形）

export function formatDiagram(data: unknown): string {
  if (!isObject(data)) return inline(data) + "\n";
  const lines = entries(data).map(([k, v]) =>
    `  ${JSON.stringify(k)}: ${Array.isArray(v) && v.length ? `[\n${v.map(x => "    " + inline(x)).join(",\n")}\n  ]` : inline(v)}`);
  return lines.length ? `{\n${lines.join(",\n")}\n}\n` : "{}\n";
}

// 1 行に書く。区切りの後ろと、中身のある {} の内側に空白を入れる
function inline(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(x => (x === undefined || typeof x === "function" ? "null" : inline(x))).join(", ")}]`;
  if (isObject(v)) {
    const e = entries(v);
    return e.length ? `{ ${e.map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(", ")} }` : "{}";
  }
  return JSON.stringify(v) ?? "null";
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

// JSON.stringify と同じく、undefined と関数の値は書かない
const entries = (o: Record<string, unknown>) => Object.entries(o).filter(([, v]) => v !== undefined && typeof v !== "function");
