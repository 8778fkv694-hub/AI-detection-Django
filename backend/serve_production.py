#!/usr/bin/env python3
"""生产环境 WSGI 入口（Gunicorn）。

设计要点：
- 默认 1 worker + 多 threads。模型推理重，多 worker 会让 OCR/YOLO 模型在每个进程
  重复加载，浪费 ~1GB 内存；threads 共享同一份模型即可应付并发请求。
- 保持原 wsgiref 版本的 CLI 接口（--host / --port），systemd 与启动脚本无需修改。
- 没装 gunicorn 时回退到 wsgiref，避免开发机一次性失败。
"""
import argparse
import os
import sys

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")


def main() -> None:
    parser = argparse.ArgumentParser(description="Production WSGI server for Django")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--workers", type=int,
                        default=int(os.environ.get("GUNICORN_WORKERS", "1")))
    parser.add_argument("--threads", type=int,
                        default=int(os.environ.get("GUNICORN_THREADS", "8")))
    parser.add_argument("--timeout", type=int,
                        default=int(os.environ.get("GUNICORN_TIMEOUT", "120")))
    args = parser.parse_args()

    try:
        from gunicorn.app.base import BaseApplication
    except ImportError:
        print("[serve_production] gunicorn 未安装，回退到 wsgiref（仅适合开发）。"
              "请在 venv 内执行: pip install gunicorn")
        _run_wsgiref_fallback(args.host, args.port)
        return

    from config.wsgi import application

    options = {
        "bind": f"{args.host}:{args.port}",
        "workers": args.workers,
        "threads": args.threads,
        "worker_class": "gthread",
        "timeout": args.timeout,
        "graceful_timeout": 30,
        "keepalive": 5,
        # 长连接 MJPEG 不能被 worker 强制回收
        "max_requests": 0,
        "accesslog": "-",
        "errorlog": "-",
        "loglevel": os.environ.get("GUNICORN_LOG_LEVEL", "info"),
        "proc_name": "ai-backend",
    }

    class DjangoApp(BaseApplication):
        def load_config(self):
            for k, v in options.items():
                self.cfg.set(k, v)

        def load(self):
            return application

    print(f"[serve_production] gunicorn on {args.host}:{args.port} "
          f"(workers={args.workers}, threads={args.threads})")
    DjangoApp().run()


def _run_wsgiref_fallback(host: str, port: int) -> None:
    from socketserver import ThreadingMixIn
    from wsgiref.simple_server import WSGIServer, WSGIRequestHandler, make_server
    from config.wsgi import application

    class ThreadedWSGIServer(ThreadingMixIn, WSGIServer):
        daemon_threads = True

    class QuietHandler(WSGIRequestHandler):
        def log_message(self, fmt, *args):
            sys.stdout.write(f"[wsgi] {self.address_string()} - {fmt % args}\n")

    with make_server(host, port, application,
                     server_class=ThreadedWSGIServer,
                     handler_class=QuietHandler) as httpd:
        print(f"[serve_production] wsgiref fallback on http://{host}:{port}")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
