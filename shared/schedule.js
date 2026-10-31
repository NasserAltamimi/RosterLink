export const scheduleDays = [
  ['sun', 'Sunday'], ['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'],
  ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'],
];
export const scheduleTimes = Array.from({ length: 96 }, (_, index) =>
  `${String(Math.floor(index / 4)).padStart(2, '0')}:${String(index % 4 * 15).padStart(2, '0')}`);
export function sortSchedule(slots) {
  return [...slots].sort((a, b) => scheduleDays.findIndex(([day]) => day === a.day) - scheduleDays.findIndex(([day]) => day === b.day));
}
export function formatSchedule(slots) {
  return sortSchedule(slots).map(slot => `${scheduleDays.find(([day]) => day === slot.day)[1].slice(0, 3)} ${slot.start}–${slot.end}${slot.end < slot.start ? ' (+1 day)' : ''}`).join('; ');
}
const minutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
export function scheduleOverlaps(slots) {
  const ranges = slots.map(slot => {
    const start = scheduleDays.findIndex(([day]) => day === slot.day) * 1440 + minutes(slot.start);
    return [start, start + (minutes(slot.end) - minutes(slot.start) + 1440) % 1440];
  });
  return ranges.some(([start, end], index) => ranges.some(([otherStart, otherEnd], other) =>
    index !== other && [-10080, 0, 10080].some(shift => start < otherEnd + shift && otherStart + shift < end)));
}
