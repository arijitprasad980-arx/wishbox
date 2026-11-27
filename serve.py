from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent


class WishboxHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        path, separator, query = self.path.partition("?")
        if path == "/edit":
            path = "/edit.html"
        elif path == "/wishbox":
            path = "/wishbox/"

        if path == "/wishbox/" or path.startswith("/wishbox/"):
            path = path[len("/wishbox"):]

        self.path = path + (separator + query if separator else "")
        super().do_GET()


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 4173), WishboxHandler).serve_forever()
