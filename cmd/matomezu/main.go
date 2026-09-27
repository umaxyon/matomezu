package main

import (
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"

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
	fmt.Fprintln(os.Stderr, "usage: matomezu serve [-addr host:port]")
	fmt.Fprintln(os.Stderr, "       matomezu version")
}

func serve(args []string) {
	fset := flag.NewFlagSet("serve", flag.ExitOnError)
	addr := fset.String("addr", "127.0.0.1:0", "待ち受けるアドレス（ポート 0 は空いている番号）")
	fset.Parse(args)

	root, err := fs.Sub(web.FS, ".")
	if err != nil {
		log.Fatal(err)
	}
	ln, err := net.Listen("tcp", *addr)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Printf("http://%s/\n", ln.Addr())
	log.Fatal(http.Serve(ln, http.FileServerFS(root)))
}
