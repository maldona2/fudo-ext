"""Resumen diario por local — SOLO LECTURA.

Uso: python3 scripts/daily_summary.py [AAAA-MM-DD] [--nombre "Los Hornos Belgrano"] [--json] [--telegram]
Sin fecha, usa el día de ayer (hora Argentina).
--telegram envía el mensaje a TELEGRAM_CHAT_ID (uno o varios separados por coma).
--chats muestra los chats que le escribieron al bot, para obtener el chat_id.
"""

import argparse
import datetime as dt
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fudo import FudoClient  # noqa: E402
from fudo import summary, telegram  # noqa: E402
from fudo.client import load_dotenv  # noqa: E402


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("day", nargs="?", type=dt.date.fromisoformat)
    parser.add_argument("--nombre", default=os.environ.get("FUDO_LOCAL_NAME", "Los Hornos"))
    parser.add_argument("--json", action="store_true", help="salida en JSON en vez de texto")
    parser.add_argument("--telegram", action="store_true", help="enviar por Telegram además de imprimir")
    parser.add_argument("--chats", action="store_true", help="listar chats que le escribieron al bot")
    args = parser.parse_args()

    load_dotenv()
    if args.chats:
        for chat_id, name in telegram.recent_chats().items():
            print(chat_id, name)
        return

    now_ar = dt.datetime.now(dt.timezone(dt.timedelta(hours=summary.UTC_OFFSET_H)))
    day = args.day or now_ar.date() - dt.timedelta(days=1)

    data = summary.build(FudoClient.from_env(), day)
    if args.json:
        print(json.dumps(data, default=str, ensure_ascii=False, indent=2))
        return
    text = summary.format_text(data, args.nombre)
    print(text)
    if args.telegram:
        telegram.send(text)


if __name__ == "__main__":
    main()
