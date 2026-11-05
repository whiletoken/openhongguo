package webserver

import (
	"embed"
	"io/fs"
)

//go:embed assets/*
var assetsFS embed.FS

// EmbeddedAssets returns the embedded web assets filesystem.
func EmbeddedAssets() fs.FS {
	sub, err := fs.Sub(assetsFS, "assets")
	if err != nil {
		return assetsFS
	}
	return sub
}
