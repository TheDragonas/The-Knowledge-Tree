//go:build windows

package main

// Eigenes Programmfenster über Microsoft WebView2 (bei Windows 10/11 vorinstalliert).
// Fallback: Edge/Chrome im App-Modus, danach der Standardbrowser.

import (
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync/atomic"
	"syscall"
	"time"
	"unsafe"

	webview2 "github.com/jchv/go-webview2"
	"golang.org/x/sys/windows/registry"
)

const isWindowsGUI = true

var (
	user32                        = syscall.NewLazyDLL("user32.dll")
	procSetProcessDpiAwarenessCtx = user32.NewProc("SetProcessDpiAwarenessContext")
	procSetProcessDPIAware        = user32.NewProc("SetProcessDPIAware")
	procGetDpiForSystem           = user32.NewProc("GetDpiForSystem")
	procGetSystemMetrics          = user32.NewProc("GetSystemMetrics")
	procSetWindowLongPtrW         = user32.NewProc("SetWindowLongPtrW")
	procCallWindowProcW           = user32.NewProc("CallWindowProcW")
	procPostMessageW              = user32.NewProc("PostMessageW")
	procShowWindow                = user32.NewProc("ShowWindow")
	procSetForegroundWindow       = user32.NewProc("SetForegroundWindow")
	procIsIconic                  = user32.NewProc("IsIconic")
	procMessageBoxW               = user32.NewProc("MessageBoxW")
)

const (
	wmClose     = 0x0010
	swMaximize  = 3
	swRestore   = 9
	smCxScreen  = 0
	smCyScreen  = 1
	mbIconError = 0x10
)

var (
	wv          webview2.WebView
	hwnd        uintptr
	origWndProc uintptr
	allowClose  atomic.Bool
	closeAsked  atomic.Bool
	initPhase   atomic.Bool
	windowMode  atomic.Int32 // 0 = keins, 1 = WebView2, 2 = Browser
	wndProcCB   uintptr
)

func markerPath() string { return filepath.Join(cacheDir, "fenster-test.txt") }

func fatalBox(msg string) {
	t, _ := syscall.UTF16PtrFromString(appName)
	m, _ := syscall.UTF16PtrFromString(msg)
	_, _, _ = procMessageBoxW.Call(0, uintptr(unsafe.Pointer(m)), uintptr(unsafe.Pointer(t)), mbIconError)
}

func setDPIAware() {
	if procSetProcessDpiAwarenessCtx.Find() == nil {
		// DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = -4
		r, _, _ := procSetProcessDpiAwarenessCtx.Call(^uintptr(3))
		if r != 0 {
			return
		}
	}
	if procSetProcessDPIAware.Find() == nil {
		_, _, _ = procSetProcessDPIAware.Call()
	}
}

func windowSize() (uint, uint) {
	dpi := uintptr(96)
	if procGetDpiForSystem.Find() == nil {
		if d, _, _ := procGetDpiForSystem.Call(); d > 0 {
			dpi = d
		}
	}
	w := uint(1400 * dpi / 96)
	h := uint(900 * dpi / 96)
	sw, _, _ := procGetSystemMetrics.Call(smCxScreen)
	sh, _, _ := procGetSystemMetrics.Call(smCyScreen)
	if sw > 0 && w > uint(sw)-40 {
		w = uint(sw) - 40
	}
	if sh > 0 && h > uint(sh)-80 {
		h = uint(sh) - 80
	}
	return w, h
}

func webview2Installed() bool {
	const guid = `{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}`
	keys := []struct {
		root registry.Key
		path string
	}{
		{registry.LOCAL_MACHINE, `SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\` + guid},
		{registry.LOCAL_MACHINE, `SOFTWARE\Microsoft\EdgeUpdate\Clients\` + guid},
		{registry.CURRENT_USER, `Software\Microsoft\EdgeUpdate\Clients\` + guid},
	}
	for _, k := range keys {
		key, err := registry.OpenKey(k.root, k.path, registry.QUERY_VALUE)
		if err != nil {
			continue
		}
		v, _, err := key.GetStringValue("pv")
		key.Close()
		if err == nil && v != "" && v != "0.0.0.0" {
			return true
		}
	}
	return false
}

// Schreibt Meldungen der WebView2-Bibliothek ins Log. Scheitert WebView2 beim Start
// (die Bibliothek beendet dann das Programm), wird das Programm im Browser-Modus neu gestartet.
type webviewLog struct{}

func (webviewLog) Write(p []byte) (int, error) {
	s := strings.TrimSpace(string(p))
	logf("WebView2: %s", s)
	if initPhase.Load() && strings.Contains(s, "failed") {
		removeLock()
		if exe, err := os.Executable(); err == nil {
			_ = exec.Command(exe, "--edge").Start()
		}
	}
	return len(p), nil
}

func runAppWindow(url string) {
	setDPIAware()
	useWV := !forceEdge && !exists(markerPath())
	if useWV && !webview2Installed() {
		logf("WebView2-Runtime nicht gefunden – verwende Browser-Fenster")
		useWV = false
	}
	if useWV {
		_ = os.WriteFile(markerPath(), []byte("Wenn diese Datei stehen bleibt, konnte das Programmfenster (WebView2) nicht starten.\r\n"+
			"KnowledgeTree verwendet dann automatisch ein Edge/Chrome-Fenster. Datei löschen = WebView2 erneut versuchen.\r\n"), 0o644)
		if runWebView(url) {
			_ = os.Remove(markerPath())
			return
		}
		logf("WebView2 konnte nicht gestartet werden – verwende Browser-Fenster")
	}
	runBrowserApp(url)
}

func runWebView(url string) bool {
	log.SetOutput(webviewLog{})
	initPhase.Store(true)
	w, h := windowSize()
	wv = webview2.NewWithOptions(webview2.WebViewOptions{
		Debug:     false,
		AutoFocus: true,
		DataPath:  filepath.Join(cacheDir, "WebView2"),
		WindowOptions: webview2.WindowOptions{
			Title: appName, Width: w, Height: h, IconId: 2, Center: true,
		},
	})
	initPhase.Store(false)
	if wv == nil {
		return false
	}
	hwnd = uintptr(wv.Window())
	windowMode.Store(1)
	subclassWindow()
	_, _, _ = procShowWindow.Call(hwnd, swMaximize)
	wv.Navigate(url)
	wv.Run()
	windowMode.Store(0)
	// kurz warten, damit letzte Speicher-Anfragen noch fertig werden
	time.Sleep(300 * time.Millisecond)
	return true
}

// Fenster schliessen abfangen: zuerst speichert die Seite alles, dann wird geschlossen.
func subclassWindow() {
	wndProcCB = syscall.NewCallback(func(h, msg, wp, lp uintptr) uintptr {
		if msg == wmClose && !allowClose.Load() && loadedOnce.Load() {
			if closeAsked.CompareAndSwap(false, true) {
				wv.Eval(`try{ window.KT_appClosing ? window.KT_appClosing() : 0 }catch(e){}`)
				go func() {
					time.Sleep(5 * time.Second) // Sicherheitsnetz
					closeAppWindow()
				}()
			}
			return 0
		}
		r, _, _ := procCallWindowProcW.Call(origWndProc, h, msg, wp, lp)
		return r
	})
	// GWLP_WNDPROC = -4
	origWndProc, _, _ = procSetWindowLongPtrW.Call(hwnd, ^uintptr(3), wndProcCB)
	if origWndProc == 0 {
		allowClose.Store(true)
	}
}

func closeAppWindow() {
	if windowMode.Load() == 1 && hwnd != 0 {
		allowClose.Store(true)
		_, _, _ = procPostMessageW.Call(hwnd, wmClose, 0, 0)
	}
}

func windowLoaded() { _ = os.Remove(markerPath()) }

func bringWindowToFront() {
	if windowMode.Load() == 1 && wv != nil {
		wv.Dispatch(func() {
			if r, _, _ := procIsIconic.Call(hwnd); r != 0 {
				_, _, _ = procShowWindow.Call(hwnd, swRestore)
			}
			_, _, _ = procSetForegroundWindow.Call(hwnd)
		})
		return
	}
	openInBrowser(listenURL)
}

func findBrowserExe() string {
	pf := os.Getenv("ProgramFiles")
	pf86 := os.Getenv("ProgramFiles(x86)")
	la := os.Getenv("LocalAppData")
	for _, p := range []string{
		filepath.Join(pf86, `Microsoft\Edge\Application\msedge.exe`),
		filepath.Join(pf, `Microsoft\Edge\Application\msedge.exe`),
		filepath.Join(la, `Microsoft\Edge\Application\msedge.exe`),
		filepath.Join(pf, `Google\Chrome\Application\chrome.exe`),
		filepath.Join(pf86, `Google\Chrome\Application\chrome.exe`),
		filepath.Join(la, `Google\Chrome\Application\chrome.exe`),
		filepath.Join(pf, `BraveSoftware\Brave-Browser\Application\brave.exe`),
	} {
		if exists(p) {
			return p
		}
	}
	return ""
}

// Edge/Chrome im "App-Modus" (Fenster ohne Adressleiste).
func runBrowserApp(url string) {
	windowMode.Store(2)
	exe := findBrowserExe()
	if exe == "" {
		openInBrowser(url)
		waitHeartbeat()
		return
	}
	cmd := exec.Command(exe, "--app="+url, "--user-data-dir="+filepath.Join(cacheDir, "BrowserProfil"),
		"--no-first-run", "--no-default-browser-check", "--start-maximized", "--disable-features=Translate")
	start := time.Now()
	if err := cmd.Start(); err != nil {
		logf("Browser-Start fehlgeschlagen: %v", err)
		openInBrowser(url)
		waitHeartbeat()
		return
	}
	done := make(chan struct{})
	go func() { _ = cmd.Wait(); close(done) }()
	select {
	case <-done:
		if time.Since(start) < 8*time.Second {
			waitHeartbeat() // Browser hat an einen laufenden Prozess übergeben
		}
	case <-quitCh:
	}
}

func openInBrowser(u string) {
	_ = exec.Command("rundll32", "url.dll,FileProtocolHandler", u).Start()
}

func openFolder(p string) {
	_ = exec.Command("explorer", p).Start()
}
