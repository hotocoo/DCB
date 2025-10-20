import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('poll')
  .setDescription('Create an interactive poll with up to 4 options')
  .addStringOption(option =>
    option.setName('question')
      .setDescription('The poll question')
      .setRequired(true))
  .addStringOption(option =>
    option.setName('option1')
      .setDescription('First option')
      .setRequired(true))
  .addStringOption(option =>
    option.setName('option2')
      .setDescription('Second option')
      .setRequired(true))
  .addStringOption(option =>
    option.setName('option3')
      .setDescription('Third option (optional)')
      .setRequired(false))
  .addStringOption(option =>
    option.setName('option4')
      .setDescription('Fourth option (optional)')
      .setRequired(false))
  .addIntegerOption(option =>
    option.setName('duration')
      .setDescription('Duration in minutes (1-60, default: 10)')
      .setMinValue(1)
      .setMaxValue(60)
      .setRequired(false));

export async function execute(interaction) {
  const question = interaction.options.getString('question');
  const option1 = interaction.options.getString('option1');
  const option2 = interaction.options.getString('option2');
  const option3 = interaction.options.getString('option3');
  const option4 = interaction.options.getString('option4');
  const durationMinutes = interaction.options.getInteger('duration') || 10;

  const options = [option1, option2, option3, option4].filter(Boolean);
  const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'];

  if (options.length < 2) {
    return interaction.reply({ content: '❌ You need at least 2 options for a poll.', ephemeral: true });
  }

  const embed = new EmbedBuilder()
    .setTitle(`📊 ${question}`)
    .setColor(0x0099FF)
    .setDescription(options.map((option, index) => `${emojis[index]} ${option}`).join('\n\n'))
    .addFields({
      name: 'Instructions',
      value: 'Click the buttons below to vote! You can change your vote at any time.',
      inline: false
    })
    .setFooter({ text: `Poll created by ${interaction.user.username} • Ends in ${durationMinutes} minutes` })
    .setTimestamp(Date.now() + durationMinutes * 60000);

  // Create buttons for each option
  const buttons = options.map((option, index) =>
    new ButtonBuilder()
      .setCustomId(`poll_${index}`)
      .setLabel(`${emojis[index]} ${option.length > 15 ? option.substring(0, 15) + '...' : option}`)
      .setStyle(ButtonStyle.Primary)
  );

  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) {
    const row = new ActionRowBuilder().addComponents(buttons.slice(i, i + 2));
    rows.push(row);
  }

  const message = await interaction.reply({ embeds: [embed], components: rows });

  // Store poll data for tracking votes
  const pollData = {
    question,
    options,
    votes: new Map(), // userId -> optionIndex
    totalVotes: 0,
    endTime: Date.now() + durationMinutes * 60000,
    messageId: message.id
  };

  // Set up collector for button interactions
  const filter = (i) => i.customId.startsWith('poll_') && i.message.id === message.id;
  const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, filter, time: durationMinutes * 60000 });

  collector.on('collect', async (i) => {
    const optionIndex = parseInt(i.customId.split('_')[1]);
    const userId = i.user.id;

    // Remove previous vote if exists
    const previousVote = pollData.votes.get(userId);
    if (previousVote !== undefined) {
      pollData.totalVotes--;
    }

    // Add new vote
    pollData.votes.set(userId, optionIndex);
    pollData.totalVotes++;

    // Update embed with current results
    const updatedEmbed = new EmbedBuilder()
      .setTitle(`📊 ${question}`)
      .setColor(0x0099FF)
      .setDescription(
        options.map((option, index) => {
          const voteCount = Array.from(pollData.votes.values()).filter(v => v === index).length;
          const percentage = pollData.totalVotes > 0 ? Math.round((voteCount / pollData.totalVotes) * 100) : 0;
          return `${emojis[index]} ${option}\n${'█'.repeat(Math.max(1, percentage / 5))}${voteCount > 0 ? ` **${voteCount}** (${percentage}%)` : ''}`;
        }).join('\n\n')
      )
      .setFooter({ text: `Total votes: ${pollData.totalVotes} • Poll ends` })
      .setTimestamp(pollData.endTime);

    await i.update({ embeds: [updatedEmbed], components: rows });
  });

  collector.on('end', async () => {
    // Final update when poll ends
    const finalEmbed = new EmbedBuilder()
      .setTitle(`📊 ${question} [ENDED]`)
      .setColor(0x666666)
      .setDescription(
        options.map((option, index) => {
          const voteCount = Array.from(pollData.votes.values()).filter(v => v === index).length;
          const percentage = pollData.totalVotes > 0 ? Math.round((voteCount / pollData.totalVotes) * 100) : 0;
          return `${emojis[index]} ${option}\n${'█'.repeat(Math.max(1, percentage / 5))}${voteCount > 0 ? ` **${voteCount}** (${percentage}%)` : ''}`;
        }).join('\n\n')
      )
      .setFooter({ text: `Final results • Total votes: ${pollData.totalVotes}` })
      .setTimestamp();

    // Disable all buttons
    const disabledRows = rows.map(row => {
      const disabledRow = new ActionRowBuilder();
      row.components.forEach(button => {
        disabledRow.addComponents(
          ButtonBuilder.from(button).setDisabled(true)
        );
      });
      return disabledRow;
    });

    await interaction.editReply({ embeds: [finalEmbed], components: disabledRows });
  });
}