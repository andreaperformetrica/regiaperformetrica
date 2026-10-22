"""Serve the imported single-file app without exposing workspace files."""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

INDEX = Path(__file__).resolve().with_name("index.html")


class Handler(BaseHTTPRequestHandler):
    def do_HEAD(self):
        self.serve(head_only=True)

    def do_GET(self):
        self.serve()

    def serve(self, head_only=False):
        if urlsplit(self.path).path not in ("/", "/index.html"):
            self.send_error(404)
            return
        content = INDEX.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if not head_only:
            self.wfile.write(content)


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 5000), Handler).serve_forever()
