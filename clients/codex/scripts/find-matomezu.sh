# Codex のプラグインのスクリプトが読み込む（. で取り込む）: どの matomezu を呼ぶかを決める。呼び出しごとの選び方をここ 1 か所にそろえ、フック・monitor・MCP が同じ常駐を見るようにする。
# 開いているフォルダが matomezu のリポジトリ（git の共通のフォルダの隣に開発の常駐 .dev-home がある）なら、その常駐（MATOMEZU_HOME も合わせる）。そうでなければ PATH の matomezu。どちらも無ければ matomezu_bin は空
# 結果: matomezu_bin（実行ファイル）、matomezu_dev_root（開発のときだけ、リポジトリの根）
matomezu_bin=""
matomezu_dev_root=""
common=$(git -C "." rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
if [ -n "$common" ] && [ -x "$(dirname "$common")/.dev-home/matomezu" ]; then
  matomezu_dev_root=$(dirname "$common")
  matomezu_bin="$matomezu_dev_root/.dev-home/matomezu"
  export MATOMEZU_HOME="$matomezu_dev_root/.dev-home"
else
  matomezu_bin=$(command -v matomezu 2>/dev/null)
fi
