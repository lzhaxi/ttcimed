export function getNextSundayMidnightCT(baseDate = new Date(), weeksToAdd = 0) {
  // ponytail: replaced 50-line loop with standard Date math and minimal Intl usage
  const d = new Date(baseDate);
  d.setUTCDate(d.getUTCDate() + 1); // advance 1 day
  d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7) + (weeksToAdd * 7)); // find Sunday + weeks
  
  let targetUtc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 6, 0, 0)); // guess Monday 6am UTC
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false });
  
  while (fmt.format(targetUtc) !== '24' && fmt.format(targetUtc) !== '00') {
    targetUtc.setUTCHours(targetUtc.getUTCHours() - 1);
  }
  return new Date(targetUtc.getTime() - 1000); // 23:59:59 CT
}
