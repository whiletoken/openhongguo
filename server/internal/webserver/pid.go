package webserver

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// PIDManager manages creation, validation, and cleanup of the application PID file.
type PIDManager struct {
	path string
	pid  int
}

// AcquirePIDFile inspects an existing PID file, removes stale/expired PIDs to avoid restart failures,
// terminates old running instances if present, and records the current PID.
func AcquirePIDFile(pidPath string) (*PIDManager, error) {
	if pidPath == "" {
		return nil, fmt.Errorf("pid file path cannot be empty")
	}

	if err := os.MkdirAll(filepath.Dir(pidPath), 0755); err != nil {
		return nil, fmt.Errorf("failed to create directory for pid file: %w", err)
	}

	myPid := os.Getpid()

	// Check existing PID file
	if content, err := os.ReadFile(pidPath); err == nil {
		oldPidStr := strings.TrimSpace(string(content))
		if oldPid, pErr := strconv.Atoi(oldPidStr); pErr == nil && oldPid > 0 {
			if oldPid == myPid {
				return &PIDManager{path: pidPath, pid: myPid}, nil
			}

			if IsProcessAlive(oldPid) {
				fmt.Printf("检测到正在运行的旧实例 (PID %d)，正在终止旧进程以释放端口并允许重启...\n", oldPid)
				_ = KillProcess(oldPid)

				// Wait up to 2 seconds for process to exit and release bound sockets
				for i := 0; i < 20; i++ {
					time.Sleep(100 * time.Millisecond)
					if !IsProcessAlive(oldPid) {
						break
					}
				}
				// Extra grace period for OS TCP socket cleanup
				time.Sleep(200 * time.Millisecond)
			} else {
				fmt.Printf("发现过期的 PID 文件 (PID %d 已不存在)，已清理以避免无法重启。\n", oldPid)
			}
		}
		_ = os.Remove(pidPath)
	}

	// Write current process PID
	if err := os.WriteFile(pidPath, []byte(strconv.Itoa(myPid)), 0644); err != nil {
		return nil, fmt.Errorf("failed to write pid file %s: %w", pidPath, err)
	}

	return &PIDManager{
		path: pidPath,
		pid:  myPid,
	}, nil
}

// Release removes the PID file if it still belongs to this process.
func (pm *PIDManager) Release() {
	if pm == nil || pm.path == "" {
		return
	}
	content, err := os.ReadFile(pm.path)
	if err == nil && strings.TrimSpace(string(content)) == strconv.Itoa(pm.pid) {
		_ = os.Remove(pm.path)
	}
}

// Path returns the PID file path.
func (pm *PIDManager) Path() string {
	if pm == nil {
		return ""
	}
	return pm.path
}

// PID returns the managed PID.
func (pm *PIDManager) PID() int {
	if pm == nil {
		return 0
	}
	return pm.pid
}
