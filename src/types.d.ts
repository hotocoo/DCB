import { Client, Collection, SlashCommandBuilder, CommandInteraction } from 'discord.js';

interface Guess {
  number: number;
  feedback: string;
  attempt: number;
}

interface GuessGameState {
  id: string;
  secretNumber: number;
  min: number;
  max: number;
  attempts: number;
  attemptsUsed: number;
  guesses: Guess[];
  gameActive: boolean;
  difficulty: string;
  startTime: number;
}

declare module 'discord.js' {
  interface Client {
    commands: Collection<string, {
      data: SlashCommandBuilder;
      execute: (interaction: CommandInteraction) => Promise<void>;
    }>;
  }
}