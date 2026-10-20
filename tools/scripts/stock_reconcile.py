"""Conciliación de stock de un día — SOLO LECTURA.

Uso: python3 scripts/stock_reconcile.py [AAAA-MM-DD] [--dir data/stock] [--telegram]
Compara la foto del día (apertura) con la del día siguiente (cierre) contra
las ventas y compras registradas entre ambas. Sin fecha, usa ayer (hora AR).
"""

import argparse
import datetime as dt
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fudo import FudoClient  # noqa: E402
from fudo import stock, telegram  # noqa: E402
from fudo.client import load_dotenv  # noqa: E402
from fudo.summary import WEEKDAYS, qty  # noqa: E402

LIMIT = 20  # máximo de productos listados en el mensaje


def format_text(day, local_name, opening_at, closing_at, diffs):
    hours = (closing_at - opening_at).total_seconds() / 3600
    out = [f"*{local_name} — stock del {WEEKDAYS[day.weekday()]} {day:%d/%m}*",
           f"Fotos: {opening_at.astimezone(stock.AR_TZ):%d/%m %H:%M} → "
           f"{closing_at.astimezone(stock.AR_TZ):%d/%m %H:%M} ({hours:.0f} h)", ""]
    if not diffs:
        out.append("✅ El stock cierra en todos los productos con control de stock")
        return "\n".join(out)
    out.append(f"*{len(diffs)} producto(s) no cierran* (inicial + compras − ventas ≠ final)")
    for d in diffs[:LIMIT]:
        sign = "+" if d["diff"] > 0 else ""
        out.append(f"• {d['name']}: {sign}{qty(d['diff'])} — {qty(d['opening'])} + {qty(d['bought'])} "
                   f"− {qty(d['sold'])} = {qty(d['expected'])}, hay {qty(d['closing'])}")
    if len(diffs) > LIMIT:
        out.append(f"• … y {len(diffs) - LIMIT} más")
    out.append("")
    out.append("Negativo: falta mercadería o ajuste a la baja. Positivo: ajuste a mano o compra sin ítems.")
    return "\n".join(out)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("day", nargs="?", type=dt.date.fromisoformat)
    parser.add_argument("--dir", default="data/stock")
    parser.add_argument("--nombre", default=os.environ.get("FUDO_LOCAL_NAME", "Los Hornos"))
    parser.add_argument("--telegram", action="store_true")
    args = parser.parse_args()
    load_dotenv()

    day = args.day or dt.datetime.now(stock.AR_TZ).date() - dt.timedelta(days=1)
    paths = [stock.snapshot_path(args.dir, d) for d in (day, day + dt.timedelta(days=1))]
    missing = [p for p in paths if not os.path.exists(p)]
    if missing:
        print(f"Faltan fotos de stock: {', '.join(missing)}. No se concilia {day}.")
        return

    opening_at, opening = stock.load_snapshot(paths[0])
    closing_at, closing = stock.load_snapshot(paths[1])
    sold, bought = stock.movements(FudoClient.from_env(), opening_at, closing_at)
    text = format_text(day, args.nombre, opening_at, closing_at,
                       stock.reconcile(opening, closing, sold, bought))
    print(text)
    if args.telegram:
        telegram.send(text)


if __name__ == "__main__":
    main()
