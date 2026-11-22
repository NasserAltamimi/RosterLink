import { t } from './i18n.js';
import { useEffect, useState } from 'react';
import { api } from './api.js';
import { Loading, Notice } from './components.jsx';
import { gameFields } from '../shared/game-form.js';
import { displayGameDetail, displayPlacement } from './presentation.js';
import { ExperienceSource } from './LiquipediaExperience.jsx';
import IdentityMark from './IdentityMark.jsx';
import CopyLink from './CopyLink.jsx';
import { Connections } from './Connections.jsx';
import Posts from './Posts.jsx';
import ProfileHero from './ProfileHero.jsx';

// SF-13: read-only public player profile opened from a shared link (/p/<profileId>).
export default function PublicProfile({ profileId, user }) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let active = true;
    setState({ loading: true });
    if (!profileId) { setState({ error: { status: 404, message: 'Profile not found.' } }); return; }
    Promise.all([api(`/public/profiles/${profileId}`), api('/games')])
      .then(([data, catalog]) => { if (active) setState({ data, games: catalog.games }); })
      .catch(error => { if (active) setState({ error }); });
    return () => { active = false; };
  }, [profileId]);

  if (state.loading) return <Loading>{t("Loading profile…")}</Loading>;
  if (state.error) return <div className="card retry-card"><h1>{state.error.status === 404 ? t("Profile not found.") : t("Let’s reconnect.")}</h1><Notice error={state.error} /><a className="button primary" href="/">{t("Go to RosterLink")}</a></div>;

  const { profile, sections } = state.data;
  // SF-08: hidden fields are omitted by the API, so render only what is present.
  const hasAffiliations = Boolean(profile.affiliations?.length);
  return <>
    <ProfileHero profile={profile} sections={sections} games={state.games} navigation={[[ 'game-experience', 'Game experience' ], ['posts', 'Posts'], ...(hasAffiliations ? [['public-affiliations', 'Affiliations']] : [])]} actions={<CopyLink path={`/p/${profile.id}`} />} />
    <Connections key={profile.id} kind="player" id={profile.id} name={profile.displayName} user={user} />
    <div className="profile-layout-body">
      {(profile.bio || hasAffiliations) && <aside className="profile-summary">
        {profile.bio && <section className="card form-card"><h2>{t("About")}</h2><p className="muted preserve-lines" dir="auto">{profile.bio}</p></section>}
        {hasAffiliations && <section className="card form-card" id="public-affiliations"><h2>{t("Affiliations")}</h2><ul className="affiliation-list">{profile.affiliations.map(item => <li key={item.teamId || item.organizationId}><div className="affiliation-identity"><IdentityMark className="org-mark" name={item.organization} src={item.logoUrl} /><div>
            <a className="affiliation-name" dir="auto" href={item.teamId ? `/teams/${item.teamId}` : `/organizations/${item.organizationId}`}>{item.team || item.organization}</a>
            <p className="muted small" dir="auto">{t(item.role)}{item.team && <> · <bdi>{item.organization}</bdi></>}</p></div></div></li>)}</ul></section>}
      </aside>}
      <div className="profile-record">
      <div className="section-title" id="game-experience"><h2>{t("Game experience")}</h2></div>
      {sections.length ? sections.map(section => {
        const game = state.games.find(item => item._id === section.gameId);
        return <section className="card game-summary" id={`game-${section.gameId}`} key={section.gameId}><IdentityMark className="game-monogram" name={game?.name || 'Game'} src={game?.imageUrl} /><div className="game-summary-body"><div className="section-heading"><div><h3>{game?.name || t("Game")}</h3>{section.details.rank && <span className="rank-label"><strong dir="auto">{section.details.rank}</strong><span>{t("Self-reported rank")}</span></span>}</div>{!section.details.rank && <span className="badge">{t("Self-reported")}</span>}</div>
          {gameFields.some(field => field.key !== 'rank' && section.details[field.key]) && <dl className="game-details">{gameFields.filter(field => field.key !== 'rank' && section.details[field.key]).map(field => <div key={field.key}><dt>{field.key === 'availability' ? t("Availability") : t(field.label)}</dt><dd dir="auto">{displayGameDetail(field.key, section.details[field.key])}</dd></div>)}</dl>}
          {Boolean(section.experience?.length) && <div className="experience-summary"><h4>{t("Competitive experience · Self-reported")}</h4><p className="muted small">{t("Competition metadata does not verify identity, participation, or results.")}</p><ul>{section.experience.map((entry, index) => <li key={index}><strong dir="auto">{entry.name}</strong> <span dir="auto">{entry.edition}{entry.stage && ` · ${entry.stage}`} · {displayPlacement(entry)}</span><p className="muted small"><ExperienceSource entry={entry} /></p></li>)}</ul></div>}
        </div></section>;
      }) : <section className="card empty-state"><h3>{t("No games added yet.")}</h3></section>}
      <Posts key={`${profile.id}-${user?.id || 'guest'}`} kind="player" id={profile.id} signedIn={Boolean(user)} />
      </div>
    </div>
  </>;
}
