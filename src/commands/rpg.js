import { SlashCommandBuilder } from 'discord.js';
import { createCharacter, getCharacter, saveCharacter, encounterMonster, fightTurn, narrate, randomEventType } from '../rpg.js';

export const data = new SlashCommandBuilder()
  .setName('rpg')
  .setDescription('Play a simple RPG')
  .addSubcommand(sub => sub.setName('start').setDescription('Create your character').addStringOption(opt => opt.setName('name').setDescription('Character name')))
  .addSubcommand(sub => sub.setName('fight').setDescription('Fight a monster'))
  .addSubcommand(sub => sub.setName('explore').setDescription('Explore and encounter random events'))
  .addSubcommand(sub => sub.setName('stats').setDescription('Show your character stats'));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const userId = interaction.user.id;

  if (sub === 'start') {
    const name = interaction.options.getString('name');
    const char = createCharacter(userId, name);
    if (!char) return interaction.reply({ content: 'You already have a character.', ephemeral: true });
    return interaction.reply(`Character created: ${char.name} (HP ${char.hp})`);
  }

  const char = getCharacter(userId);
  if (!char) return interaction.reply({ content: 'You have no character. Run /rpg start', ephemeral: true });

  if (sub === 'stats') {
    return interaction.reply(`Name: ${char.name}\nLevel: ${char.lvl} XP: ${char.xp}\nHP: ${char.hp}/${char.maxHp} ATK: ${char.atk}`);
  }

  if (sub === 'fight') {
    const monster = encounterMonster(char.lvl);
    // simple fight: user attacks, monster attacks until one dies (short)
    let log = [];
    while (char.hp > 0 && monster.hp > 0 && log.length < 10) {
      const dmg = fightTurn(char, monster);
      log.push(`You hit ${monster.name} for ${dmg} dmg (hp ${Math.max(0, monster.hp)})`);
      if (monster.hp <= 0) break;
      const mdmg = fightTurn(monster, char);
      log.push(`${monster.name} hits you for ${mdmg} dmg (hp ${Math.max(0, char.hp)})`);
    }

    if (char.hp > 0 && monster.hp <= 0) {
      char.xp += monster.lvl * 5;
      char.lvl = Math.floor(1 + char.xp / 20);
      char.hp = Math.min(char.maxHp, char.hp + 2);
      saveCharacter(userId, char);
      log.push(`You defeated ${monster.name}! Gained ${monster.lvl * 5} XP.`);
    } else if (char.hp <= 0) {
      char.hp = Math.max(1, Math.floor(char.maxHp / 2));
      saveCharacter(userId, char);
      log.push('You were defeated and recover to half HP.');
    }

    return interaction.reply(log.join('\n'));
  }

  if (sub === 'explore') {
    const type = randomEventType();
    if (type === 'monster') {
      const monster = encounterMonster(char.lvl);
      const narr = await narrate(interaction.guildId, `A level ${char.lvl} adventurer encounters a ${monster.name}. Provide a short battle intro.`, `You encounter ${monster.name}!`);
      // do a quick exchange
      const dmg = fightTurn(char, monster);
      let out = `${narr}\nYou strike the ${monster.name} for ${dmg} damage.`;
      if (monster.hp > 0) {
        const mdmg = fightTurn(monster, char);
        out += `\n${monster.name} hits back for ${mdmg} dmg.`;
      }
      if (char.hp <= 0) {
        char.hp = Math.max(1, Math.floor(char.maxHp / 2));
        saveCharacter(userId, char);
        out += '\nYou were defeated and recover to half HP.';
      } else {
        char.xp += monster.lvl * 5;
        saveCharacter(userId, char);
        out += `\nYou survived and gained ${monster.lvl * 5} XP.`;
      }
      return interaction.reply(out);
    }

    if (type === 'treasure') {
      const narr = await narrate(interaction.guildId, `A chest appears on the path. Provide a short treasure description and reward (gold or item).`, `You find a small chest containing some gold.`);
      // reward
      char.xp += 3;
      saveCharacter(userId, char);
      return interaction.reply(`${narr}\nYou gained 3 XP.`);
    }

    if (type === 'trap') {
      const narr = await narrate(interaction.guildId, `Describe a sudden trap that injures the player (short).`, `A trap springs!`);
      const dmg = Math.max(1, Math.floor(Math.random() * 6) + 1);
      char.hp -= dmg;
      if (char.hp <= 0) char.hp = Math.max(1, Math.floor(char.maxHp / 2));
      saveCharacter(userId, char);
      return interaction.reply(`${narr}\nYou took ${dmg} damage.`);
    }

    if (type === 'npc') {
      const narr = await narrate(interaction.guildId, `A wandering NPC meets the player. Provide a short friendly or quirky NPC interaction.`, `You meet a stranger.`);
      // small xp
      char.xp += 2;
      saveCharacter(userId, char);
      return interaction.reply(`${narr}\nThey taught you something. +2 XP.`);
    }
  }
}
