import type { ShortageEvent } from './counts.js';

const TZ = 'America/Argentina/Buenos_Aires';
const MAX_LINES = 10;

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const money = (n: number) =>
  '$' +
  new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(
    Math.abs(n)
  );

const units = (n: number) =>
  new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 }).format(
    Math.abs(n)
  );

const part = (d: Date, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('es-AR', { timeZone: TZ, ...options }).format(d);

const dayMonth = (d: Date) => part(d, { day: '2-digit', month: '2-digit' });

const when = (d: Date) =>
  `${part(d, { weekday: 'long' })} ${dayMonth(d)} ${part(d, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })}`;

export function formatShortageMessage(e: ShortageEvent, appUrl: string) {
  const out = [
    `<b>⚠️ Faltantes en el conteo de ${escapeHtml(e.countedBy)}</b>`,
    `${when(e.countedAt)} · Faltan ${units(e.summary.missingUnits)} unidades (${money(e.summary.missingValue)})`,
    '',
  ];
  for (const m of e.missing.slice(0, MAX_LINES)) {
    const value =
      m.differenceValue === null ? '' : ` (${money(m.differenceValue)})`;
    const basis = m.previous
      ? `desde el conteo del ${dayMonth(m.previous.countedAt)}`
      : 'vs. sistema';
    out.push(`• ${units(m.difference)} ${escapeHtml(m.name)}${value} ${basis}`);
  }
  if (e.missing.length > MAX_LINES) {
    out.push(`• … y ${e.missing.length - MAX_LINES} más`);
  }
  out.push(
    '',
    `Ver detalle: ${appUrl.replace(/\/$/, '')}/panel/conteos/${e.countId}`
  );
  return out.join('\n');
}

export function createTelegramNotifier({
  token,
  chatIds,
  appUrl,
  fetchFn = fetch,
}: {
  token: string;
  chatIds: string[];
  appUrl: string;
  fetchFn?: typeof fetch;
}) {
  return async (event: ShortageEvent) => {
    const text = formatShortageMessage(event, appUrl);
    for (const chatId of chatIds) {
      const res = await fetchFn(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
          }),
        }
      );
      if (!res.ok) {
        throw new Error(`Telegram sendMessage failed with ${res.status}`);
      }
    }
  };
}
