import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Client, Collection, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { handleMessage } from './chat.js';
import { checkTypingAttempt } from './minigames/typing.js';

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
  try {
    // handle modal submit for confirmations
    if (interaction.isModalSubmit && interaction.isModalSubmit()) {
      const custom = interaction.customId || '';
      if (custom.startsWith('rpg_reset_confirm:')) {
        const parts = custom.split(':');
        // format rpg_reset_confirm:btn|cmd:userId
        const mode = parts[1] || 'btn';
        const targetUser = parts[2] || interaction.user.id;
        if (targetUser !== interaction.user.id) return interaction.reply({ content: 'You cannot confirm reset for another user.', ephemeral: true });
        const text = interaction.fields.getTextInputValue('confirm_text');
        if (text !== 'RESET') {
          return interaction.reply({ content: 'Confirmation text did not match. Type RESET to confirm.', ephemeral: true });
        }
        const { resetCharacter } = await import('./rpg.js');
        const def = resetCharacter(interaction.user.id);
        return interaction.reply({ content: `Character reset to defaults: HP ${def.hp} ATK ${def.atk} Level ${def.lvl}`, ephemeral: true });
      }
    }
    if (interaction.isButton()) {
      // button customId format examples:
      // rpg_spend:stat:amount:userId
      // rpg_reset:0:userId
      // rpg_leaderboard:0:userId
      const [action, arg2, arg3] = interaction.customId ? interaction.customId.split(':') : [];
      const userId = interaction.user.id;
      if (action === 'rpg_spend') {
        const [ , stat, amountStr, targetUser ] = interaction.customId.split(':');
        const { spendSkillPoints } = await import('./rpg.js');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot press buttons for another user.', ephemeral: true });
        const amount = parseInt(amountStr || '1', 10) || 1;
        const res = spendSkillPoints(userId, stat, amount);
        if (!res.success) return interaction.reply({ content: `Failed: ${res.reason}` , ephemeral: true});
        const char = res.char;
        return interaction.reply({ content: `Spent ${amount} point(s) on ${stat}. New stats: HP ${char.hp}/${char.maxHp} ATK ${char.atk}. Remaining points: ${char.skillPoints}`, ephemeral: true });
      }
      if (action === 'rpg_reset') {
        const [ , , targetUser ] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot reset another user.', ephemeral: true });
        const { resetCharacter } = await import('./rpg.js');
        const def = resetCharacter(userId);
        return interaction.reply({ content: `Character reset to defaults: HP ${def.hp} ATK ${def.atk} Level ${def.lvl}`, ephemeral: true });
      }
      if (action === 'rpg_reset_modal') {
        const [ , , targetUser ] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot reset another user.', ephemeral: true });
        // show confirmation modal
        const modal = new ModalBuilder().setCustomId(`rpg_reset_confirm:btn:${userId}`).setTitle('Confirm Reset');
        const input = new TextInputBuilder().setCustomId('confirm_text').setLabel('Type RESET to confirm').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('RESET');
        modal.addComponents({ type: 1, components: [input] });
        await interaction.showModal(modal);
        return;
      }
      if (action === 'rpg_leaderboard') {
        const [ , offsetStr, targetUser ] = interaction.customId.split(':');
        const userId = interaction.user.id;
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot view another user\'s leaderboard pagination.', ephemeral: true });
        const { getLeaderboard } = await import('./rpg.js');
        const offset = Math.max(0, parseInt(offsetStr || '0', 10) || 0);
        const limit = 10;
        const list = getLeaderboard(limit, offset);
        if (!list.length) return interaction.reply({ content: 'No players yet.', ephemeral: true });

        // check if there is more for next page
        const nextExists = getLeaderboard(1, offset + limit).length > 0;
        const row = new ActionRowBuilder();
        if (offset > 0) {
          row.addComponents(new ButtonBuilder().setCustomId(`rpg_leaderboard:${Math.max(0, offset - limit)}:${userId}`).setLabel('Prev').setStyle(ButtonStyle.Secondary));
        }
        if (nextExists) {
          row.addComponents(new ButtonBuilder().setCustomId(`rpg_leaderboard:${offset + limit}:${userId}`).setLabel('Next').setStyle(ButtonStyle.Primary));
        }

        return interaction.reply({ content: list.map((p, i) => `${offset + i + 1}. ${p.name} — Level ${p.lvl} XP ${p.xp} ATK ${p.atk}`).join('\n'), components: row.components.length ? [row] : [], ephemeral: true });
      }
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

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
    // First, check typing minigame attempts
    const attempt = checkTypingAttempt(message.author.id, message.content);
    if (attempt) {
      if (attempt.ok) await message.reply({ content: `Nice! You typed it correctly: ${attempt.expected}` });
      else if (attempt.reason === 'timeout') await message.reply({ content: 'Too slow! The typing challenge expired.' });
      return;
    }

    const reply = await handleMessage(message);
    if (reply) await message.reply({ content: reply });
  } catch (err) {
    console.error('Error handling message', err);
  }
});

(async () => {
  await client.login(TOKEN);
})();
