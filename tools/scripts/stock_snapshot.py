"""Foto del stock de todos los productos — SOLO LECTURA.

Uso: python3 scripts/stock_snapshot.py [--dir data/stock] [--force]
Guarda <dir>/<AAAA-MM-DD>.csv con el día (hora AR) en que se toma. Si ya hay
una foto de ese día no la pisa (la primera del día es la de apertura), salvo --force.
"""

import argparse
import datetime as dt
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fudo import FudoClient  # noqa: E402
from fudo import stock  # noqa: E402


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", default="data/stock")
    parser.add_argument("--force", action="store_true", help="pisar la foto del día si ya existe")
    args = parser.parse_args()

    today = dt.datetime.now(stock.AR_TZ).date()
    path = stock.snapshot_path(args.dir, today)
    if os.path.exists(path) and not args.force:
        print(f"Ya existe {path}, no se pisa")
        return

    taken_at, rows = stock.take_snapshot(FudoClient.from_env())
    path = stock.save_snapshot(args.dir, taken_at, rows)
    print(f"{path}: {len(rows)} productos ({taken_at.isoformat()})")


if __name__ == "__main__":
    main()
