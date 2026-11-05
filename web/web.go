package web

import (
	"embed"
	"io/fs"
)

//go:embed index.html css/* js/*
var assets embed.FS

// Assets returns the embedded file system containing all web frontend files.
func Assets() fs.FS {
	return assets
}
