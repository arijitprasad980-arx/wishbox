from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parent


class SPAHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        request_path = self.path.split("?", 1)[0]
        if request_path == "/edit":
            shell = ROOT / "edit.html"
            if shell.is_file():
                content = shell.read_text(encoding="utf-8")
                content = content.replace(
                    '<link rel="stylesheet" href="/assets/styles-BO52kEcd.css" data-precedence="default"/>',
                    '<link rel="stylesheet" href="/assets/styles-BO52kEcd.css" data-precedence="default"/><link rel="stylesheet" href="/assets/cake-wish.css?v=5"/>',
                    1,
                )
                content = re.sub(
                    r'<script defer src="/__l5e/events\.[^"]+"[^>]*></script>',
                    "",
                    content,
                    count=1,
                )
                content = content.replace(
                    "</body>",
                    '<script type="module" src="/assets/cake-wish.js?v=6"></script></body>',
                    1,
                )
                payload = content.encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
                return
        if request_path in ("", "/"):
            shell = ROOT / "home.html"
            if shell.is_file():
                content = shell.read_text(encoding="utf-8")
                content = content.replace(
                    '<link rel="stylesheet" href="/assets/styles-BO52kEcd.css" data-precedence="default"/>',
                    '<link rel="stylesheet" href="/assets/styles-BO52kEcd.css" data-precedence="default"/><link rel="stylesheet" href="/assets/cake-wish.css?v=5"/>',
                    1,
                )
                content = re.sub(
                    r'<script defer src="/__l5e/events\.[^"]+"[^>]*></script>',
                    "",
                    content,
                    count=1,
                )
                content = content.replace(
                    '<script type="module" async="" src="/assets/index-iWzc-Qn0.js"></script>',
                    "",
                    1,
                )
                content = content.replace("Open your wish", "", 1)
                content = content.replace(
                    "</body>",
                    '<script type="module" src="/assets/cake-wish.js?v=6"></script></body>',
                    1,
                )
                payload = content.encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
                return
        path = self.translate_path(request_path)
        if not Path(path).is_file() and not request_path.startswith("/assets/"):
            self.path = "/index.html"
        super().do_GET()


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 4173), SPAHandler).serve_forever()
