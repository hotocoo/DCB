import { SlashCommandBuilder } from 'discord.js';

const sessions = new Map();

export const data = new SlashCommandBuilder()
  .setName('minigame')
  .setDescription('Play a quick minigame')
  .addSubcommand(sub => sub.setName('guess').setDescription('Start or guess the number').addIntegerOption(opt => opt.setName('number').setDescription('Your guess').setRequired(false)));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const user = interaction.user.id;
  if (sub === 'guess') {
    const guess = interaction.options.getInteger('number');
    if (!sessions.has(user)) {
      sessions.set(user, Math.floor(Math.random() * 100) + 1);
      return interaction.reply({ content: 'I have picked a number between 1 and 100. Try /minigame guess <number> to guess!', ephemeral: true });
    }
    const target = sessions.get(user);
    if (!guess) return interaction.reply({ content: 'You need to provide a number to guess.', ephemeral: true });
    if (guess === target) {
      sessions.delete(user);
      return interaction.reply(`${interaction.user.username}, correct! You guessed ${target}.`);
    }
    const hint = guess < target ? 'higher' : 'lower';
    return interaction.reply({ content: `Nope — try ${hint}.`, ephemeral: true });
  }
}
