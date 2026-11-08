package logger

import (
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"go.uber.org/zap"
)

func TestLoggerInitAndWrite(t *testing.T) {
	tempDir := t.TempDir()
	logFile := "test-run.log"

	cfg := Config{
		Level:         "debug",
		LogDir:        tempDir,
		Filename:      logFile,
		EnableConsole: false,
		EnableFile:    true,
		MaxSize:       5,
		MaxBackups:    2,
		MaxAge:        1,
		Compress:      false,
	}

	l, err := Init(cfg)
	if err != nil {
		t.Fatalf("Init failed: %v", err)
	}
	if l == nil {
		t.Fatal("expected non-nil logger")
	}

	Debug("debug event", zap.String("module", "test"))
	Info("info event", zap.Int("status", 200))
	Warn("warning event")
	Error("error event", zap.String("reason", "mock_failure"))
	Infof("formatted %s with %d", "string", 42)

	_ = Sync()

	content, err := os.ReadFile(filepath.Join(tempDir, logFile))
	if err != nil {
		t.Fatalf("failed to read log file: %v", err)
	}
	str := string(content)

	if !strings.Contains(str, "debug event") {
		t.Errorf("expected debug event in log file, got:\n%s", str)
	}
	if !strings.Contains(str, "info event") {
		t.Errorf("expected info event in log file, got:\n%s", str)
	}
	if !strings.Contains(str, "warning event") {
		t.Errorf("expected warning event in log file, got:\n%s", str)
	}
	if !strings.Contains(str, "mock_failure") {
		t.Errorf("expected mock_failure in log file, got:\n%s", str)
	}
	if !strings.Contains(str, "formatted string with 42") {
		t.Errorf("expected formatted string in log file, got:\n%s", str)
	}
}

func TestSafeGoRecoversPanic(t *testing.T) {
	var wg sync.WaitGroup
	wg.Add(1)

	// SafeGo should catch this panic without crashing the process
	SafeGo(func() {
		defer wg.Done()
		panic("simulated fatal crash in background task")
	})

	wg.Wait()
	time.Sleep(50 * time.Millisecond)
}

func TestSafeGoNamedRecoversPanic(t *testing.T) {
	var wg sync.WaitGroup
	wg.Add(1)

	SafeGoNamed("prefetch_worker", func() {
		defer wg.Done()
		panic("nil pointer dereference inside prefetch_worker")
	})

	wg.Wait()
	time.Sleep(50 * time.Millisecond)
}
