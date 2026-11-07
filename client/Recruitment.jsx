import { useState } from 'react';
import { api } from './api.js';
import { Field, Loading, Notice, Submit } from './components.jsx';
import { ArrowLeft, ArrowUpRight, Building2, ChevronRight, Gamepad2, Plus } from 'lucide-react';
import useResource from './useResource.js';
import { navigate } from './navigation.js';
import { useToast } from './Toasts.jsx';
import { platforms } from '../shared/game-form.js';
import SchedulePicker from './SchedulePicker.jsx';

const orgFields = [['name', 'Organization name', 100], ['description', 'About the organization', 2000, 'textarea'], ['region', 'Organization region', 100], ['website', 'Website (optional)', 500, 'url']];
const teamFields = [['name', 'Team name', 100], ['description', 'About the team', 2000, 'textarea']];
const openingFields = [['role', 'Role', 100], ['requirements', 'Game-specific requirements', 2000, 'textarea'], ['rank', 'Minimum rank / context (optional)', 100], ['region', 'Region', 100], ['language', 'Language', 100], ['timezone', 'Schedule timezone', 100], ['deadline', 'Deadline', null, 'datetime-local']];
const deadlineLocal = value => { if (!value) return ''; const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

function ResourceState({ resource, children }) {
  if (resource.loading) return <Loading />;
  if (resource.error) return <><Notice error={resource.error} />{resource.error.status === 401 && <p><a href="/login">Log in to manage your organizations</a></p>}<button className="button secondary" onClick={resource.reload}>Try again</button></>;
  return children;
}

// Shared labelled controls retain all input on failed requests; errors use the API's field paths.
function Editor({ title, fields, initial = {}, extra, path, method = 'POST', onSaved, button = 'Save', opening = false, children }) {
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
      const result = await api(path, { method, body }); notify(`${title} saved.`); onSaved(result);
    } catch (error) { setError(error); } finally { setBusy(false); }
  }
  return <form className="card form-card editor-card" onSubmit={submit} aria-busy={busy}><div className="section-heading"><div><p className="eyebrow">BUILD YOUR ROSTER</p><h2>{title}</h2></div><span className="badge">Required fields *</span></div><Notice error={error} /><fieldset disabled={busy} className="recruitment-fieldset">{children}
    {opening && <Field label="Platform" as="select" value={values.platform} onChange={event => change('platform', event.target.value)} error={error?.fields?.platform} required><option value="">Choose platform</option>{platforms.map(platform => <option key={platform}>{platform}</option>)}</Field>}
    {opening && <SchedulePicker value={scheduleSlots} onChange={setScheduleSlots} errors={error?.fields} legacy={initial.schedule} />}
    <div className="form-grid">{fields.map(([key, label, maxLength, type]) => <Field key={key} label={label} as={type === 'textarea' ? 'textarea' : 'input'} type={type === 'textarea' ? undefined : type || 'text'} maxLength={maxLength || undefined} dir={type === 'datetime-local' ? undefined : 'auto'} value={values[key] ?? ''} required={!['website', 'rank'].includes(key)} onChange={event => change(key, event.target.value)} error={error?.fields?.[key]} help={key === 'deadline' ? 'Enter your local date and time. Saved as an exact UTC instant.' : key === 'schedule' ? 'Include days and times; the timezone below applies.' : key === 'timezone' ? 'IANA timezone, e.g. Asia/Riyadh.' : undefined} />)}</div>
    <Submit busy={busy}>{button}</Submit></fieldset></form>;
}

function OpeningCard({ opening }) {
  return <article className="card form-card"><p className="eyebrow">{opening.gameName} · {opening.region}</p><h2><a href={`/openings/${opening.id}`}>{opening.role}</a></h2><p><a href={`/organizations/${opening.organizationId}`}>{opening.organizationName}</a> / <a href={`/teams/${opening.team}`}>{opening.teamName}</a></p><p>{opening.language} · {opening.schedule} ({opening.timezone})</p><p className="muted">Deadline: {new Date(opening.deadline).toLocaleString()} (your local time)</p></article>;
}

function Browse({ search }) {
  const [filters, setFilters] = useState(() => Object.fromEntries(['game', 'role', 'region', 'language'].map(key => [key, new URLSearchParams(search).get(key) || ''])));
  const query = search;
  const catalog = useResource('/games'), result = useResource(`/openings${query}`);
  function filter(event) { event.preventDefault(); const query = new URLSearchParams(Object.entries(filters).map(([key, value]) => [key, value.trim()]).filter(([, value]) => value)); navigate(`/openings${query.size ? '?' + query : ''}`); }
  return <><p className="eyebrow">FIND YOUR NEXT TEAM</p><h1>Recruitment openings</h1><p className="muted">Active opportunities from organizations. Deadlines are displayed in your local time.</p>
    <form className="card form-card" onSubmit={filter}><h2>Filter openings</h2><ResourceState resource={catalog}><div className="form-grid"><Field label="Game" as="select" value={filters.game} onChange={event => setFilters({ ...filters, game: event.target.value })}><option value="">All games</option>{catalog.data?.games.map(game => <option value={game._id} key={game._id}>{game.name}</option>)}</Field>{['role', 'region', 'language'].map(key => <Field key={key} label={key[0].toUpperCase() + key.slice(1)} maxLength={100} value={filters[key]} onChange={event => setFilters({ ...filters, [key]: event.target.value })} />)}</div><div className="heading-actions"><button className="button primary">Apply filters</button><button className="button secondary" type="button" onClick={() => { setFilters({ game: '', role: '', region: '', language: '' }); navigate('/openings'); }}>Clear filters</button></div></ResourceState></form>
    <ResourceState resource={result}><p role="status">{result.data?.openings.length || 0} active openings</p>{result.data?.openings.length ? result.data.openings.map(opening => <OpeningCard key={opening.id} opening={opening} />) : <section className="card form-card"><h2>No active openings found.</h2><p>Try changing your filters or check back later.</p></section>}</ResourceState></>;
}

function PublicPage({ kind, id }) {
  const result = useResource(`/${kind}/${id}`);
  return <ResourceState resource={result}>{result.data && (() => {
    if (kind === 'openings') {
      const { opening } = result.data;
      return <><Breadcrumbs items={[['/openings', 'Openings'], [`/organizations/${opening.organizationId}`, opening.organizationName], [`/teams/${opening.team}`, opening.teamName], [null, opening.role]]} /><p className="eyebrow">PUBLIC OPENING</p><h1 dir="auto">{opening.role}</h1><OpeningCard opening={opening} /><section className="card form-card"><h2>Opening details</h2><p className="badge">{opening.status === 'closed' ? 'Closed' : opening.expired ? 'Expired' : 'Active'}</p><h3>Requirements for {opening.gameName}</h3><p className="preserve-lines" dir="auto">{opening.requirements}</p><p>Platform: {opening.platform}</p><p>Minimum rank / context: {opening.rank || 'Not specified'}</p></section></>;
    }
    if (kind === 'teams') {
      const { team, openings } = result.data;
      return <><Breadcrumbs items={[[null, 'Organizations'], [`/organizations/${team.organization}`, team.organizationName], [null, team.name]]} /><section className="card form-card"><p className="eyebrow">PUBLIC TEAM · {team.gameName}</p><h1 dir="auto">{team.name}</h1><p><a href={`/organizations/${team.organization}`}>{team.organizationName}</a></p><p className="preserve-lines" dir="auto">{team.description}</p></section><h2>Active team openings</h2>{openings.length ? openings.map(opening => <OpeningCard key={opening.id} opening={opening} />) : <section className="card empty-state"><h3>No active openings for this team.</h3><p className="muted">Explore opportunities from other teams.</p><a className="button secondary" href="/openings">Browse openings</a></section>}</>;
    }
    const { organization, teams } = result.data;
    return <><Breadcrumbs items={[[null, 'Organizations'], [null, organization.name]]} /><section className="card form-card"><p className="eyebrow">PUBLIC ORGANIZATION · {organization.region}</p><h1 dir="auto">{organization.name}</h1><p className="preserve-lines" dir="auto">{organization.description}</p>{organization.website && <a href={organization.website} rel="noreferrer">Organization website ↗</a>}</section><h2>Game teams</h2><div className="organization-grid">{teams.length ? teams.map(team => <section className="card destination-card" key={team.id}><Gamepad2 size={24} aria-hidden="true" /><p className="eyebrow">{team.gameName}</p><h3><a href={`/teams/${team.id}`}>{team.name}</a></h3><p className="muted" dir="auto">{team.description}</p></section>) : <p>No teams published yet.</p>}</div></>;
  })()}</ResourceState>;
}

function Roles({ organization, teams, onChanged }) {
  const result = useResource(`/organizations/${organization.id}/roles`);
  const [email, setEmail] = useState(''), [teamId, setTeamId] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(null);
  const notify = useToast();
  async function mutate(method, body) {
    setBusy(true); setError(null);
    try { await api(`/organizations/${organization.id}/roles`, { method, body }); notify('Management roles updated.'); result.reload(); onChanged(); }
    catch (error) { setError(error); } finally { setBusy(false); }
  }
  return <section className="card form-card"><h2>Management roles</h2><p className="muted">Organization managers manage every team and assign roles. Team managers manage only their assigned team and its openings. Keep at least one organization manager.</p><Notice error={error} />
    <form onSubmit={event => { event.preventDefault(); mutate('POST', { email, teamId: teamId || null }); }}><div className="form-grid"><Field label="Registered user email" type="email" required value={email} onChange={event => setEmail(event.target.value)} error={error?.fields?.email} /><Field label="Management scope" as="select" value={teamId} onChange={event => setTeamId(event.target.value)}><option value="">Organization-wide</option>{teams.map(team => <option value={team.id} key={team.id}>{team.name}</option>)}</Field></div><Submit busy={busy}>Assign manager</Submit></form>
    <ResourceState resource={result}><ul className="role-list">{result.data?.roles.map(role => <li key={`${role.userId}-${role.teamId}`}><span>{role.email}<br /><small>{role.teamName || 'Organization-wide'}</small></span><button className="button secondary danger" disabled={busy} onClick={() => mutate('DELETE', { userId: role.userId, teamId: role.teamId })}>Revoke <span className="sr-only">{role.email} {role.teamName || 'organization-wide'}</span></button></li>)}</ul></ResourceState></section>;
}

function OpeningManager({ team, openings, reload }) {
  const [editing, setEditing] = useState(null), [error, setError] = useState(null), [busy, setBusy] = useState(false);
  const notify = useToast();
  async function close(opening) {
    setBusy(true); setError(null);
    try { await api(`/openings/${opening.id}/close`, { method: 'POST', body: {} }); notify('Opening closed.'); reload(); }
    catch (error) { setError(error); } finally { setBusy(false); }
  }
  return <><div className="section-heading"><h3>Openings · {team.name}</h3><button className="button secondary" onClick={() => setEditing({})}>New opening</button></div><Notice error={error} />
    {editing && <><Editor key={editing.id || 'new'} title={editing.id ? 'Edit opening' : 'Publish opening'} fields={openingFields} initial={{ ...Object.fromEntries(openingFields.map(([key]) => [key, editing[key] || '']).concat([['platform', editing.platform || '']])), schedule: editing.schedule, scheduleSlots: editing.scheduleSlots }} opening path={editing.id ? `/openings/${editing.id}` : `/teams/${team.id}/openings`} method={editing.id ? 'PUT' : 'POST'} button={editing.id ? 'Save opening' : 'Publish opening'} onSaved={() => { setEditing(null); reload(); }}><p>Team: {team.name} · Game: {team.gameName} (derived from team)</p></Editor><button className="text-button" onClick={() => setEditing(null)}>Cancel opening edit</button></>}
    {openings.length ? openings.map(opening => <article className="card form-card" key={opening.id}><h3>{opening.role}</h3><p>{opening.status === 'closed' ? 'Closed' : opening.expired ? 'Expired' : 'Active'} · {opening.language} · {opening.region}</p><a href={`/openings/${opening.id}`}>View opening</a>{opening.status !== 'closed' && <div className="heading-actions"><button className="button secondary" onClick={() => setEditing(opening)}>Edit opening</button><button className="button secondary danger" disabled={busy} onClick={() => close(opening)}>Close opening</button></div>}</article>) : <p>No openings yet.</p>}</>;
}

function Breadcrumbs({ items }) {
  return <nav className="breadcrumbs" aria-label="Breadcrumb"><ol>{items.map(([href, label], index) => <li key={index}>{index > 0 && <ChevronRight size={14} aria-hidden="true" />}{href ? <a href={href}>{label}</a> : <span aria-current={index === items.length - 1 ? 'page' : undefined}>{label}</span>}</li>)}</ol></nav>;
}

function OrganizationCard({ organization, teams }) {
  return <article className="card destination-card"><div className="section-heading"><span className="destination-icon"><Building2 size={24} aria-hidden="true" /></span><span className="badge">{organization.canManage ? 'Organization manager' : 'Team manager'}</span></div><h2 dir="auto">{organization.name}</h2><p className="muted">{organization.region} · {teams.length} {organization.canManage ? 'teams' : 'assigned teams'}</p><p className="muted card-description" dir="auto">{organization.description}</p><div className="heading-actions"><a className="button primary" href={`/manage/organizations/${organization.id}`}>Manage organization<ArrowUpRight size={16} aria-hidden="true" /></a><a className="text-button" href={`/organizations/${organization.id}`}>View public page</a></div></article>;
}

function Management({ route }) {
  const result = useResource('/management'), catalog = useResource('/games');
  const [gameId, setGameId] = useState('');
  const { organizationId, teamId, action, creating } = route;
  const base = `/manage/organizations/${organizationId}`;
  const organization = result.data?.organizations.find(org => org.id === organizationId);
  const teams = result.data?.teams.filter(team => team.organization === organizationId) || [];
  const team = teams.find(item => item.id === teamId);
  function teamEditor(selectedTeam) {
    return <><p className="muted">The parent organization and game define where this team belongs.</p><Editor key={selectedTeam?.id || 'new'} title={selectedTeam ? 'Edit team' : 'New team'} fields={teamFields} initial={selectedTeam ? { name: selectedTeam.name, description: selectedTeam.description } : {}} extra={selectedTeam ? undefined : { gameId }} path={selectedTeam ? `/teams/${selectedTeam.id}` : `/organizations/${organization.id}/teams`} method={selectedTeam ? 'PUT' : 'POST'} button={selectedTeam ? 'Save team' : 'Create team'} onSaved={data => { result.reload(); navigate(`${base}/teams/${data.team.id}`); }}>
      <div className="editor-context"><Building2 size={20} aria-hidden="true" /><div><span className="small-label">PARENT ORGANIZATION</span><strong dir="auto">{organization.name}</strong></div></div>
      {selectedTeam ? <div className="editor-context"><Gamepad2 size={20} aria-hidden="true" /><div><span className="small-label">TEAM GAME</span><strong>{selectedTeam.gameName}</strong><p className="muted small">The game stays attached to this team and its openings.</p></div></div> : <Field label="Team game" as="select" required value={gameId} onChange={event => setGameId(event.target.value)} help="Every opening on this team uses this game."><option value="">Choose a game</option>{catalog.data?.games.map(game => <option key={game._id} value={game._id}>{game.name}</option>)}</Field>}
    </Editor><a className="text-button" href={selectedTeam ? `${base}/teams/${selectedTeam.id}` : base}>Cancel and go back</a></>;
  }
  return <ResourceState resource={result}><ResourceState resource={catalog}>{result.data && (() => {
    if (creating) return <><Breadcrumbs items={[[ '/organizations', 'Organizations'], [null, 'Create organization']]} /><h1>Create organization</h1><p className="muted">Use your existing account. You’ll become this organization’s first manager.</p><Editor title="New organization" fields={orgFields} path="/organizations" button="Create organization page" onSaved={data => { result.reload(); navigate(`/manage/organizations/${data.organization.id}`); }} /><a className="text-button" href="/organizations">Cancel and go back</a></>;
    if (!organizationId) return <><div className="page-intro"><div><p className="eyebrow">YOUR ACCOUNT · YOUR MANAGEMENT ACCESS</p><h1>Organizations</h1><p className="muted">The organizations and teams you manage, together in one place.</p></div><a className="button primary" href="/organizations/new"><Plus size={17} aria-hidden="true" />Create organization</a></div>
      {result.data.organizations.length ? <div className="organization-grid">{result.data.organizations.map(org => <OrganizationCard key={org.id} organization={org} teams={result.data.teams.filter(team => team.organization === org.id)} />)}</div> : <section className="card empty-state organization-empty"><Building2 size={36} aria-hidden="true" /><h2>Build something together.</h2><p className="muted">You don’t manage any organizations or teams yet. Create an organization to become its manager, or ask an existing manager to assign your registered email.</p><a className="button primary" href="/organizations/new">Create organization<ArrowUpRight size={16} aria-hidden="true" /></a></section>}
      <p className="muted small membership-note">Access follows your assigned memberships. A team manager can manage their assigned teams and openings; an organization manager can also manage the organization and roles.</p></>;
    if (!organization || (teamId && !team) || ((action === 'edit' || action === 'teams/new') && !organization.canManage)) return <><Breadcrumbs items={[[ '/organizations', 'Organizations'], [null, 'Management access']]} /><h1>Management access unavailable.</h1><Notice error="You don’t have management access to this organization or team." /><p className="muted">Only assigned memberships grant access. Contact an organization manager if you need a role.</p><a className="button secondary" href="/organizations">Back to organizations</a> <a className="text-button" href={`/organizations/${organizationId}`}>View public organization page</a></>;
    const crumbs = [[ '/organizations', 'Organizations'], [action || teamId ? base : null, organization.name]];
    if (team) crumbs.push([route.editTeam ? `${base}/teams/${team.id}` : null, team.name]);
    if (action === 'edit') crumbs.push([null, 'Edit organization']);
    if (action === 'teams/new') crumbs.push([null, 'New team']);
    if (route.editTeam) crumbs.push([null, 'Edit team']);
    if (action === 'edit') return <><Breadcrumbs items={crumbs} /><h1>Edit organization</h1><p className="muted">Update the public details for {organization.name}.</p><Editor title="Organization" fields={orgFields} initial={Object.fromEntries(orgFields.map(([key]) => [key, organization[key] || '']))} path={`/organizations/${organization.id}`} method="PUT" onSaved={() => { result.reload(); navigate(base); }} /><a className="text-button" href={base}>Cancel and go back</a></>;
    if (action === 'teams/new' || route.editTeam) return <><Breadcrumbs items={crumbs} /><h1>{team ? 'Edit team' : 'Create team'}</h1>{teamEditor(team)}</>;
    if (team) return <><Breadcrumbs items={crumbs} /><div className="page-intro"><div><p className="eyebrow">TEAM MANAGEMENT · {team.gameName}</p><h1 dir="auto">{team.name}</h1><p className="muted">{organization.name} · {organization.canManage ? 'Organization manager' : 'Team manager · assigned team only'}</p></div><a className="button secondary" href={`${base}/teams/${team.id}/edit`}>Edit team</a></div><section className="card form-card"><p dir="auto" className="preserve-lines">{team.description}</p><a className="text-button" href={`/teams/${team.id}`}>Public team page ↗</a></section><OpeningManager key={team.id} team={team} openings={result.data.openings.filter(opening => opening.team === team.id)} reload={result.reload} /></>;
    return <><Breadcrumbs items={crumbs} /><div className="page-intro"><div><p className="eyebrow">ORGANIZATION MANAGEMENT</p><h1 dir="auto">{organization.name}</h1><p className="muted">{organization.canManage ? 'Organization manager' : 'Team manager · assigned teams only'} · {organization.region}</p></div><a className="button secondary" href={`/organizations/${organization.id}`}>Public organization page<ArrowUpRight size={16} aria-hidden="true" /></a></div><section className="card form-card"><p dir="auto" className="preserve-lines">{organization.description}</p>{organization.canManage && <div className="heading-actions"><a className="button secondary" href={`${base}/edit`}>Edit organization</a><a className="button primary" href={`${base}/teams/new`}><Plus size={16} aria-hidden="true" />Add team</a></div>}</section><div className="section-title"><div><p className="eyebrow">YOUR MANAGEMENT SCOPE</p><h2>Managed teams</h2></div><span className="badge">{teams.length} teams</span></div>
      {teams.length ? <div className="organization-grid">{teams.map(team => <article className="card destination-card" key={team.id}><Gamepad2 size={24} aria-hidden="true" /><p className="eyebrow">{team.gameName}</p><h2 dir="auto">{team.name}</h2><p className="muted card-description" dir="auto">{team.description}</p><div className="heading-actions"><a className="button primary" href={`${base}/teams/${team.id}`}>Manage team<ArrowUpRight size={16} aria-hidden="true" /></a><a className="text-button" href={`/teams/${team.id}`}>View public team</a></div></article>)}</div> : <section className="card empty-state"><h3>No teams in your management scope.</h3><p className="muted">{organization.canManage ? 'Add your first team and choose its game.' : 'Ask an organization manager to assign a team to your account.'}</p>{organization.canManage && <a className="button primary" href={`${base}/teams/new`}>Add team</a>}</section>}
      {organization.canManage && <details className="card roles-panel"><summary>Management roles <span className="muted small">Assign and review organization or team access</span></summary><Roles organization={organization} teams={teams} onChanged={result.reload} /></details>}
    </>;
  })()}</ResourceState></ResourceState>;
}

export default function Recruitment({ route, routeKey, user }) {
  const publicCrumbs = route.page === 'public-detail' && route.kind !== 'openings' && user;
  return <>{publicCrumbs && <a className="back-link" href="/organizations"><ArrowLeft size={16} aria-hidden="true" />Back to my organizations</a>}{route.page === 'organizations' || route.page === 'management' ? <Management key={`${user.id}-${routeKey}`} route={route} /> : route.page === 'openings' ? <Browse key={routeKey} search={routeKey.includes('?') ? '?' + routeKey.split('?')[1] : ''} /> : <PublicPage key={`${route.kind}-${route.id}`} kind={route.kind} id={route.id} />}</>;
}
