import { errorText, getLanguage, isolate, t } from './i18n.js';
import { useId } from 'react';
import { scheduleDays, scheduleTimes, sortSchedule } from '../shared/schedule.js';

export default function SchedulePicker({ value, onChange, errors = {}, legacy }) {
  const id = useId();
  const overnight = value.filter(slot => slot.end < slot.start).map(slot => t(scheduleDays.find(([day]) => day === slot.day)[1]));
  const update = (day, values) => onChange(sortSchedule(value.map(slot => slot.day === day ? { ...slot, ...values } : slot)));
  return <fieldset className="schedule-picker" aria-describedby={`${id}-help${errors.scheduleSlots ? ` ${id}-error` : ''}`}>
    <legend>{t("Required playing availability *")}</legend>
    <p className="field-help" id={`${id}-help`}>{t("Select the days and times players must be available. Times use the schedule timezone. End times earlier than start times finish the next day.")}</p>
    {legacy && !value.length && <p className="muted small">{t('Previously saved: {schedule}. Choose days and times below to update this schedule.', { schedule: isolate(legacy) })}</p>}
    <table className="schedule-table"><caption className="sr-only">{t("Weekly playing schedule")}</caption><thead><tr><th scope="col">{t("Day")}</th><th scope="col">{t("From")}</th><th scope="col">{t("To")}</th></tr></thead><tbody>
      {scheduleDays.map(([day, label]) => {
        const slot = value.find(item => item.day === day), index = value.findIndex(item => item.day === day);
        return <tr key={day}><th scope="row"><label className="schedule-day"><input type="checkbox" checked={Boolean(slot)} onChange={event => onChange(event.target.checked ? sortSchedule([...value, { day, start: '20:00', end: '23:00' }]) : value.filter(item => item.day !== day))} />{t(label)}</label></th>
          {['start', 'end'].map(key => {
            const error = errors[`scheduleSlots.${index}.${key}`];
            return <td key={key}><select aria-label={t(key === 'start' ? '{day} start time' : '{day} end time', { day: t(label) })} disabled={!slot} value={slot?.[key] || '20:00'} aria-invalid={Boolean(error)} onChange={event => update(day, { [key]: event.target.value })}>{scheduleTimes.map(time => <option key={time}>{time}</option>)}</select>{error && <p className="field-error">{errorText(error)}</p>}</td>;
          })}
        </tr>;
      })}
    </tbody></table>
    {overnight.length > 0 && <p className="field-help">{t('Overnight: {days} ends the following day.', { days: overnight.join(getLanguage() === 'ar' ? '، ' : ', ') })}</p>}
    {errors.scheduleSlots && <p className="field-error" id={`${id}-error`} role="alert">{errorText(errors.scheduleSlots)}</p>}
  </fieldset>;
}
