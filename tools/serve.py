"""Static dev server for the domino 404 that tells the browser never to reuse a cached file.

The stock `python3 -m http.server` sends no Cache-Control, so Chrome keeps serving JavaScript modules
from its heuristic cache after they change; a plain reload then shows an old build.
    python3 tools/serve.py [port] [directory]
"""
import functools
import http.server
import sys


class NoStore(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 3015
    root = sys.argv[2] if len(sys.argv) > 2 else '.'
    handler = functools.partial(NoStore, directory=root)
    with http.server.ThreadingHTTPServer(('127.0.0.1', port), handler) as httpd:
        print(f'Serving {root} on http://127.0.0.1:{port} (no-store)', flush=True)
        httpd.serve_forever()
