export function getActiveStreak(currentStreak, lastStreakDate, now = new Date()) {
  const normalizedCurrent = Math.max(0, Number(currentStreak) || 0);
  if (normalizedCurrent === 0 || !lastStreakDate) {
    return 0;
  }

  const todayKey = getLocalDateKey(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = getLocalDateKey(yesterday);

  return lastStreakDate === todayKey || lastStreakDate === yesterdayKey
    ? normalizedCurrent
    : 0;
}

export function getMillisecondsUntilNextDay(now = new Date()) {
  const nextDay = new Date(now);
  nextDay.setHours(24, 0, 1, 0);
  return Math.max(1000, nextDay.getTime() - now.getTime());
}

function getLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
