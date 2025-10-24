import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { REST, Routes } from 'discord.js';

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID) {
  console.error('DISCORD_TOKEN and CLIENT_ID must be set in environment');
  process.exit(1);
}

const commands = [];
const commandsPath = path.join(process.cwd(), 'src', 'commands');
for (const file of fs.readdirSync(commandsPath)) {
   if (file.endsWith('.js') || file.endsWith('.mjs')) {
     const { data } = await import(path.join(commandsPath, file));
     commands.push(data.toJSON());
   }
 }

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log('Registering commands...');
    if (GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
      console.log('Registered guild commands');
    } else {
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log('Registered global commands');
    }
  } catch (err) {
    console.error(err);
  }
})();
