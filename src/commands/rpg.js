import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { createCharacter, getCharacter, saveCharacter, encounterMonster, fightTurn, narrate, randomEventType, applyXp, getLeaderboard, resetCharacter } from '../rpg.js';

export const data = new SlashCommandBuilder()
  .setName('rpg')
  .setDescription('Play a simple RPG')
  .addSubcommand(sub => sub.setName('start').setDescription('Create your character').addStringOption(opt => opt.setName('name').setDescription('Character name')))
  .addSubcommand(sub => sub.setName('fight').setDescription('Fight a monster'))
  .addSubcommand(sub => sub.setName('explore').setDescription('Explore and encounter random events'))
  .addSubcommand(sub => sub.setName('quest').setDescription('Quest actions (create/list/complete)').addStringOption(opt => opt.setName('action').setDescription('create|list|complete').setRequired(true)).addStringOption(opt => opt.setName('title').setDescription('Quest title')).addStringOption(opt => opt.setName('id').setDescription('Quest id to complete')).addStringOption(opt => opt.setName('desc').setDescription('Quest description')))
  .addSubcommand(sub => sub.setName('boss').setDescription('Face a boss (dangerous)'))
  .addSubcommand(sub => sub.setName('levelup').setDescription('Spend skill points to increase stats').addStringOption(opt => opt.setName('stat').setDescription('hp|maxhp|atk').setRequired(true)).addIntegerOption(opt => opt.setName('amount').setDescription('How many points to spend').setRequired(true)))
  .addSubcommand(sub => sub.setName('stats').setDescription('Show your character stats'))
  .addSubcommand(sub => sub.setName('leaderboard').setDescription('Show top players'))
  .addSubcommand(sub => sub.setName('reset').setDescription('Reset your character to defaults'));

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
    // include buttons for quick actions
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`rpg_leaderboard:0:${userId}`).setLabel('Leaderboard').setStyle(ButtonStyle.Primary),
      // open a confirmation modal instead of immediate reset
      new ButtonBuilder().setCustomId(`rpg_reset_modal:0:${userId}`).setLabel('Reset Character').setStyle(ButtonStyle.Danger),
    );
    return interaction.reply({ content: `Name: ${char.name}\nLevel: ${char.lvl} XP: ${char.xp} Skill Points: ${char.skillPoints || 0}\nHP: ${char.hp}/${char.maxHp} ATK: ${char.atk}`, components: [row] });
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
  const res = applyXp(userId, char, monster.lvl * 5);
  char = res.char;
  char.hp = Math.min(char.maxHp, char.hp + 2);
  saveCharacter(userId, char);
  log.push(`You defeated ${monster.name}! Gained ${monster.lvl * 5} XP.`);
  if (res.gained > 0) log.push(`Level up! ${res.oldLvl} → ${res.newLvl}. You gained ${res.gained} skill point(s).`);
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
  const res = applyXp(userId, char, monster.lvl * 5);
  char = res.char;
  saveCharacter(userId, char);
  out += `\nYou survived and gained ${monster.lvl * 5} XP.`;
  if (res.gained > 0) out += `\nLevel up! ${res.oldLvl} → ${res.newLvl}. You gained ${res.gained} skill point(s).`;
      }
      // if leveled, no buttons here (monster flow already used log), respond normally
      return interaction.reply(out);
    }

    if (type === 'treasure') {
      const narr = await narrate(interaction.guildId, `A chest appears on the path. Provide a short treasure description and reward (gold or item).`, `You find a small chest containing some gold.`);
      // reward
  const res = applyXp(userId, char, 3);
  char = res.char;
  saveCharacter(userId, char);
  let outT = `${narr}\nYou gained 3 XP.`;
  if (res.gained > 0) {
    outT += `\nLevel up! ${res.oldLvl} → ${res.newLvl}. You gained ${res.gained} skill point(s).`;
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`rpg_spend:hp:1:${userId}`).setLabel('Spend on HP').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`rpg_spend:maxhp:1:${userId}`).setLabel('Spend on MaxHP').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`rpg_spend:atk:1:${userId}`).setLabel('Spend on ATK').setStyle(ButtonStyle.Secondary),
    );
    return interaction.reply({ content: outT, components: [row] });
  }
  return interaction.reply(outT);
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
  const res = applyXp(userId, char, 2);
  char = res.char;
  saveCharacter(userId, char);
  let outNpc = `${narr}\nThey taught you something. +2 XP.`;
  if (res.gained > 0) {
    outNpc += `\nLevel up! ${res.oldLvl} → ${res.newLvl}. You gained ${res.gained} skill point(s).`;
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`rpg_spend:hp:1:${userId}`).setLabel('Spend on HP').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`rpg_spend:maxhp:1:${userId}`).setLabel('Spend on MaxHP').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`rpg_spend:atk:1:${userId}`).setLabel('Spend on ATK').setStyle(ButtonStyle.Secondary),
    );
    return interaction.reply({ content: outNpc, components: [row] });
  }
  return interaction.reply(outNpc);
    }
  }

  if (sub === 'boss') {
    const boss = bossEncounter(Math.max(3, char.lvl + 2));
    const narr = await narrate(interaction.guildId, `A dire boss ${boss.name} appears. Give a short epic intro.`, `A fearsome boss appears!`);
    let out = `${narr}`;
    // exchange
    const dmg = fightTurn(char, boss);
    out += `\nYou strike the ${boss.name} for ${dmg} damage.`;
    if (boss.hp > 0) {
      const mdmg = fightTurn(boss, char);
      out += `\n${boss.name} hits you for ${mdmg} damage.`;
    }
    if (char.hp <= 0) { char.hp = Math.max(1, Math.floor(char.maxHp / 2)); saveCharacter(userId, char); out += '\nYou were defeated but live to fight another day.'; }
    else { const res = applyXp(userId, char, boss.lvl * 20); char = res.char; saveCharacter(userId, char); out += `\nYou survived and earned ${boss.lvl * 20} XP!`; if (res.gained > 0) out += `\nLevel up! ${res.oldLvl} → ${res.newLvl}. You gained ${res.gained} skill point(s).`; }
    return interaction.reply(out);
  }

  if (sub === 'levelup') {
    const stat = interaction.options.getString('stat');
    const amount = interaction.options.getInteger('amount');
    const pts = char.skillPoints || 0;
    if (amount <= 0) return interaction.reply({ content: 'Amount must be > 0', ephemeral: true });
    if (amount > pts) return interaction.reply({ content: `You only have ${pts} skill points.`, ephemeral: true });

    // apply points
    if (stat === 'hp') {
      char.hp += amount * 2; // each point heals current HP by 2
    } else if (stat === 'maxhp') {
      char.maxHp += amount * 5; // each point increases maxHp
      char.hp = Math.min(char.hp + amount * 2, char.maxHp);
    } else if (stat === 'atk') {
      char.atk += amount;
    } else {
      return interaction.reply({ content: 'Unknown stat. Use hp|maxhp|atk', ephemeral: true });
    }

    char.skillPoints = pts - amount;
    saveCharacter(userId, char);
    return interaction.reply({ content: `Leveled up: +${amount} ${stat}. Remaining points: ${char.skillPoints}`, ephemeral: true });
  }

  if (sub === 'leaderboard') {
    const limit = 10;
    const offset = 0;
    const list = getLeaderboard(limit, offset);
    const total = getLeaderboardCount();
    if (!list.length) return interaction.reply({ content: 'No players yet.', ephemeral: true });
    const page = Math.floor(offset / limit) + 1;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const row = new ActionRowBuilder();
    if (offset > 0) row.addComponents(new ButtonBuilder().setCustomId(`rpg_leaderboard:${Math.max(0, offset - limit)}:${userId}`).setLabel('Prev').setStyle(ButtonStyle.Secondary));
    if (offset + limit < total) row.addComponents(new ButtonBuilder().setCustomId(`rpg_leaderboard:${offset + limit}:${userId}`).setLabel('Next').setStyle(ButtonStyle.Primary));
    return interaction.reply({ content: `Leaderboard — Page ${page}/${totalPages}\n` + list.map((p, i) => `${offset + i + 1}. ${p.name} — Level ${p.lvl} XP ${p.xp} ATK ${p.atk}`).join('\n'), components: row.components.length ? [row] : [] });
  }

  if (sub === 'reset') {
    // show a confirmation modal before resetting
    const modal = new ModalBuilder().setCustomId(`rpg_reset_confirm:cmd:${userId}`).setTitle('Confirm Reset');
    const input = new TextInputBuilder().setCustomId('confirm_text').setLabel('Type RESET to confirm').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('RESET');
    // modal requires ActionRow-like placement via components
    modal.addComponents({ type: 1, components: [input] });
    await interaction.showModal(modal);
    return;
  }

  if (sub === 'quest') {
    const action = interaction.options.getString('action');
    if (action === 'create') {
      const title = interaction.options.getString('title') || 'A simple quest';
      const desc = interaction.options.getString('desc') || 'Do something heroic.';
      const q = createQuest(userId, title, desc);
      return interaction.reply({ content: `Quest created: ${q.title} (id=${q.id})`, ephemeral: true });
    }
    if (action === 'list') {
      const qs = listQuests(userId);
      if (!qs.length) return interaction.reply({ content: 'No quests.', ephemeral: true });
      return interaction.reply(qs.map(q => `${q.id} - ${q.title} [${q.status}]`).join('\n'));
    }
    if (action === 'complete') {
      const id = interaction.options.getString('id');
      const q = completeQuest(userId, id);
      if (!q) return interaction.reply({ content: 'Quest not found.', ephemeral: true });
      return interaction.reply({ content: `Quest completed: ${q.title}`, ephemeral: true });
    }
    return interaction.reply({ content: 'Unknown quest action. Use create|list|complete', ephemeral: true });
  }
}
