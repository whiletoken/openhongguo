package webserver

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func TestIsProcessAlive(t *testing.T) {
	myPid := os.Getpid()
	if !IsProcessAlive(myPid) {
		t.Errorf("expected current process %d to be alive", myPid)
	}

	fakePid := 99999999
	if IsProcessAlive(fakePid) {
		t.Errorf("expected non-existent process %d to be dead", fakePid)
	}
}

func TestAcquirePIDFileLifecycle(t *testing.T) {
	tmpDir := t.TempDir()
	pidPath := filepath.Join(tmpDir, "test.pid")

	// 1. Initial acquire
	pm, err := AcquirePIDFile(pidPath)
	if err != nil {
		t.Fatalf("AcquirePIDFile failed: %v", err)
	}

	content, err := os.ReadFile(pidPath)
	if err != nil {
		t.Fatalf("failed to read pid file: %v", err)
	}
	if strings.TrimSpace(string(content)) != strconv.Itoa(os.Getpid()) {
		t.Errorf("expected pid %d, got %s", os.Getpid(), string(content))
	}

	// 2. Release
	pm.Release()
	if _, err := os.Stat(pidPath); !os.IsNotExist(err) {
		t.Errorf("expected pid file to be removed after release")
	}
}

func TestAcquirePIDFileWithStalePID(t *testing.T) {
	tmpDir := t.TempDir()
	pidPath := filepath.Join(tmpDir, "test.pid")

	// Write a dead/stale PID
	deadPid := 99999999
	_ = os.WriteFile(pidPath, []byte(strconv.Itoa(deadPid)), 0644)

	// AcquirePIDFile should detect the dead PID, remove it, and write current PID
	pm, err := AcquirePIDFile(pidPath)
	if err != nil {
		t.Fatalf("AcquirePIDFile with stale PID failed: %v", err)
	}
	defer pm.Release()

	content, err := os.ReadFile(pidPath)
	if err != nil {
		t.Fatalf("failed to read pid file: %v", err)
	}
	if strings.TrimSpace(string(content)) != strconv.Itoa(os.Getpid()) {
		t.Errorf("expected current pid %d, got %s", os.Getpid(), string(content))
	}
}
