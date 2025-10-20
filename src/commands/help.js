import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';

async function getAllCommands() {
  const commandsPath = path.join(process.cwd(), 'src', 'commands');
  const commands = [];

  if (fs.existsSync(commandsPath)) {
    for (const file of fs.readdirSync(commandsPath)) {
      if (file.endsWith('.js')) {
        try {
          const command = await import(path.join(commandsPath, file));
          if (command.data && command.data.name) {
            commands.push(command.data);
          }
        } catch (error) {
          console.error(`Failed to load command ${file}:`, error);
        }
      }
    }
  }

  return commands;
}

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Shows comprehensive help about all bot features')
  .addStringOption(option =>
    option.setName('category')
      .setDescription('Specific category to show help for')
      .addChoices(
        { name: 'All Commands', value: 'all' },
        { name: 'RPG System', value: 'rpg' },
        { name: 'Minigames', value: 'games' },
        { name: 'Utility', value: 'utility' },
        { name: 'Chat & AI', value: 'chat' }
      ));

export async function execute(interaction) {
  const category = interaction.options.getString('category') || 'all';
  const commands = await getAllCommands();

  // Organize commands by category
  const commandCategories = {
    rpg: [],
    games: [],
    utility: [],
    chat: [],
    admin: []
  };

  for (const cmd of commands) {
    const name = cmd.name;
    const description = cmd.description || 'No description available';

    if (name === 'rpg') commandCategories.rpg.push(`\`/${name}\` - ${description}`);
    else if (['8ball', 'roll', 'rps', 'minigame', 'novel'].includes(name)) commandCategories.games.push(`\`/${name}\` - ${description}`);
    else if (['ping', 'echo', 'help', 'setmodel', 'togglechat', 'toggleplay'].includes(name)) commandCategories.utility.push(`\`/${name}\` - ${description}`);
    else if (['chat'].includes(name)) commandCategories.chat.push(`\`/${name}\` - ${description}`);
    else commandCategories.utility.push(`\`/${name}\` - ${description}`);
  }

  const embed = new EmbedBuilder()
    .setTitle('🤖 Discord Bot Help')
    .setColor(0x0099FF)
    .setTimestamp();

  switch (category) {
    case 'rpg':
      embed.setDescription('**RPG System Commands**\n\n' + commandCategories.rpg.join('\n'));
      embed.addFields({
        name: 'RPG Features',
        value: '• Character creation and leveling\n• Combat system with monsters\n• Exploration and random events\n• Quest system\n• Skill point allocation\n• Leaderboards and statistics',
        inline: false
      });
      break;

    case 'games':
      embed.setDescription('**Minigame Commands**\n\n' + commandCategories.games.join('\n'));
      embed.addFields({
        name: 'Available Games',
        value: '• **8ball**: Magic 8-ball for questions\n• **roll**: Dice rolling (e.g., 2d6, 1d20)\n• **rps**: Rock Paper Scissors\n• **minigame**: Interactive typing challenges\n• **novel**: AI-generated story creation',
        inline: false
      });
      break;

    case 'utility':
      embed.setDescription('**Utility Commands**\n\n' + commandCategories.utility.join('\n'));
      embed.addFields({
        name: 'Utility Features',
        value: '• **ping**: Check bot latency\n• **echo**: Repeat messages\n• **setmodel**: Configure AI models per server\n• **togglechat**: Enable/disable chat responses\n• **toggleplay**: Enable/disable playful responses',
        inline: false
      });
      break;

    case 'chat':
      embed.setDescription('**Chat & AI Features**\n\n' + commandCategories.chat.join('\n'));
      embed.addFields({
        name: 'AI Integration',
        value: '• DM the bot or mention it to start chatting\n• Supports OpenAI GPT models\n• Compatible with local AI models\n• Conversation history and context\n• Type `!clear` to reset conversation\n• Configurable per-server AI settings',
        inline: false
      });
      break;

    default:
      embed.setDescription('**All Available Commands**\n\n' +
        '🏆 **RPG System**\n' + commandCategories.rpg.join('\n') + '\n\n' +
        '🎮 **Games & Fun**\n' + commandCategories.games.join('\n') + '\n\n' +
        '🔧 **Utilities**\n' + commandCategories.utility.join('\n'));

      embed.addFields(
        {
          name: '💬 Chat & AI',
          value: 'DM the bot or mention it to chat!\nSupports OpenAI and local models.',
          inline: true
        },
        {
          name: '📚 More Info',
          value: 'Use `/help category:rpg` for RPG details\nUse `/help category:games` for game info\nUse `/help category:utility` for utilities',
          inline: true
        }
      );
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
