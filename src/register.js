import dotenv from 'dotenv';
import { ALL_COMMANDS } from './commands.js';

dotenv.config({ path: '.dev.vars' });

const token = process.env.DISCORD_TOKEN;
const applicationId = process.env.DISCORD_APPLICATION_ID;
const guildId = process.env.GUILD_ID;

if (!token) throw new Error('DISCORD_TOKEN is required.');
if (!applicationId) throw new Error('DISCORD_APPLICATION_ID is required.');

const url = guildId
  ? `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`
  : `https://discord.com/api/v10/applications/${applicationId}/commands`;

const response = await fetch(url, {
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bot ${token}`,
  },
  method: 'PUT',
  body: JSON.stringify(ALL_COMMANDS),
});

if (response.ok) {
  console.log(`Registered ${ALL_COMMANDS.length} commands to ${guildId ? `guild ${guildId}` : 'global'}`);
  console.log(JSON.stringify(await response.json(), null, 2));
} else {
  const error = await response.text();
  console.error(`Registration failed (${response.status}):`, error);
  process.exit(1);
}
