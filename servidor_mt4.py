#!/usr/bin/env python3
"""
Elder Trader - Servidor MT4 com CORS correto
Substitui o servidor simples que nao suporta OPTIONS (erro 501)

Como usar:
  python servidor_mt4.py

Coloque este arquivo na mesma pasta que os .json do MT4 (MQL4/Files)
"""

import http.server
import os
import sys

PORT = 3000

class CORSHandler(http.server.SimpleHTTPRequestHandler):

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        super().end_headers()

    def do_OPTIONS(self):
        """Responde corretamente ao preflight CORS — sem erro 501"""
        self.send_response(200)
        self.end_headers()

    def log_message(self, format, *args):
        """Log simplificado — mostra so 200 e 404"""
        code = args[1] if len(args) > 1 else "?"
        path = args[0].split('"')[1] if '"' in args[0] else args[0]
        if code == "200":
            print(f"  [OK]  {path}")
        elif code == "404":
            print(f"  [404] {path}  <- par nao aberto no MT4")
        # Ignora OPTIONS no log para nao poluir


def main():
    print("=" * 45)
    print("  Elder Trader - Servidor MT4 (CORS OK)")
    print("=" * 45)
    print(f"\n  Pasta: {os.getcwd()}")
    print(f"  URL:   http://localhost:{PORT}")
    print(f"\n  Arquivos disponiveis:")

    jsons = sorted([f for f in os.listdir(".") if f.endswith(".json")])
    if jsons:
        for f in jsons:
            print(f"    - {f}")
    else:
        print("    NENHUM .json encontrado nesta pasta!")
        print("    Verifique se o EA do MT4 esta exportando os arquivos.")

    print("\n  Deixe essa janela aberta!\n")
    print("-" * 45)

    try:
        with http.server.HTTPServer(("", PORT), CORSHandler) as httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n\n  Servidor encerrado.")
    except OSError as e:
        if "Address already in use" in str(e) or "10048" in str(e):
            print(f"\n  ERRO: Porta {PORT} ja esta em uso!")
            print(f"  Feche o outro servidor e tente novamente.")
        else:
            raise

if __name__ == "__main__":
    main()
