package server

import (
	"os"
	"strconv"
	"testing"
)

// 自分のプロセスは居て、数でない id は居るとみなし、居ない id は居ない。印は同じプロセスの中で変わらない
func TestProcessAlive(t *testing.T) {
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
