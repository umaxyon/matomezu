# Codex のプラグインのスクリプトが読み込む（. で取り込む）: どの matomezu を呼ぶかを決める。呼び出しごとの選び方をここ 1 か所にそろえ、フックと MCP が同じ常駐を見るようにする。
# このプラグインを matomezu のリポジトリから入れたとき（Codex の設定の [marketplaces.matomezu] の source がリポジトリの中で、git の共通のフォルダの隣に開発の常駐 .dev-home がある）は、
# その常駐（MATOMEZU_HOME も合わせる）。Codex は MCP にもフックにも開いているプロジェクトのフォルダを教えないので、入れた元で見分ける。
# そうでなければ PATH の matomezu。どちらも無ければ matomezu_bin は空
# 結果: matomezu_bin（実行ファイル）、matomezu_dev_root（開発のときだけ、リポジトリの根）
matomezu_bin=""
matomezu_dev_root=""
codex_config="${CODEX_HOME:-$HOME/.codex}/config.toml"
installed_from=""
if [ -f "$codex_config" ]; then
  installed_from=$(awk '
    /^\[/ { inside = ($0 == "[marketplaces.matomezu]") ; next }
    inside && /^[ \t]*source[ \t]*=/ { sub(/^[^=]*=[ \t]*"/, ""); sub(/".*$/, ""); print; exit }
  ' "$codex_config")
fi
common=""
if [ -n "$installed_from" ] && [ -d "$installed_from" ]; then
  common=$(git -C "$installed_from" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
fi
if [ -n "$common" ] && [ -x "$(dirname "$common")/.dev-home/matomezu" ]; then
  matomezu_dev_root=$(dirname "$common")
  matomezu_bin="$matomezu_dev_root/.dev-home/matomezu"
  export MATOMEZU_HOME="$matomezu_dev_root/.dev-home"
else
  matomezu_bin=$(command -v matomezu 2>/dev/null)
fi
