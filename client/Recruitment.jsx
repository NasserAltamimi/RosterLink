import { isolate, number, t } from './i18n.js';
import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { Field, Loading, Notice, Submit } from './components.jsx';
import { ArrowRight, ArrowUpRight, Building2, ChevronRight, Gamepad2, MapPin, Plus, SlidersHorizontal } from 'lucide-react';
import useResource from './useResource.js';
import { navigate } from './navigation.js';
import { useToast } from './Toasts.jsx';
import { platforms } from '../shared/game-form.js';
import { describeFilters, filterLabels } from '../shared/opening-filters.js';
import SchedulePicker from './SchedulePicker.jsx';
import { OpeningApplication } from './Applications.jsx';
import IdentityMark from './IdentityMark.jsx';
import CopyLink from './CopyLink.jsx';
import { Connections } from './Connections.jsx';
import Posts from './Posts.jsx';
import { ImageUpload } from './Images.jsx';
import { displayDate, displayRegion, displaySchedule, featuredGames, quantity } from './presentation.js';

const orgFields = [['name', 'Organization name', 100], ['description', 'About the organization', 2000, 'textarea'], ['region', 'Organization region', 100], ['website', 'Website (optional)', 500, 'url']];
const teamFields = [['name', 'Team name', 100], ['description', 'About the team', 2000, 'textarea']];
const openingFields = [['role', 'Role', 100], ['requirements', 'Game-specific requirements', 2000, 'textarea'], ['rank', 'Minimum rank / context (optional)', 100], ['region', 'Region', 100], ['language', 'Language', 100], ['timezone', 'Schedule timezone', 100], ['deadline', 'Deadline', null, 'datetime-local']];
const deadlineLocal = value => { if (!value) return ''; const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const isOpen = opening => opening.status === 'active' && !opening.expired;

function BrandHero({ title, brand, logo, kicker, subtitle, children }) {
  return <section className="recruiting-hero brand-hero"><div className="brand-hero-identity">
    <IdentityMark className="org-mark hero-mark" name={brand || title} src={logo} />
    <div><p className="eyebrow">{kicker}</p><h1 dir="auto">{title}</h1>{subtitle && <p dir="auto">{subtitle}</p>}</div>
  </div>{children && <div className="recruiting-hero-actions">{children}</div>}</section>;
}

function TeamSummary({ team, openings, managePath }) {
  const active = openings.filter(opening => opening.team === team.id && isOpen(opening)).length;
  return <article className="card team-summary">
    <div><span className="badge">{team.gameName}</span><h3 dir="auto">{managePath ? team.name : <a href={`/teams/${team.id}`}>{team.name}</a>}</h3><p className="muted card-description" dir="auto">{team.description}</p></div>
    <div className="team-summary-footer"><span className={active ? 'badge offers' : 'badge'}>{quantity(active, 'open role')}</span>
      {managePath ? <a className="button secondary compact" href={managePath}>{t("Manage team") + ' '}<ArrowUpRight size={15} aria-hidden="true" /></a> : <a className="text-button" href={`/teams/${team.id}`}>{t("Team page") + ' '}<ArrowRight size={15} aria-hidden="true" /></a>}
    </div>
  </article>;
}

function ResourceState({ resource, children }) {
  if (resource.loading) return <Loading />;
  if (resource.error) return <><Notice error={resource.error} />{resource.error.status === 401 && <p><a href="/login">{t("Log in to manage your organizations")}</a></p>}<button className="button secondary" onClick={resource.reload}>{t("Try again")}</button></>;
  return children;
}

// Shared labelled controls retain all input on failed requests; errors use the API's field paths.
function Editor({ title, fields, initial = {}, extra, path, method = 'POST', onSaved, button = t('Save'), opening = false, children }) {
  const notify = useToast();
  const [values, setValues] = useState(() => ({ ...Object.fromEntries(fields.map(([key]) => [key, ''])), ...initial, ...(opening ? { deadline: deadlineLocal(initial.deadline), timezone: initial.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone, platform: initial.platform || '' } : {}) }));
  const [busy, setBusy] = useState(false), [error, setError] = useState(null);
  const [scheduleSlots, setScheduleSlots] = useState(initial.scheduleSlots || []);
  const change = (key, value) => setValues(previous => ({ ...previous, [key]: value }));
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const { schedule: legacySchedule, scheduleSlots: previousSlots, ...body } = { ...values, ...extra };
      if (opening) { body.deadline = new Date(values.deadline).toISOString(); body.scheduleSlots = scheduleSlots; }
      const result = await api(path, { method, body }); notify('Changes saved.'); onSaved(result);
    } catch (error) { setError(error); } finally { setBusy(false); }
  }
  return <form className="card form-card editor-card" onSubmit={submit} aria-busy={busy}><div className="section-heading"><h2>{title}</h2></div><Notice error={error} /><fieldset disabled={busy} className="recruitment-fieldset">{children}
    {opening && <Field label={t("Platform")} as="select" value={values.platform} onChange={event => change('platform', event.target.value)} error={error?.fields?.platform} required><option value="">{t("Choose platform")}</option>{platforms.map(platform => <option key={platform} value={platform}>{t(platform)}</option>)}</Field>}
    <div className="form-grid">{fields.map(([key, label, maxLength, type]) => <Field key={key} label={t(label)} as={type === 'textarea' ? 'textarea' : 'input'} type={type === 'textarea' ? undefined : type || 'text'} maxLength={maxLength || undefined} dir={type === 'url' || key === 'timezone' ? 'ltr' : type === 'datetime-local' ? undefined : 'auto'} value={values[key] ?? ''} required={!['website', 'rank'].includes(key)} onChange={event => change(key, event.target.value)} error={error?.fields?.[key]} help={key === 'deadline' ? t("Enter your local date and time. Saved as an exact UTC instant.") : key === 'schedule' ? t("Include days and times; the timezone below applies.") : key === 'timezone' ? t("IANA timezone, e.g. Asia/Riyadh.") : undefined} />)}</div>
    {opening && <SchedulePicker value={scheduleSlots} onChange={setScheduleSlots} errors={error?.fields} legacy={initial.schedule} />}
    <div className="form-actions"><Submit busy={busy}>{button}</Submit></div></fieldset></form>;
}

function OpeningCard({ opening, compact = false, showTeam = true }) {
  if (compact) return <article className="card team-opening-summary">
    <div><p className="eyebrow" dir="auto">{showTeam ? `${opening.gameName} · ${opening.teamName}` : opening.gameName}</p><h3 dir="auto"><a href={`/openings/${opening.id}`}>{opening.role}</a></h3>
      <p className="muted small">{opening.rank && <><bdi>{opening.rank}</bdi> · </>}{t("Closes") + ' '}<time dateTime={opening.deadline}>{displayDate(opening.deadline, undefined, false)}</time></p></div>
    <a className="text-button" href={`/openings/${opening.id}`} aria-label={t('View opening for {role}', { role: isolate(opening.role) })}>{t("View opening") + ' '}<ArrowRight size={15} aria-hidden="true" /></a>
  </article>;
  return <article className="card opening-listing">
    <IdentityMark className="org-mark" name={opening.organizationName || opening.teamName} src={opening.organizationLogoUrl} />
    <div className="opening-listing-name"><p className="eyebrow" dir="auto">{opening.gameName}</p><h2 dir="auto"><a href={`/openings/${opening.id}`}>{opening.role}</a></h2>
      <p className="muted" dir="auto"><a href={`/organizations/${opening.organizationId}`}>{opening.organizationName}</a> / <a href={`/teams/${opening.team}`}>{opening.teamName}</a></p></div>
    <div className="opening-listing-detail"><p><span className="badge" dir="auto">{opening.region}</span> <span className="badge" dir="auto">{t(opening.platform)}</span></p>
      {opening.rank && <p className="muted small">{t("Rank") + ' '}<bdi>{opening.rank}</bdi></p>}
      <p className="muted small" dir="auto">{opening.language}<span className="opening-schedule-preview"> · {displaySchedule(opening)} (<bdi>{opening.timezone}</bdi>)</span></p>
      <p className="muted small">{t("Closes") + ' '}<time dateTime={opening.deadline}>{displayDate(opening.deadline, undefined, false)}</time></p>
    </div>
    <a className="button secondary compact" href={`/openings/${opening.id}`} aria-label={t('View opening for {role}', { role: isolate(opening.role) })}>{t("View opening") + ' '}<ArrowRight size={15} aria-hidden="true" /></a>
  </article>;
}

function Browse({ search }) {
  const [filters, setFilters] = useState(() => Object.fromEntries(['game', 'role', 'region', 'language'].map(key => [key, new URLSearchParams(search).get(key) || ''])));
  const [filterOpen, setFilterOpen] = useState(false);
  const [sort, setSort] = useState('newest');
  const applied = Object.fromEntries(new URLSearchParams(search));
  const catalog = useResource('/games'), result = useResource(`/openings${search}`);
  const appliedText = describeFilters(applied, catalog.data?.games, (label, value) => t('{label}: {value}', { label: t(label), value: isolate(value) }));
  const games = featuredGames(catalog.data?.games);
  const openings = result.data?.openings || [];
  const sorted = sort === 'deadline' ? [...openings].sort((a, b) => new Date(a.deadline) - new Date(b.deadline)) : openings;
  function gamePath(gameId) {
    const next = new URLSearchParams(search);
    if (gameId) next.set('game', gameId); else next.delete('game');
    return '/openings' + (next.size ? '?' + next : '');
  }
  function filter(event) { event.preventDefault(); const query = new URLSearchParams(Object.entries(filters).map(([key, value]) => [key, value.trim()]).filter(([, value]) => value)); navigate(`/openings${query.size ? '?' + query : ''}`); }
  return <><div className="directory-heading discovery-heading"><span className="destination-icon"><SlidersHorizontal size={24} aria-hidden="true" /></span><div><h1>{t("Recruitment openings")}</h1><p className="muted">{t("Find a role that fits your game, region, and schedule.")}</p></div></div>
    {games.length > 0 && <nav className="game-shortcuts" aria-label={t("Filter openings by game")}>
      <a href={gamePath('')} aria-current={!applied.game ? 'true' : undefined}>{t("All games")}</a>
      {games.map(game => <a key={game._id} href={gamePath(game._id)} aria-current={applied.game === game._id ? 'true' : undefined}>{game.name}</a>)}
    </nav>}
    <div className="opening-directory openings-discovery">
      <form className="card form-card directory-filters opening-filters" onSubmit={filter} data-expanded={filterOpen}>
        <h2><SlidersHorizontal size={18} aria-hidden="true" />{' ' + t("Filter openings")}</h2>
        <button className="button secondary opening-filter-toggle" type="button" aria-label={t("Filter openings")} aria-controls="opening-filters-body" aria-expanded={filterOpen} onClick={() => setFilterOpen(!filterOpen)}><SlidersHorizontal size={17} aria-hidden="true" />{t("Filter openings")}{Object.keys(applied).length > 0 && <span className="badge">{number(Object.keys(applied).length)}</span>}</button>
        <div id="opening-filters-body"><ResourceState resource={catalog}>
          <div className="form-grid"><Field label={t("Game")} as="select" value={filters.game} onChange={event => setFilters({ ...filters, game: event.target.value })}>
            <option value="">{t("All games")}</option>{catalog.data?.games.map(game => <option value={game._id} key={game._id}>{game.name}</option>)}
          </Field>
          {Object.entries({ role: 'e.g. Support', region: 'e.g. Middle East', language: 'e.g. Arabic' }).map(([key, placeholder]) => <Field key={key} label={t(filterLabels[key])} placeholder={t(placeholder)} dir="auto" maxLength={100} value={filters[key]} onChange={event => setFilters({ ...filters, [key]: event.target.value })} />)}</div>
          <div className="heading-actions"><button className="button primary">{t("Apply filters")}</button><button className="button secondary" type="button" disabled={!describeFilters(filters) && !appliedText} onClick={() => { setFilters({ game: '', role: '', region: '', language: '' }); navigate('/openings'); }}>{t("Clear filters")}</button></div>
        </ResourceState></div>
      </form>
      <section className="opening-directory-results" aria-label={t("Opening search results")}><ResourceState resource={result}>
        <div className="discovery-results-bar"><div><p role="status">{quantity(openings.length, 'active opening')}</p>{appliedText && <p className="muted small">{t("Filtered by") + ' '}{appliedText} · <a href="/openings">{t("Reset")}</a></p>}</div>
          {openings.length > 1 && <Field label={t("Sort openings")} as="select" value={sort} onChange={event => setSort(event.target.value)}><option value="newest">{t("Newest first")}</option><option value="deadline">{t("Closing soon")}</option></Field>}
        </div>
        {sorted.length ? sorted.map(opening => <OpeningCard key={opening.id} opening={opening} />) : <section className="card empty-state"><h2>{t("No active openings found.")}</h2><p className="muted">{appliedText ? t("Try a different game, role, or region.") : t("Check back for new opportunities.")}</p>{appliedText && <a className="button secondary" href="/openings">{t("Browse all openings")}</a>}</section>}
      </ResourceState></section>
    </div></>;
}

function PublicPage({ kind, id, user }) {
  const result = useResource(`/${kind}/${id}`);
  return <ResourceState resource={result}>{result.data && (() => {
    if (kind === 'openings') {
      const { opening } = result.data;
      const state = opening.status === 'closed' ? 'Closed' : opening.expired ? 'Expired' : 'Active';
      return <>
        <Breadcrumbs items={[[ '/openings', t('Openings') ], [`/organizations/${opening.organizationId}`, opening.organizationName], [`/teams/${opening.team}`, opening.teamName], [null, opening.role]]} />
        <BrandHero title={opening.role} brand={opening.organizationName} logo={opening.organizationLogoUrl} kicker={opening.gameName} subtitle={`${opening.organizationName} / ${opening.teamName}`}>
          <div className="recruiting-hero-actions opening-header-actions"><span className={state === 'Active' ? 'badge offers' : 'badge'}>{t(state)}</span>
            {state === 'Active' && <a className="button primary compact" href="#opening-application">{t("Go to application") + ' '}<ArrowRight size={16} aria-hidden="true" /></a>}
          </div>
        </BrandHero>
        <dl className="card opening-facts">
          {[['Platform', t(opening.platform)], ['Minimum rank', opening.rank || t('Not specified')], ['Region', opening.region], ['Language', opening.language]].map(([label,value]) => <div key={label}><dt>{t(label)}</dt><dd dir="auto">{value}</dd></div>)}
        </dl>
        <div className="application-layout opening-layout">
          <section className="card form-card"><h2>{t("Opening details")}</h2><h3>{t('Requirements for {game}', { game: isolate(opening.gameName) })}</h3><p className="preserve-lines" dir="auto">{opening.requirements}</p>
            <dl className="game-details"><div><dt>{t("Schedule")}</dt><dd>{displaySchedule(opening)} (<bdi>{opening.timezone}</bdi>)</dd></div><div><dt>{t("Deadline (your local time)")}</dt><dd><time dateTime={opening.deadline}>{displayDate(opening.deadline)}</time></dd></div></dl>
            <CopyLink path={`/openings/${opening.id}`} />
          </section>
          <div className="recruitment-list" id="opening-application">{state !== 'Active' && <section className="card form-card"><h2>{t("Applications closed")}</h2><p className="muted">{t("You can still browse other active openings.")}</p><a href="/openings">{t("Browse openings")}</a></section>}<OpeningApplication opening={opening} user={user} refresh={result.reload} /></div>
        </div>
      </>;
    }
    if (kind === 'teams') {
      const { team, openings } = result.data;
      return <><Breadcrumbs items={[[null, t('Organizations')], [`/organizations/${team.organization}`, team.organizationName], [null, team.name]]} />
        <BrandHero title={team.name} brand={team.organizationName} logo={team.organizationLogoUrl} kicker={team.gameName} subtitle={team.organizationName}>{openings.length > 0 && <a className="button primary" href="#team-openings">{quantity(openings.length, 'open role')} <ArrowRight size={16} aria-hidden="true" /></a>}<a className="button secondary" href={`/organizations/${team.organization}`}>{t("Organization page") + ' '}<ArrowUpRight size={16} aria-hidden="true" /></a><a className="button secondary" href="#posts">{t("Posts")}</a></BrandHero>
        <Connections kind="team" id={team.id} name={team.name} user={user} />
        <div className="team-management-layout">
          <aside className="card form-card"><h2>{t("About the team")}</h2><p className="preserve-lines muted" dir="auto">{team.description}</p><CopyLink path={`/teams/${team.id}`} /></aside>
          <section id="team-openings"><h2>{t("Active team openings")}</h2>{openings.length ? <div className="recruitment-list">{openings.map(opening => <OpeningCard key={opening.id} opening={opening} compact showTeam={false} />)}</div> : <div className="card empty-state"><h3>{t("No active openings for this team.")}</h3><p className="muted">{t("Explore opportunities from other teams.")}</p><a className="button secondary" href="/openings">{t("Browse openings")}</a></div>}</section>
        </div>
        <Posts key={user?.id || 'guest'} kind="team" id={team.id} signedIn={Boolean(user)} />
      </>;
    }
    const { organization, teams, openings = [] } = result.data;
    return <div className="public-organization">
      <BrandHero title={organization.name} logo={organization.logoUrl} kicker={t("Esports organization")} subtitle={displayRegion(organization.region)}>
        {openings.length > 0 && <a className="button primary" href="#organization-openings">{quantity(openings.length, 'open role')} <ArrowRight size={16} aria-hidden="true" /></a>}
        <CopyLink path={`/organizations/${organization.id}`} />
        <a className="button secondary" href="#posts">{t("Posts")}</a>
      </BrandHero>
      <Connections kind="organization" id={organization.id} name={organization.name} user={user} />
      <section className="card form-card organization-context"><div><h2>{t("About the organization")}</h2><p className="preserve-lines muted" dir="auto">{organization.description}</p></div>{organization.website && <a className="text-button" href={organization.website} rel="noreferrer">{t("Organization website") + ' '}<ArrowUpRight size={16} aria-hidden="true" /></a>}</section>
      <div className="organization-public-layout">
        <section aria-labelledby="organization-teams-title"><h2 id="organization-teams-title">{t("Teams") + ' '}<span className="muted small">{teams.length}</span></h2>{teams.length ? <div className="recruitment-list">{teams.map(team => <TeamSummary key={team.id} team={team} openings={openings} />)}</div> : <div className="card empty-state"><p>{t("No teams published yet.")}</p></div>}</section>
        <section id="organization-openings" aria-labelledby="organization-openings-title"><h2 id="organization-openings-title">{t("Recruitment openings") + ' '}<span className="muted small">{openings.length}</span></h2>{openings.length ? <div className="recruitment-list">{openings.map(opening => <OpeningCard key={opening.id} opening={opening} compact />)}</div> : <div className="card empty-state"><h3>{t("No open roles right now")}</h3><a className="button secondary" href="/openings">{t("Browse other openings")}</a></div>}</section>
      </div>
      <Posts key={user?.id || 'guest'} kind="organization" id={organization.id} signedIn={Boolean(user)} />
    </div>;
  })()}</ResourceState>;
}

function Roles({ organization, teams, onChanged }) {
  const result = useResource(`/organizations/${organization.id}/roles`);
  const [email, setEmail] = useState(''), [teamId, setTeamId] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(null);
  const notify = useToast();
  async function mutate(method, body) {
    setBusy(true); setError(null);
    try { await api(`/organizations/${organization.id}/roles`, { method, body }); notify('Management roles updated.'); onChanged(); }
    catch (error) { setError(error); } finally { setBusy(false); }
  }
  return <section className="card form-card"><h2>{t("Management roles")}</h2><p className="muted">{t("Organization managers manage every team and assign roles. Team managers manage only their assigned team and its openings. Keep at least one organization manager.")}</p><Notice error={error} />
    <form onSubmit={event => { event.preventDefault(); mutate('POST', { email, teamId: teamId || null }); }}><div className="form-grid"><Field label={t("Registered user email")} type="email" required value={email} onChange={event => setEmail(event.target.value)} error={error?.fields?.email} /><Field label={t("Management scope")} as="select" value={teamId} onChange={event => setTeamId(event.target.value)}><option value="">{t("Organization-wide")}</option>{teams.map(team => <option value={team.id} key={team.id}>{team.name}</option>)}</Field></div><Submit busy={busy}>{t("Assign manager")}</Submit></form>
    <ResourceState resource={result}><ul className="role-list">{result.data?.roles.map(role => <li key={`${role.userId}-${role.teamId}`}><span>{role.email}<br /><small>{role.teamName || t("Organization-wide")}</small></span><button className="button secondary danger" disabled={busy} onClick={() => mutate('DELETE', { userId: role.userId, teamId: role.teamId })}>{t("Revoke") + ' '}<span className="sr-only">{role.email} {role.teamName || t("organization-wide")}</span></button></li>)}</ul></ResourceState></section>;
}

function OpeningManager({ team, openings, reload }) {
  const [editing, setEditing] = useState(null), [error, setError] = useState(null), [busy, setBusy] = useState(false);
  const notify = useToast();
  const editor = useRef(null);
  const pending = openings.reduce((sum, item) => sum + (item.applicantCounts?.submitted || 0), 0);
  useEffect(() => {
    if (editing) {
      editor.current?.focus({ preventScroll: true });
      editor.current?.scrollIntoView({ block: 'start' });
    }
  }, [editing]);
  async function close(opening) {
    setBusy(true); setError(null);
    try { await api(`/openings/${opening.id}/close`, { method: 'POST', body: {} }); notify('Opening closed.'); reload(); }
    catch (error) { setError(error); } finally { setBusy(false); }
  }
  return <section className="managed-openings"><div className="section-heading"><div><h2>{t('Openings · {team}', { team: isolate(team.name) })}</h2><p className="muted small manager-queue-summary">{quantity(openings.filter(isOpen).length, 'open role')}{pending > 0 && <> · {quantity(pending, 'new applicant')}</>}</p></div>{!editing && <button className="button primary" onClick={() => setEditing({})}><Plus size={17} aria-hidden="true" />{t("New opening")}</button>}</div><Notice error={error} />
    {editing && <div className="opening-editor" ref={editor} tabIndex={-1}><Editor key={editing.id || 'new'} title={editing.id ? t("Edit opening") : t("Publish opening")} fields={openingFields} initial={{ ...Object.fromEntries(openingFields.map(([key]) => [key, editing[key] || '']).concat([['platform', editing.platform || '']])), schedule: editing.schedule, scheduleSlots: editing.scheduleSlots }} opening path={editing.id ? `/openings/${editing.id}` : `/teams/${team.id}/openings`} method={editing.id ? 'PUT' : 'POST'} button={editing.id ? t("Save opening") : t("Publish opening")} onSaved={() => { setEditing(null); reload(); }}><div className="editor-context"><Gamepad2 size={20} aria-hidden="true" /><strong dir="auto">{team.name} · {team.gameName}</strong></div></Editor><button className="text-button" onClick={() => setEditing(null)}>{t("Cancel opening edit")}</button></div>}
    {openings.length ? <div className="recruitment-list">{openings.map(opening => <article className="card managed-opening" key={opening.id}>
      <div><span className={isOpen(opening) ? 'badge offers' : 'badge'}>{opening.status === 'closed' ? t("Closed") : opening.expired ? t("Expired") : t("Active")}</span><h3 dir="auto">{opening.role}</h3><p className="muted" dir="auto">{opening.language} · {opening.region}</p>
        <p className="muted small opening-applicant-count">{quantity(opening.applicantCounts?.total || 0, 'applicant')}{opening.applicantCounts?.submitted > 0 && <span className="badge offers">{t('{count} new', { count: number(opening.applicantCounts.submitted) })}</span>}</p></div>
      <div className="managed-opening-actions"><div className="heading-actions"><a className="button secondary" href={`/manage/openings/${opening.id}/applicants`}>{t("Review applicants")}</a><a className="text-button" href={`/openings/${opening.id}`}>{t("View opening")}</a></div>
        {opening.status !== 'closed' && <div className="heading-actions"><button className="text-button" onClick={() => setEditing(opening)}>{t("Edit opening")}</button><button className="text-button danger" disabled={busy} onClick={() => close(opening)}>{t("Close opening")}</button></div>}</div>
    </article>)}</div> : !editing && <div className="card empty-state"><h3>{t("No openings yet.")}</h3><p className="muted">{t("Publish an opening to start receiving applications for this team.")}</p></div>}</section>;
}

function Breadcrumbs({ items }) {
  return <nav className="breadcrumbs" aria-label={t("Breadcrumb")}><ol>{items.map(([href, label], index) => <li key={index}>{index > 0 && <ChevronRight size={14} aria-hidden="true" />}{href ? <a href={href}>{label}</a> : <span aria-current={index === items.length - 1 ? 'page' : undefined}>{label}</span>}</li>)}</ol></nav>;
}

function OrganizationCard({ organization, teams, openings }) {
  const path = `/manage/organizations/${organization.id}`;
  const active = openings.filter(opening => opening.organizationId === organization.id && isOpen(opening)).length;
  const games = [...new Set(teams.map(team => team.gameName))];
  const singleAssignment = !organization.canManage && teams.length === 1;
  return <article className="card organization-tile">
    <div className="organization-tile-identity"><IdentityMark className="org-mark" name={organization.name} src={organization.logoUrl} />
      <div><h2 dir="auto">{organization.name}</h2><p className="region-label muted"><MapPin size={14} aria-hidden="true" /><span className="sr-only">{t("Region")}</span><bdi>{displayRegion(organization.region)}</bdi></p></div>
    </div>
    <span className="badge management-badge">{organization.canManage ? t("Organization manager") : t("Team manager")}</span>
    <p className="muted card-description" dir="auto">{organization.description}</p>
    <div className="organization-tile-scope">
      <p><strong>{quantity(teams.length, organization.canManage ? 'team' : 'assigned team')}</strong><span className={active ? 'badge offers' : 'badge'}>{quantity(active, 'open role')}</span></p>
      {organization.canManage ? games.length > 0 && <ul aria-label={t("Games")}>{games.map(game => <li className="badge" key={game}>{game}</li>)}</ul>
        : <ul aria-label={t("Assigned teams")}>{teams.map(team => <li key={team.id}>{singleAssignment ? <span className="badge">{team.name} · {team.gameName}</span> : <a className="badge" href={`${path}/teams/${team.id}`}>{team.name} · {team.gameName}</a>}</li>)}</ul>}
    </div>
    <div className="heading-actions"><a className="button primary" href={singleAssignment ? `${path}/teams/${teams[0].id}` : path}>{organization.canManage ? t("Manage organization") : singleAssignment ? t("Manage assigned team") : t("Manage assigned teams")} <ArrowUpRight size={16} aria-hidden="true" /></a><a className="text-button" href={`/organizations/${organization.id}`}>{t("Public page") + ' '}<ArrowUpRight size={15} aria-hidden="true" /></a></div>
  </article>;
}

function OrganizationLogoEditor({ organization }) {
  const [logo, setLogo] = useState(organization.logoUrl);
  return <section className="card form-card organization-logo-editor"><h2>{t("Branding")}</h2>
    <ImageUpload title="Organization logo" kind="profile" name={organization.name} url={logo} path={`/organizations/${organization.id}/logo`}
      onSaved={({ organization }) => setLogo(organization.logoUrl)}
      help={t("Shown on your public page, teams, and openings. A square JPEG, PNG, or WebP under 5 MB works best.")} />
  </section>;
}

function Management({ route }) {
  const result = useResource('/management'), catalog = useResource('/games');
  const [gameId, setGameId] = useState('');
  const [rolesOpen, setRolesOpen] = useState(false);
  const { organizationId, teamId, action, creating } = route;
  const base = `/manage/organizations/${organizationId}`;
  const organization = result.data?.organizations.find(org => org.id === organizationId);
  const teams = result.data?.teams.filter(team => team.organization === organizationId) || [];
  const team = teams.find(item => item.id === teamId);
  function teamEditor(selectedTeam) {
    return <><p className="muted">{t("The parent organization and game define where this team belongs.")}</p><Editor key={selectedTeam?.id || 'new'} title={selectedTeam ? t("Edit team") : t("New team")} fields={teamFields} initial={selectedTeam ? { name: selectedTeam.name, description: selectedTeam.description } : {}} extra={selectedTeam ? undefined : { gameId }} path={selectedTeam ? `/teams/${selectedTeam.id}` : `/organizations/${organization.id}/teams`} method={selectedTeam ? 'PUT' : 'POST'} button={selectedTeam ? t("Save team") : t("Create team")} onSaved={data => { result.reload(); navigate(`${base}/teams/${data.team.id}`); }}>
      <div className="editor-context"><Building2 size={20} aria-hidden="true" /><div><span className="small-label">{t("PARENT ORGANIZATION")}</span><strong dir="auto">{organization.name}</strong></div></div>
      {selectedTeam ? <div className="editor-context"><Gamepad2 size={20} aria-hidden="true" /><div><span className="small-label">{t("TEAM GAME")}</span><strong>{selectedTeam.gameName}</strong><p className="muted small">{t("The game stays attached to this team and its openings.")}</p></div></div> : <Field label={t("Team game")} as="select" required value={gameId} onChange={event => setGameId(event.target.value)} help={t("Every opening on this team uses this game.")}><option value="">{t("Choose a game")}</option>{catalog.data?.games.map(game => <option key={game._id} value={game._id}>{game.name}</option>)}</Field>}
    </Editor><a className="text-button" href={selectedTeam ? `${base}/teams/${selectedTeam.id}` : base}>{t("Cancel and go back")}</a></>;
  }
  return <ResourceState resource={result}><ResourceState resource={catalog}>{result.data && (() => {
    if (creating) return <><Breadcrumbs items={[[ '/organizations', t('Organizations')], [null, t('Create organization')]]} /><h1>{t("Create organization")}</h1><p className="muted">{t("Use your existing account. You’ll become this organization’s first manager.")}</p><Editor title={t("New organization")} fields={orgFields} path="/organizations" button={t("Create organization page")} onSaved={data => { result.reload(); navigate(`/manage/organizations/${data.organization.id}`); }} /><a className="text-button" href="/organizations">{t("Cancel and go back")}</a></>;
    if (!organizationId) {
      const { organizations, teams, openings = [] } = result.data;
      const ordered = [...organizations].sort((a, b) => Number(b.canManage) - Number(a.canManage) || a.name.localeCompare(b.name));
      return <><div className="page-intro"><div><h1>{t("Organizations")}</h1><p className="muted">{t("Manage your clubs, teams, and recruiting.")}</p></div>{ordered.length > 0 && <a className="button secondary" href="/organizations/new"><Plus size={17} aria-hidden="true" />{t("Create organization")}</a>}</div>
        {ordered.length ? <><div className="organization-directory-summary"><span>{quantity(ordered.length, 'organization')}</span><span>{t('{count} in your scope', { count: quantity(teams.length, 'team') })}</span><span>{quantity(openings.filter(isOpen).length, 'open role')}</span></div>
          <div className="organization-grid organization-directory">{ordered.map(org => <OrganizationCard key={org.id} organization={org} teams={teams.filter(team => team.organization === org.id)} openings={openings} />)}</div>
        </> : <section className="card empty-state organization-empty"><Building2 size={36} aria-hidden="true" /><h2>{t("Build something together.")}</h2><p className="muted">{t("Create an organization to start managing teams, or ask an existing manager to assign your registered email.")}</p><a className="button primary" href="/organizations/new">{t("Create organization")}<ArrowUpRight size={16} aria-hidden="true" /></a></section>}
      </>;
    }
    if (!organization || (teamId && !team) || ((action === 'edit' || action === 'teams/new') && !organization.canManage)) return <><Breadcrumbs items={[[ '/organizations', t('Organizations')], [null, t('Management access')]]} /><h1>{t("Management access unavailable.")}</h1><Notice error="You don’t have management access to this organization or team." /><p className="muted">{t("Only assigned memberships grant access. Contact an organization manager if you need a role.")}</p><a className="button secondary" href="/organizations">{t("Back to organizations")}</a> <a className="text-button" href={`/organizations/${organizationId}`}>{t("View public organization page")}</a></>;
    const crumbs = [[ '/organizations', t('Organizations')], [action || teamId ? base : null, organization.name]];
    if (team) crumbs.push([route.editTeam ? `${base}/teams/${team.id}` : null, team.name]);
    if (action === 'edit') crumbs.push([null, t('Edit organization')]);
    if (action === 'teams/new') crumbs.push([null, t('New team')]);
    if (route.editTeam) crumbs.push([null, t('Edit team')]);
    if (action === 'edit') return <><Breadcrumbs items={crumbs} /><h1>{t("Edit organization")}</h1><p className="muted">{t('Update the public details for {name}.', { name: isolate(organization.name) })}</p><div className="organization-edit-layout"><OrganizationLogoEditor organization={organization} /><Editor title={t("Organization details")} fields={orgFields} initial={Object.fromEntries(orgFields.map(([key]) => [key, organization[key] || '']))} path={`/organizations/${organization.id}`} method="PUT" onSaved={() => { result.reload(); navigate(base); }} /></div><a className="text-button" href={base}>{t("Back to management")}</a></>;
    if (action === 'teams/new' || route.editTeam) return <><Breadcrumbs items={crumbs} /><h1>{team ? t("Edit team") : t("Create team")}</h1>{teamEditor(team)}</>;
    if (team) return <><Breadcrumbs items={crumbs} />
      <BrandHero title={team.name} brand={organization.name} logo={organization.logoUrl} kicker={t('Team management · {game}', { game: isolate(team.gameName) })} subtitle={`${isolate(organization.name)} · ${t(organization.canManage ? 'Organization manager' : 'Team manager')}`}><a className="button secondary" href={`${base}/teams/${team.id}/edit`}>{t("Edit team")}</a><a className="button secondary" href="#posts">{t("Posts")}</a></BrandHero>
      <div className="team-management-layout">
        <aside className="card form-card"><h2>{t("About the team")}</h2><p dir="auto" className="preserve-lines muted">{team.description}</p><a className="text-button" href={`/teams/${team.id}`}>{t("Public team page") + ' '}<ArrowUpRight size={16} aria-hidden="true" /></a></aside>
        <OpeningManager key={team.id} team={team} openings={result.data.openings.filter(opening => opening.team === team.id)} reload={result.reload} />
      </div>
      <Posts kind="team" id={team.id} signedIn />
    </>;
    return <><Breadcrumbs items={crumbs} />
      <BrandHero title={organization.name} logo={organization.logoUrl} kicker={t("Organization management")} subtitle={`${t(organization.canManage ? 'Organization manager' : 'Team manager · assigned teams only')} · ${isolate(displayRegion(organization.region))}`}>
        {organization.canManage && <a className="button primary" href={`${base}/teams/new`}><Plus size={16} aria-hidden="true" />{t("Add team")}</a>}
        {organization.canManage && <a className="button secondary" href="#posts">{t("Posts")}</a>}
      </BrandHero>
      <section className="card form-card organization-context"><div><h2>{t("About the organization")}</h2><p dir="auto" className="preserve-lines muted">{organization.description}</p></div><div className="heading-actions"><a className="text-button" href={`/organizations/${organization.id}`}>{t("Public organization page")}<ArrowUpRight size={16} aria-hidden="true" /></a>{organization.canManage && <a className="text-button" href={`${base}/edit`}>{t("Edit organization")}</a>}</div></section>
      <div className="section-title"><h2>{t("Managed teams")}</h2><div className="workspace-meta"><span className="badge">{quantity(teams.length, 'team')}</span>{organization.canManage && <a className="text-button" href="#organization-management-roles">{t("Manage roles")}</a>}</div></div>
      {teams.length ? <div className="organization-grid organization-directory">{teams.map(team => <TeamSummary key={team.id} team={team} openings={result.data.openings} managePath={`${base}/teams/${team.id}`} />)}</div> : <section className="card empty-state"><h3>{t("No teams in your management scope.")}</h3><p className="muted">{organization.canManage ? t("Add your first team and choose its game.") : t("Ask an organization manager to assign a team to your account.")}</p></section>}
      {organization.canManage && <details id="organization-management-roles" className="card roles-panel" open={rolesOpen} onToggle={event => setRolesOpen(event.currentTarget.open)}><summary>{t("Management roles") + ' '}<span className="muted small">{t("Assign and review organization or team access")}</span></summary><Roles organization={organization} teams={teams} onChanged={result.reload} /></details>}
      {organization.canManage && <Posts kind="organization" id={organization.id} signedIn />}
    </>;
  })()}</ResourceState></ResourceState>;
}

export default function Recruitment({ route, routeKey, user }) {
  if (route.page === 'organizations' || route.page === 'management') return <Management key={`${user.id}-${routeKey}`} route={route} />;
  if (route.page === 'openings') return <Browse key={routeKey} search={routeKey.includes('?') ? '?' + routeKey.split('?')[1] : ''} />;
  return <PublicPage key={`${route.kind}-${route.id}`} kind={route.kind} id={route.id} user={user} />;
}
