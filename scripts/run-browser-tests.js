import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Each device gets a fresh API/MongoDB process and the unchanged production
// rate-limit budget. Otherwise desktop authentication attempts contaminate mobile.
const cli = fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url));
const args = process.argv.slice(2);
const explicitProject = args.some(arg => arg === '--project' || arg.startsWith('--project='));
const projects = explicitProject ? [null] : ['desktop-chrome', 'mobile-chrome'];
for (const project of projects) {
  if (project) console.log(`Browser verification: ${project} (fresh API and database).`);
  const result = spawnSync(process.execPath, [cli, 'test', ...args, ...(project ? [`--project=${project}`] : [])], {
    stdio: 'inherit', env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
