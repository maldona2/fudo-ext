export function reorderProducts(
  order: string[],
  activeId: string,
  overId: string | null
): string[] {
  const from = order.indexOf(activeId);
  const to = overId === null ? -1 : order.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return order;
  const next = [...order];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}
