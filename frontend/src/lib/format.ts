const TZ = 'America/Argentina/Buenos_Aires';

const moneyFormat = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const unitsFormat = new Intl.NumberFormat('es-AR', {
  maximumFractionDigits: 3,
});

export const formatMoney = (n: number) => '$' + moneyFormat.format(Math.abs(n));

export const formatUnits = (n: number) => unitsFormat.format(Math.abs(n));

const parts = (d: Date, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('es-AR', { timeZone: TZ, ...options }).format(d);

export const formatDate = (iso: string) =>
  parts(new Date(iso), { day: '2-digit', month: '2-digit' });

export const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  const weekday = parts(d, { weekday: 'short' }).replace('.', '');
  const time = parts(d, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  return `${weekday} ${formatDate(iso)} ${time}`;
};

export const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

export const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
