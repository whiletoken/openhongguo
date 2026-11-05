package webserver

import (
	"io/fs"

	"github.com/beilunyang/openhongguo/web"
)

// EmbeddedAssets returns the embedded web assets filesystem from the web package.
func EmbeddedAssets() fs.FS {
	return web.Assets()
}
