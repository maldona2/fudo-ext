"""Prueba técnica Fase 0.5 — SOLO LECTURA.

Uso: python3 scripts/smoke_test.py [AAAA-MM-DD]
Autentica y lee usuarios, roles, productos, ingredientes, ventas, ítems,
pagos y gastos de un día. No escribe nada en FUDO.
"""

import datetime as dt
import os
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fudo import FudoClient, FudoError  # noqa: E402


def check(name, fn):
    try:
        result = fn()
        print(f"[OK]   {name}: {result}")
    except FudoError as e:
        print(f"[FAIL] {name}: {e}")


def main():
    day = dt.date.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else dt.date.today() - dt.timedelta(days=1)
    rng = f"and(gte.{day}T00:00:00Z,lt.{day + dt.timedelta(days=1)}T00:00:00Z)"
    c = FudoClient.from_env()

    def token():
        c.token()
        return f"vence {dt.datetime.fromtimestamp(c._exp)}"

    check("token", token)
    check("users", lambda: [u["attributes"].get("name") for u in c.paginate("/users")])
    check("roles", lambda: [r["attributes"].get("name") for r in c.paginate("/roles")])

    def products():
        ps = list(c.paginate("/products"))
        with_code = sum(1 for p in ps if p["attributes"].get("code"))
        stock_ctl = sum(1 for p in ps if p["attributes"].get("stockControl"))
        return f"{len(ps)} productos, {with_code} con código, {stock_ctl} con control de stock; ej: {ps[0]['attributes'] if ps else '-'}"

    def ingredients():
        ings = list(c.paginate("/ingredients"))
        return f"{len(ings)} ingredientes; ej: {ings[0]['attributes'] if ings else '-'}"

    def sales():
        ss = list(c.paginate("/sales", **{"filter[createdAt]": rng}))
        states = Counter(s["attributes"].get("saleState") for s in ss)
        total = sum(s["attributes"].get("total") or 0 for s in ss)
        return f"{len(ss)} ventas el {day}, total {total}, estados {dict(states)}"

    def sale_detail():
        page = c.get("/sales", **{"filter[createdAt]": rng, "page[size]": 1,
                                  "include": "items,items.createdBy,payments.paymentMethod,cashRegister,discounts"})
        if not page.get("data"):
            return "sin ventas ese día"
        s = page["data"][0]
        types = Counter(i["type"] for i in page.get("included", []))
        return f"venta {s['id']} relaciones={list(s.get('relationships', {}))} incluidos={dict(types)}"

    def payments():
        ps = list(c.paginate("/payments", **{"filter[createdAt]": rng, "include": "paymentMethod"}))
        return f"{len(ps)} pagos; ej: {ps[0] if ps else '-'}"

    def expenses():
        es = list(c.paginate("/expenses", **{"filter[date]": f"and(gte.{day},lte.{day})"}))
        return f"{len(es)} gastos; ej: {es[0]['attributes'] if es else '-'}"

    for name, fn in [("products", products), ("ingredients", ingredients), ("sales", sales),
                     ("sale detail", sale_detail), ("payments", payments), ("expenses", expenses)]:
        check(name, fn)


if __name__ == "__main__":
    main()
