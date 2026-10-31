import { ArrowUpRight, Building2, Search, UserRound } from 'lucide-react';
import { Loading, Notice } from './components.jsx';
import useResource from './useResource.js';

export default function Workspace() {
  const profile = useResource('/profiles/me'), management = useResource('/management');
  if (profile.loading || management.loading) return <Loading />;
  const error = profile.error || management.error;
  if (error) return <><Notice error={error} /><button className="button secondary" onClick={() => { profile.reload(); management.reload(); }}>Try again</button></>;
  const player = profile.data.profile, { organizations, teams } = management.data;
  return <><div className="page-intro"><div><p className="eyebrow">YOUR NEXT CHAPTER IN ESPORTS</p><h1>{!player && !organizations.length ? 'Your journey starts here.' : 'My Workspace'}</h1><p className="muted">One account for your player profile and the organizations and teams you manage.</p></div><span className="badge">Your account, connected</span></div>
    <section className="workspace-welcome"><div><p className="eyebrow">CHOOSE YOUR NEXT MOVE</p><h2>{player ? `Welcome back, ${player.displayName}.` : 'Play your part. Build your team.'}</h2><p>Start with a player profile or create an organization. Both are available through the same account, whenever you’re ready.</p></div><ArrowUpRight size={44} aria-hidden="true" /></section>
    <div className="workspace-cards"><section className="card destination-card"><span className="destination-icon"><UserRound size={24} aria-hidden="true" /></span><p className="eyebrow">YOUR PLAYER IDENTITY</p><h2>{player ? player.displayName : 'Create player profile'}</h2><p className="muted">{player ? `${player.region} · ${profile.data.sections.length} game profiles` : 'Share your play style, game experience, and availability with future teammates.'}</p><a className="button primary" href="/profile">{player ? 'View my profile' : 'Create player profile'}<ArrowUpRight size={16} aria-hidden="true" /></a></section>
    <section className="card destination-card"><span className="destination-icon"><Building2 size={24} aria-hidden="true" /></span><p className="eyebrow">YOUR MANAGEMENT ACCESS</p><h2>{organizations.length ? `${organizations.length} organization${organizations.length === 1 ? '' : 's'}` : 'Create organization'}</h2><p className="muted">{organizations.length ? `Manage ${teams.length} team${teams.length === 1 ? '' : 's'} through your assigned memberships.` : 'Build an organization and become its manager. Existing managers can assign access to your account email.'}</p><a className="button secondary" href={organizations.length ? '/organizations' : '/organizations/new'}>{organizations.length ? 'View organizations' : 'Create organization'}<ArrowUpRight size={16} aria-hidden="true" /></a></section></div>
    <section className="card workspace-opportunities"><div><Search size={22} aria-hidden="true" /><div><h2>Find your next team.</h2><p className="muted">Explore active recruitment openings by game, role, region, and language.</p></div></div><a className="button secondary" href="/openings">Browse openings<ArrowUpRight size={16} aria-hidden="true" /></a></section>
  </>;
}
