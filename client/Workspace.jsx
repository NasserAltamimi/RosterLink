import { t } from './i18n.js';
import { ArrowUpRight, Building2, CalendarClock, ClipboardList, Search, UserRound } from 'lucide-react';
import { activeApplicationStates } from '../shared/applications.js';
import { Loading, Notice } from './components.jsx';
import useResource from './useResource.js';
import IdentityMark from './IdentityMark.jsx';
import OpeningPreview from './OpeningPreview.jsx';
import { displayDate, quantity } from './presentation.js';

export default function Workspace() {
  const profile = useResource('/profiles/me'), management = useResource('/management');
  const applications = useResource('/applications'), discovery = useResource('/openings');
  if (profile.loading || management.loading) return <Loading />;
  const error = profile.error || management.error;
  if (error) return <><Notice error={error} /><button className="button secondary" onClick={() => { profile.reload(); management.reload(); }}>{t("Try again")}</button></>;
  const player = profile.data.profile, { organizations, teams, openings = [] } = management.data;
  const onboarding = !player && !organizations.length;
  const savedGames = new Set(profile.data.sections.map(section => section.gameId));
  const myApplications = applications.data?.applications || [];
  const appliedOpenings = new Set(myApplications.filter(item => activeApplicationStates.includes(item.status)).map(item => item.opening.id));
  const available = (discovery.data?.openings || []).filter(opening => !appliedOpenings.has(opening.id));
  const matching = available.filter(opening => savedGames.has(opening.game));
  const suggested = (matching.length ? matching : available).slice(0, 4);
  const tryouts = myApplications.filter(item => item.actions.includes('attend'))
    .sort((a, b) => new Date(a.invitation.startsAt) - new Date(b.invitation.startsAt));
  const review = openings.filter(opening => opening.applicantCounts?.submitted > 0);
  const active = openings.filter(opening => opening.status === 'active' && !opening.expired);
  return <>
    <section className="workspace-welcome workspace-overview workspace-hero">
      <div><h1>{onboarding ? t("Your journey starts here.") : t("My Workspace")}</h1>
        <p>{player ? <span>{t("Welcome back,") + ' '}<bdi>{player.displayName}</bdi>.</span> : t("Create a player profile or manage a team. Both are available through the same account, whenever you’re ready.")}</p>
      </div>
      <div className="heading-actions"><a className="button secondary" href="/feed">{t("View feed")}</a><a className={`button ${onboarding ? 'secondary' : 'primary'}`} href="/openings"><Search size={17} aria-hidden="true" />{t("Browse openings")}</a></div>
    </section>
    <div className="workspace-grid" data-onboarding={onboarding}>
      <div className="workspace-main">
        {(tryouts.length > 0 || review.length > 0) && <section className="card workspace-panel workspace-attention">
          <h2>{t("Needs your attention")}</h2>
          {tryouts.slice(0, 2).map(item => <a className="workspace-task" key={item.id} href={`/applications/${item.id}`}>
            <span className="destination-icon"><CalendarClock size={19} aria-hidden="true" /></span>
            <span><strong>{t("Respond to tryout")}</strong><small><bdi>{item.opening.role}</bdi> · {displayDate(item.invitation.startsAt, item.invitation.timeZone)}</small></span>
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>)}
          {review.slice(0, 2).map(item => <a className="workspace-task" key={item.id} href={`/manage/openings/${item.id}/applicants`}>
            <span className="destination-icon"><ClipboardList size={19} aria-hidden="true" /></span>
            <span><strong>{t("Review {count}", { count: quantity(item.applicantCounts.submitted, "new applicant") })}</strong><small><bdi>{item.role}</bdi> · <bdi>{item.teamName}</bdi></small></span>
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>)}
        </section>}
        <section className="card workspace-panel workspace-discovery">
          <div className="section-heading"><div><h2>{matching.length ? t("Openings in your games") : t("Open roles")}</h2><p className="muted small">{matching.length ? t("Based on the games on your player profile.") : t("Browse teams currently recruiting.")}</p></div><a className="text-button" href="/openings">{t("See all openings") + ' '}<ArrowUpRight size={15} aria-hidden="true" /></a></div>
          {discovery.loading ? <Loading>{t("Loading openings…")}</Loading> : discovery.error ? <><Notice error={discovery.error} /><button className="button secondary" onClick={discovery.reload}>{t("Retry openings")}</button></> : suggested.length ? <ul className="opening-preview-list">{suggested.map(opening => <OpeningPreview key={opening.id} opening={opening} />)}</ul> : <p className="muted">{appliedOpenings.size ? t("No other roles to suggest right now.") : t("No teams are recruiting right now.")}</p>}
        </section>
      </div>
      <aside className="workspace-side" aria-label={t("Your profile and teams")}>
        <section className="card workspace-panel workspace-person">
          <div className="workspace-identity">{player ? <IdentityMark name={player.displayName} src={player.profileImageUrl} className="person-mark" /> : <span className="destination-icon"><UserRound size={23} aria-hidden="true" /></span>}
            <div><h2 dir="auto">{player ? player.displayName : t("Player profile")}</h2><p className="muted small" dir="auto">{player ? player.region : t("Share your games and availability.")}</p></div></div>
          {player && <div className="workspace-meta"><span className="badge">{quantity(savedGames.size, 'game profile')}</span>{player.openToOffers && <span className="badge offers">{t("Open to offers")}</span>}</div>}
          <a className={`button ${player ? 'secondary' : 'primary'}`} href="/profile">{player ? t("View my profile") : t("Create player profile")}<ArrowUpRight size={16} aria-hidden="true" /></a>
          {player && <a className="text-button" href="/applications">{t("My Applications") + ' '}<ArrowUpRight size={15} aria-hidden="true" /></a>}
        </section>
        <section className="card workspace-panel workspace-orgs">
          <h2><Building2 size={19} aria-hidden="true" />{t("Organizations")}</h2>
          {organizations.length > 0 ? <p className="muted small">{t('{teams} in your scope · {roles}', { teams: quantity(teams.length, 'team'), roles: quantity(active.length, 'open role') })}</p> : <p className="muted small">{t("Create a club and start recruiting for your teams.")}</p>}
          <a className="button secondary" href={organizations.length ? '/organizations' : '/organizations/new'}>{organizations.length ? t("View organizations") : t("Create organization")}<ArrowUpRight size={16} aria-hidden="true" /></a>
        </section>
      </aside>
    </div>
  </>;
}
