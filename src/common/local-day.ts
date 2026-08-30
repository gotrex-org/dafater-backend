/**
 * Day-boundary helpers for filtering *timestamp* columns (e.g. AuditLog.createdAt).
 *
 * Date-only columns (invoice.date, transaction.date, …) are stored at UTC midnight, so
 * `new Date('2024-05-01')` is already the right boundary for them. A real timestamp is
 * different: the API runs on UTC while the users pick days on the Egyptian calendar, so
 * «من ١ مايو» has to mean midnight *in Cairo* — otherwise the first hours of every day
 * fall outside the range that was asked for and the filter looks broken.
 */
const APP_TZ = process.env.APP_TZ || 'Africa/Cairo';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_DAY = 86_400_000;

/** How far ahead of UTC `tz` is at a given instant, in ms — DST-aware. */
function tzOffsetMs(at: Date, tz: string): number {
  try {
    // sv-SE formats as "YYYY-MM-DD HH:mm:ss"; re-reading that wall clock as if it were
    // UTC puts it exactly one offset away from the instant it was rendered from.
    const wall = at.toLocaleString('sv-SE', { timeZone: tz }).replace(' ', 'T');
    return new Date(`${wall}Z`).getTime() - at.getTime();
  } catch {
    return 0; // no tz data → behave like UTC instead of throwing on every list request
  }
}

/** The instant local midnight of `day` ("YYYY-MM-DD") starts at. */
export function localDayStart(day: string, tz = APP_TZ): Date {
  const utcMidnight = new Date(`${day}T00:00:00Z`);
  // Walk back from UTC midnight by the offset, then re-measure at the corrected instant:
  // on the two DST days a year the offset differs on either side of the shift.
  const first = new Date(utcMidnight.getTime() - tzOffsetMs(utcMidnight, tz));
  return new Date(utcMidnight.getTime() - tzOffsetMs(first, tz));
}

/** The instant the day *after* `day` starts at — an exclusive upper bound. */
export function localDayEnd(day: string, tz = APP_TZ): Date {
  const next = new Date(new Date(`${day}T00:00:00Z`).getTime() + MS_DAY);
  return localDayStart(next.toISOString().slice(0, 10), tz);
}

/**
 * A Prisma `{ gte, lt }` filter for a timestamp column, or undefined when neither bound
 * is usable. Malformed bounds are ignored rather than rejected — a half-typed date in the
 * picker shouldn't turn the whole list into an error.
 */
export function localDayRange(from?: string, to?: string, tz = APP_TZ) {
  const gte = from && DAY_RE.test(from) ? localDayStart(from, tz) : undefined;
  const lt = to && DAY_RE.test(to) ? localDayEnd(to, tz) : undefined;
  return gte || lt ? { gte, lt } : undefined;
}
