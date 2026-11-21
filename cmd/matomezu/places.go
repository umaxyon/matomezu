package main

// AI が動いている場所（AI のセッションを並べて起動する道具。clients/others）の部品をつなぐ所: 場所の名前を読み、セッション名を場所の表示名にも書く。
// 道具の名前を知るのはここと clients/others だけ（常駐・MCP・フックは、名前を読む関数と書く関数として受ける）

import (
	"os"

	"github.com/umaxyon/matomezu/clients/others/orca"
)

// placeName は、今のフォルダの場所の名前（join で参加の郵便に添える。どの道具の中でもなければ空）
func placeName() string {
	dir, err := os.Getwd()
	if err != nil {
		return ""
	}
	return orca.Name(dir)
}

// renamePlace は、フォルダ dir の場所の表示名を name にする（どの道具の中でもなければ何もしない。前に書いた名前は、常駐の置き場の home に覚える）
func renamePlace(dir, name string) {
	cache := ""
	if h, err := openHome(); err == nil {
		cache = h.Dir
	}
	orca.Rename(dir, name, cache)
}
