#!/usr/bin/env python3
"""DADA 背单词 - 启动器"""
import http.server
import webbrowser
import threading
import os
import sys

os.chdir(os.path.dirname(os.path.abspath(__file__)))

PORT = 8765
ADDR = '127.0.0.1'
URL = f'http://{ADDR}:{PORT}/index.html'

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    def end_headers(self):
        path = self.path.split('?')[0]
        if path.endswith('.css') or path.endswith('.js'):
            self.send_header('Cache-Control', 'public, max-age=86400')
        elif path.endswith('.json'):
            self.send_header('Cache-Control', 'public, max-age=3600')
        else:
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()
    def log_message(self, fmt, *args):
        pass  # quiet

class ThreadedServer(http.server.ThreadingHTTPServer):
    daemon_threads = True

def open_browser():
    import time
    time.sleep(0.5)
    webbrowser.open(URL)

t = threading.Thread(target=open_browser, daemon=True)
t.start()

print(f'DADA 服务已启动：{URL}')
print('按 Ctrl+C 停止服务')
sys.stdout.flush()

try:
    server = ThreadedServer((ADDR, PORT), NoCacheHandler)
    server.serve_forever()
except KeyboardInterrupt:
    print('\n服务已停止')
    server.shutdown()
