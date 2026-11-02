#!/bin/sh
# Claude Code のフック（利用者が話しかけたとき）: 開発の常駐（main の worktree の .dev-home）に、AI の応えを待つアノテーションを聞き、
# あれば話しかけに添える。どの worktree から呼んでも main の常駐を見る。常駐が無い・待つ物が無いときは何も出さない
common=$(git -C "${CLAUDE_PROJECT_DIR:-.}" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || exit 0
home="$(dirname "$common")/.dev-home"
[ -x "$home/matomezu" ] || exit 0
MATOMEZU_HOME="$home" "$home/matomezu" annotations 2>/dev/null
exit 0
