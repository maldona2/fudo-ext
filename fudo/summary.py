"""Resumen diario de un local a partir de la API de FUDO. Solo lectura.

`build(client, day)` junta los datos y devuelve un dict; `format_text(summary)`
lo convierte en un mensaje listo para WhatsApp (negritas con *...*).
"""

import datetime as dt
from collections import Counter, defaultdict

# Argentina no tiene horario de verano: el día local va de 03:00Z a 02:59:59Z.
UTC_OFFSET_H = -3
LOW_STOCK_LIMIT = 15  # máximo de productos listados con stock bajo


def day_range(day):
    start = dt.datetime.combine(day, dt.time()) - dt.timedelta(hours=UTC_OFFSET_H)
    end = start + dt.timedelta(days=1, seconds=-1)
    return f"and(gte.{start:%Y-%m-%dT%H:%M:%S}Z,lte.{end:%Y-%m-%dT%H:%M:%S}Z)"


def fetch_with_included(client, path, page_size=100, **params):
    """Como paginate, pero también junta los `included` indexados por (tipo, id)."""
    data, included = [], {}
    number = 1
    while True:
        page = client.get(path, **params, **{"page[size]": page_size, "page[number]": number})
        data += page.get("data", [])
        for inc in page.get("included", []):
            included[(inc["type"], inc["id"])] = inc
        if len(page.get("data", [])) < page_size:
            return data, included
        number += 1


def _rel(resource, name):
    """Devuelve la clave (tipo, id) de una relación a uno, o None."""
    data = (resource.get("relationships", {}).get(name) or {}).get("data")
    return (data["type"], data["id"]) if data else None


def _rels(resource, name):
    data = (resource.get("relationships", {}).get(name) or {}).get("data") or []
    return [(d["type"], d["id"]) for d in data]


def _attr(included, key, field, default=None):
    if not key or key not in included:
        return default
    return (included[key].get("attributes") or {}).get(field, default)


def build(client, day):
    rng = day_range(day)
    sales, inc = fetch_with_included(client, "/sales", **{
        "filter[createdAt]": rng,
        "include": "items.product,items.createdBy,discounts,payments.paymentMethod,closedBy",
    })

    closed = [s for s in sales if s["attributes"]["saleState"] == "CLOSED"]
    canceled_sales = [s for s in sales if s["attributes"]["saleState"] == "CANCELED"]
    open_sales = [s for s in sales if s["attributes"]["saleState"] not in ("CLOSED", "CANCELED")]

    by_method = defaultdict(float)
    cash_sales = 0.0
    for s in closed:
        for key in _rels(s, "payments"):
            if _attr(inc, key, "canceled"):
                continue
            amount = _attr(inc, key, "amount", 0.0)
            method = _rel(inc[key], "paymentMethod")
            by_method[_attr(inc, method, "name", "?")] += amount
            if _attr(inc, method, "code") == "cash":
                cash_sales += amount

    products_sold = Counter()
    canceled_items = []
    for s in closed + open_sales:
        for key in _rels(s, "items"):
            item = inc[key]
            a = item["attributes"]
            product = _attr(inc, _rel(item, "product"), "name", "?")
            if a.get("canceled"):
                canceled_items.append({
                    "user": _attr(inc, _rel(item, "createdBy"), "name", "?"),
                    "product": product,
                    "quantity": a["quantity"],
                    "amount": a["price"],  # price es el total de la línea
                    "reason": a.get("cancellationReason"),
                    "comment": a.get("cancellationComment"),
                })
            else:
                products_sold[product] += a["quantity"]

    discounts = defaultdict(lambda: {"count": 0, "amount": 0.0, "percent": 0})
    canceled_discounts = 0
    for s in closed:
        for key in _rels(s, "discounts"):
            if _attr(inc, key, "canceled"):
                canceled_discounts += 1
                continue
            d = discounts[_attr(inc, _rel(inc[key], "createdBy"), "name", "?")]
            d["count"] += 1
            if _attr(inc, key, "amount"):
                d["amount"] += _attr(inc, key, "amount")
            else:
                d["percent"] += 1

    expenses, einc = fetch_with_included(client, "/expenses", **{
        "filter[date]": f"and(gte.{day},lte.{day})",
        "include": "expenseItems.product,provider,paymentMethod,cashRegister,expenseCategory",
        # Sin fields[...] /expenses devuelve solo ids.
        "fields[expense]": "amount,canceled,description,status,expenseItems,provider,"
                           "paymentMethod,cashRegister,expenseCategory",
        "fields[expenseItem]": "canceled,price,quantity,product",
        "fields[product]": "name",
        "fields[provider]": "name",
        "fields[paymentMethod]": "code,name",
        "fields[cashRegister]": "name",
        "fields[expenseCategory]": "name",
    })
    cash_expenses, purchases, other_expenses = [], [], []
    for e in expenses:
        a = e["attributes"]
        if a.get("canceled"):
            continue
        entry = {
            "amount": a["amount"],
            "provider": _attr(einc, _rel(e, "provider"), "name", "-"),
            "category": _attr(einc, _rel(e, "expenseCategory"), "name", "-"),
            "description": a.get("description") or "",
            "status": a.get("status"),
        }
        is_cash = (_attr(einc, _rel(e, "paymentMethod"), "code") == "cash"
                   and _rel(e, "cashRegister") and a.get("status") == "PAID")
        items = [k for k in _rels(e, "expenseItems") if not _attr(einc, k, "canceled")]
        if items:
            entry["items"] = [(_attr(einc, _rel(einc[k], "product"), "name", "?"),
                               _attr(einc, k, "quantity", 0)) for k in items]
            purchases.append(entry)
        elif not is_cash:
            other_expenses.append(entry)
        if is_cash:
            cash_expenses.append(entry)

    low_stock = []
    for p in client.paginate("/products", **{"filter[stockControl]": "eq.true", "filter[active]": "eq.true"}):
        a = p["attributes"]
        stock, min_stock = a.get("stock") or 0, a.get("minStock")
        # Un 0 sin ventas suele ser un producto al que nunca se le cargó stock:
        # solo se avisa si es negativo, está bajo el mínimo o se vendió en 0.
        if (stock < 0 or (min_stock is not None and stock <= min_stock)
                or (stock == 0 and products_sold[a["name"]] > 0)):
            low_stock.append({"name": a["name"], "stock": stock, "minStock": min_stock,
                              "sold": products_sold[a["name"]]})
    low_stock.sort(key=lambda p: p["stock"])

    total = sum(s["attributes"]["total"] or 0 for s in closed)
    cash_out = sum(e["amount"] for e in cash_expenses)
    return {
        "day": day,
        "sales_count": len(closed),
        "sales_total": total,
        "avg_ticket": total / len(closed) if closed else 0,
        "by_method": dict(sorted(by_method.items(), key=lambda kv: -kv[1])),
        "open_sales": len(open_sales),
        "canceled_sales": [{"total": s["attributes"]["total"],
                            "user": _attr(inc, _rel(s, "closedBy"), "name", "?")} for s in canceled_sales],
        "cash_sales": cash_sales,
        "cash_expenses": cash_expenses,
        "cash_net": cash_sales - cash_out,
        "canceled_items": canceled_items,
        "discounts": dict(discounts),
        "canceled_discounts": canceled_discounts,
        "top_products": products_sold.most_common(5),
        "purchases": purchases,
        "other_expenses": other_expenses,
        "low_stock": low_stock,
    }


def money(x):
    s = f"{x:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return "$" + (s[:-3] if s.endswith(",00") else s)


def qty(x):
    return str(int(x)) if float(x).is_integer() else f"{x:g}"


WEEKDAYS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]


def format_text(s, local_name="Local"):
    d = s["day"]
    out = [f"*{local_name} — resumen del {WEEKDAYS[d.weekday()]} {d:%d/%m}*", ""]

    out.append(f"*Ventas:* {money(s['sales_total'])} en {s['sales_count']} ventas "
               f"(ticket promedio {money(s['avg_ticket'])})")
    for method, amount in s["by_method"].items():
        out.append(f"• {method}: {money(amount)}")
    if s["open_sales"]:
        out.append(f"⚠️ {s['open_sales']} venta(s) sin cerrar")
    out.append("")

    out.append("*Efectivo en caja*")
    out.append(f"• Ventas en efectivo: {money(s['cash_sales'])}")
    for e in s["cash_expenses"]:
        label = e["description"] or e["category"]
        out.append(f"• − {label}: {money(e['amount'])}")
    out.append(f"• *Neto del día: {money(s['cash_net'])}* (sin contar el fondo inicial)")
    out.append("")

    out.append("*Control*")
    if not (s["canceled_items"] or s["canceled_sales"] or s["discounts"]):
        out.append("• Sin cancelaciones ni descuentos")
    for c in s["canceled_items"]:
        reason = c["reason"] or "sin motivo"
        if c["comment"]:
            reason += f": {c['comment']}"
        out.append(f"• Cancelado por {c['user']}: {qty(c['quantity'])} × {c['product']} "
                   f"({money(c['amount'])}) — {reason}")
    for c in s["canceled_sales"]:
        out.append(f"• Venta anulada por {c['user']}: {money(c['total'] or 0)}")
    for user, d in s["discounts"].items():
        parts = []
        if d["amount"]:
            parts.append(money(d["amount"]))
        if d["percent"]:
            parts.append(f"{d['percent']} con %")
        out.append(f"• Descuentos de {user}: {d['count']} ({', '.join(parts)})")
    if s["canceled_discounts"]:
        out.append(f"• {s['canceled_discounts']} descuento(s) anulado(s)")
    out.append("")

    if s["top_products"]:
        out.append("*Más vendidos:* " + ", ".join(f"{name} ({qty(q)})" for name, q in s["top_products"]))
        out.append("")

    if s["purchases"]:
        out.append("*Mercadería recibida*")
        for p in s["purchases"]:
            items = ", ".join(f"{qty(q)} {name}" for name, q in p["items"])
            unpaid = " — a pagar" if p["status"] == "UNPAID" else ""
            out.append(f"• {p['provider']}: {money(p['amount'])}{unpaid} ({items})")
        out.append("")

    if s["other_expenses"]:
        out.append("*Otros gastos*")
        for e in s["other_expenses"]:
            out.append(f"• {e['provider']} / {e['category']}: {money(e['amount'])}")
        out.append("")

    if s["low_stock"]:
        out.append(f"*Stock a revisar* ({len(s['low_stock'])}, stock actual)")
        for p in s["low_stock"][:LOW_STOCK_LIMIT]:
            minimum = f" (mín. {qty(p['minStock'])})" if p["minStock"] is not None else ""
            sold = f", se vendieron {qty(p['sold'])}" if p["sold"] else ""
            out.append(f"• {p['name']}: {qty(p['stock'])}{minimum}{sold}")
        if len(s["low_stock"]) > LOW_STOCK_LIMIT:
            out.append(f"• … y {len(s['low_stock']) - LOW_STOCK_LIMIT} más")

    return "\n".join(out).rstrip()
