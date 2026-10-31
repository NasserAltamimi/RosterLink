import { useEffect, useState } from 'react';
import { api } from './api.js';
import { Brand, Field, Loading, Notice, Submit } from './components.jsx';
import { useToast } from './Toasts.jsx';
import { platforms } from '../shared/game-form.js';
import SchedulePicker from './SchedulePicker.jsx';

const orgFields = [['name', 'Organization name', 100], ['description', 'About the organization', 2000, 'textarea'], ['region', 'Organization region', 100], ['website', 'Website (optional)', 500, 'url']];
const teamFields = [['name', 'Team name', 100], ['description', 'About the team', 2000, 'textarea']];
const openingFields = [['role', 'Role', 100], ['requirements', 'Game-specific requirements', 2000, 'textarea'], ['rank', 'Minimum rank / context (optional)', 100], ['region', 'Region', 100], ['language', 'Language', 100], ['timezone', 'Schedule timezone', 100], ['deadline', 'Deadline', null, 'datetime-local']];
const deadlineLocal = value => { if (!value) return ''; const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

function useResource(path) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setState({ loading: true, data: null, error: null });
    api(path).then(data => { if (active) setState({ data, loading: false, error: null }); }, error => { if (active) setState({ data: null, loading: false, error }); });
    return () => { active = false; };
  }, [path, revision]);
  return { ...state, reload: () => setRevision(value => value + 1) };
}
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
  return <form className="card form-card" onSubmit={submit}><h3>{title}</h3>{children}<Notice error={error} /><fieldset disabled={busy} className="recruitment-fieldset">
    {opening && <Field label="Platform" as="select" value={values.platform} onChange={event => change('platform', event.target.value)} error={error?.fields?.platform} required><option value="">Choose platform</option>{platforms.map(platform => <option key={platform}>{platform}</option>)}</Field>}
    {opening && <SchedulePicker value={scheduleSlots} onChange={setScheduleSlots} errors={error?.fields} legacy={initial.schedule} />}
    <div className="form-grid">{fields.map(([key, label, maxLength, type]) => <Field key={key} label={label} as={type === 'textarea' ? 'textarea' : 'input'} type={type === 'textarea' ? undefined : type || 'text'} maxLength={maxLength || undefined} dir={type === 'datetime-local' ? undefined : 'auto'} value={values[key] ?? ''} required={!['website', 'rank'].includes(key)} onChange={event => change(key, event.target.value)} error={error?.fields?.[key]} help={key === 'deadline' ? 'Enter your local date and time. Saved as an exact UTC instant.' : key === 'schedule' ? 'Include days and times; the timezone below applies.' : key === 'timezone' ? 'IANA timezone, e.g. Asia/Riyadh.' : undefined} />)}</div>
    <Submit busy={busy}>{button}</Submit></fieldset></form>;
}

function OpeningCard({ opening }) {
  return <article className="card form-card"><p className="eyebrow">{opening.gameName} · {opening.region}</p><h2><a href={`/openings/${opening.id}`}>{opening.role}</a></h2><p><a href={`/organizations/${opening.organizationId}`}>{opening.organizationName}</a> / <a href={`/teams/${opening.team}`}>{opening.teamName}</a></p><p>{opening.language} · {opening.schedule} ({opening.timezone})</p><p className="muted">Deadline: {new Date(opening.deadline).toLocaleString()} (your local time)</p></article>;
}

function Browse() {
  const [filters, setFilters] = useState({ game: '', role: '', region: '', language: '' });
  const [query, setQuery] = useState('');
  const catalog = useResource('/games'), result = useResource(`/openings${query}`);
  function filter(event) { event.preventDefault(); setQuery(`?${new URLSearchParams(Object.entries(filters).filter(([, value]) => value.trim()))}`); }
  return <><p className="eyebrow">FIND YOUR NEXT TEAM</p><h1>Recruitment openings</h1><p className="muted">Active opportunities from organizations. Deadlines are displayed in your local time.</p>
    <form className="card form-card" onSubmit={filter}><h2>Filter openings</h2><ResourceState resource={catalog}><div className="form-grid"><Field label="Game" as="select" value={filters.game} onChange={event => setFilters({ ...filters, game: event.target.value })}><option value="">All games</option>{catalog.data?.games.map(game => <option value={game._id} key={game._id}>{game.name}</option>)}</Field>{['role', 'region', 'language'].map(key => <Field key={key} label={key[0].toUpperCase() + key.slice(1)} maxLength={100} value={filters[key]} onChange={event => setFilters({ ...filters, [key]: event.target.value })} />)}</div><button className="button primary">Apply filters</button> <button className="button secondary" type="button" onClick={() => { setFilters({ game: '', role: '', region: '', language: '' }); setQuery(''); }}>Clear filters</button></ResourceState></form>
    <ResourceState resource={result}><p role="status">{result.data?.openings.length || 0} active openings</p>{result.data?.openings.length ? result.data.openings.map(opening => <OpeningCard key={opening.id} opening={opening} />) : <section className="card form-card"><h2>No active openings found.</h2><p>Try changing your filters or check back later.</p></section>}</ResourceState></>;
}

function PublicPage({ kind, id }) {
  const result = useResource(`/${kind}/${id}`);
  return <ResourceState resource={result}>{result.data && (() => {
    if (kind === 'openings') {
      const { opening } = result.data;
      return <><OpeningCard opening={opening} /><section className="card form-card"><h2>Opening details</h2><p className="badge">{opening.status === 'closed' ? 'Closed' : opening.expired ? 'Expired' : 'Active'}</p><h3>Requirements for {opening.gameName}</h3><p className="preserve-lines" dir="auto">{opening.requirements}</p><p>Platform: {opening.platform}</p><p>Minimum rank / context: {opening.rank || 'Not specified'}</p></section></>;
    }
    if (kind === 'teams') {
      const { team, openings } = result.data;
      return <><section className="card form-card"><p className="eyebrow">{team.gameName}</p><h1 dir="auto">{team.name}</h1><p><a href={`/organizations/${team.organization}`}>{team.organizationName}</a></p><p className="preserve-lines" dir="auto">{team.description}</p></section><h2>Active team openings</h2>{openings.length ? openings.map(opening => <OpeningCard key={opening.id} opening={opening} />) : <p>No active openings for this team.</p>}</>;
    }
    const { organization, teams } = result.data;
    return <><section className="card form-card"><p className="eyebrow">ORGANIZATION · {organization.region}</p><h1 dir="auto">{organization.name}</h1><p className="preserve-lines" dir="auto">{organization.description}</p>{organization.website && <a href={organization.website} rel="noreferrer">Organization website ↗</a>}</section><h2>Game teams</h2>{teams.length ? teams.map(team => <section className="card form-card" key={team.id}><p className="eyebrow">{team.gameName}</p><h3><a href={`/teams/${team.id}`}>{team.name}</a></h3><p dir="auto">{team.description}</p></section>) : <p>No teams published yet.</p>}</>;
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

function ManagedOrganization({ organization, teams, openings, games, reload }) {
  const [editOrg, setEditOrg] = useState(false), [newTeam, setNewTeam] = useState(false), [gameId, setGameId] = useState(games[0]?._id || '');
  const [editTeam, setEditTeam] = useState(null);
  const orgInitial = Object.fromEntries(orgFields.map(([key]) => [key, organization[key] || '']));
  return <><section className="card form-card"><h2>{organization.name}</h2><p>{organization.canManage ? 'Organization manager' : 'Team manager · assigned teams only'}</p><a href={`/organizations/${organization.id}`}>Public organization page ↗</a>{organization.canManage && <div className="heading-actions"><button className="button secondary" onClick={() => setEditOrg(!editOrg)}>Edit organization</button><button className="button secondary" onClick={() => setNewTeam(!newTeam)}>Add team</button></div>}</section>
    {organization.canManage && <>{editOrg && <Editor title="Organization" fields={orgFields} initial={orgInitial} path={`/organizations/${organization.id}`} method="PUT" onSaved={() => { setEditOrg(false); reload(); }} />}
      {newTeam && <Editor title="New team" fields={teamFields} extra={{ gameId }} path={`/organizations/${organization.id}/teams`} button="Create team" onSaved={() => { setNewTeam(false); reload(); }}><Field label="Team game" as="select" required value={gameId} onChange={event => setGameId(event.target.value)}><option value="">Choose a game</option>{games.map(game => <option key={game._id} value={game._id}>{game.name}</option>)}</Field></Editor>}
      <Roles organization={organization} teams={teams} onChanged={reload} /></>}
    <h2>Managed teams</h2>{!teams.length && <p>No teams in your management scope.</p>}{teams.map(team => <section className="managed-team" key={team.id}><div className="card form-card"><p className="eyebrow">{team.gameName}</p><h2>{team.name}</h2><p dir="auto">{team.description}</p><a href={`/teams/${team.id}`}>Public team page ↗</a><div><button className="text-button" onClick={() => setEditTeam(editTeam === team.id ? null : team.id)}>Edit team</button></div></div>{editTeam === team.id && <Editor title="Team" fields={teamFields} initial={{ name: team.name, description: team.description }} path={`/teams/${team.id}`} method="PUT" onSaved={() => { setEditTeam(null); reload(); }} />}<OpeningManager team={team} openings={openings.filter(opening => opening.team === team.id)} reload={reload} /></section>)}</>;
}

function Management() {
  const result = useResource('/management'), catalog = useResource('/games');
  const [creating, setCreating] = useState(false), [selected, setSelected] = useState('');
  const organization = result.data?.organizations.find(org => org.id === selected) || result.data?.organizations[0];
  return <><p className="eyebrow">BUILD YOUR ROSTER</p><h1>Organization workspace</h1><ResourceState resource={result}><ResourceState resource={catalog}>
    <button className="button primary" onClick={() => setCreating(!creating)}>Create organization</button>
    {creating && <Editor title="New organization" fields={orgFields} path="/organizations" button="Create organization page" onSaved={data => { setSelected(data.organization.id); setCreating(false); result.reload(); }} />}
    {!result.data?.organizations.length && <p className="card form-card">You have no management roles yet. Create an organization or ask its manager to assign your registered email.</p>}
    {organization && <><Field label="Managed organization" as="select" value={organization.id} onChange={event => setSelected(event.target.value)}>{result.data.organizations.map(org => <option value={org.id} key={org.id}>{org.name}</option>)}</Field><ManagedOrganization key={organization.id} organization={organization} teams={result.data.teams.filter(team => team.organization === organization.id)} openings={result.data.openings} games={catalog.data?.games || []} reload={result.reload} /></>}
  </ResourceState></ResourceState></>;
}

export default function Recruitment() {
  const segments = location.pathname.split('/').filter(Boolean);
  const kind = segments[0], id = segments.length === 2 ? segments[1] : null;
  const publicKind = ['organizations', 'teams', 'openings'].includes(kind);
  return <><a className="skip-link" href="#main-content">Skip to content</a><header className="topbar"><Brand /><nav className="recruitment-nav" aria-label="Recruitment"><a href="/">Player workspace</a><a href="/openings">Browse openings</a><a href="/manage">Manage organization</a></nav></header><main className="recruitment-main" id="main-content">{kind === 'manage' && segments.length === 1 ? <Management /> : kind === 'openings' && segments.length === 1 ? <Browse /> : publicKind && id ? <PublicPage kind={kind} id={id} /> : <Notice error="Page not found." />}</main></>;
}
