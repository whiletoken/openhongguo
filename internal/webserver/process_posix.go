//go:build !windows

package webserver

import (
	"os"
	"syscall"
)

// IsProcessAlive checks whether the process with the given PID is currently running on POSIX systems.
func IsProcessAlive(pid int) bool {
	if pid <= 0 {
		return false
	}
	proc, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	return proc.Signal(syscall.Signal(0)) == nil
}

// KillProcess terminates the process with the given PID on POSIX systems.
func KillProcess(pid int) error {
	if pid <= 0 {
		return nil
	}
	proc, err := os.FindProcess(pid)
	if err != nil {
		return err
	}
	return proc.Kill()
}
