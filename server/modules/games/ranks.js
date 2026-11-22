import { rocketLeague } from './catalog.js';

const ironToDiamond = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Emerald', 'Diamond'];
const riotApex = ['Master', 'Grandmaster', 'Challenger'];
const divisions = (tiers, levels) => tiers.flatMap(tier => levels.map(level => `${tier} ${level}`));
const riotDivisions = divisions(ironToDiamond, ['IV', 'III', 'II', 'I']);
const lolRanks = [...riotDivisions, ...riotApex];

const ranks = new Map([
  ['rocketleague', [rocketLeague.fields.find(field => field.key === 'rank').options, rocketLeague.sources[0].url]],
  ['leagueoflegends', [lolRanks, 'https://support.riotgames.com/en-us/league-of-legends/gameplay/ranked-tiers-divisions-and-queues']],
  ['wildrift', [[...lolRanks, 'Sovereign'], 'https://support.riotgames.com/en-us/wild-rift/gameplay/ranked-marks']],
  ['tft', [lolRanks, 'https://teamfighttactics.leagueoflegends.com/en-us/news/game-updates/tft-ranked-updates-remix-rumble-edition/']],
  ['valorant', [[...divisions(['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Ascendant', 'Immortal'], [1, 2, 3]), 'Radiant'], 'https://support.riotgames.com/en-us/valorant/gameplay/valorant-competitive-mode-faq']],
  ['apexlegends', [['Rookie', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master', 'Apex Predator'], 'https://help.ea.com/en/articles/apex-legends/ranked/']],
  ['rainbowsix', [['Copper', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Emerald', 'Diamond', 'Champion'], 'https://www.ubisoft.com/en-us/game/rainbow-six/siege/news-updates/5fzYRZKVVHqqRkkv3m4MyF/ranked-30-update']],
  ['overwatch', [['Bronze', 'Silver', 'Gold', 'Platinum', 'Emerald', 'Diamond', 'Master', 'Grandmaster', 'Champion'], 'https://overwatch.blizzard.com/en-us/news/patch-body/live/2026/8/']],
  ['fortnite', [['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Elite', 'Champion', 'Unreal'], 'https://www.fortnite.com/competitive/discover-competitive/fortnite-ranked-play-explained']],
  ['pubg', [['Bronze', 'Silver', 'Gold', 'Platinum', 'Crystal', 'Diamond', 'Master', 'Survivor'], 'https://pubg.com/en/news/11338?category=patch_notes']],
  ['pubgmobile', [['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Crown', 'Ace', 'Master', 'Challenger', 'Conqueror'], 'https://pubgmobile.helpshift.com/hc/en/3-pubg-mobile/faq/126-what-are-the-season-tiers-and-ranking-rules-in-pubg-mobile/']],
  ['brawlstars', [['Bronze', 'Silver', 'Gold', 'Diamond', 'Mythic', 'Legendary', 'Masters', 'Pro'], 'https://support.supercell.com/brawl-stars/en/articles/intro-to-ranked.html']],
  ['hearthstone', [['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Legend'], 'https://news.blizzard.com/en-gb/article/23319441/welcome-to-the-year-of-the-phoenix']],
  ['starcraft', [['F', 'E', 'D', 'C', 'B', 'A', 'S'], 'https://news.blizzard.com/en-us/article/23312982/season-6-unleashes-refreshed-maps-and-ferocious-new-rank-rewards']],
  ['starcraft2', [[...divisions(['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master'], [3, 2, 1]), 'Grandmaster'], 'https://news.blizzard.com/en-us/article/20166423/patch-3-4-the-starcraft-ii-ladder-revamp']],
]);

export function rankCatalog(game) {
  const match = ranks.get(game.liquipediaWiki || (game.slug === rocketLeague.slug ? 'rocketleague' : ''));
  return match ? { rankOptions: match[0], rankSource: match[1] } : {};
}
