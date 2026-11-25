//go:build !windows

package main

import (
	"fmt"
	"os"
	"os/exec"
	"runtime"
)

const isWindowsGUI = false

func fatalBox(msg string) { fmt.Fprintln(os.Stderr, msg) }

func runAppWindow(url string) {
	openInBrowser(url)
	waitHeartbeat()
}

func openInBrowser(u string) {
	cmd := "xdg-open"
	if runtime.GOOS == "darwin" {
		cmd = "open"
	}
	_ = exec.Command(cmd, u).Start()
}

func openFolder(p string) { openInBrowser(p) }

func bringWindowToFront() {}
func closeAppWindow()     {}
func windowLoaded()       {}
