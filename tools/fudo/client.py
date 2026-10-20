"""Cliente mínimo para la API de FUDO (v1alpha1).

Aísla al resto del sistema de los detalles de la API: token de 24 h con
renovación anticipada, paginación sin total, reintentos ante 429.
Solo usa la biblioteca estándar.
"""

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

API_URL = "https://api.fu.do/v1alpha1"
AUTH_URL = "https://auth.fu.do/api"
TOKEN_MARGIN_S = 15 * 60  # renovar 15 min antes de que venza
MAX_RETRIES = 5


class FudoError(Exception):
    def __init__(self, status, body):
        super().__init__(f"HTTP {status}: {body}")
        self.status = status
        self.body = body


def load_dotenv(path=".env"):
    """Carga KEY=VALUE de un .env sin pisar variables ya definidas."""
    if not os.path.exists(path):
        return
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())


class FudoClient:
    def __init__(self, api_key, api_secret, api_url=API_URL, auth_url=AUTH_URL):
        self.api_key = api_key
        self.api_secret = api_secret
        self.api_url = api_url.rstrip("/")
        self.auth_url = auth_url
        self._token = None
        self._exp = 0

    @classmethod
    def from_env(cls):
        load_dotenv()
        key = os.environ.get("FUDO_API_KEY") or os.environ.get("API_KEY")
        secret = os.environ.get("FUDO_API_SECRET") or os.environ.get("API_SECRET")
        if not key or not secret:
            raise SystemExit("Faltan FUDO_API_KEY / FUDO_API_SECRET (ver .env.example)")
        return cls(
            key,
            secret,
            os.environ.get("FUDO_API_URL", API_URL),
            os.environ.get("FUDO_AUTH_URL", AUTH_URL),
        )

    # --- autenticación ---

    def token(self):
        if self._token and time.time() < self._exp - TOKEN_MARGIN_S:
            return self._token
        body = json.dumps({"apiKey": self.api_key, "apiSecret": self.api_secret}).encode()
        data = self._send("POST", self.auth_url, body, auth=False)
        self._token = data["token"]
        self._exp = int(data["exp"])
        return self._token

    # --- requests ---

    def _send(self, method, url, body=None, auth=True):
        headers = {"Accept": "application/json", "Content-Type": "application/json"}
        for attempt in range(MAX_RETRIES):
            if auth:
                headers["Authorization"] = f"Bearer {self.token()}"
            req = urllib.request.Request(url, data=body, method=method, headers=headers)
            try:
                with urllib.request.urlopen(req, timeout=60) as resp:
                    raw = resp.read()
                    return json.loads(raw) if raw else None
            except urllib.error.HTTPError as e:
                raw = e.read().decode(errors="replace")
                if e.code == 429 and attempt < MAX_RETRIES - 1:
                    time.sleep(int(e.headers.get("Retry-After", "5")))
                    continue
                if e.code == 401 and auth and attempt == 0:
                    self._token = None  # token vencido o revocado: pedir otro
                    continue
                try:
                    raw = json.loads(raw)
                except ValueError:
                    pass
                raise FudoError(e.code, raw) from None
        raise FudoError(429, "Rate limit: se agotaron los reintentos")

    def request(self, method, path, params=None, payload=None):
        url = self.api_url + path
        if params:
            url += "?" + urllib.parse.urlencode(params, safe="[]().,:")
        body = json.dumps(payload).encode() if payload is not None else None
        return self._send(method, url, body)

    def get(self, path, **params):
        return self.request("GET", path, params)

    def patch(self, path, payload):
        return self.request("PATCH", path, payload=payload)

    def post(self, path, payload):
        return self.request("POST", path, payload=payload)

    def paginate(self, path, page_size=500, **params):
        """Itera todos los recursos. La API no da total: se corta cuando
        una página trae menos elementos que page[size]."""
        number = 1
        while True:
            page = self.get(path, **params, **{"page[size]": page_size, "page[number]": number})
            data = page.get("data", [])
            yield from data
            if len(data) < page_size:
                return
            number += 1
