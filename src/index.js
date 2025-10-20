import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
import { handleMessage } from './chat.js';

const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
  console.error('Missing DISCORD_TOKEN in environment');
  process.exit(1);
}

// Include DirectMessages and MessageContent intents so the bot can respond to DMs and mentions
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel],
});
client.commands = new Collection();

// Load command modules
const commandsPath = path.join(process.cwd(), 'src', 'commands');
if (fs.existsSync(commandsPath)) {
  for (const file of fs.readdirSync(commandsPath)) {
    if (file.endsWith('.js')) {
      const { data, execute } = await import(path.join(commandsPath, file));
      client.commands.set(data.name, { data, execute });
    }
  }
}

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(err);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
    } else {
      await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
    }
  }
});

client.on('messageCreate', async message => {
  try {
    const reply = await handleMessage(message);
    if (reply) await message.reply({ content: reply });
  } catch (err) {
    console.error('Error handling message', err);
  }
});

(async () => {
  await client.login(TOKEN);
})();
