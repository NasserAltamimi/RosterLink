import { Game } from './model.js';
import { gameFields } from '../../../shared/game-form.js';

// Liquipedia Hub's Main list, plus Chess and PUBG Mobile from the API coverage page.
// Keep legacy RosterLink slugs and PandaScore IDs so existing references still resolve.
export const liquipediaGames = [
  ['rocket-league', 'Rocket League', 'rocketleague', 22],
  ['mlbb', 'Mobile Legends: Bang Bang', 'mobilelegends', 34],
  ['starcraft-brood-war', 'StarCraft Brood War', 'starcraft', 30],
  ['starcraft-2', 'StarCraft 2', 'starcraft2', 29],
  ['lol-wild-rift', 'LoL Wild Rift', 'wildrift', 28],
  ['kog', 'Honor of Kings', 'honorofkings', 27],
  ['valorant', 'Valorant', 'valorant', 26],
  ['fifa', 'EA Sports FC', 'easportsfc', 25],
  ['r6-siege', 'Rainbow 6 Siege', 'rainbowsix', 24],
  ['cod-mw', 'Call of Duty', 'callofduty', 23],
  ['pubg', 'PUBG', 'pubg', 20],
  ['ow', 'Overwatch', 'overwatch', 14],
  ['dota-2', 'Dota 2', 'dota2', 4],
  ['cs-go', 'Counter-Strike', 'counterstrike', 3],
  ['league-of-legends', 'League of Legends', 'leagueoflegends', 1],
  ['age-of-empires', 'Age of Empires', 'ageofempires'],
  ['apex-legends', 'Apex Legends', 'apexlegends'],
  ['brawl-stars', 'Brawl Stars', 'brawlstars'],
  ['chess', 'Chess', 'chess'],
  ['delta-force', 'Delta Force', 'deltaforce'],
  ['eva', 'EVA', 'eva'],
  ['fighters', 'Fighting Games', 'fighters'],
  ['fortnite', 'Fortnite', 'fortnite'],
  ['hearthstone', 'Hearthstone', 'hearthstone'],
  ['heroes-of-the-storm', 'Heroes of the Storm', 'heroes'],
  ['identity-v', 'Identity V', 'identityv'],
  ['pubg-mobile', 'PUBG Mobile', 'pubgmobile'],
  ['rematch', 'Rematch', 'rematch'],
  ['super-smash-bros', 'Super Smash Bros.', 'smash'],
  ['teamfight-tactics', 'Teamfight Tactics', 'tft'],
  ['the-finals', 'The Finals', 'thefinals'],
  ['warcraft', 'Warcraft', 'warcraft'],
  ['world-of-warcraft', 'World of Warcraft', 'worldofwarcraft'],
];

export async function syncLiquipediaGames() {
  const added = [];
  for (const [slug, name, wiki, providerId] of liquipediaGames) {
    const aliases = [{ liquipediaWiki: wiki }, { slug }];
    if (providerId) aliases.push({ providerId });
    const existing = await Game.find({ $or: aliases }).select('_id').limit(2).lean();
    if (existing.length > 1) throw new Error(`Multiple games match ${wiki}. Resolve the catalog mapping before syncing this wiki.`);
    const result = await Game.updateOne(existing.length ? { _id: existing[0]._id } : { slug }, {
      $set: { liquipediaWiki: wiki },
      $setOnInsert: {
        slug, name, ...(providerId ? { providerId } : {}), enabled: true, schemaVersion: 2,
        fields: gameFields, sources: [{ title: 'Liquipedia game coverage', url: `https://liquipedia.net/${wiki}/` }],
      },
    }, { upsert: true, runValidators: true });
    if (result.upsertedCount) added.push(name);
  }
  return { count: await Game.countDocuments({ enabled: true }), added };
}
