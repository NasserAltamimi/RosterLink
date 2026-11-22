import { t } from './i18n.js';
import { useEffect, useState } from 'react';
import { api } from './api.js';
import { navigate } from './navigation.js';
import ProfileForm from './ProfileForm.jsx';
import Images from './Images.jsx';
import Games from './Games.jsx';
import ProfileOrganizations from './ProfileOrganizations.jsx';
import { ExperienceSource } from './LiquipediaExperience.jsx';
import PrivacySettings from './PrivacySettings.jsx';
import { Loading, Notice } from './components.jsx';
import { LegacyDetails } from './Experience.jsx';
import { gameFields } from '../shared/game-form.js';
import { displayGameDetail, displayPlacement } from './presentation.js';
import IdentityMark from './IdentityMark.jsx';
import CopyLink from './CopyLink.jsx';
import { Connections } from './Connections.jsx';
import Posts from './Posts.jsx';
import ProfileHero from './ProfileHero.jsx';

function Overview({ profile, sections, games, navigate }) {
  return <>
    <ProfileHero profile={profile} sections={sections} games={games} owner navigation={[[ 'game-experience', 'Game experience' ], ['posts', 'Posts'], ['my-organizations', 'My Organizations']]}
      actions={<><a className="button secondary" href={`/p/${profile.id}`}>{t("View public profile")}</a><CopyLink path={`/p/${profile.id}`} label={t("Copy public link")} /></>} />
    <Connections key={profile.id} kind="player" id={profile.id} name={profile.displayName} user={true} />
    <div className="profile-layout-body">
      <aside className="profile-summary">
        <section className="card form-card"><h2>{t("About")}</h2><p className="preserve-lines muted" dir="auto">{profile.bio || t("Tell teams about your play style and competitive goals.")}</p>{!profile.bio && <a className="text-button" href="/profile/edit">{t("Add a bio")}</a>}</section>
        <div id="my-organizations"><ProfileOrganizations profileId={profile.id} /></div>
      </aside>
    <div className="profile-record">
    <div className="section-title" id="game-experience"><h2>{t("Game experience")}</h2><button className="text-button" onClick={() => navigate('games')}>{t("Manage games ↗")}</button></div>
    {sections.length ? sections.map(section => {
      const game = games.find(game => game._id === section.gameId);
      return <section className="card game-summary" id={`game-${section.gameId}`} key={section.id}><IdentityMark className="game-monogram" name={game?.name || 'Game'} src={game?.imageUrl} /><div className="game-summary-body"><div className="section-heading"><div><h3>{game?.name || t("Saved game")}</h3>{section.details.rank && <span className="rank-label"><strong dir="auto">{section.details.rank}</strong><span>{t("Self-reported rank")}</span></span>}</div>{game && <a className="text-button" href={`/profile/games?game=${game._id}`}>{t("Edit game profile")}</a>}</div><dl className="game-details">{gameFields.filter(field => field.key !== 'rank' && section.details[field.key]).map(field => <div key={field.key}><dt>{field.key === 'availability' ? t("Availability") : t(field.label)}</dt><dd dir="auto">{displayGameDetail(field.key, section.details[field.key])}</dd></div>)}</dl>
        {Boolean(section.experience?.length) && <div className="experience-summary"><h4>{t("Competitive experience · Self-reported")}</h4><p className="muted small">{t("Competition metadata does not verify identity, participation, or results.")}</p><ul>{section.experience.map((entry, index) => <li key={index}><strong dir="auto">{entry.name}</strong> <span dir="auto">{entry.edition}{entry.stage && ` · ${entry.stage}`} · {displayPlacement(entry)}</span><p className="muted small"><ExperienceSource entry={entry} />{' ' + t("· Participation and results: self-reported")}</p></li>)}</ul></div>}
        <LegacyDetails details={section.legacyDetails} />
      </div></section>;
    }) : <section className="card empty-state"><span className="empty-symbol" aria-hidden="true">＋</span><h3>{t("Put your game on the map.")}</h3><p className="muted">{t("Add your game experience, rank, and availability.")}</p><button className="button primary" onClick={() => navigate('games')}>{t("Add your first game ↗")}</button></section>}
    <Posts kind="player" id={profile.id} signedIn />
    </div>
  </div></>;
}

export default function PlayerWorkspace({ tab }) {
  const [games, setGames] = useState([]);
  const [data, setData] = useState({ profile: null, sections: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const page = tab;
  const setPage = value => navigate(value === 'overview' ? '/profile' : `/profile/${value}`);
  const params = new URLSearchParams(location.search);
  const requestedGame = params.get('game') || '';
  const returnTo = params.get('next');
  const opening = /^\/openings\/[a-f\d]{24}$/i.test(returnTo || '') ? returnTo : null;

  async function bootstrap() {
    setLoading(true); setError(null);
    try {
      const [catalog, profileData] = await Promise.all([api('/games'), api('/profiles/me')]);
      setGames(catalog.games); setData(profileData);
    } catch (error) { setError(error); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    bootstrap();
  }, []);
  if (loading) return <Loading />;
  if (error) return <><Notice error={error} /><button className="button primary" onClick={bootstrap}>{t("Try again")}</button></>;
  const { profile, sections } = data;
  const updateProfile = profile => setData(previous => ({ ...previous, profile }));
  const saveSection = section => setData(previous => ({ ...previous, sections: [...previous.sections.filter(item => item.gameId !== section.gameId), section] }));
  return <>
    {profile && <nav className="profile-navigation" aria-label={t("Player profile")}>{[['overview', 'Overview'], ['edit', 'Edit profile'], ['games', 'Game profiles']].map(([id, label]) => <a key={id} href={id === 'overview' ? '/profile' : '/profile/' + id} aria-current={page === id ? 'page' : undefined}>{t(label)}</a>)}</nav>}
        <div className="page-intro"><div><h1>{!profile ? t("Your journey starts here.") : page === 'overview' ? t("Your player profile.") : page === 'edit' ? t("Edit player profile") : t("Game profiles")}</h1><p className="muted">{!profile ? opening ? t("Create your profile to return to the opening and apply.") : t("Add a display name, region, and languages to start.") : page === 'overview' ? t("Manage your public profile and competitive experience.") : page === 'edit' ? t("Update your details, visuals, and public visibility.") : t("Manage your rank, availability, and tournament experience by game.")}</p></div>
        {profile && page === 'overview' && <div className="profile-quick-actions"><a className="button secondary" href="/applications">{t("My Applications")}</a></div>}</div>
        <Notice error={error} />
        {!profile ? <ProfileForm profile={null} onSaved={result => { setData(result); if (opening) navigate(opening, { replace: true }); else setPage('overview'); }} />
          : page === 'overview' ? <Overview profile={profile} sections={sections} games={games} navigate={setPage} />
            : page === 'edit' ? <div className="profile-edit-layout"><nav className="card settings-index" aria-label={t("Profile settings")}><a href="#profile-details">{t("Profile details")}</a><a href="#profile-images">{t("Profile images")}</a><a href="#profile-privacy">{t("Privacy settings")}</a></nav><div>
              <div id="profile-details"><ProfileForm key={profile.id} profile={profile} onSaved={result => updateProfile(result.profile)} /></div>
              <div id="profile-images"><Images profile={profile} onSaved={updateProfile} /></div>
              <div id="profile-privacy"><PrivacySettings key={`privacy-${profile.id}`} profile={profile} onSaved={result => updateProfile(result.profile)} /></div>
            </div></div> : <Games key={requestedGame} requestedGame={requestedGame} profile={profile} games={games} sections={sections} onSaved={saveSection} onRemoved={id => setData(previous => ({ ...previous, sections: previous.sections.filter(section => section.gameId !== id) }))} />}
  </>;
}
