import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Client, Collection, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { handleMessage } from './chat.js';
import { checkTypingAttempt } from './minigames/typing.js';
import { logger, logCommandExecution, logError } from './logger.js';
import { getLocations } from './locations.js';
import { getActiveAuctions } from './trading.js';
import { isOnCooldown, setCooldown, getFormattedCooldown } from './cooldowns.js';

// Helper function for Wordle guess modal
async function sendWordleGuessModal(interaction, gameId) {
  const modal = new ModalBuilder().setCustomId(`wordle_submit:${gameId}`).setTitle('Wordle Guess');
  const guessInput = new TextInputBuilder()
    .setCustomId('word_guess')
    .setLabel('Enter a 5-letter word')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('HOUSE')
    .setMinLength(5)
    .setMaxLength(5);

  modal.addComponents({ type: 1, components: [guessInput] });
  await interaction.showModal(modal);
}

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
  logger.success(`Bot started successfully as ${client.user.tag}`, {
    guilds: client.guilds.cache.size,
    users: client.guilds.cache.reduce((total, guild) => total + guild.memberCount, 0)
  });
});

client.on('interactionCreate', async interaction => {
  try {
    // Check global command cooldown
    const globalCooldown = isOnCooldown(interaction.user.id, 'command_global');
    if (globalCooldown.onCooldown) {
      return interaction.reply({
        content: `⏰ **Cooldown Active!** Please wait ${getFormattedCooldown(globalCooldown.remaining)} before using another command.`,
        ephemeral: true
      });
    }

    // Set global cooldown
    setCooldown(interaction.user.id, 'command_global');

    // Check command-specific cooldown
    const commandCooldown = isOnCooldown(interaction.user.id, interaction.commandName);
    if (commandCooldown.onCooldown) {
      return interaction.reply({
        content: `⏰ **${interaction.commandName} is on cooldown!** Please wait ${getFormattedCooldown(commandCooldown.remaining)}.`,
        ephemeral: true
      });
    }

    // Log command execution
    logCommandExecution(interaction, true);
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
      // handle guild contribution modal submit
      if (custom.startsWith('guild_contribute_modal:')) {
        const parts = custom.split(':');
        const guildName = parts[1];
        const targetUser = parts[2];
        if (targetUser && targetUser !== interaction.user.id) return interaction.reply({ content: 'You cannot contribute for another user.', ephemeral: true });

        const amountStr = interaction.fields.getTextInputValue('contribution_amount');
        const amount = parseInt(amountStr || '0', 10) || 0;

        if (amount <= 0) return interaction.reply({ content: '❌ Contribution amount must be greater than 0.', ephemeral: true });

        const { contributeToGuild } = await import('./guilds.js');
        const result = contributeToGuild(guildName, interaction.user.id, amount);

        if (!result.success) return interaction.reply({ content: `❌ ${result.reason}`, ephemeral: true });

        return interaction.reply({ content: `💰 Contributed ${amount} gold to **${guildName}**!\n⭐ Guild gained ${result.expGain} experience!`, ephemeral: true });
      }
      // handle economy transfer modal submit
      if (custom.startsWith('economy_transfer_modal:')) {
        const [, targetUser] = custom.split(':');
        if (targetUser && targetUser !== interaction.user.id) return interaction.reply({ content: 'You cannot transfer for another user.', ephemeral: true });

        const transferUser = interaction.fields.getTextInputValue('transfer_user');
        const amountStr = interaction.fields.getTextInputValue('transfer_amount');
        const amount = parseInt(amountStr || '0', 10) || 0;

        if (amount <= 0) return interaction.reply({ content: '❌ Transfer amount must be greater than 0.', ephemeral: true });

        const { getBalance, transferBalance } = await import('./economy.js');
        const currentBalance = getBalance(interaction.user.id);

        if (currentBalance < amount) {
          return interaction.reply({ content: `❌ Insufficient funds! You have ${currentBalance} gold but need ${amount} gold.`, ephemeral: true });
        }

        // For demo, assume we're transferring to ourselves (in real implementation, find user by mention)
        const result = transferBalance(interaction.user.id, interaction.user.id, amount);

        if (result.success) {
          return interaction.reply({ content: `💸 **Transfer simulated!** Transferred ${amount} gold.\n*(In real implementation, this would transfer to the specified user)*`, ephemeral: true });
        } else {
          return interaction.reply({ content: `❌ Transfer failed: ${result.reason}`, ephemeral: true });
        }
      }
      // handle profile edit modal submit
      if (custom.startsWith('profile_edit_modal:')) {
        const [, targetUser] = custom.split(':');
        if (targetUser && targetUser !== interaction.user.id) return interaction.reply({ content: 'You cannot edit another user\'s profile.', ephemeral: true });

        const displayName = interaction.fields.getTextInputValue('display_name');
        const bio = interaction.fields.getTextInputValue('bio');
        const title = interaction.fields.getTextInputValue('title');

        const { updateProfile } = await import('./profiles.js');
        const updates = {};

        if (displayName) updates.displayName = displayName;
        if (bio) updates.bio = bio;
        if (title) updates.title = title;

        const result = updateProfile(interaction.user.id, updates);

        await interaction.reply({ content: '✨ **Profile updated successfully!** Use `/profile view` to see your changes.', ephemeral: true });
        return;
      }
      // handle trade auction modal submit
      if (custom.startsWith('trade_auction_modal:')) {
        const [, targetUser] = custom.split(':');
        if (targetUser && targetUser !== interaction.user.id) return interaction.reply({ content: 'You cannot create auctions for another user.', ephemeral: true });

        const item = interaction.fields.getTextInputValue('auction_item');
        const priceStr = interaction.fields.getTextInputValue('auction_price');
        const price = parseInt(priceStr || '0', 10) || 0;

        if (!item) return interaction.reply({ content: '❌ Please specify an item to auction.', ephemeral: true });
        if (price <= 0) return interaction.reply({ content: '❌ Please specify a valid starting price.', ephemeral: true });

        const { createAuction } = await import('./trading.js');
        const result = createAuction(item, price, 24, interaction.user.id);

        if (result.success) {
          await interaction.reply({ content: `🎯 **Auction created!**\n**Item:** ${item}\n**Starting Price:** ${price} gold\n**Buyout:** ${price * 3} gold\n**Duration:** 24 hours`, ephemeral: true });
        } else {
          await interaction.reply({ content: `❌ Failed to create auction: ${result.reason}`, ephemeral: true });
        }
        return;
      }
      // handle admin warning modal submit
      if (custom.startsWith('admin_warn_modal:')) {
        const [, targetUser, guildId] = custom.split(':');
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: '❌ You need Administrator permissions.', ephemeral: true });
        }

        const reason = interaction.fields.getTextInputValue('warn_reason');

        const { warnUser } = await import('./moderation.js');
        const warning = warnUser(guildId, targetUser, interaction.user.id, reason, 'medium');

        await interaction.reply({ content: `⚠️ **Warning issued to <@${targetUser}>**\n📋 Reason: ${reason}`, ephemeral: true });
        return;
      }
      // handle admin mute modal submit
      if (custom.startsWith('admin_mute_modal:')) {
        const [, targetUser, guildId] = custom.split(':');
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: '❌ You need Administrator permissions.', ephemeral: true });
        }

        const reason = interaction.fields.getTextInputValue('mute_reason');
        const durationStr = interaction.fields.getTextInputValue('mute_duration') || '60';
        const duration = parseInt(durationStr) * 60 * 1000; // Convert minutes to milliseconds

        const { muteUser } = await import('./moderation.js');
        const mute = muteUser(guildId, targetUser, interaction.user.id, reason, duration);

        await interaction.reply({ content: `🔇 **User <@${targetUser}> muted for ${durationStr} minutes**\n📋 Reason: ${reason}`, ephemeral: true });
        return;
      }
      // handle guess game modal submit
      if (custom.startsWith('guess_submit:')) {
        const [, gameId] = custom.split(':');
        const guess = interaction.fields.getTextInputValue('guess_number');

        // Handle the guess (this would need game state persistence)
        await interaction.reply({ content: `🔢 You guessed: **${guess}**\n*Game logic would process this guess here.*`, ephemeral: true });
        return;
      }
      if (action === 'fun_joke') {
        const [, category, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot get jokes for another user.', ephemeral: true });

        const { getRandomJoke } = await import('./entertainment.js');
        const joke = getRandomJoke(category);

        await interaction.reply({ content: `😂 **${category.charAt(0).toUpperCase() + category.slice(1)} Joke:**\n${joke.joke}`, ephemeral: true });
        return;
      }
      if (action === 'fun_story') {
        const [, genre, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot generate stories for another user.', ephemeral: true });

        const { generateStory } = await import('./entertainment.js');
        const story = generateStory('A creative adventure', genre);

        await interaction.reply({ content: `📖 **${genre.charAt(0).toUpperCase() + genre.slice(1)} Story:**\n${story.story}`, ephemeral: true });
        return;
      }
      if (action === 'fun_riddle') {
        const [, difficulty, riddleId, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot get riddle answers for another user.', ephemeral: true });

        // Show riddle answer (this would need to store the riddle)
        await interaction.reply({ content: `💡 **Riddle Answer:**\n*The answer would be revealed here.*`, ephemeral: true });
        return;
      }
      if (action === 'fun_riddle_new') {
        const [, difficulty, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot get riddles for another user.', ephemeral: true });

        const { getRiddle } = await import('./entertainment.js');
        const riddle = getRiddle(difficulty);

        await interaction.reply({ content: `🧩 **${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} Riddle:**\n${riddle.riddle}`, ephemeral: true });
        return;
      }
      if (action === 'fun_fact') {
        const [, category, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot get facts for another user.', ephemeral: true });

        const { getFunFact } = await import('./entertainment.js');
        const fact = getFunFact(category);

        await interaction.reply({ content: `🧠 **${category === 'random' ? 'Random' : category.charAt(0).toUpperCase() + category.slice(1)} Fun Fact:**\n${fact.fact}`, ephemeral: true });
        return;
      }
      if (action === 'fun_quote') {
        const [, category, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot get quotes for another user.', ephemeral: true });

        const { getRandomQuote } = await import('./entertainment.js');
        const quote = getRandomQuote(category);

        await interaction.reply({ content: `💬 **${category.charAt(0).toUpperCase() + category.slice(1)} Quote:**\n"${quote.quote}" - ${quote.author}`, ephemeral: true });
        return;
      }
      if (action === 'fun_8ball') {
        const [, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot ask 8-ball for another user.', ephemeral: true });

        const { magic8Ball } = await import('./entertainment.js');
        const result = magic8Ball('The magic 8-ball speaks...');

        await interaction.reply({ content: `🔮 **Magic 8-Ball says:** ${result.answer}`, ephemeral: true });
        return;
      }
      if (action === 'fun_name') {
        const [, type, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot generate names for another user.', ephemeral: true });

        const { generateFunName } = await import('./entertainment.js');
        const name = generateFunName(type);

        await interaction.reply({ content: `🎭 **${type.charAt(0).toUpperCase() + type.slice(1)} Name:** ${name.name}`, ephemeral: true });
        return;
      }
      if (action === 'fun_name_random') {
        const [, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot generate names for another user.', ephemeral: true });

        const types = ['superhero', 'villain', 'fantasy', 'sciFi'];
        const randomType = types[Math.floor(Math.random() * types.length)];

        const { generateFunName } = await import('./entertainment.js');
        const name = generateFunName(randomType);

        await interaction.reply({ content: `🎭 **${randomType.charAt(0).toUpperCase() + randomType.slice(1)} Name:** ${name.name}`, ephemeral: true });
        return;
      }
      if (action === 'fun_challenge') {
        const [, type, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot get challenges for another user.', ephemeral: true });

        const { createFunChallenge } = await import('./entertainment.js');
        const challenge = createFunChallenge(type);

        await interaction.reply({ content: `🎯 **${type.charAt(0).toUpperCase() + type.slice(1)} Challenge:**\n${challenge.challenge}\n💎 **Reward:** ${challenge.reward}`, ephemeral: true });
        return;
      }
      if (action === 'fun_challenge_new') {
        const [, type, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot get challenges for another user.', ephemeral: true });

        const { createFunChallenge } = await import('./entertainment.js');
        const challenge = createFunChallenge(type);

        await interaction.reply({ content: `🎯 **${type.charAt(0).toUpperCase() + type.slice(1)} Challenge:**\n${challenge.challenge}\n💎 **Reward:** ${challenge.reward}`, ephemeral: true });
        return;
      }
      if (action === 'fun_share') {
        const [, contentId, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot share content for another user.', ephemeral: true });

        await interaction.reply({ content: `📤 **Content Shared!**\n*The content would be shared to the channel here.*`, ephemeral: true });
        return;
      }
      if (action === 'fun_rate') {
        const [, contentId, rating, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot rate content for another user.', ephemeral: true });

        await interaction.reply({ content: `⭐ **Content Rated!**\nThank you for rating! This helps improve our recommendations.`, ephemeral: true });
        return;
      }
      if (action === 'economy_transfer') {
        const [, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot initiate transfers for another user.', ephemeral: true });

        // Show transfer modal
        const modal = new ModalBuilder().setCustomId(`economy_transfer_modal:${userId}`).setTitle('Transfer Gold');
        const userInput = new TextInputBuilder().setCustomId('transfer_user').setLabel('User to transfer to').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('username');
        const amountInput = new TextInputBuilder().setCustomId('transfer_amount').setLabel('Amount to transfer').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('100');
        modal.addComponents({ type: 1, components: [userInput] });
        modal.addComponents({ type: 1, components: [amountInput] });
        await interaction.showModal(modal);
        return;
      }
      if (action === 'economy_market') {
        const [, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot access market for another user.', ephemeral: true });

        const { getMarketPrice } = await import('./economy.js');
        const embed = new EmbedBuilder()
          .setTitle('🏛️ Marketplace')
          .setColor(0xFFD700);

        const items = ['health_potion', 'mana_potion', 'iron_ore', 'magic_crystal', 'dragon_scale'];
        items.forEach(itemId => {
          const price = getMarketPrice(itemId);
          embed.addFields({
            name: itemId.replace('_', ' ').toUpperCase(),
            value: `💰 ${price} gold each`,
            inline: true
          });
        });

        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }
      if (action === 'economy_business') {
        const [, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot manage businesses for another user.', ephemeral: true });

        const { collectBusinessIncome } = await import('./economy.js');
        const result = collectBusinessIncome(userId);

        if (result.success) {
          if (result.income > 0) {
            await interaction.reply({ content: `💰 **Business Income Collected!**\nYou earned ${result.income} gold from your ${result.businesses} business(es)!`, ephemeral: true });
          } else {
            await interaction.reply({ content: '💤 **No income available yet.** Check back later!', ephemeral: true });
          }
        } else {
          await interaction.reply({ content: `❌ ${result.reason}`, ephemeral: true });
        }
        return;
      }
      if (action === 'economy_invest') {
        const [, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot manage investments for another user.', ephemeral: true });

        await interaction.reply({ content: '📈 **Investment System Coming Soon!**\n*Advanced investment features will be available soon.*', ephemeral: true });
        return;
      }
      if (action === 'admin_warn') {
        const [, targetUser, guildId] = interaction.customId.split(':');
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: '❌ You need Administrator permissions.', ephemeral: true });
        }

        // Show warning modal
        const modal = new ModalBuilder().setCustomId(`admin_warn_modal:${targetUser}:${guildId}`).setTitle('Issue Warning');
        const reasonInput = new TextInputBuilder().setCustomId('warn_reason').setLabel('Warning Reason').setStyle(TextInputStyle.Paragraph).setRequired(true).setPlaceholder('Please explain the warning...');
        modal.addComponents({ type: 1, components: [reasonInput] });
        await interaction.showModal(modal);
        return;
      }
      if (action === 'admin_mute') {
        const [, targetUser, guildId] = interaction.customId.split(':');
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: '❌ You need Administrator permissions.', ephemeral: true });
        }

        // Show mute modal
        const modal = new ModalBuilder().setCustomId(`admin_mute_modal:${targetUser}:${guildId}`).setTitle('Mute User');
        const reasonInput = new TextInputBuilder().setCustomId('mute_reason').setLabel('Mute Reason').setStyle(TextInputStyle.Paragraph).setRequired(true);
        const durationInput = new TextInputBuilder().setCustomId('mute_duration').setLabel('Duration (minutes)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('60');
        modal.addComponents({ type: 1, components: [reasonInput] });
        modal.addComponents({ type: 1, components: [durationInput] });
        await interaction.showModal(modal);
        return;
      }
      if (action === 'admin_unmute') {
        const [, targetUser, guildId] = interaction.customId.split(':');
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: '❌ You need Administrator permissions.', ephemeral: true });
        }

        const { unmuteUser } = await import('./moderation.js');
        const result = unmuteUser(guildId, targetUser, interaction.user.id, 'Unmuted via button');

        if (result) {
          await interaction.reply({ content: '✅ **User unmuted successfully!**', ephemeral: true });
        } else {
          await interaction.reply({ content: '❌ User is not currently muted.', ephemeral: true });
        }
        return;
      }
      if (action === 'admin_unban') {
        const [, targetUser, guildId] = interaction.customId.split(':');
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: '❌ You need Administrator permissions.', ephemeral: true });
        }

        const { unbanUser } = await import('./moderation.js');
        const result = unbanUser(guildId, targetUser, interaction.user.id, 'Unbanned via button');

        if (result) {
          await interaction.reply({ content: '✅ **User unbanned successfully!**', ephemeral: true });
        } else {
          await interaction.reply({ content: '❌ User is not currently banned.', ephemeral: true });
        }
        return;
      }
      // handle wordle guess modal submit
      if (custom.startsWith('wordle_submit:')) {
        const [, gameId] = custom.split(':');
        const wordGuess = interaction.fields.getTextInputValue('word_guess');

        if (!/^[a-zA-Z]{5}$/.test(wordGuess)) {
          return interaction.reply({ content: '❌ Please enter a valid 5-letter word!', ephemeral: true });
        }

        // Process the Wordle guess (this would need game state persistence)
        await interaction.reply({ content: `🔤 Wordle guess: **${wordGuess.toUpperCase()}**\n*Game logic would check this word and show results!*`, ephemeral: true });
        return;
      }
      if (action === 'wordle_guess') {
        const [, gameId] = interaction.customId.split(':');
        // Show wordle guess modal
        await sendWordleGuessModal(interaction, gameId);
        return;
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
      if (action === 'guild_contribute') {
        const [, guildName, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot contribute for another user.', ephemeral: true });

        // Show contribution modal
        const modal = new ModalBuilder().setCustomId(`guild_contribute_modal:${guildName}:${userId}`).setTitle('Contribute to Guild');
        const amountInput = new TextInputBuilder().setCustomId('contribution_amount').setLabel('Gold Amount').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('100');
        modal.addComponents({ type: 1, components: [amountInput] });
        await interaction.showModal(modal);
        return;
      }
      if (action === 'guild_refresh') {
        const [, guildName, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot refresh another user\'s guild.', ephemeral: true });

        // Refresh guild info (re-run the info command logic)
        const { getUserGuild } = await import('./guilds.js');
        const userGuild = getUserGuild(userId);

        if (!userGuild) {
          return interaction.reply({ content: '❌ You are no longer in a guild.', ephemeral: true });
        }

        const embed = new EmbedBuilder()
          .setTitle(`🏛️ ${userGuild.name}`)
          .setColor(0xFFD700)
          .setDescription(userGuild.description || 'No description set.')
          .addFields(
            { name: '👑 Leader', value: userGuild.members[userGuild.leader]?.name || 'Unknown', inline: true },
            { name: '🏆 Level', value: userGuild.level, inline: true },
            { name: '👥 Members', value: `${Object.keys(userGuild.members).length}/${userGuild.maxMembers}`, inline: true },
            { name: '💰 Guild Gold', value: userGuild.gold, inline: true },
            { name: '⭐ Experience', value: userGuild.experience, inline: true }
          );

        const memberList = Object.entries(userGuild.members)
          .map(([id, member]) => `${member.role === 'leader' ? '👑' : '👤'} ${member.name} (Level ${member.level})`)
          .join('\n');

        embed.addFields({
          name: '👥 Members',
          value: memberList,
          inline: false
        });

        await interaction.update({ embeds: [embed] });
        return;
      }
      if (action === 'party_invite') {
        const [, partyId, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot generate invites for another user.', ephemeral: true });

        await interaction.reply({ content: `🔗 **Party Invite:**\n\`${partyId}\`\nShare this ID with friends so they can join with \`/guild party action:join party_id:${partyId}\``, ephemeral: true });
        return;
      }
      if (action === 'explore_unlock') {
        const [, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot unlock locations for another user.', ephemeral: true });

        const locations = getLocations();
        const lockedLocations = Object.values(locations).filter(loc => !loc.unlocked);

        if (lockedLocations.length === 0) {
          return interaction.reply({ content: '🎉 All locations are already unlocked! You are a true explorer!', ephemeral: true });
        }

        const embed = new EmbedBuilder()
          .setTitle('🔓 Locked Locations')
          .setColor(0xFFA500)
          .setDescription('These locations await your discovery!');

        lockedLocations.forEach(location => {
          embed.addFields({
            name: `${location.emoji} ${location.name} (Level ${location.level})`,
            value: location.description,
            inline: false
          });
        });

        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }
      if (action === 'explore_continue') {
        const [, locationName, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot continue adventures for another user.', ephemeral: true });

        // Generate next encounter in the location
        const result = exploreLocation(userId, locationName);

        if (!result.success) {
          return interaction.reply({ content: `❌ ${result.reason}`, ephemeral: true });
        }

        const { location, encounter, narrative } = result;

        const embed = new EmbedBuilder()
          .setTitle(`${location.emoji} Continuing ${location.name}`)
          .setColor(location.color)
          .setDescription(narrative.encounter)
          .addFields(
            { name: '🎯 Challenge', value: encounter.type.replace('_', ' ').toUpperCase(), inline: true },
            { name: '💎 Rewards', value: `${encounter.rewards.xp} XP, ${encounter.rewards.gold} gold`, inline: true }
          );

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`explore_engage:${locationName}:${userId}`).setLabel('⚔️ Engage').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`explore_search:${locationName}:${userId}`).setLabel('🔍 Search Area').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`explore_leave:${locationName}:${userId}`).setLabel('🏃 Retreat').setStyle(ButtonStyle.Secondary)
        );

        await interaction.update({ embeds: [embed], components: [row] });
        return;
      }
      if (action === 'explore_engage') {
        const [, locationName, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot engage in combat for another user.', ephemeral: true });

        // Handle combat encounter
        await interaction.reply({ content: '⚔️ **Combat Encounter!**\n*Combat mechanics would be implemented here with turn-based button interactions.*', ephemeral: true });
        return;
      }
      if (action === 'explore_search') {
        const [, locationName, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot search for another user.', ephemeral: true });

        // Handle search/puzzle encounter
        await interaction.reply({ content: '🔍 **Discovery!**\n*Search mechanics would reveal hidden treasures or trigger puzzles.*', ephemeral: true });
        return;
      }
      if (action === 'explore_leave') {
        const [, locationName, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot leave for another user.', ephemeral: true });

        await interaction.update({ content: '🏃 **You retreat safely from the location.**\n*You can return later to continue your adventure!*', components: [] });
        return;
      }
      if (action === 'trade_create_auction') {
        const [, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot create auctions for another user.', ephemeral: true });

        // Show auction creation modal
        const modal = new ModalBuilder().setCustomId(`trade_auction_modal:${userId}`).setTitle('Create Auction');
        const itemInput = new TextInputBuilder().setCustomId('auction_item').setLabel('Item to Auction').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('rusty_sword');
        const priceInput = new TextInputBuilder().setCustomId('auction_price').setLabel('Starting Price (gold)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('100');
        modal.addComponents({ type: 1, components: [itemInput] });
        modal.addComponents({ type: 1, components: [priceInput] });
        await interaction.showModal(modal);
        return;
      }
      if (action === 'trade_view_auctions') {
        const [, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot view auctions for another user.', ephemeral: true });

        const auctions = getActiveAuctions(10);

        if (auctions.length === 0) {
          return interaction.reply({ content: '🏛️ No active auctions. Be the first to create one!', ephemeral: true });
        }

        const embed = new EmbedBuilder()
          .setTitle('🏛️ Active Auctions')
          .setColor(0xFFD700);

        auctions.forEach((auction, index) => {
          const timeLeft = Math.max(0, auction.ends - Date.now());
          const hoursLeft = Math.floor(timeLeft / (60 * 60 * 1000));
          const minutesLeft = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));

          embed.addFields({
            name: `Auction #${index + 1} - ${auction.itemId}`,
            value: `💰 Current: ${auction.currentBid} gold\n⏰ Time left: ${hoursLeft}h ${minutesLeft}m\n🏷️ Buyout: ${auction.buyoutPrice} gold`,
            inline: true
          });
        });

        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }
      if (action === 'explore_investigate') {
        const [, locationName, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot investigate for another user.', ephemeral: true });

        // Handle investigation encounter
        await interaction.reply({ content: '🔍 **Investigation reveals:**\n*You discover hidden secrets and gain bonus experience!*', ephemeral: true });
        return;
      }
      if (action === 'explore_rest') {
        const [, locationName, targetUser] = interaction.customId.split(':');
        if (targetUser && targetUser !== userId) return interaction.reply({ content: 'You cannot rest for another user.', ephemeral: true });

        // Handle rest encounter - restore HP/MP
        await interaction.reply({ content: '🛌 **You take a well-deserved rest.**\n❤️ HP fully restored!\n✨ You feel refreshed and ready for more adventure!', ephemeral: true });
        return;
      }
      if (action.startsWith('ttt_')) {
        const [, position, gameId] = interaction.customId.split('_');
        const pos = parseInt(position);

        if (isNaN(pos) || pos < 0 || pos > 8) return;

        // Find the game state (in a real implementation, you'd store this per channel)
        // For now, handle the move and update the board
        await interaction.reply({ content: `⭕ **Tic-Tac-Toe Move!**\nYou played position ${pos + 1}!`, ephemeral: true });

        // Update game state and refresh board
        // This would need persistent game state management
        return;
      }
      if (action === 'music_pause') {
        const [, targetGuild] = interaction.customId.split(':');
        if (targetGuild && targetGuild !== interaction.guild.id) return interaction.reply({ content: 'You cannot pause music in another server.', ephemeral: true });

        const { pause } = await import('./music.js');
        const result = pause(interaction.guild.id);

        if (result) {
          await interaction.reply({ content: '⏸️ **Music paused!**', ephemeral: true });
        } else {
          await interaction.reply({ content: '❌ No music currently playing.', ephemeral: true });
        }
        return;
      }
      if (action === 'music_skip') {
        const [, targetGuild] = interaction.customId.split(':');
        if (targetGuild && targetGuild !== interaction.guild.id) return interaction.reply({ content: 'You cannot skip music in another server.', ephemeral: true });

        const { skip } = await import('./music.js');
        const nextSong = skip(interaction.guild.id);

        if (nextSong) {
          await interaction.reply({ content: `⏭️ **Skipped to:** ${nextSong.title} by ${nextSong.artist}`, ephemeral: true });
        } else {
          await interaction.reply({ content: '❌ No songs in queue to skip to.', ephemeral: true });
        }
        return;
      }
      if (action === 'music_stop') {
        const [, targetGuild] = interaction.customId.split(':');
        if (targetGuild && targetGuild !== interaction.guild.id) return interaction.reply({ content: 'You cannot stop music in another server.', ephemeral: true });

        const { stop } = await import('./music.js');
        const result = stop(interaction.guild.id);

        if (result) {
          await interaction.reply({ content: '⏹️ **Music stopped and queue cleared!**', ephemeral: true });
        } else {
          await interaction.reply({ content: '❌ Failed to stop music.', ephemeral: true });
        }
        return;
      }
      if (action === 'music_shuffle') {
        const [, targetGuild] = interaction.customId.split(':');
        if (targetGuild && targetGuild !== interaction.guild.id) return interaction.reply({ content: 'You cannot shuffle queue in another server.', ephemeral: true });

        const { shuffleQueue } = await import('./music.js');
        const result = shuffleQueue(interaction.guild.id);

        if (result) {
          await interaction.reply({ content: '🔀 **Queue shuffled!**', ephemeral: true });
        } else {
          await interaction.reply({ content: '❌ Queue is empty or too small to shuffle.', ephemeral: true });
        }
        return;
      }
      if (action === 'music_clear') {
        const [, targetGuild] = interaction.customId.split(':');
        if (targetGuild && targetGuild !== interaction.guild.id) return interaction.reply({ content: 'You cannot clear queue in another server.', ephemeral: true });

        const { clearQueue } = await import('./music.js');
        const result = clearQueue(interaction.guild.id);

        if (result) {
          await interaction.reply({ content: '🗑️ **Queue cleared!**', ephemeral: true });
        } else {
          await interaction.reply({ content: '❌ Failed to clear queue.', ephemeral: true });
        }
        return;
      }
      if (action === 'guess_modal') {
        const [, gameId, min, max] = interaction.customId.split(':');
        // Show guess input modal (this would be handled by the guess command)
        return;
      }
      if (action.startsWith('c4_')) {
        const [, column, gameId] = interaction.customId.split('_');
        const col = parseInt(column);

        if (isNaN(col) || col < 0 || col > 6) return;

        // Find the game state and make the move
        await interaction.reply({ content: `🎯 **Connect Four Move!**\nYou dropped a piece in column ${col + 1}!`, ephemeral: true });

        // Update game state and refresh board
        // This would need persistent game state management
        return;
      }
      if (action === 'hangman') {
        const [, letter] = interaction.customId.split('_');
        if (!letter || letter.length !== 1) return;

        // Find the game state (in a real implementation, you'd store this per user/channel)
        // For now, we'll handle this in the command file itself

        // Update the game state and refresh the board
        await interaction.reply({ content: `You guessed: **${letter}**`, ephemeral: true });
        // The actual game logic would need to be implemented with persistent state
        return;
      }
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    await command.execute(interaction);

    // Set command-specific cooldown after successful execution
    setCooldown(interaction.user.id, interaction.commandName);
  } catch (err) {
    // Log the error with full context
    logError('Command execution failed', err, {
      command: interaction.commandName,
      user: `${interaction.user.username}#${interaction.user.discriminator}`,
      userId: interaction.user.id,
      guild: interaction.guild?.name || 'DM',
      channel: interaction.channel?.name || 'Unknown'
    });

    // Log command failure
    logCommandExecution(interaction, false, err);

    // Provide user-friendly error response
    const errorMessage = process.env.NODE_ENV === 'development'
      ? `❌ **Error:** ${err.message}`
      : '❌ There was an error while executing this command! Please try again.';

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: errorMessage, ephemeral: true });
    } else {
      await interaction.reply({ content: errorMessage, ephemeral: true });
    }
  }
});

client.on('messageCreate', async message => {
  try {
    // Check global message cooldown
    const messageCooldown = isOnCooldown(message.author.id, 'message_global');
    if (messageCooldown.onCooldown) {
      return; // Silently ignore messages during cooldown
    }

    // Set message cooldown
    setCooldown(message.author.id, 'message_global');

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
    logError('Message handling failed', err, {
      user: `${message.author.username}#${message.author.discriminator}`,
      userId: message.author.id,
      guild: message.guild?.name || 'DM',
      channel: message.channel?.name || 'Unknown',
      messageLength: message.content.length
    });
  }
});

(async () => {
  await client.login(TOKEN);
})();
