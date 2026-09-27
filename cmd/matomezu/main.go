package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/umaxyon/matomezu/internal/server"
	"github.com/umaxyon/matomezu/web"
)

var version = "dev"

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	switch os.Args[1] {
	case "serve":
		serve(os.Args[2:])
	case "version":
		fmt.Println(version)
	default:
		usage()
		os.Exit(2)
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, "usage: matomezu serve [-addr host:port] <file.json>")
	fmt.Fprintln(os.Stderr, "       matomezu version")
}

func serve(args []string) {
	fset := flag.NewFlagSet("serve", flag.ExitOnError)
	addr := fset.String("addr", "127.0.0.1:0", "待ち受けるアドレス（ポート 0 は空いている番号）")
	fset.Usage = usage
	fset.Parse(args)
	if fset.NArg() != 1 {
		usage()
		os.Exit(2)
	}

	srv, err := server.New(fset.Arg(0), web.FS)
	if err != nil {
		log.Fatal(err)
	}
	ln, err := net.Listen("tcp", *addr)
	if err != nil {
		log.Fatal(err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go srv.Watch(ctx)

	hs := &http.Server{Handler: srv.Handler(), BaseContext: func(net.Listener) context.Context { return ctx }}
	go func() {
		<-ctx.Done()
		hs.Shutdown(context.Background())
	}()

	// LLM が読み取れるよう、1行目に URL だけを出す
	fmt.Printf("http://%s/\n", ln.Addr())
	if err := hs.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}
