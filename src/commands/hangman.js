import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { readFileSync } from 'fs';
import path from 'path';

export const data = new SlashCommandBuilder()
    .setName('hangman')
    .setDescription('Play a game of Hangman!')
    .addSubcommand(subcommand =>
        subcommand
            .setName('start')
            .setDescription('Start a new Hangman game'))
    .addSubcommand(subcommand =>
        subcommand
            .setName('guess')
            .setDescription('Guess a letter in the Hangman game')
            .addStringOption(option =>
                option
                    .setName('letter')
                    .setDescription('The letter to guess')
                    .setRequired(true)));

export async function execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'start') {
        const words = readFileSync(path.join(__dirname, '../../data/words.txt'), 'utf8')
            .split('\n')
            .filter(word => word.trim().length > 0);

        if (words.length === 0) {
            return await interaction.reply({ content: 'No words available for Hangman.', ephemeral: true });
        }

        const randomWord = words[Math.floor(Math.random() * words.length)];
        const gameState = {
            word: randomWord.toLowerCase(),
            guessedLetters: new Set(),
            wrongGuesses: 0,
            maxWrongGuesses: 6,
            isGameOver: false,
            isWon: false
        };

        const displayWord = () => {
            return gameState.word.split('').map(letter => gameState.guessedLetters.has(letter) ? letter : '_').join(' ');
        };

        const drawHangman = () => {
            const stages = [
                '```\n  +---+\n  |   |\n      |\n      |\n      |\n      |\n=========```',
                '```\n  +---+\n  |   |\n  O   |\n      |\n      |\n      |\n=========```',
                '```\n  +---+\n  |   |\n  O   |\n  |   |\n      |\n      |\n=========```',
                '```\n  +---+\n  |   |\n  O   |\n /|   |\n      |\n      |\n=========```',
                '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n      |\n      |\n=========```',
                '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n /    |\n      |\n=========```',
                '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n / \\  |\n      |\n=========```'
            ];
            return stages[gameState.wrongGuesses];
        };

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Hangman Game')
            .setDescription(`**Word:** ${displayWord()}\n**Wrong Guesses:** ${gameState.wrongGuesses}/${gameState.maxWrongGuesses}\n${drawHangman()}`)
            .setFooter({ text: 'Guess a letter using /hangman guess <letter>' });

        await interaction.reply({ embeds: [embed] });

        // Store game state
        if (!interaction.client.games) {
            interaction.client.games = new Map();
        }
        interaction.client.games.set(interaction.user.id, gameState);

    } else if (subcommand === 'guess') {
        const guess = interaction.options.getString('letter').toLowerCase();

        if (!guess || guess.length !== 1 || !/^[a-z]$/.test(guess)) {
            return await interaction.reply({ content: 'Please guess a single letter (a-z).', ephemeral: true });
        }

        const gameState = interaction.client.games.get(interaction.user.id);
        if (!gameState || gameState.isGameOver) {
            return await interaction.reply({ content: 'No active game found. Start a new game with /hangman start.', ephemeral: true });
        }

        if (gameState.guessedLetters.has(guess)) {
            return await interaction.reply({ content: 'You have already guessed that letter.', ephemeral: true });
        }

        gameState.guessedLetters.add(guess);

        if (!gameState.word.includes(guess)) {
            gameState.wrongGuesses++;
        }

        // Check for win or loss
        const currentDisplay = gameState.word.split('').map(letter => gameState.guessedLetters.has(letter) ? letter : '_').join(' ');
        if (currentDisplay.replace(/\s/g, '') === gameState.word) {
            gameState.isWon = true;
            gameState.isGameOver = true;
        } else if (gameState.wrongGuesses >= gameState.maxWrongGuesses) {
            gameState.isGameOver = true;
        }

        const updatedEmbed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(gameState.isGameOver ? (gameState.isWon ? 'You Won!' : 'You Lost!') : 'Hangman Game')
            .setDescription(`**Word:** ${currentDisplay}\n**Wrong Guesses:** ${gameState.wrongGuesses}/${gameState.maxWrongGuesses}\n${drawHangman()}`)
            .setFooter({ text: gameState.isGameOver ? 'Game Over' : 'Guess a letter using /hangman guess <letter>' });

        await interaction.reply({ embeds: [updatedEmbed] });

        if (gameState.isGameOver) {
            interaction.client.games.delete(interaction.user.id);
        }
    }
}
