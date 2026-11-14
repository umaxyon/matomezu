#!/bin/bash
# 利用者の手元をまねた、使い捨てのまっさらな環境（HOME・npm の prefix・Claude Code の設定を空のフォルダに向けた物）を作って入り、片付ける。
# 内部の npm レジストリ（Verdaccio）から matomezu を入れるところから試すための物で、開発の常駐（.dev-home）や開発の .claude と混ぜない。
#   scripts/npm-lab.sh shell [名前]   環境を作って（あれば再利用して）、その中のシェルに入る（名前の既定は default）
#   scripts/npm-lab.sh down [名前]    環境の常駐を止めて、フォルダを消す
# 環境は ~/matomezu-lab/run/<名前>。claude のログインは、~/matomezu-lab/oauth-token（claude setup-token の鍵）があれば CLAUDE_CODE_OAUTH_TOKEN で渡す。
# 画面の待ち受けは既定の 7230 なので、同時に入れる環境は 1 つ
set -eu
LAB="$HOME/matomezu-lab"
REGISTRY="http://127.0.0.1:4873/"
cmd="${1:-}"
name="${2:-default}"
dir="$LAB/run/$name"

# 環境の PATH は、環境の npm の bin・環境の bin（claude への道）・node の置き場・/usr/bin:/bin だけにし、開発の道具（go・bun など）が見えないようにする

case "$cmd" in
shell)
  mkdir -p "$dir/home" "$dir/npm" "$dir/work" "$dir/bin"
  node_dir="$(dirname "$(asdf which node 2>/dev/null || readlink -f "$(command -v node)")")"
  ln -sf "$(readlink -f "$(command -v claude)")" "$dir/bin/claude"
  token=""
  [ -r "$LAB/oauth-token" ] && token="$(tr -d '[:space:]' <"$LAB/oauth-token")"
  cd "$dir/work"
  exec env -i \
    HOME="$dir/home" TERM="${TERM:-xterm}" LANG="${LANG:-C.UTF-8}" \
    XDG_CONFIG_HOME="$dir/home/.config" XDG_DATA_HOME="$dir/home/.local/share" \
    XDG_CACHE_HOME="$dir/home/.cache" XDG_STATE_HOME="$dir/home/.local/state" \
    npm_config_prefix="$dir/npm" npm_config_cache="$dir/home/.npm" npm_config_registry="$REGISTRY" \
    CLAUDE_CONFIG_DIR="$dir/home/.claude" DISABLE_AUTOUPDATER=1 \
    ${token:+CLAUDE_CODE_OAUTH_TOKEN="$token"} \
    PS1="[lab:$name] \w \$ " \
    PATH="$dir/npm/bin:$dir/bin:$node_dir:/usr/bin:/bin" \
    bash --norc -i
  ;;
down)
  [ -d "$dir" ] || { echo "no such environment: $dir" >&2; exit 1; }
  # 常駐が残っていると、次の環境が古い常駐に当たるので、先に止める
  if [ -x "$dir/npm/bin/matomezu" ]; then
    HOME="$dir/home" XDG_DATA_HOME="$dir/home/.local/share" PATH="$(dirname "$(asdf which node)"):/usr/bin:/bin" "$dir/npm/bin/matomezu" stop || true
  fi
  rm -rf "$dir"
  echo "removed $dir"
  ;;
*)
  sed -n '2,8p' "$0" >&2
  exit 2
  ;;
esac
