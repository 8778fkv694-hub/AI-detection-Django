#!/usr/bin/env python3
import argparse
import os
from socketserver import ThreadingMixIn
from wsgiref.simple_server import WSGIServer, WSGIRequestHandler, make_server

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
from config.wsgi import application

class ThreadedWSGIServer(ThreadingMixIn, WSGIServer):
    daemon_threads = True

class QuietHandler(WSGIRequestHandler):
    def log_message(self, fmt, *args):
        print(f"[wsgi] {self.address_string()} - {fmt % args}")

def main():
    parser = argparse.ArgumentParser(description="Threaded WSGI server for Django")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    with make_server(args.host, args.port, application, server_class=ThreadedWSGIServer, handler_class=QuietHandler) as httpd:
        print(f"WSGI server listening on http://{args.host}:{args.port}")
        httpd.serve_forever()

if __name__ == "__main__":
    main()
