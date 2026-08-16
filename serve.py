"""Serve the app on this machine for testing.

    python serve.py            # http://localhost:8000
    python serve.py 9000       # pick a port

Camera note: browsers only hand over a camera on a *secure* origin.
localhost counts as secure, so scanning works on this PC straight away.
Opening http://192.168.x.x:8000 on your phone will show the app but the
camera will stay dark -- see README.md for putting it on real https.
"""

import http.server
import socket
import socketserver
import sys
import os

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
os.chdir(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = dict(http.server.SimpleHTTPRequestHandler.extensions_map)
    extensions_map[".webmanifest"] = "application/manifest+json"

    def end_headers(self):
        # No caching while developing, or the service worker will keep
        # handing you yesterday's stylesheet.
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("  %s\n" % (fmt % args))


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("0.0.0.0", PORT), Handler) as httpd:
    print("\n  Bookshelf")
    print("  ---------")
    print("  this PC     http://localhost:%d" % PORT)
    print("  this network http://%s:%d   (no camera: needs https)" % (lan_ip(), PORT))
    print("\n  Ctrl+C to stop\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  stopped\n")
