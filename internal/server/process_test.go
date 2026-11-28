package server

import (
	"os"
	"strconv"
	"testing"
)

// 自分のプロセスは居て、数でない id は居るとみなし、居ない id は居ない。印は同じプロセスの中で変わらない
func TestProcessAlive(t *testing.T) {
	t.Parallel()
	if !ProcessAlive(strconv.Itoa(os.Getpid())) {
		t.Fatal("this process is not alive")
	}
	if !ProcessAlive("not-a-number") {
		t.Fatal("a pid that is not a number must count as alive")
	}
	if ProcessAlive("2147483646") {
		t.Fatal("a pid that does not exist is alive")
	}
	if ProcessSpace() == "" || ProcessSpace() != ProcessSpace() {
		t.Fatalf("space = %q", ProcessSpace())
	}
}

// 印が同じなら居るかを見る。起動ごとの識別子が変わっていれば（機械が起動し直された）終わっている。名前空間だけが違うときと、ほかの OS の印が違うときは、終わったとは言わない
func TestProcessSpaceEnded(t *testing.T) {
	t.Parallel()
	gone := func(string) bool { return false }
	here := func(string) bool { return true }
	for _, c := range []struct {
		name      string
		said, now string
		alive     func(string) bool
		want      bool
	}{
		{"same space, the process is gone", "linux|ns1|boot1", "linux|ns1|boot1", gone, true},
		{"same space, the process is alive", "linux|ns1|boot1", "linux|ns1|boot1", here, false},
		{"rebooted since", "linux|ns1|boot1", "linux|ns9|boot2", here, true},
		{"another namespace on the same boot", "linux|ns1|boot1", "linux|ns2|boot1", gone, false},
		{"another OS", "windows|host", "linux|ns1|boot1", gone, false},
		{"no boot id", "linux|ns1|", "linux|ns2|boot1", gone, false},
	} {
		if got := ProcessSpaceEnded(c.said, c.now, "42", c.alive); got != c.want {
			t.Errorf("%s: ended = %v, want %v", c.name, got, c.want)
		}
	}
}
