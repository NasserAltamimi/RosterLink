import { useId } from 'react';
import { scheduleDays, scheduleTimes, sortSchedule } from '../shared/schedule.js';

export default function SchedulePicker({ value, onChange, errors = {}, legacy }) {
  const id = useId();
  const update = (day, values) => onChange(sortSchedule(value.map(slot => slot.day === day ? { ...slot, ...values } : slot)));
  return <fieldset className="schedule-picker" aria-describedby={`${id}-help${errors.scheduleSlots ? ` ${id}-error` : ''}`}>
    <legend>Required playing availability *</legend>
    <p className="field-help" id={`${id}-help`}>Select the days and times players must be available. Times use the schedule timezone. End times earlier than start times finish the next day.</p>
    {legacy && !value.length && <p className="muted small">Previously saved: {legacy}. Choose days and times below to update this schedule.</p>}
    <table className="schedule-table"><caption className="sr-only">Weekly playing schedule</caption><thead><tr><th scope="col">Day</th><th scope="col">From</th><th scope="col">To</th></tr></thead><tbody>
      {scheduleDays.map(([day, label]) => {
        const slot = value.find(item => item.day === day), index = value.findIndex(item => item.day === day);
        return <tr key={day}><th scope="row"><label className="schedule-day"><input type="checkbox" checked={Boolean(slot)} onChange={event => onChange(event.target.checked ? sortSchedule([...value, { day, start: '20:00', end: '23:00' }]) : value.filter(item => item.day !== day))} />{label}</label></th>
          {['start', 'end'].map(key => <td key={key}><select aria-label={`${label} ${key === 'start' ? 'start' : 'end'} time`} disabled={!slot} value={slot?.[key] || '20:00'} aria-invalid={Boolean(errors[`scheduleSlots.${index}.${key}`])} onChange={event => update(day, { [key]: event.target.value })}>{scheduleTimes.map(time => <option key={time}>{time}</option>)}</select>{errors[`scheduleSlots.${index}.${key}`] && <p className="field-error">{errors[`scheduleSlots.${index}.${key}`]}</p>}</td>)}
        </tr>;
      })}
    </tbody></table>
    {value.some(slot => slot.end < slot.start) && <p className="field-help">Overnight: {value.filter(slot => slot.end < slot.start).map(slot => scheduleDays.find(([day]) => day === slot.day)[1]).join(', ')} ends the following day.</p>}
    {errors.scheduleSlots && <p className="field-error" id={`${id}-error`} role="alert">{errors.scheduleSlots}</p>}
  </fieldset>;
}
