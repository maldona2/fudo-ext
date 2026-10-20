"""Fotos diarias de stock y conciliación entre dos fotos. Solo lectura.

La API solo da el stock actual, así que guardamos una foto por día (CSV).
Entre dos fotos se cumple, si todo se registró bien:

    stock_final = stock_inicial + compras − ventas

Lo que no cierra es un ajuste manual de stock, una compra cargada sin ítems,
o un producto cuyo stock FUDO no descuenta (p. ej. los "PY" de PedidosYa).
"""

import csv
import datetime as dt
import os
from collections import Counter

from .summary import UTC_OFFSET_H, _attr, _rel, _rels, fetch_with_included

FIELDS = ["id", "code", "name", "stock", "minStock", "cost", "price", "stockControl", "active"]
AR_TZ = dt.timezone(dt.timedelta(hours=UTC_OFFSET_H))


def take_snapshot(client):
    rows = []
    for p in client.paginate("/products"):
        a = p["attributes"]
        rows.append({"id": p["id"], **{f: a.get(f) for f in FIELDS[1:]}})
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0), rows


def snapshot_path(directory, day):
    return os.path.join(directory, f"{day}.csv")


def save_snapshot(directory, taken_at, rows):
    """Guarda la foto con el nombre del día (hora AR) en que se tomó."""
    os.makedirs(directory, exist_ok=True)
    path = snapshot_path(directory, taken_at.astimezone(AR_TZ).date())
    with open(path, "w", newline="") as f:
        f.write(f"# taken_at={taken_at.isoformat()}\n")
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    return path


def load_snapshot(path):
    with open(path, newline="") as f:
        taken_at = dt.datetime.fromisoformat(f.readline().strip().split("=", 1)[1])
        rows = {}
        for r in csv.DictReader(f):
            r["stock"] = float(r["stock"]) if r["stock"] else 0.0
            r["stockControl"] = r["stockControl"] == "True"
            rows[r["id"]] = r
    return taken_at, rows


def _window(start, end):
    fmt = "%Y-%m-%dT%H:%M:%SZ"
    return f"and(gte.{start.astimezone(dt.timezone.utc):{fmt}},lte.{end.astimezone(dt.timezone.utc):{fmt}})"


def movements(client, start, end):
    """Unidades vendidas y compradas por producto entre dos momentos."""
    window = _window(start, end)
    sold = Counter()
    sales, inc = fetch_with_included(client, "/sales", **{"filter[createdAt]": window, "include": "items"})
    for s in sales:
        if s["attributes"]["saleState"] == "CANCELED":
            continue
        for key in _rels(s, "items"):
            item = inc[key]
            product = _rel(item, "product")
            if product and not item["attributes"].get("canceled"):
                sold[product[1]] += item["attributes"]["quantity"]

    bought = Counter()
    expenses, einc = fetch_with_included(client, "/expenses", **{
        "filter[createdAt]": window,
        "include": "expenseItems",
        # Sin fields[...] /expenses devuelve solo ids.
        "fields[expense]": "canceled,expenseItems",
        "fields[expenseItem]": "canceled,quantity,product",
    })
    for e in expenses:
        if e["attributes"].get("canceled"):
            continue
        for key in _rels(e, "expenseItems"):
            product = _rel(einc[key], "product")
            if product and not _attr(einc, key, "canceled"):
                bought[product[1]] += _attr(einc, key, "quantity", 0)
    return sold, bought


def reconcile(opening, closing, sold, bought):
    """Productos con control de stock cuyo stock final no cierra."""
    diffs = []
    for pid, close in closing.items():
        if not close["stockControl"] or pid not in opening:
            continue
        start = opening[pid]["stock"]
        expected = start + bought[pid] - sold[pid]
        diff = close["stock"] - expected
        if abs(diff) > 1e-6:
            diffs.append({"id": pid, "name": close["name"], "opening": start, "bought": bought[pid],
                          "sold": sold[pid], "expected": expected, "closing": close["stock"], "diff": diff})
    diffs.sort(key=lambda d: d["diff"])
    return diffs
