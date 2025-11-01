import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { createReminder, createEvent, parseTime, getUserReminders, getUserEvents, cancelReminder, cancelEvent, getUpcomingEvents } from '../scheduler.js';
import { safeExecuteCommand, CommandError, validateGuild, validateRange, validateNotEmpty } from '../errorHandler.js';

export const data = new SlashCommandBuilder()
  .setName('remind')
  .setDescription('Advanced reminder and scheduling system')
  .addSubcommand(sub => sub.setName('me').setDescription('Set a personal reminder')
    .addStringOption(opt => opt.setName('when').setDescription('When to remind you (e.g., "in 30 minutes", "tomorrow 3pm")').setRequired(true))
    .addStringOption(opt => opt.setName('what').setDescription('What to remind you about').setRequired(true))
    .addStringOption(opt => opt.setName('title').setDescription('Reminder title').setRequired(false)))
  .addSubcommand(sub => sub.setName('event').setDescription('Create a server event')
    .addStringOption(opt => opt.setName('title').setDescription('Event title').setRequired(true))
    .addStringOption(opt => opt.setName('description').setDescription('Event description').setRequired(true))
    .addStringOption(opt => opt.setName('when').setDescription('When the event starts').setRequired(true))
    .addIntegerOption(opt => opt.setName('duration').setDescription('Duration in minutes (default: 60)').setRequired(false))
    .addIntegerOption(opt => opt.setName('max_participants').setDescription('Maximum participants (0 for unlimited)').setRequired(false)))
  .addSubcommand(sub => sub.setName('list').setDescription('List your reminders and events'))
  .addSubcommand(sub => sub.setName('upcoming').setDescription('View upcoming events and reminders')
    .addIntegerOption(opt => opt.setName('days').setDescription('Days to look ahead (default: 7)').setRequired(false)))
  .addSubcommand(sub => sub.setName('cancel').setDescription('Cancel a reminder or event')
    .addStringOption(opt => opt.setName('type').setDescription('reminder or event').setRequired(true))
    .addStringOption(opt => opt.setName('id').setDescription('ID to cancel').setRequired(true)));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'me') {
    const when = interaction.options.getString('when');
    const what = interaction.options.getString('what');
    const title = interaction.options.getString('title') || 'Reminder';

    validateNotEmpty(when, 'time');
    validateNotEmpty(what, 'reminder message');

    try {
      const scheduledTime = parseTime(when);

      if (!scheduledTime) {
        throw new CommandError('Invalid time format. Use formats like "in 30 minutes", "tomorrow 3pm", "next friday 2pm".', 'INVALID_ARGUMENT');
      }

      if (scheduledTime <= Date.now()) {
        throw new CommandError('Cannot schedule reminders in the past!', 'INVALID_ARGUMENT');
      }

      const maxReminderTime = Date.now() + (365 * 24 * 60 * 60 * 1000); // 1 year
      if (scheduledTime > maxReminderTime) {
        throw new CommandError('Cannot schedule reminders more than 1 year in advance.', 'OUT_OF_RANGE');
      }

      const reminderData = {
        title,
        message: what,
        scheduledFor: scheduledTime,
        channelId: interaction.channel.id,
        guildId: interaction.guild?.id || null
      };

      const reminder = createReminder(interaction.user.id, reminderData);

      const timeUntil = Math.round((scheduledTime - Date.now()) / 60000); // Convert to minutes

      const embed = new EmbedBuilder()
        .setTitle('⏰ Reminder Set!')
        .setColor(0x00FF00)
        .setDescription(`**${title}**`)
        .addFields(
          { name: '📝 Message', value: what, inline: false },
          { name: '⏱️ When', value: `In ${timeUntil} minutes (${new Date(scheduledTime).toLocaleString()})`, inline: true },
          { name: '🆔 Reminder ID', value: `\`${reminder.id}\``, inline: true }
        );

      await interaction.reply({ embeds: [embed] });

    } catch (error) {
      throw new CommandError(`Failed to create reminder: ${error.message}`, 'COMMAND_ERROR', { originalError: error.message });
    }

  } else if (sub === 'event') {
    validateGuild(interaction);

    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const when = interaction.options.getString('when');
    const duration = interaction.options.getInteger('duration') || 60;
    const maxParticipants = interaction.options.getInteger('max_participants') || 0;

    validateNotEmpty(title, 'event title');
    validateNotEmpty(description, 'event description');
    validateNotEmpty(when, 'event time');
    validateRange(duration, 1, 1440, 'duration (minutes)'); // Max 24 hours
    validateRange(maxParticipants, 0, 1000, 'max participants');

    try {
      const startTime = parseTime(when);

      if (!startTime) {
        throw new CommandError('Invalid time format. Use formats like "in 30 minutes", "tomorrow 3pm", "next friday 2pm".', 'INVALID_ARGUMENT');
      }

      if (startTime <= Date.now()) {
        throw new CommandError('Cannot schedule events in the past!', 'INVALID_ARGUMENT');
      }

      const maxEventTime = Date.now() + (365 * 24 * 60 * 60 * 1000); // 1 year
      if (startTime > maxEventTime) {
        throw new CommandError('Cannot schedule events more than 1 year in advance.', 'OUT_OF_RANGE');
      }

      const eventData = {
        title,
        description,
        scheduledFor: startTime,
        duration: duration * 60000, // Convert minutes to milliseconds
        channelId: interaction.channel.id,
        guildId: interaction.guild.id,
        creatorId: interaction.user.id,
        maxParticipants,
        reminders: [600000, 1800000] // 10 minutes and 30 minutes before
      };

      const event = createEvent(eventData);

      const timeUntil = Math.round((startTime - Date.now()) / 60000);

      const embed = new EmbedBuilder()
        .setTitle('📅 Event Created!')
        .setColor(0x0099FF)
        .setDescription(`**${title}**`)
        .addFields(
          { name: '📝 Description', value: description, inline: false },
          { name: '⏱️ Starts In', value: `${timeUntil} minutes (${new Date(startTime).toLocaleString()})`, inline: true },
          { name: '⏳ Duration', value: `${duration} minutes`, inline: true },
          { name: '👥 Max Participants', value: maxParticipants || 'Unlimited', inline: true }
        );

      await interaction.reply({ embeds: [embed] });

    } catch (error) {
      throw new CommandError(`Failed to create event: ${error.message}`, 'COMMAND_ERROR', { originalError: error.message });
    }

  } else if (sub === 'list') {
    try {
      const userReminders = getUserReminders(interaction.user.id, 10);
      const userEvents = interaction.guild ? getUserEvents(interaction.guild.id, 10) : [];

      if (!Array.isArray(userReminders) || !Array.isArray(userEvents)) {
        throw new CommandError('Failed to retrieve schedule data.', 'COMMAND_ERROR');
      }

      if (userReminders.length === 0 && userEvents.length === 0) {
        return interaction.reply({ content: '📅 No upcoming reminders or events. Use `/remind me` or `/remind event` to create some!', flags: MessageFlags.Ephemeral });
      }

    const embed = new EmbedBuilder()
      .setTitle('📅 Your Schedule')
      .setColor(0x0099FF)
      .setDescription('Upcoming reminders and events');

    if (userReminders.length > 0) {
      const reminderList = userReminders.map(r => {
        const timeUntil = Math.round((r.scheduledFor - Date.now()) / 60000);
        return `⏰ **${r.title}** - In ${timeUntil}m\n${r.message}`;
      }).join('\n\n');

      embed.addFields({
        name: `⏰ Personal Reminders (${userReminders.length})`,
        value: reminderList,
        inline: false
      });
    }

    if (userEvents.length > 0) {
      const eventList = userEvents.map(e => {
        const timeUntil = Math.round((e.scheduledFor - Date.now()) / 60000);
        return `📅 **${e.title}** - In ${timeUntil}m\n${e.description}`;
      }).join('\n\n');

      embed.addFields({
        name: `📅 Server Events (${userEvents.length})`,
        value: eventList,
        inline: false
      });
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`remind_upcoming:${interaction.user.id}`).setLabel('📅 View All').setStyle(ButtonStyle.Primary)
    );

    } catch (error) {
      throw new CommandError(`Failed to list schedule: ${error.message}`, 'COMMAND_ERROR', { originalError: error.message });
    }

    await interaction.reply({ embeds: [embed], components: [row] });

  } else if (sub === 'upcoming') {
    const days = interaction.options.getInteger('days') || 7;
    validateRange(days, 1, 365, 'days ahead');

    try {
      const upcoming = getUpcomingEvents(interaction.user.id, interaction.guild?.id, days);

      if (!Array.isArray(upcoming)) {
        throw new CommandError('Failed to retrieve upcoming events.', 'COMMAND_ERROR');
      }

      if (upcoming.length === 0) {
        return interaction.reply({ content: `📅 No upcoming events or reminders in the next ${days} days.`, flags: MessageFlags.Ephemeral });
      }

    const embed = new EmbedBuilder()
      .setTitle(`📅 Upcoming (${days} days)`)
      .setColor(0x0099FF)
      .setDescription(`${upcoming.length} upcoming items`);

    upcoming.slice(0, 10).forEach((item, index) => {
      const timeUntil = Math.round((item.scheduledFor - Date.now()) / 60000);
      const type = item.type === 'reminder' ? '⏰' : '📅';

      embed.addFields({
        name: `${type} ${item.title}`,
        value: `**In:** ${timeUntil} minutes\n**Description:** ${item.message || item.description}\n**When:** ${new Date(item.scheduledFor).toLocaleString()}`,
        inline: false
      });
    });

    } catch (error) {
      throw new CommandError(`Failed to get upcoming events: ${error.message}`, 'COMMAND_ERROR', { originalError: error.message });
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

  } else if (sub === 'cancel') {
    const type = interaction.options.getString('type');
    const id = interaction.options.getString('id');

    validateNotEmpty(type, 'type');
    validateNotEmpty(id, 'ID');

    const validTypes = ['reminder', 'event'];
    if (!validTypes.includes(type)) {
      throw new CommandError('Invalid type. Use "reminder" or "event".', 'INVALID_ARGUMENT');
    }

    try {
      if (type === 'reminder') {
        const result = cancelReminder(interaction.user.id, id);

        if (result) {
          await interaction.reply({ content: '✅ **Reminder cancelled successfully!**', flags: MessageFlags.Ephemeral });
        } else {
          throw new CommandError('Reminder not found or already executed.', 'NOT_FOUND');
        }

      } else if (type === 'event') {
        validateGuild(interaction);
        const result = cancelEvent(interaction.guild.id, id, interaction.user.id);

        if (result) {
          await interaction.reply({ content: '✅ **Event cancelled successfully!**', flags: MessageFlags.Ephemeral });
        } else {
          throw new CommandError('Event not found or you are not the creator.', 'NOT_FOUND');
        }
      }
    } catch (error) {
      throw new CommandError(`Failed to cancel ${type}: ${error.message}`, 'COMMAND_ERROR', { originalError: error.message });
    }
  }
}

export async function safeExecute(interaction) {
  return safeExecuteCommand(interaction, execute);
}
  }
}