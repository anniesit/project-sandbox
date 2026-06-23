#!/usr/bin/env python3
# Minimal static file server for previewing chart.html.
# Lives in the filmtv sandbox; serves this directory on the given port.
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)

from http.server import HTTPServer, SimpleHTTPRequestHandler

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8753
httpd = HTTPServer(("127.0.0.1", port), SimpleHTTPRequestHandler)
print("serving %s on http://127.0.0.1:%d" % (ROOT, port))
httpd.serve_forever()
