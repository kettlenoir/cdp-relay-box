#!/usr/bin/env python3
"""CDP relay for muse-box.

Listens on the muse-net gateway address (172.31.0.1:9222, reachable only from
inside the muse-net bridge) and forwards raw TCP to Chrome's CDP endpoint on
the host loopback (127.0.0.1:9222). Raw TCP forwarding keeps WebSocket
connections (CDP) working unchanged.
"""
import socket
import threading

LISTEN = ("172.31.0.1", 9222)
TARGET = ("127.0.0.1", 9222)


def pump(src, dst):
    try:
        while True:
            data = src.recv(65536)
            if not data:
                break
            dst.sendall(data)
    except OSError:
        pass
    finally:
        try:
            dst.shutdown(socket.SHUT_WR)
        except OSError:
            pass


def handle(client):
    try:
        upstream = socket.create_connection(TARGET, timeout=10)
    except OSError:
        client.close()
        return
    t = threading.Thread(target=pump, args=(client, upstream), daemon=True)
    t.start()
    pump(upstream, client)
    try:
        client.close()
    except OSError:
        pass
    try:
        upstream.close()
    except OSError:
        pass


def main():
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(LISTEN)
    srv.listen(64)
    while True:
        conn, _ = srv.accept()
        threading.Thread(target=handle, args=(conn,), daemon=True).start()


if __name__ == "__main__":
    main()
