import { isolate, number, t } from './i18n.js';
import { useState } from 'react';
import { ArrowLeft, ArrowUpRight, Bell, CalendarDays, ClipboardList } from 'lucide-react';
import { applicationActions, applicationStates, applicationUpdates } from '../shared/applications.js';
import { api } from './api.js';
import { Field, Loading, Notice, Submit } from './components.jsx';
import { navigate } from './navigation.js';
import useResource from './useResource.js';
import { useToast } from './Toasts.jsx';
import IdentityMark from './IdentityMark.jsx';
import { displayDate as dateTime, quantity } from './presentation.js';

const actionFeedback = {
  review: 'Application marked in review.', shortlist: 'Candidate shortlisted.', accept: 'Application accepted. The player was notified.',
  reject: 'Decision saved. The player was notified.', withdraw: 'Application withdrawn.',
  attend: 'Tryout accepted. The team was notified.', decline: 'Tryout declined. The team was notified.',
};
const playerStatus = {
  submitted: 'The team has received your application.',
  reviewing: 'The team is reviewing your application.',
  shortlisted: 'The team may contact you with a tryout invitation.',
  accepted: 'The team accepted your application.',
  rejected: 'The team decided not to proceed with your application.',
  withdrawn: 'You withdrew your application.',
};

function Status({ value }) {
  return <span className="application-status" data-status={value}>{t(applicationStates[value])}</span>;
}

function PageHeader({ kicker, title, subtitle, identity, children }) {
  return <section className="recruiting-hero">
    <div className="brand-hero-identity">{identity}<div><p className="eyebrow">{kicker}</p><h1 dir="auto">{title}</h1><p dir="auto">{subtitle}</p></div></div>
    {children && <div className="recruiting-hero-actions">{children}</div>}
  </section>;
}

function Resource({ result, children }) {
  if (result.loading) return <Loading>{t("Loading recruitment details…")}</Loading>;
  if (result.error) return <section className="card form-card"><Notice error={result.error} /><button className="button secondary" onClick={result.reload}>{t("Try again")}</button></section>;
  return children(result.data);
}

function ApplyForm({ opening, profile, onConflict }) {
  const notify = useToast();
  const [submissionId] = useState(() => crypto.randomUUID());
  const [introduction, setIntroduction] = useState('');
  const [availability, setAvailability] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError(null);
    try {
      const { id } = await api(`/applications/opening/${opening.id}`, { method: 'POST', body: { introduction, availability, submissionId } });
      notify('Application submitted. You can track its status here.');
      navigate(`/applications/${id}`);
    } catch (error) { setError(error); }
    finally { setBusy(false); }
  }
  return <form className="card form-card apply-panel" onSubmit={submit}>
    <h2>{t("Apply to this opening")}</h2>
    <p className="muted">{t("Applying as") + ' '}<a href={`/p/${profile.id}`}><bdi>{profile.name}</bdi></a>{t(". The team will receive your answers and a link to your public player profile.")}</p>
    <Notice error={error} />
    <fieldset disabled={busy} className="recruitment-fieldset">
      <Field label={t("Why are you a good fit?")} as="textarea" required maxLength={1600} value={introduction} error={error?.fields?.introduction} onChange={event => setIntroduction(event.target.value)} dir="auto" />
      <Field label={t("Availability for this team")} as="textarea" required maxLength={300} value={availability} error={error?.fields?.availability} help={t("Include your time zone and times that work for you.")} onChange={event => setAvailability(event.target.value)} dir="auto" />
      <div className="heading-actions"><Submit busy={busy}>{t("Submit application")}</Submit>
        {error?.status === 409 && <button className="button secondary" type="button" onClick={onConflict}>{t("Refresh opening")}</button>}
      </div>
    </fieldset>
  </form>;
}

function SignedInApplication({ opening, open, refresh }) {
  const result = useResource(`/applications/opening/${opening.id}`);
  return <Resource result={result}>{context => <>
    {context.canManage && <section className="card recruitment-inline"><div><strong>{t("Manager access")}</strong><p className="muted">{t("Review submitted applications for this opening.")}</p></div><a className="button secondary" href={`/manage/openings/${opening.id}/applicants`}>{t("Review applicants")}</a></section>}
    {context.applicationId ? <section className="card form-card"><h2>{t("Your application")}</h2><p>{t("You have an active application for this opening.")}</p><a className="button primary" href={`/applications/${context.applicationId}`}>{t("View application")}</a></section>
      : open && (context.profile ? <ApplyForm opening={opening} profile={context.profile} onConflict={() => { result.reload(); refresh(); }} />
        : <section className="card form-card"><h2>{t("Get ready to apply")}</h2><p>{t("Create a player profile and we’ll bring you back to this opening.")}</p><a className="button primary" href={`/profile?next=${encodeURIComponent('/openings/' + opening.id)}`}>{t("Create player profile")}</a></section>)}
  </>}</Resource>;
}

export function OpeningApplication({ opening, user, refresh }) {
  const open = opening.status === 'active' && !opening.expired;
  if (user) return <SignedInApplication opening={opening} open={open} refresh={refresh} />;
  return open && <section className="card form-card apply-panel"><h2>{t("Apply to this opening")}</h2><p className="muted">{t("Sign in to send your application and track what happens next.")}</p><a className="button primary" href={`/login?next=/openings/${opening.id}`}>{t("Log in to apply")}</a></section>;
}

function ApplicationRow({ application, manager }) {
  const { profile, opening, team, invitation, actions } = application;
  const needsResponse = !manager && actions.includes('attend');
  return <article className="card application-row applicant-row" data-needs-response={needsResponse}>
    <div className="application-identity">
      <IdentityMark className={manager ? 'person-mark' : 'org-mark'} name={manager ? profile.name : team.organizationName} src={manager ? profile.avatarUrl : team.logoUrl} />
      <div>{!manager && <p className="eyebrow" dir="auto">{team.organizationName}</p>}
        <h2 dir="auto"><a href={`/applications/${application.id}`}>{manager ? profile.name : opening.role}</a></h2>
        <p className="muted small" dir="auto">{(manager ? [profile.rank, profile.region] : [team.name, opening.gameName]).filter(Boolean).map((value, index) => <span key={value}>{index > 0 && ' · '}<bdi>{value}</bdi></span>)}</p>
        {manager && <p className="muted small">{t("Applied") + ' '}<time dateTime={application.createdAt}>{dateTime(application.createdAt, undefined, false)}</time></p>}
        {needsResponse && <p className="small invitation-highlight"><CalendarDays size={15} aria-hidden="true" />{t("Response needed ·") + ' '}{dateTime(invitation.startsAt, invitation.timeZone)}</p>}
        {manager && invitation && <p className="small invitation-highlight"><CalendarDays size={15} aria-hidden="true" />{invitationLabel(invitation)}</p>}
      </div>
    </div>
    <div className="application-row-actions"><Status value={application.status} /><a className={`button ${needsResponse ? 'primary' : 'secondary'} compact`} href={`/applications/${application.id}`}>{manager ? t("Review application") : t("View application")} <ArrowUpRight size={15} aria-hidden="true" /></a></div>
  </article>;
}

export function ApplicationList({ openingId }) {
  const [status, setStatus] = useState('');
  const result = useResource(openingId ? `/applications/review/${openingId}` : '/applications');
  return <>
    {!openingId && <PageHeader title={t("My Applications")} kicker={t("Player workspace")} subtitle={t("Track your applications and respond to tryout invitations.")}><a className="button primary" href="/openings">{t("Browse openings")}</a></PageHeader>}
    <Resource result={result}>{({ applications, opening }) => {
      const shown = applications.filter(application => !status || application.status === status);
      const stages = Object.entries(applicationStates).map(([value, label]) => [value, label, applications.filter(item => item.status === value).length]).filter(([, , count]) => count > 0);
      const pending = opening ? [] : shown.filter(application => application.actions.includes('attend'));
      const rest = pending.length ? shown.filter(application => !application.actions.includes('attend')) : shown;
      return <>
      {opening && <PageHeader title={t('Applicants · {role}', { role: isolate(opening.role) })} kicker={t("Team recruitment")} subtitle={`${opening.organization} / ${opening.team}`}
        identity={<IdentityMark className="org-mark hero-mark" name={opening.organization} src={opening.logoUrl} />}>
        <a className="button secondary" href={`/manage/organizations/${opening.organizationId}/teams/${opening.teamId}`}>{t("Back to team")}</a>
        <a className="button secondary" href={`/openings/${opening.id}`}>{t("View opening")}</a>
      </PageHeader>}
      {applications.length > 0 && <div className="card application-queue-tools">
        <div className="queue-stage-tabs" role="group" aria-label={t("Filter by stage")}>
          <button type="button" aria-pressed={!status} onClick={() => setStatus('')}>{t("All") + ' '}<span>{number(applications.length)}</span></button>
          {stages.map(([value, label, count]) => <button type="button" key={value} aria-pressed={status === value} onClick={() => setStatus(status === value ? '' : value)}>{t(label)} <span>{number(count)}</span></button>)}
        </div>
        <div className="recruitment-filter"><Field label={t("Application status")} as="select" value={status} onChange={event => setStatus(event.target.value)}><option value="">{t("All statuses")}</option>{Object.entries(applicationStates).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}</Field><p className="small muted" role="status">{status ? t('{shown} of {total}', { shown: number(shown.length), total: quantity(applications.length, 'application') }) : quantity(applications.length, 'application')}</p></div>
      </div>}
      {pending.length > 0 && <section className="pending-applications"><h2>{t("Tryouts to respond to")}</h2><div className="recruitment-list">{pending.map(application => <ApplicationRow key={application.id} application={application} />)}</div></section>}
      {rest.length > 0 && <section>{pending.length > 0 && <h2>{t("Other applications")}</h2>}<div className="recruitment-list">{rest.map(application => <ApplicationRow key={application.id} application={application} manager={Boolean(openingId)} />)}</div></section>}
      {shown.length === 0 && <section className="card empty-state"><ClipboardList size={28} aria-hidden="true" /><h2>{status ? t("No applications with this status") : t("No applications yet")}</h2><p className="muted">{openingId ? t("Submissions for this opening will appear here.") : t("When you apply, track the team’s response here.")}</p>{status && <button className="button secondary" type="button" onClick={() => setStatus('')}>{t("Show all applications")}</button>}{!openingId && applications.length === 0 && <a className="button primary" href="/openings">{t("Browse openings")}</a>}</section>}
    </>;
    }}</Resource>
  </>;
}

function invitationLabel(invitation) {
  if (invitation.status === 'pending') return t(new Date(invitation.startsAt) <= new Date() ? 'Response window ended' : 'Awaiting response');
  return t({ attending: 'Tryout accepted', declined: 'Tryout declined', cancelled: 'Tryout cancelled' }[invitation.status]);
}

function Invitation({ value, compact = false }) {
  const scheduled = dateTime(value.startsAt, value.timeZone);
  const local = dateTime(value.startsAt);
  const Heading = compact ? 'h3' : 'h2';
  return <section className={compact ? 'application-invitation invitation-context' : 'card form-card application-invitation'}>
    <div className="section-heading"><Heading><CalendarDays size={22} aria-hidden="true" />{' ' + t("Tryout invitation")}</Heading><span className="badge">{t({ attending: 'Accepted', declined: 'Declined', cancelled: 'Cancelled' }[value.status]) || invitationLabel(value)}</span></div>
    <p><strong>{scheduled}</strong> (<bdi>{value.timeZone}</bdi>)</p>
    {scheduled !== local && <p className="muted small">{t("Your local time ·") + ' '}{local}</p>}
    <p className="preserve-lines" dir="auto">{value.notes}</p>
  </section>;
}

function ApplicationDetail({ initial, reload }) {
  const notify = useToast();
  const [application, setApplication] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState('');
  const [showInvitation, setShowInvitation] = useState(false);
  const [when, setWhen] = useState(''), [notes, setNotes] = useState('');
  const { id, opening, team, profile, status, actions, invitation, viewer } = application;
  const manager = viewer === 'manager';
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  async function send(action) {
    setBusy(true); setError(null);
    try {
      const invitation = action === 'invite';
      const body = invitation ? { revision: application.revision, startsAt: new Date(when).toISOString(), timeZone: timezone, notes }
        : { revision: application.revision, action };
      const data = await api(`/applications/detail/${id}/${invitation ? 'invitation' : 'action'}`, { method: 'POST', body });
      setApplication(data.application); setShowInvitation(false); setConfirm('');
      notify(invitation ? 'Tryout invitation sent.' : actionFeedback[action]);
    } catch (error) { setError(error); }
    finally { setBusy(false); }
  }
  function click(action) {
    if (action === 'invite') setShowInvitation(true);
    else if (['withdraw', 'accept', 'reject', 'decline'].includes(action)) setConfirm(action);
    else send(action);
  }
  return <>
    <a className="back-link" href={manager ? `/manage/openings/${opening.id}/applicants` : '/applications'}><ArrowLeft size={17} aria-hidden="true" />{manager ? t("All applicants") : t("My Applications")}</a>
    <PageHeader title={manager ? profile.name : opening.role} kicker={manager ? t("Applicant review") : t("Your application")} subtitle={manager ? `${opening.role} · ${team.organizationName} / ${team.name}` : `${team.organizationName} / ${team.name}`}
      identity={<IdentityMark className={`${manager ? 'person-mark' : 'org-mark'} hero-mark`} name={manager ? profile.name : team.organizationName} src={manager ? profile.avatarUrl : team.logoUrl} />}><Status value={status} />{manager && actions.length > 0 && <a className="text-button review-jump" href="#review-actions">{t("Review actions")}</a>}</PageHeader>
    <div className={`application-layout application-detail-layout${manager ? ' recruiter-detail' : ''}`}>
      <aside id="review-actions" className="card form-card application-sidebar">
        <h2>{manager ? t("Review actions") : t("What’s next")}</h2>
        {manager && invitation && <p className="small muted">{t("Tryout ·") + ' '}{invitationLabel(invitation)}</p>}
        {!manager && <p className="muted">{actions.includes('attend') ? t("Respond to your tryout invitation before the scheduled start.") : status === 'shortlisted' && invitation ? t("Your tryout details and response are recorded below.") : t(playerStatus[status])}</p>}
        {!manager && invitation && <Invitation value={invitation} compact />}
        <Notice error={error} />
        {error?.status === 409 ? <button className="button secondary" onClick={reload}>{t("Refresh application")}</button> :
          confirm ? <div className="confirm-action"><p>{t({ accept: 'Accept this application and notify the player?', reject: 'Close this application and notify the player?', withdraw: 'Withdraw this application and notify the team?', decline: 'Decline this tryout and notify the team?' }[confirm])}</p><button className="button primary" type="button" disabled={busy} onClick={() => send(confirm)}>{t(applicationActions[confirm])}</button><button className="button secondary" type="button" disabled={busy} onClick={() => setConfirm('')}>{t("Cancel")}</button></div>
            : showInvitation ? <form onSubmit={event => { event.preventDefault(); send('invite'); }}>
              <Field label={t("Tryout date and time")} type="datetime-local" required value={when} disabled={busy} onChange={event => setWhen(event.target.value)} help={t('Enter the time in {zone}. Both sides will see the time zone.', { zone: isolate(timezone) })} error={error?.fields?.startsAt} />
              <Field label={t("Tryout notes")} as="textarea" required maxLength={1000} value={notes} disabled={busy} onChange={event => setNotes(event.target.value)} help={t("Include how to join and what to prepare.")} error={error?.fields?.notes} dir="auto" />
              <Submit busy={busy}>{t("Send tryout invitation")}</Submit><button className="button secondary" type="button" disabled={busy} onClick={() => setShowInvitation(false)}>{t("Cancel")}</button>
            </form> : actions.length ? <div className="recruitment-actions">{[...actions].sort((a, b) => Number(b === 'review') - Number(a === 'review')).map((action, index) => <button key={action} className={`button ${index === 0 && action !== 'withdraw' ? 'primary' : 'secondary'}`} type="button" disabled={busy} onClick={() => click(action)}>{t(applicationActions[action])}</button>)}</div>
              : manager && <p className="muted">{t("This application has reached a final status.")}</p>}
        <div className="recruitment-context">{manager && <a href="#application-answers">{t("Read application answers")}</a>}<a href={`/openings/${opening.id}`}>{t("View opening")}</a><a href={`/teams/${team.id}`}>{t("View team")}</a>{manager && <a href={`/p/${profile.id}`}>{t("View public player profile")}</a>}</div>
      </aside>
      <div className="recruitment-list application-answers">{manager && invitation && <Invitation value={invitation} />}<section className="card form-card" id="application-answers">
        {manager && (profile.rank || profile.region) && <p className="muted small applicant-profile-summary" dir="auto">{profile.rank && <><strong>{opening.gameName}</strong> · <bdi>{profile.rank}</bdi>{' ' + t("(self-reported)")}{profile.region && ' · '}</>}{profile.region && <bdi>{profile.region}</bdi>}</p>}
        <h2>{t("Application answers")}</h2><p className="muted small">{t("Submitted") + ' '}{dateTime(application.createdAt)}</p>
        <h3>{t("Why this opening?")}</h3><p className="preserve-lines" dir="auto">{application.introduction}</p>
        <h3>{t("Availability")}</h3><p className="preserve-lines" dir="auto">{application.availability}</p>
      </section>{application.history?.length > 0 && <section className="card form-card application-history"><h2>{t("Application activity")}</h2><ol>{[...application.history].reverse().map(({ kind, date }, index) => <li key={`${kind}/${index}`}><span>{kind === 'submitted' ? t("Application submitted") : t(applicationUpdates[kind])}</span><time className="muted small" dateTime={date}>{dateTime(date)}</time></li>)}</ol></section>}</div>
    </div>
  </>;
}

export function ApplicationPage({ id }) {
  const result = useResource(`/applications/detail/${id}`);
  return <Resource result={result}>{({ application }) => <ApplicationDetail initial={application} reload={result.reload} />}</Resource>;
}

export function Notifications() {
  const result = useResource('/applications/notifications');
  const [error, setError] = useState(null);
  const [onlyUnread, setOnlyUnread] = useState(false);
  async function open(event, item) {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || item.read) return;
    event.preventDefault();
    try { await api(`/applications/notifications/${item.applicationId}/read`, { method: 'POST', body: { eventId: item.id } }); }
    catch (error) { setError(error); return; }
    navigate(`/applications/${item.applicationId}`);
  }
  return <><PageHeader title={t("Notifications")} kicker={t("Recruitment updates")} subtitle={t("Application decisions, tryout invitations, and responses.")}><button className="button secondary" onClick={result.reload}>{t("Refresh")}</button></PageHeader>
    <Notice error={error} />
    <Resource result={result}>{({ notifications }) => {
      const unread = notifications.filter(item => !item.read);
      const shown = onlyUnread ? unread : notifications;
      return <>
      {notifications.length > 0 && <div className="queue-stage-tabs notification-tabs" role="group" aria-label={t("Filter notifications")}>
        <button type="button" aria-pressed={!onlyUnread} onClick={() => setOnlyUnread(false)}>{t("All updates") + ' '}<span>{number(notifications.length)}</span></button>
        <button type="button" aria-pressed={onlyUnread} onClick={() => setOnlyUnread(true)}>{t("Unread") + ' '}<span>{number(unread.length)}</span></button>
      </div>}
      {shown.length ? <ul className="recruitment-list notification-list">
      {shown.map(item => {
        const Icon = ['invited', 'attending', 'declined'].includes(item.kind) ? CalendarDays : ClipboardList;
        return <li key={item.id} className="card application-row notification-row" data-unread={!item.read}>
          <span className="destination-icon"><Icon size={20} aria-hidden="true" /></span>
          <div><h2><a href={`/applications/${item.applicationId}`} onClick={event => open(event, item)}>{t(applicationUpdates[item.kind])}</a></h2><p className="muted" dir="auto">{item.opening}</p><time className="muted small" dateTime={item.date}>{dateTime(item.date)}</time></div>
          {!item.read && <span className="badge offers">{t("Unread")}</span>}
        </li>;
      })}
    </ul> : <section className="card empty-state"><Bell size={28} aria-hidden="true" /><h2>{t("You’re all caught up")}</h2><p className="muted">{onlyUnread ? t("You have no unread updates.") : t("New recruitment activity will appear here.")}</p>{onlyUnread && <button className="button secondary" onClick={() => setOnlyUnread(false)}>{t("Show all updates")}</button>}</section>}</>;
    }}</Resource>
  </>;
}
