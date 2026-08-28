#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""سيرفر معاينة محلي - يمنع المتصفح من تخزين نسخ قديمة من الصفحة"""
import http.server
import socketserver

PORT = 8000


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        print("📋", self.address_string(), "-", fmt % args)


if __name__ == "__main__":
    with socketserver.TCPServer(("", PORT), NoCacheHandler) as httpd:
        print(f"🚀 السيرفر شغال على البورت {PORT} (بدون كاش)")
        httpd.serve_forever()
