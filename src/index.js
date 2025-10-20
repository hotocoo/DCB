import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Client, Collection, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { handleMessage } from './chat.js';
import { checkTypingAttempt } from './minigames/typing.js';

// Helper function to update inventory embed
async function updateInventoryEmbed(interaction, itemsByType, inventoryValue) {
  const { getItemInfo, getItemRarityInfo } = await import('./rpg.js');

  const embed = interaction.message.embeds[0];
  const newEmbed = {
    title: embed.title,
    color: embed.color,
    description: `💰 Total Value: ${inventoryValue} gold`,
    fields: []
  };

  for (const [type, items] of Object.entries(itemsByType)) {
    const typeEmoji = {
      weapon: '⚔️',
      armor: '🛡️',
      consumable: '🧪',
      material: '🔩'
    }[type] || '📦';

    const itemList = items.map(item => {
      return `${typeEmoji} **${item.name}** (${item.quantity}x)`;
    }).join('\n');

    newEmbed.fields.push({
      name: `${typeEmoji} ${type.charAt(0).toUpperCase() + type.slice(1)}s`,
      value: itemList || 'None',
      inline: true
    });
  }

  await interaction.editReply({ embeds: [newEmbed] });
}

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

// simple cooldown map to prevent modal spam: userId -> timestamp of last spend modal
const spendCooldowns = new Map();

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
        const def = resetCharacter(interaction.user.id, parts[3] || 'warrior');
        return interaction.reply({ content: `Character reset to defaults: HP ${def.hp}/${def.maxHp} ATK ${def.atk} DEF ${def.def} SPD ${def.spd} Level ${def.lvl}`, ephemeral: true });
      }
      // handle spend modal submit
      if (custom.startsWith('rpg_spend_submit:')) {
        const parts = custom.split(':');
        const targetUser = parts[1] || interaction.user.id;
        if (targetUser !== interaction.user.id) return interaction.reply({ content: 'You cannot spend for another user.', ephemeral: true });
        const stat = interaction.fields.getTextInputValue('stat_choice');
        const amountStr = interaction.fields.getTextInputValue('amount_choice');
        const amount = parseInt(amountStr || '0', 10) || 0;
        const { spendSkillPoints, getCharacter } = await import('./rpg.js');
        const res = spendSkillPoints(interaction.user.id, stat, amount);
        if (!res.success) return interaction.reply({ content: `Spend failed: ${res.reason}`, ephemeral: true });
        const char = res.char;
        // try to update the original message if possible
        try {
          if (interaction.message && interaction.message.editable) {
            const remaining = char.skillPoints || 0;
            const spendRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`rpg_spend:hp:1:${interaction.user.id}`).setLabel('❤️ HP').setStyle(ButtonStyle.Primary).setDisabled(remaining <= 0),
              new ButtonBuilder().setCustomId(`rpg_spend:maxhp:1:${interaction.user.id}`).setLabel('🛡️ Max HP').setStyle(ButtonStyle.Success).setDisabled(remaining <= 0),
              new ButtonBuilder().setCustomId(`rpg_spend:atk:1:${interaction.user.id}`).setLabel('⚔️ ATK').setStyle(ButtonStyle.Secondary).setDisabled(remaining <= 0),
              new ButtonBuilder().setCustomId(`rpg_spend:def:1:${interaction.user.id}`).setLabel('🛡️ DEF').setStyle(ButtonStyle.Secondary).setDisabled(remaining <= 0),
              new ButtonBuilder().setCustomId(`rpg_spend:spd:1:${interaction.user.id}`).setLabel('💨 SPD').setStyle(ButtonStyle.Secondary).setDisabled(remaining <= 0),
              new ButtonBuilder().setCustomId(`rpg_spend_modal:0:${interaction.user.id}`).setLabel('💎 Spend...').setStyle(ButtonStyle.Primary).setDisabled(remaining <= 0),
            );
            const content = `Name: ${char.name}\nLevel: ${char.lvl} XP: ${char.xp} Skill Points: ${remaining}\nHP: ${char.hp}/${char.maxHp} ATK: ${char.atk} DEF: ${char.def} SPD: ${char.spd}`;
            await interaction.update({ content, components: [spendRow] });
            return;
          }
        } catch (err) {
          console.error('Failed to update message after modal spend', err);
        }
        return interaction.reply({ content: `Spent ${amount} on ${stat}. New points: ${char.skillPoints}`, ephemeral: true });
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
        // If the message with buttons is available, update it to reflect new stats and button state
        try {
          if (interaction.message && interaction.message.editable) {
            const remaining = char.skillPoints || 0;
            // build spend buttons (disable when no points)
            const spendRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`rpg_spend:hp:1:${userId}`).setLabel('❤️ HP').setStyle(ButtonStyle.Primary).setDisabled(remaining <= 0),
              new ButtonBuilder().setCustomId(`rpg_spend:maxhp:1:${userId}`).setLabel('🛡️ Max HP').setStyle(ButtonStyle.Success).setDisabled(remaining <= 0),
              new ButtonBuilder().setCustomId(`rpg_spend:atk:1:${userId}`).setLabel('⚔️ ATK').setStyle(ButtonStyle.Secondary).setDisabled(remaining <= 0),
              new ButtonBuilder().setCustomId(`rpg_spend:def:1:${userId}`).setLabel('🛡️ DEF').setStyle(ButtonStyle.Secondary).setDisabled(remaining <= 0),
              new ButtonBuilder().setCustomId(`rpg_spend:spd:1:${userId}`).setLabel('💨 SPD').setStyle(ButtonStyle.Secondary).setDisabled(remaining <= 0),
            );
            const content = `Name: ${char.name}\nLevel: ${char.lvl} XP: ${char.xp} Skill Points: ${remaining}\nHP: ${char.hp}/${char.maxHp} ATK: ${char.atk} DEF: ${char.def} SPD: ${char.spd}`;
            await interaction.update({ content, components: [spendRow] });
            return;
          }
        } catch (err) {
          // fall back to ephemeral reply on any failure
          console.error('Failed to update original message after spend', err);
        }

        return interaction.reply({ content: `Spent ${amount} point(s) on ${stat}. New stats: HP ${char.hp}/${char.maxHp} ATK ${char.atk} DEF ${char.def} SPD ${char.spd}. Remaining points: ${char.skillPoints}`, ephemeral: true });
      }
      if (action === 'rpg_spend_modal') {
        const [, , targetUser] = interaction.customId.split(':');
        const userNow = interaction.user.id;
        if (targetUser && targetUser !== userNow) return interaction.reply({ content: 'You cannot open a spend modal for another user.', ephemeral: true });
        // enforce short cooldown (2s) to reduce spam
        const last = spendCooldowns.get(userNow) || 0;
        const now = Date.now();
        if (now - last < 2000) return interaction.reply({ content: 'Please wait a moment before opening another spend modal.', ephemeral: true });
        spendCooldowns.set(userNow, now);
        // show a modal allowing stat and amount selection
        const modal = new ModalBuilder().setCustomId(`rpg_spend_submit:${userNow}`).setTitle('Spend Skill Points');
        const statInput = new TextInputBuilder().setCustomId('stat_choice').setLabel('Stat (hp|maxhp|atk)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('atk');
        const amountInput = new TextInputBuilder().setCustomId('amount_choice').setLabel('Amount').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('1');
        modal.addComponents({ type: 1, components: [statInput] });
        modal.addComponents({ type: 1, components: [amountInput] });
        await interaction.showModal(modal);
        return;
      }
      if (action === 'rpg_reset') {
        const [ , , targetUser ] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot reset another user.', ephemeral: true });
        const { resetCharacter } = await import('./rpg.js');
        const def = resetCharacter(userId, targetUser || 'warrior');
        return interaction.reply({ content: `Character reset to defaults: HP ${def.hp}/${def.maxHp} ATK ${def.atk} DEF ${def.def} SPD ${def.spd} Level ${def.lvl}`, ephemeral: true });
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
      if (action === 'inventory_refresh') {
        const [, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot refresh another user\'s inventory.', ephemeral: true });

        const { getInventory, getItemInfo, getItemRarityInfo, getInventoryValue } = await import('./rpg.js');
        const inventory = getInventory(userId);
        const inventoryValue = getInventoryValue(userId);

        if (Object.keys(inventory).length === 0) {
          return interaction.reply({ content: '🛄 Your inventory is empty.', ephemeral: true });
        }

        // Group items by type
        const itemsByType = {};
        for (const [itemId, quantity] of Object.entries(inventory)) {
          const item = getItemInfo(itemId);
          if (item) {
            if (!itemsByType[item.type]) itemsByType[item.type] = [];
            itemsByType[item.type].push({ itemId, ...item, quantity });
          }
        }

        await updateInventoryEmbed(interaction, itemsByType, inventoryValue);
        return interaction.deferUpdate();
      }
      if (action === 'inventory_random') {
        const [, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot get items for another user.', ephemeral: true });

        const { addItemToInventory, generateRandomItem, getCharacter } = await import('./rpg.js');
        const char = getCharacter(userId);

        if (!char) return interaction.reply({ content: 'You need a character first. Use /rpg start', ephemeral: true });

        const randomItem = generateRandomItem(char.lvl);
        const result = addItemToInventory(userId, randomItem.id, 1);

        if (result.success) {
          const rarityInfo = getItemRarityInfo(randomItem.rarity);
          await interaction.reply({ content: `🎉 You found: **${randomItem.name}** (${randomItem.rarity})!\n📝 ${randomItem.description}`, ephemeral: true });
        } else {
          await interaction.reply({ content: '❌ Failed to add item to inventory.', ephemeral: true });
        }
        return;
      }
      if (action === 'inventory_sell_all') {
        const [, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot sell items for another user.', ephemeral: true });

        // This would implement selling all junk items for gold
        await interaction.reply({ content: '💰 Sold all junk items for gold!', ephemeral: true });
        return;
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
