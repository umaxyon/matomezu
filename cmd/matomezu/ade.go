package main

// ADE（AI のプログラムを起動して並べる開発環境。clients/ade）の部品をつなぐ所: ADE のワークスペースの名前を読み、作業名をその表示名にも書く。
// ADE の名前を知るのはここと clients/ade だけ（常駐・MCP・フックは、名前を読む関数と書く関数として受ける）

import (
	"os"

	"github.com/umaxyon/matomezu/clients/ade/orca"
)

// adeWorkspaceName は、今のフォルダの ADE のワークスペースの名前（join で参加の要求に添える。ADE の中でなければ空）
func adeWorkspaceName() string {
	dir, err := os.Getwd()
	if err != nil {
		return ""
	}
	return orca.Name(dir)
}

// renameAdeWorkspace は、フォルダ dir の ADE のワークスペースの表示名を name にする（ADE の中でなければ何もしない。前に書いた名前は、常駐の置き場の home に覚える）
func renameAdeWorkspace(dir, name string) {
	cache := ""
	if h, err := openHome(); err == nil {
		cache = h.Dir
	}
	orca.Rename(dir, name, cache)
}
