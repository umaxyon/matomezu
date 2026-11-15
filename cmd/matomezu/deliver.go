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
	opencodedeliver "github.com/umaxyon/matomezu/clients/opencode/deliver"
)

// deliverCmd は、組み込みの渡すコマンドの組
type deliverCmd struct {
	Codex    deliverCodexCmd    `cmd:"" help:"Hand it to a Codex conversation through the app-server (daemon) of CODEX_HOME (~/.codex when unset)."`
	Opencode deliverOpencodeCmd `cmd:"" help:"Hand it to an opencode conversation through the opencode background server (opencode/service.json under XDG_STATE_HOME, ~/.local/state when unset), as an input that is not the user's (synthetic) marked as a wake notice."`
}

type deliverCodexCmd struct{}

// Run は、標準入力の本文を、MATOMEZU_SESSION の Codex の会話に渡す
func (deliverCodexCmd) Run() error {
	return deliverWith("deliver codex", func(ctx context.Context, session, text string) (delivered, absent bool, err error) {
		got, err := codexdeliver.Deliver(ctx, codexdeliver.SocketPath(os.Getenv("CODEX_HOME")), session, text, version)
		return got == codexdeliver.Delivered, got == codexdeliver.Absent, err
	})
}

type deliverOpencodeCmd struct{}

// Run は、標準入力の本文を、MATOMEZU_SESSION の opencode の会話に渡す
func (deliverOpencodeCmd) Run() error {
	return deliverWith("deliver opencode", func(ctx context.Context, session, text string) (delivered, absent bool, err error) {
		got, err := opencodedeliver.Deliver(ctx, opencodedeliver.ServicePath(os.Getenv("XDG_STATE_HOME")), session, text)
		return got == opencodedeliver.Delivered, got == opencodedeliver.Absent, err
	})
}

// deliverWith は、標準入力の本文を MATOMEZU_SESSION の会話に hand で渡し、結果を終わりの値に写す（渡せた 0・会話が無い 3・失敗 1）。
// name は、誤りを標準エラーに書くときの名前
func deliverWith(name string, hand func(ctx context.Context, session, text string) (delivered, absent bool, err error)) error {
	text, err := io.ReadAll(os.Stdin)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	delivered, absent, err := hand(ctx, os.Getenv("MATOMEZU_SESSION"), string(text))
	if err != nil {
		fmt.Fprintln(os.Stderr, name+":", err)
	}
	switch {
	case delivered:
		return nil
	case absent:
		os.Exit(deliverAbsentExit)
	}
	os.Exit(1)
	return nil
}
