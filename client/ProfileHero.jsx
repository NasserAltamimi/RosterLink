import { t } from './i18n.js';
import { displayLanguage } from './presentation.js';
import IdentityMark from './IdentityMark.jsx';

export default function ProfileHero({ profile, sections, games, owner = false, actions, navigation }) {
  const Heading = owner ? 'h2' : 'h1';
  const details = [profile.region, profile.languages?.map(displayLanguage).join(' / ')].filter(Boolean);
  return <section className="card player-card profile-hero-card">
    <div className="player-cover">{profile.headerImageUrl && <img src={profile.headerImageUrl} alt={owner ? t("Your player header") : t("Player header")} />}</div>
    <div className="profile-hero-info">
      <IdentityMark className="avatar person-mark" name={profile.displayName} src={profile.profileImageUrl} alt={owner ? t("Your player avatar") : t("Player avatar")} />
      <div className="profile-hero-name"><p className="eyebrow">{t("Player profile")}</p><Heading dir="auto">{profile.displayName}</Heading>
        {details.length > 0 && <p className="muted small" dir="auto">{details.map((value, i) => <span key={i}>{i > 0 && ' · '}<bdi>{value}</bdi></span>)}</p>}
        {profile.openToOffers && <span className="badge offers">{t("Open to offers")}</span>}
      </div>
      <div className="profile-hero-actions">{actions}</div>
    </div>
    {sections.length > 0 && <ul className="profile-game-links" aria-label={t("Game profiles")}>{sections.map(section => {
      const game = games.find(item => item._id === section.gameId);
      return <li key={section.gameId}><a href={'#game-' + section.gameId}>
        <IdentityMark className="game-monogram" name={game?.name || 'Game'} src={game?.imageUrl} />
        <span><strong dir="auto">{game?.name || t("Game")}</strong>{section.details.rank && <small>{t("Self-reported ·")} <bdi>{section.details.rank}</bdi></small>}</span>
      </a></li>;
    })}</ul>}
    <nav className="section-rail" aria-label={t("Profile sections")}>{navigation.map(([id, label]) => <a href={'#' + id} key={id}>{t(label)}</a>)}</nav>
  </section>;
}
