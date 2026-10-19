"""Resumen diario por local — SOLO LECTURA.

Uso: python3 scripts/daily_summary.py [AAAA-MM-DD] [--nombre "Los Hornos Belgrano"] [--json]
Sin fecha, usa el día de ayer (hora Argentina).
"""

import argparse
import datetime as dt
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fudo import FudoClient  # noqa: E402
from fudo import summary  # noqa: E402


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("day", nargs="?", type=dt.date.fromisoformat)
    parser.add_argument("--nombre", default=os.environ.get("FUDO_LOCAL_NAME", "Los Hornos"))
    parser.add_argument("--json", action="store_true", help="salida en JSON en vez de texto")
    args = parser.parse_args()

    now_ar = dt.datetime.now(dt.timezone(dt.timedelta(hours=summary.UTC_OFFSET_H)))
    day = args.day or now_ar.date() - dt.timedelta(days=1)

    data = summary.build(FudoClient.from_env(), day)
    if args.json:
        print(json.dumps(data, default=str, ensure_ascii=False, indent=2))
    else:
        print(summary.format_text(data, args.nombre))


if __name__ == "__main__":
    main()
