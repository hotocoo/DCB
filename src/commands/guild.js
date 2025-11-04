import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';

import {
  createGuild,
  joinGuild,
  leaveGuild,
  createParty,
  joinParty,
  leaveParty,
  getUserGuild,
  getUserParty,
  getGuildLeaderboard,
  contributeToGuild
} from '../guilds.js';
import { safeExecuteCommand, CommandError, validateNotEmpty, validateRange } from '../errorHandler.js';

export const data = new SlashCommandBuilder()
  .setName('guild')
  .setDescription('Manage guilds and parties for multiplayer RPG')
  .addSubcommand(sub => sub.setName('create').setDescription('Create a new guild').addStringOption(opt => opt.setName('name').setDescription('Guild name').setRequired(true)))
  .addSubcommand(sub => sub.setName('join').setDescription('Join an existing guild').addStringOption(opt => opt.setName('name').setDescription('Guild name').setRequired(true)))
  .addSubcommand(sub => sub.setName('leave').setDescription('Leave your current guild'))
  .addSubcommand(sub => sub.setName('info').setDescription('View guild information'))
  .addSubcommand(sub => sub.setName('leaderboard').setDescription('View guild leaderboard'))
  .addSubcommand(sub => sub.setName('party').setDescription('Party management').addStringOption(opt => opt.setName('action').setDescription('create|join|leave').setRequired(true)).addStringOption(opt => opt.setName('party_id').setDescription('Party ID (for join)')));

export async function execute(interaction) {
  return safeExecuteCommand(interaction, async() => {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const userName = interaction.user.username;

    switch (sub) {
      case 'create': {
        const guildName = interaction.options.getString('name');

        // Validate guild name
        validateNotEmpty(guildName, 'guild name');
        validateRange(guildName.length, 3, 20, 'guild name length');

        if (!/^[\d\sA-Za-z]+$/.test(guildName)) {
          throw new CommandError('Guild name can only contain letters, numbers, and spaces.', 'INVALID_ARGUMENT');
        }

        const result = createGuild(guildName, userId, userName);
        if (!result.success) {
          throw new CommandError(result.reason, 'COMMAND_ERROR');
        }

        const embed = new EmbedBuilder()
          .setTitle('🏛️ Guild Created!')
          .setColor(0xFF_D7_00)
          .setDescription(`**${guildName}** has been founded!`)
          .addFields(
            { name: '👑 Leader', value: userName, inline: true },
            { name: '🏆 Level', value: '1', inline: true },
            { name: '👥 Members', value: '1', inline: true }
          );

        await interaction.reply({ embeds: [embed] });

        break;
      }
      case 'join': {
        const guildName = interaction.options.getString('name');

        validateNotEmpty(guildName, 'guild name');

        const result = joinGuild(guildName, userId, userName);
        if (!result.success) {
          throw new CommandError(result.reason, 'COMMAND_ERROR');
        }

        const embed = new EmbedBuilder()
          .setTitle('🤝 Welcome to the Guild!')
          .setColor(0x00_FF_00)
          .setDescription(`You have joined **${guildName}**!`)
          .addFields(
            { name: '👥 Members', value: Object.keys(result.guild.members).length, inline: true },
            { name: '🏆 Level', value: result.guild.level, inline: true },
            { name: '💰 Guild Gold', value: result.guild.gold, inline: true }
          );

        await interaction.reply({ embeds: [embed] });

        break;
      }
      case 'leave': {
        const userGuild = getUserGuild(userId);
        if (!userGuild) {
          return interaction.reply({ content: '❌ You are not in a guild.', flags: MessageFlags.Ephemeral });
        }

        const result = leaveGuild(userGuild.name, userId);
        if (!result.success) {
          return interaction.reply({ content: `❌ ${result.reason}`, flags: MessageFlags.Ephemeral });
        }

        await interaction.reply({ content: `👋 You have left **${userGuild.name}**.`, flags: MessageFlags.Ephemeral });

        break;
      }
      case 'info': {
        const userGuild = getUserGuild(userId);
        if (!userGuild) {
          return interaction.reply({ content: '❌ You are not in a guild. Use `/guild create` or `/guild join`!', flags: MessageFlags.Ephemeral });
        }

        const embed = new EmbedBuilder()
          .setTitle(`🏛️ ${userGuild.name}`)
          .setColor(0xFF_D7_00)
          .setDescription(userGuild.description || 'No description set.')
          .addFields(
            { name: '👑 Leader', value: userGuild.members[userGuild.leader]?.name || 'Unknown', inline: true },
            { name: '🏆 Level', value: userGuild.level, inline: true },
            { name: '👥 Members', value: `${Object.keys(userGuild.members).length}/${userGuild.maxMembers}`, inline: true },
            { name: '💰 Guild Gold', value: userGuild.gold, inline: true },
            { name: '⭐ Experience', value: userGuild.experience, inline: true }
          );

        // Add member list
        const memberList = Object.entries(userGuild.members)
          .map(([id, member]) => `${member.role === 'leader' ? '👑' : '👤'} ${member.name} (Level ${member.level})`)
          .join('\n');

        embed.addFields({
          name: '👥 Members',
          value: memberList,
          inline: false
        });

        // Add guild action buttons
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`guild_contribute:${userGuild.name}:${userId}`).setLabel('💰 Contribute Gold').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`guild_refresh:${userGuild.name}:${userId}`).setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({ embeds: [embed], components: [row] });

        break;
      }
      case 'leaderboard': {
        const leaderboard = getGuildLeaderboard(10);

        if (leaderboard.length === 0) {
          return interaction.reply({ content: '🏆 No guilds yet. Be the first to create one!', flags: MessageFlags.Ephemeral });
        }

        const userGuild = getUserGuild(userId);
        const userRank = userGuild ? leaderboard.findIndex(g => g.name === userGuild.name) + 1 : 0;

        const embed = new EmbedBuilder()
          .setTitle('🏆 Guild Leaderboard')
          .setColor(0xFF_D7_00)
          .setDescription(`**Your Rank:** ${userRank > 0 ? `#${userRank}` : 'Not in a guild'}`);

        const leaderboardText = leaderboard.map((guild, index) => {
          const rank = index + 1;
          const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🏅';
          return `${medal} **${guild.name}** - Level ${guild.level} (${guild.memberCount} members)`;
        }).join('\n');

        embed.addFields({
          name: '🏛️ Top Guilds',
          value: leaderboardText,
          inline: false
        });

        await interaction.reply({ embeds: [embed] });

        break;
      }
      case 'party': {
        const action = interaction.options.getString('action');

        switch (action) {
          case 'create': {
            const result = createParty(userId, userName);
            if (!result.success) {
              return interaction.reply({ content: `❌ ${result.reason}`, flags: MessageFlags.Ephemeral });
            }

            const embed = new EmbedBuilder()
              .setTitle('🎭 Party Created!')
              .setColor(0x99_32_CC)
              .setDescription(`**Party ID:** \`${result.party.id}\`\nShare this ID with friends to join!`)
              .addFields(
                { name: '👑 Leader', value: userName, inline: true },
                { name: '👥 Members', value: '1', inline: true },
                { name: '⚔️ Max Size', value: result.party.maxMembers, inline: true }
              );

            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`party_invite:${result.party.id}:${userId}`).setLabel('🔗 Generate Invite').setStyle(ButtonStyle.Primary)
            );

            await interaction.reply({ embeds: [embed], components: [row] });

            break;
          }
          case 'join': {
            const partyId = interaction.options.getString('party_id');

            if (!partyId.startsWith('party_')) {
              return interaction.reply({ content: '❌ Invalid party ID format.', flags: MessageFlags.Ephemeral });
            }

            const result = joinParty(partyId, userId, userName);
            if (!result.success) {
              return interaction.reply({ content: `❌ ${result.reason}`, flags: MessageFlags.Ephemeral });
            }

            const embed = new EmbedBuilder()
              .setTitle('🤝 Joined Party!')
              .setColor(0x00_FF_00)
              .setDescription('You have joined the party!')
              .addFields(
                { name: '👥 Members', value: Object.keys(result.party.members).length, inline: true },
                { name: '⚔️ Max Size', value: result.party.maxMembers, inline: true }
              );

            await interaction.reply({ embeds: [embed] });

            break;
          }
          case 'leave': {
            const userParty = getUserParty(userId);
            if (!userParty) {
              return interaction.reply({ content: '❌ You are not in a party.', flags: MessageFlags.Ephemeral });
            }

            const result = leaveParty(userParty.id, userId);
            if (!result.success) {
              return interaction.reply({ content: `❌ ${result.reason}`, flags: MessageFlags.Ephemeral });
            }

            await interaction.reply({ content: '👋 You have left the party.', flags: MessageFlags.Ephemeral });

            break;
          }
        // No default
        }

        break;
      }
    // No default
    }
  }, {
    command: 'guild'
  });
}