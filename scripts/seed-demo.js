import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { mkdir, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import mongoose from 'mongoose';
import sharp from 'sharp';
import { readConfig } from '../server/config.js';
import { connectDatabase } from '../server/db.js';
import { localImageStorage } from '../server/storage/local-images.js';
import { User } from '../server/modules/auth/model.js';
import { hashPassword } from '../server/modules/auth/passwords.js';
import { Game } from '../server/modules/games/model.js';
import { syncLiquipediaGames } from '../server/modules/games/liquipedia-catalog.js';
import { PlayerGame, PlayerProfile } from '../server/modules/profiles/model.js';
import { Application, Opening, Organization, Team, recruitmentModels } from '../server/modules/recruitment/models.js';
import { Follow, Post, PostComment, PostReaction, postModels } from '../server/modules/posts/models.js';
import { formatSchedule } from '../shared/schedule.js';

const password = 'RosterLink Demo 2026!';
const email = key => `${key}@rosterlink-demo.test`;
const oid = key => new mongoose.Types.ObjectId(createHash('sha256').update(`rosterlink-demo/v1/${key}`).digest('hex').slice(0, 24));
const date = days => new Date(Date.now() + days * 86_400_000);
const scheduleSlots = [{ day: 'tue', start: '19:00', end: '22:00' }, { day: 'thu', start: '20:00', end: '23:00' }];
const timeZone = 'Asia/Riyadh';
const roster = [
  ['recruiter', 'Nadir “Switchback” Kamil', 'Riyadh, Saudi Arabia', ['Arabic', 'English'], 'Player-coach in Rocket League. I build practice blocks around replay review and coach the Stratos Vale development teams.', 'rocket-league', 'Champion III', 'Stratos Evening Series'],
  ['active', 'Lina “Pulse” Faris', 'Jeddah, Saudi Arabia', ['Arabic', 'English'], 'Defensive third with calm comms. I keep a replay journal and enjoy coaching new teammates through boost routes.', 'rocket-league', 'Grand Champion I', 'Red Sea 3v3 Circuit'],
  ['player', 'Kai “Relay” Sen', 'Dubai, UAE', ['English', 'Malay'], 'Flexible second in Rocket League and a controller player in Valorant. Looking for a team that scrims twice a week and reviews losses together.', 'rocket-league', 'Champion II', 'Gulf Community Open'],
  ['captain', 'Sami “Flare” Mazin', 'Doha, Qatar', ['Arabic', 'English'], 'Shotcaller and utility planner. I prefer structured defaults and brief, actionable feedback after every map.', 'valorant', 'Ascendant II', 'Signal City Invitational'],
  ['orbit', 'Mira “Orbit” Tan', 'Dubai, UAE', ['English', 'Mandarin'], 'Anchor player with experience on international rosters. I play Rocket League and Apex and can cover late evening blocks.', 'rocket-league', 'Grand Champion II', 'Coastline Rocket Cup'],
  ['morrow', 'Zayn “Morrow” Idris', 'Manama, Bahrain', ['Arabic', 'English'], 'Aggressive first player with a patient approach to replay review. Most comfortable in a consistent 3v3 roster.', 'rocket-league', 'Champion III', 'After Hours Open'],
  ['vela', 'Rana “Vela” Noor', 'Riyadh, Saudi Arabia', ['Arabic', 'English'], 'Sentinel and analyst. I write opponent notes, record lineups and can lead warmups for a new roster.', 'valorant', 'Ascendant III', 'Studio Five Qualifier'],
  ['ridge', 'Theo “Ridge” Vale', 'Amman, Jordan', ['English', 'Arabic'], 'Support flex and backup IGL. My priority is finding a team that balances tournament prep with a sustainable practice schedule.', 'rocket-league', 'Champion I', 'Skyline Arena League'],
];
const orgs = [
  ['stratos', 'Stratos Vale', 'Saudi Arabia', 'A Riyadh-based competitive club with weekly scrims, a development roster, and a focus on clear comms.', 'recruiter'],
  ['canyon', 'Canyon Signal', 'United Arab Emirates', 'A Gulf roster collective building tournament-ready teams through structured practice and replay review.', 'recruiter'],
  ['lunar', 'Lunar Current', 'Qatar', 'A Doha club for competitive players looking for a steady practice schedule and a friendly entry point into organized play.', 'captain'],
  ['ember', 'Ember Atlas', 'Bahrain', 'An independent club that helps developing teams prepare for their first regional qualifiers.', 'ridge'],
];
const teams = [
  ['velocity', 'stratos', 'Stratos Velocity', 'rocket-league', 'An established 3v3 squad that reviews one replay after every set.'],
  ['wardens', 'stratos', 'Stratos Wardens', 'valorant', 'A tactical roster building a stable map pool for regional qualifiers.'],
  ['foundry', 'stratos', 'Stratos Foundry', 'apex-legends', 'Evening scrims and ranked blocks for a developing Apex squad.'],
  ['spire', 'canyon', 'Canyon Spire', 'fortnite', 'A competitive duos program with weekly endgame review.'],
  ['echo', 'canyon', 'Canyon Echo', 'cs-go', 'A Counter-Strike team practicing utility protocols and retakes.'],
  ['tide', 'lunar', 'Lunar Tide', 'rocket-league', 'A rotating 3v3 roster with an open practice every Thursday.', ['recruiter']],
  ['eclipse', 'lunar', 'Lunar Eclipse', 'valorant', 'A bilingual academy squad with a weekly VOD session.'],
  ['atlas', 'ember', 'Atlas Relay', 'ow', 'A flexible team building toward its first open qualifier.'],
  ['zenith', 'ember', 'Atlas Zenith', 'league-of-legends', 'A developing five-stack with a focus on objective setup and clear calls.'],
];
const roles = [
  ['third', 'velocity', 'Defensive third · 3v3', 'GC I preferred', 'Hold the back line, call boost, and join two structured scrim blocks each week. Send a recent replay if you have one.'],
  ['rotation', 'velocity', 'Rotation player · 3v3', 'Champion II or above', 'Flex between second and third. Comfort with fast rotations and replay discussion is more important than a peak rank.'],
  ['coach', 'velocity', 'Replay analyst', '', 'Review two Rocket League sets each week and leave specific feedback on positioning and challenges.'],
  ['old', 'velocity', 'Substitute · Fall roster', 'Champion I', 'Cover weekend matches when a starter is unavailable.', true],
  ['sentinel', 'wardens', 'Sentinel starter', 'Ascendant I', 'Hold sites independently, track opponent habits, and help build setups for Haven and Lotus.'],
  ['entry', 'wardens', 'Flex initiator', 'Diamond III', 'Coordinate utility and entry timing on two maps during the trial block.'],
  ['anchor', 'foundry', 'Anchor / support', 'Diamond', 'Play from cover, track resources, and help call safe rotations in scrims.'],
  ['duo', 'spire', 'Duo partner · endgame', 'Elite', 'Join two endgame practice blocks and communicate builds and rotates consistently.'],
  ['rifler', 'echo', 'Anchor rifler', 'Level 8 preferred', 'Hold a site on CT, stay active in retakes, and bring two recent demos.'],
  ['old-echo', 'echo', 'Utility coordinator', '', 'Document team utility and call mid-round rotations.', true],
  ['tide', 'tide', 'Second player · academy', 'Diamond III', 'Make controlled challenges and bring one replay for a short review.'],
  ['lunar', 'eclipse', 'Controller · academy', 'Platinum III', 'Build smoke lineups for two maps and practice trades with our entry.'],
  ['atlas', 'atlas', 'Flex support', 'Diamond', 'Rotate between utility and healing duties and join one weekend scrim.'],
  ['zenith', 'zenith', 'Jungle / shotcaller', 'Emerald', 'Track objectives and communicate early pathing. Share two recent competitive games.'],
  ['old-ember', 'atlas', 'Reserve tank', '', 'Cover scrims and help teach positioning fundamentals.', true],
];
const applications = [
  ['active', 'third', 'shortlisted', 'pending'], ['orbit', 'third', 'shortlisted', 'attending'],
  ['morrow', 'third', 'reviewing'], ['ridge', 'third', 'submitted'], ['vela', 'third', 'rejected', 'declined'],
  ['captain', 'third', 'submitted'], ['recruiter', 'tide', 'reviewing'], ['active', 'coach', 'reviewing'],
  ['active', 'old', 'accepted', 'attending'], ['morrow', 'old', 'withdrawn'], ['vela', 'sentinel', 'shortlisted', 'pending'],
  ['captain', 'entry', 'submitted'], ['orbit', 'tide', 'submitted'], ['ridge', 'coach', 'submitted'],
];
const updates = [
  ['player', 'active', 'red-sea', 'Top 8 at the Red Sea 3v3 Circuit this weekend. Our last series went to game five. I’m taking Wednesday to review the defensive rotations before the next open.', ['player', 'recruiter', 'orbit'], [
    ['player', 'Congrats! Game five sounded close. Good luck with the next open.'],
    ['recruiter', 'Great run, Lina. The late-game boost calls were sharp.'],
  ]],
  ['player', 'player', 'replay-review', 'The best change in my Rocket League scrims this month was calling the second touch early. I’m reviewing two replays on Thursdays and looking for a steady 3v3 roster.', ['active', 'morrow'], [
    ['morrow', 'Calling it early helped our rotations too. See you in the next open bracket.'],
  ]],
  ['player', 'recruiter', 'player-coach', 'I’ve started ending our Rocket League replay reviews with one decision to work on next session. This week mine is knowing when to stop chasing the second touch.', ['active', 'captain'], []],
  ['organization', 'stratos', 'development', 'Stratos Vale’s development rosters start their next practice block on Tuesday. Stratos Velocity is recruiting a defensive third, and Wardens is looking for a Sentinel. Both roles are on our organization page.', ['active', 'player', 'vela'], [
    ['vela', 'Thanks for posting the schedule in the opening. It made it easy to check my availability.'],
    ['active', 'Good luck to the new development rosters!'],
  ]],
  ['organization', 'canyon', 'canyon-night', 'Canyon Spire and Canyon Echo wrapped up their first shared replay night yesterday. We’re keeping the format for next month: one match per team and one question for the room.', ['captain', 'recruiter'], [
    ['captain', 'One question per match is a great format. We might try it with Lunar Tide.'],
  ]],
  ['organization', 'lunar', 'academy', 'نبدأ هذا الأسبوع فترة تدريب جديدة لفريق Lunar Tide. تفاصيل دور الأكاديمية المفتوح موجودة في صفحة الفريق، ونرحب باللاعبين الذين يتواصلون بالعربية أو الإنجليزية.', ['active', 'recruiter'], [
    ['active', 'بالتوفيق للفريق في الفترة الجديدة!'],
  ]],
  ['team', 'velocity', 'velocity-tryouts', 'Rocket League tryouts this week are two short 3v3 sets followed by a replay review. We’ll look at comms and off-ball decisions. Bring one replay you want to discuss.', ['active', 'player', 'morrow'], [
    ['player', 'The replay review is a good idea. I have one from last week’s cup ready.'],
    ['morrow', 'Thanks for sharing what to expect.'],
  ]],
  ['team', 'wardens', 'map-pool', 'Wardens’ first Valorant scrims this block are on Haven and Lotus. We’ll spend one round per map rehearsing our retake calls before the live sets.', ['vela', 'captain'], [
    ['vela', 'I’ve been working on Lotus setups. Happy to bring a couple to a tryout.'],
  ]],
  ['team', 'tide', 'open-practice', 'Thursday’s Rocket League practice starts with controlled challenges before we run 3v3 sets. If you’re applying to the academy opening, bring one replay with a challenge you want feedback on.', ['player', 'orbit'], []],
];
const config = readConfig();
const mongo = new URL(config.mongoUri);
assert(!config.production && mongo.protocol === 'mongodb:' && ['127.0.0.1', 'localhost', '[::1]'].includes(mongo.hostname),
  'Demo seed requires a local MongoDB development database.');
const storage = localImageStorage(config.uploadDir);
const asset = fileURLToPath(new URL('./demo-assets.webp', import.meta.url));

async function image(tile) {
  const buffer = await sharp(asset).extract({ left: (tile % 4) * 256 + 2, top: Math.floor(tile / 4) * 256 + 2, width: 252, height: 252 }).webp({ quality: 90 }).toBuffer();
  return storage.save({ buffer, mimetype: 'image/webp' }, 'profile');
}

const counts = {};
async function createOnce(Model, key, values, imageField, tile) {
  const _id = oid(`${Model.modelName}/${key}`);
  const row = await Model.findById(_id);
  if (row) return row;
  const data = typeof values === 'function' ? await values() : values;
  const imageKey = imageField ? await image(tile) : null;
  try {
    const created = await Model.create({ _id, ...data, ...(imageField && { [imageField]: imageKey }) });
    counts[Model.modelName] = (counts[Model.modelName] || 0) + 1;
    return created;
  } catch (error) {
    await storage.remove(imageKey);
    if (error.code === 11000) {
      const concurrent = await Model.findById(_id);
      if (concurrent) return concurrent;
    }
    throw error;
  }
}

try {
  await connectDatabase(config.mongoUri);
  await Promise.all([User, Game, PlayerProfile, PlayerGame, ...recruitmentModels, ...postModels].map(Model => Model.init()));
  const existingEmails = await User.find({ email: { $in: [...roster.map(([key]) => email(key)), email('new')] } }).select('email');
  for (const user of existingEmails) assert(user._id.equals(oid(`User/${user.email.split('@')[0]}`)), 'A demo email is already used by an existing account.');
  const games = await Game.find({ enabled: true }).select('slug');
  if (!games.length) {
    await syncLiquipediaGames();
    games.push(...await Game.find({ enabled: true }).select('slug'));
  }
  const game = Object.fromEntries(games.map(row => [row.slug, row._id]));
  for (const slug of new Set(teams.map(([, , , slug]) => slug))) assert(game[slug], `Missing game ${slug}. Run npm run sync:games first.`);

  const users = {}, profiles = {}, organizations = {}, squads = {}, openings = {};
  for (const key of [...roster.map(([key]) => key), 'new']) {
    users[key] = await createOnce(User, key, async () => ({ email: email(key), passwordHash: await hashPassword(password) }));
  }
  for (const [index, [key, name, region, description, manager]] of orgs.entries()) {
    organizations[key] = await createOnce(Organization, key, { name, region, description, managers: [users[manager]._id] }, 'logoImage', index);
  }
  for (const [key, org, name, slug, description, managers = []] of teams) {
    squads[key] = await createOnce(Team, key, { name, description, organization: organizations[org]._id, game: game[slug], managers: managers.map(value => users[value]._id) });
  }
  for (const [index, [key, displayName, region, languages, bio, slug, rank, event]] of roster.entries()) {
    profiles[key] = await createOnce(PlayerProfile, key, {
      owner: users[key]._id, displayName, region, languages, bio, openToOffers: key !== 'recruiter',
      ...(key === 'recruiter' && { sharedAffiliations: [`organization:${organizations.stratos.id}`] }),
    }, 'profileImage', index + 4);
    const addGame = (gameSlug, rank, event, placement) => createOnce(PlayerGame, `${key}/${gameSlug}`, {
      profile: profiles[key]._id, game: game[gameSlug], schemaVersion: 2,
      details: { platform: 'PC', server: 'Middle East', language: languages.join(', '), rank, availability: 'Tue and Thu after 19:00, with weekends by arrangement (Asia/Riyadh).' },
      experience: [{ name: event, edition: '2026', placement }],
    });
    await addGame(slug, rank, event, index % 2 ? 'Top 8' : '3rd place');
    if (['player', 'active', 'recruiter', 'orbit'].includes(key)) {
      await addGame(key === 'orbit' ? 'apex-legends' : 'valorant', key === 'orbit' ? 'Diamond II' : 'Diamond I', 'Harbor Club Open', 'Top 16');
    }
  }
  for (const [index, [key, slug, role, rank, requirements, closed]] of roles.entries()) {
    const team = squads[slug];
    const manager = users[orgs.find(([org]) => org === teams.find(([id]) => id === slug)[1])[4]];
    openings[key] = await createOnce(Opening, key, {
      team: team._id, game: team.game, role, rank, requirements, platform: 'PC', region: 'Middle East', language: index % 3 ? 'Arabic / English' : 'English',
      scheduleSlots, schedule: formatSchedule(scheduleSlots), timezone: timeZone, deadline: date(closed ? -14 : 45 + index),
      status: closed ? 'closed' : 'active', createdBy: manager._id, updatedBy: manager._id, createdAt: date(-18 - index),
      ...(closed && { closedBy: manager._id, closedAt: date(-12) }),
    });
  }
  for (const [index, [player, key, status, response]] of applications.entries()) {
    const opening = openings[key];
    const recipient = users[player]._id;
    const team = Object.values(squads).find(squad => squad._id.equals(opening.team));
    const org = Object.values(organizations).find(organization => organization._id.equals(team.organization));
    const managers = [...new Set([...org.managers, ...team.managers].map(String))].filter(id => id !== String(recipient));
    const progress = (kind, recipients, age, read) => ({ kind, recipients, date: date(-age), readBy: read ? recipients : [] });
    const events = [progress('submitted', managers, 9, index % 3 !== 0)];
    if (status !== 'submitted' && status !== 'withdrawn') events.push(progress('reviewing', [recipient], 7, true));
    if (status === 'shortlisted' || response) events.push(progress('shortlisted', [recipient], 5, true));
    if (response) events.push(progress('invited', [recipient], 3, response !== 'pending'));
    if (response && response !== 'pending') events.push(progress(response, managers, 2, index % 2 !== 0));
    if (['accepted', 'rejected', 'withdrawn'].includes(status)) events.push(progress(status, status === 'withdrawn' ? managers : [recipient], 1, index % 2 === 0));
    await createOnce(Application, `${player}/${key}`, {
      opening: opening._id, team: opening.team, player: recipient, profile: profiles[player]._id,
      submissionId: `demo-${player}-${key}`, status, revision: events.length - 1, events,
      createdAt: date(-9), updatedAt: events.at(-1).date,
      introduction: [
        'I bring calm comms, consistent practice, and recent tournament experience. I can share a replay ahead of the tryout.',
        'I am looking for a roster that reviews games together. I can cover a flexible role and take feedback between sets.',
        'I have been playing in local open brackets and want a stable practice group. Happy to run a test set or share player notes.',
      ][index % 3],
      availability: index % 2 ? 'Tuesday and Thursday after 20:00, with weekend availability in Asia/Riyadh.' : '19:00–22:00 most weekdays, Asia/Riyadh. I can confirm weekend blocks in advance.',
      ...(response && { invitation: { startsAt: date(status === 'accepted' ? -1 : 10 + index), timeZone, status: response, notes: 'Meet in the club practice lobby 10 minutes early. Warm up, then play two scrim sets and review a replay together.' } }),
    });
  }
  for (const [account, kind, target] of [
    ['player', 'player', profiles.active], ['player', 'organization', organizations.stratos],
    ['active', 'team', squads.velocity], ['recruiter', 'player', profiles.active],
  ]) {
    const key = { user: users[account]._id, kind, target: target._id };
    await Follow.updateOne(key, { $setOnInsert: { ...key, active: true } }, { upsert: true, timestamps: false });
  }
  const authors = { player: profiles, organization: organizations, team: squads };
  const mediaPosts = [
    ['player','active','rotation','Back-post rotation • Rocket League. Watch the third car wait for the clear before turning in. Demo film room, gameplay by Jonalotu.', ['rotation.mp4'], 'That extra beat leaves room for the recovery.'],
    ['team','velocity','rank-set','Ranked notebook • Champion III. Two screenshots from our demo review: the player-shared rank card and the final seconds of a 3v3.',['rank.webp','score.webp'], 'Keeping the score and the rotation notes together helps.'],
    ['organization','stratos','arena-duel','Aerowalk duel • OpenArena. Tracking the high-ground route through the next engagement. Demo excerpt from Draena’s match with Wolf-Snipe (CC BY-SA 4.0).',['duel.mp4'], 'The timing on the upper platform is worth a second look.'],
    ['player','recruiter','podium','Blue takes the series • Rocket League. A final team photo for the review notebook. Demo match still by Jonalotu.',['podium.webp'], 'Saving this for replay night.'],
    ['team','wardens','arena-still','Aerowalk frag review • OpenArena. A frame from our arena film study. Demo still from Draena’s duel (CC BY-SA 4.0).',['arena.webp'], 'Next session we should compare both angles.'],
  ];
  mediaPosts.push(['player','active','two-frags','Two unanswered frags • OpenArena. From 1–1 to 3–1 on Aerowalk. Two moments from Draena’s duel with Wolf-Snipe, saved for our demo review (CC BY-SA 4.0).',
    ['frag-one.webp','frag-two.webp'],'You can see the score change in the lower right of each frame.']);
  const destination = join(config.uploadDir,'posts');
  await mkdir(destination,{recursive:true});
  for (const [index,[kind,subject,key,body,files,reply]] of mediaPosts.entries()) {
    if (await Post.exists({_id:oid('Post/'+key)})) continue;
    async function copy(name) {
      const target = 'demo-' + key + '-' + name;
      await copyFile(fileURLToPath(new URL('./demo-media/'+name,import.meta.url)),join(destination,target));
      return target;
    }
    const attachments = [];
    for (const name of files) {
      const video = name.endsWith('.mp4');
      attachments.push({kind:video?'video':'photo',key:await copy(name), ...(video && {poster:await copy(name.replace('.mp4','.jpg'))})});
    }
    const post = await createOnce(Post,key,{authorKind:kind,authorId:authors[kind][subject]._id,body,attachments,createdAt:date(-0.15-index/4)});
    await createOnce(PostReaction,key+'/morrow',{post:post._id,user:users.morrow._id});
    await createOnce(PostComment,key+'/reply',{post:post._id,user:users.vela._id,body:reply,createdAt:date(-0.1-index/4)});
  }
  for (const [index, [kind, subject, key, body, reactions, comments]] of updates.entries()) {
    // Seed the discussion only when the post is new so a rerun respects removed reactions and comments.
    if (await Post.exists({ _id: oid(`Post/${key}`) })) continue;
    const post = await createOnce(Post, key, { authorKind: kind, authorId: authors[kind][subject]._id, body, createdAt: date(-2 - index) });
    for (const user of reactions) await createOnce(PostReaction, `${key}/${user}`, { post: post._id, user: users[user]._id });
    for (const [i, [user, body]] of comments.entries()) {
      await createOnce(PostComment, `${key}/${i}`, { post: post._id, user: users[user]._id, body, createdAt: date(-1.8 - index + i / 24) });
    }
  }
  console.log('Demo records created:', counts);
  console.log(`Demo accounts: ${['new', 'player', 'active', 'recruiter', 'captain'].map(email).join(', ')}`);
  console.log(`Start a fresh application: /openings/${openings.rotation.id}`);
  console.log(`Review populated applicants: /manage/openings/${openings.third.id}/applicants`);
  console.log(`Public organization: /organizations/${organizations.stratos.id}`);
  console.log(`Public team: /teams/${squads.velocity.id}`);
  console.log(`Public player: /p/${profiles.active.id}`);
} finally {
  await mongoose.disconnect();
}
