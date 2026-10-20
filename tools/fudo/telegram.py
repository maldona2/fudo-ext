"""Envío de mensajes por Telegram (Bot API) con la biblioteca estándar."""

import html
import json
import os
import re
import urllib.request

API = "https://api.telegram.org/bot{token}/{method}"
MAX_LEN = 4096  # límite de Telegram por mensaje


def _call(token, method, payload=None):
    req = urllib.request.Request(
        API.format(token=token, method=method),
        data=json.dumps(payload or {}).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())
    if not data.get("ok"):
        raise RuntimeError(f"Telegram {method}: {data}")
    return data["result"]


def to_html(text):
    """Convierte las negritas estilo WhatsApp (*...*) a HTML de Telegram.
    Se escapa todo antes, así nombres con <, & o _ no rompen el mensaje."""
    return re.sub(r"\*([^*\n]+)\*", r"<b>\1</b>", html.escape(text, quote=False))


def _chunks(text):
    """Parte el mensaje por líneas para no pasar el límite de Telegram."""
    chunk = ""
    for line in text.split("\n"):
        if len(chunk) + len(line) + 1 > MAX_LEN:
            yield chunk
            chunk = ""
        chunk += line + "\n"
    if chunk.strip():
        yield chunk


def send(text, token=None, chat_ids=None):
    token = token or os.environ["TELEGRAM_BOT_TOKEN"]
    chat_ids = chat_ids or os.environ["TELEGRAM_CHAT_ID"].split(",")
    for chat_id in chat_ids:
        for chunk in _chunks(to_html(text)):
            _call(token, "sendMessage", {"chat_id": chat_id.strip(), "text": chunk, "parse_mode": "HTML"})


def recent_chats(token=None):
    """Chats que le escribieron al bot hace poco (para averiguar el chat_id)."""
    token = token or os.environ["TELEGRAM_BOT_TOKEN"]
    chats = {}
    for update in _call(token, "getUpdates"):
        message = update.get("message") or update.get("my_chat_member") or {}
        chat = message.get("chat")
        if chat:
            chats[chat["id"]] = chat.get("title") or " ".join(
                filter(None, [chat.get("first_name"), chat.get("last_name")])) or chat.get("username")
    return chats
