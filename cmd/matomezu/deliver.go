package main

// 渡すコマンド（deliver）: watch と mcp に -- のあとで渡す、AI のプログラムに起こす知らせを渡すコマンドのうち、本体に組み込んだ物。
// 中身は clients/<AI の名前> の Go のパッケージが持ち、ここはそれを呼んで、終わりの値に写すだけ（AI の種類は、どのサブコマンドかで決まる）

import (
	"context"
	"fmt"
	"io"
	"os"
	"time"

	codexdeliver "github.com/umaxyon/matomezu/clients/codex/deliver"
)

// deliverCmd は、組み込みの渡すコマンドの組
type deliverCmd struct {
	Codex deliverCodexCmd `cmd:"" help:"Hand it to a Codex conversation through the app-server (daemon) of CODEX_HOME (~/.codex when unset)."`
}

type deliverCodexCmd struct{}

// Run は、標準入力の本文を、MATOMEZU_SESSION の Codex の会話に渡す
func (deliverCodexCmd) Run() error {
	text, err := io.ReadAll(os.Stdin)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	got, err := codexdeliver.Deliver(ctx, codexdeliver.SocketPath(os.Getenv("CODEX_HOME")), os.Getenv("MATOMEZU_SESSION"), string(text), version)
	if err != nil {
		fmt.Fprintln(os.Stderr, "deliver codex:", err)
	}
	switch got {
	case codexdeliver.Delivered:
		return nil
	case codexdeliver.Absent:
		os.Exit(deliverAbsentExit)
	}
	os.Exit(1)
	return nil
}
