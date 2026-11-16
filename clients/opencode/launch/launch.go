// Package launch は、opencode のプラグイン（npm のパッケージ matomezu-opencode）の入れ方・外し方のうち、opencode に依る所。
package launch

// Package は、opencode のプラグインの npm のパッケージの名前（opencode plugin add で入れる）
const Package = "matomezu-opencode"

// Remove は、opencode から matomezu のプラグインを外すコマンド
var Remove = [][]string{
	{"opencode", "plugin", "remove", Package},
}
