import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder } from 'discord.js';
import { createCharacter, getCharacter, saveCharacter, encounterMonster, fightTurn, narrate, randomEventType, applyXp, getLeaderboard, resetCharacter, getCharacterClasses, getClassInfo } from '../rpg.js';
import { updateUserStats } from '../achievements.js';
import { exploreLocation } from '../locations.js';

export const data = new SlashCommandBuilder()
  .setName('rpg')
  .setDescription('Play an enhanced RPG with character classes')
  .addSubcommand(sub => sub.setName('start').setDescription('Create your character')
    .addStringOption(opt => opt.setName('name').setDescription('Character name'))
    .addStringOption(opt => opt.setName('class').setDescription('Character class').addChoices(
      { name: '🛡️ Warrior', value: 'warrior' },
      { name: '🔮 Mage', value: 'mage' },
      { name: '🗡️ Rogue', value: 'rogue' },
      { name: '⚔️ Paladin', value: 'paladin' }
    )))
  .addSubcommand(sub => sub.setName('fight').setDescription('Fight a monster'))
  .addSubcommand(sub => sub.setName('explore').setDescription('Explore and encounter random events'))
  .addSubcommand(sub => sub.setName('quest').setDescription('Quest actions (create/list/complete)').addStringOption(opt => opt.setName('action').setDescription('create|list|complete').setRequired(true)).addStringOption(opt => opt.setName('title').setDescription('Quest title')).addStringOption(opt => opt.setName('id').setDescription('Quest id to complete')).addStringOption(opt => opt.setName('desc').setDescription('Quest description')))
  .addSubcommand(sub => sub.setName('boss').setDescription('Face a boss (dangerous)'))
  .addSubcommand(sub => sub.setName('levelup').setDescription('Spend skill points to increase stats').addStringOption(opt => opt.setName('stat').setDescription('hp|maxhp|atk|def|spd').setRequired(true)).addIntegerOption(opt => opt.setName('amount').setDescription('How many points to spend').setRequired(true)))
  .addSubcommand(sub => sub.setName('stats').setDescription('Show your character stats'))
  .addSubcommand(sub => sub.setName('leaderboard').setDescription('Show top players'))
  .addSubcommand(sub => sub.setName('reset').setDescription('Reset your character to defaults').addStringOption(opt => opt.setName('class').setDescription('New character class').addChoices(
    { name: '🛡️ Warrior', value: 'warrior' },
    { name: '🔮 Mage', value: 'mage' },
    { name: '🗡️ Rogue', value: 'rogue' },
    { name: '⚔️ Paladin', value: 'paladin' }
  )))
  .addSubcommand(sub => sub.setName('class').setDescription('View information about character classes'))
  .addSubcommand(sub => sub.setName('inventory').setDescription('View and manage your inventory'));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const userId = interaction.user.id;

  if (sub === 'start') {
    const name = interaction.options.getString('name');
    const charClass = interaction.options.getString('class') || 'warrior';
    const char = createCharacter(userId, name, charClass);
    if (!char) return interaction.reply({ content: 'You already have a character.', ephemeral: true });

    // Track achievements
    const achievementResult = updateUserStats(userId, {
      characters_created: 1,
      features_tried: 1
    });

    // Check if user earned "Born to Adventure" achievement
    if (achievementResult.newAchievements.length > 0) {
      const newAchievement = achievementResult.newAchievements[0];
      await interaction.reply({ content: `🎉 **Achievement Unlocked!** ${newAchievement.icon} ${newAchievement.name}\n${newAchievement.description}\n💎 +${newAchievement.points} points!` });
    }

    const embed = new EmbedBuilder()
      .setTitle('🎮 Character Created!')
      .setColor(char.color)
      .setDescription(`**${char.name}** - Level ${char.lvl} ${char.class.charAt(0).toUpperCase() + char.class.slice(1)}`)
      .addFields(
        { name: '❤️ Health', value: `${char.hp}/${char.maxHp}`, inline: true },
        { name: '⚔️ Attack', value: `${char.atk}`, inline: true },
        { name: '🛡️ Defense', value: `${char.def}`, inline: true },
        { name: '💨 Speed', value: `${char.spd}`, inline: true },
        { name: '⭐ Abilities', value: char.abilities.join(', '), inline: false },
        { name: '📈 Available Stats', value: 'Use `/rpg levelup` to spend skill points on:\n❤️ HP, 🛡️ Max HP, ⚔️ ATK, 🛡️ DEF, 💨 SPD', inline: false }
      );

    return interaction.reply({ embeds: [embed] });
  }

  if (sub === 'inventory') {
    // Redirect to inventory command for now
    return interaction.reply({ content: 'Use `/inventory view` to manage your inventory!', ephemeral: true });
  }

  const char = getCharacter(userId);
  if (!char) return interaction.reply({ content: 'You have no character. Run /rpg start', ephemeral: true });

  if (sub === 'stats') {
    const classInfo = getClassInfo(char.class);
    const embed = new EmbedBuilder()
      .setTitle(`📊 ${char.name} - Level ${char.lvl} ${char.class.charAt(0).toUpperCase() + char.class.slice(1)}`)
      .setColor(char.color)
      .addFields(
        { name: '❤️ Health', value: `${char.hp}/${char.maxHp}`, inline: true },
        { name: '⚔️ Attack', value: `${char.atk}`, inline: true },
        { name: '🛡️ Defense', value: `${char.def}`, inline: true },
        { name: '💨 Speed', value: `${char.spd}`, inline: true },
        { name: '⭐ Experience', value: `${char.xp} XP`, inline: true },
        { name: '💎 Skill Points', value: `${char.skillPoints || 0}`, inline: true },
        { name: '🎯 Abilities', value: char.abilities.join(', '), inline: false }
      );

    // include buttons for quick actions
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`rpg_leaderboard:0:${userId}`).setLabel('Leaderboard').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`rpg_reset_modal:0:${userId}`).setLabel('Reset Character').setStyle(ButtonStyle.Danger),
    );

    return interaction.reply({ embeds: [embed], components: [row] });
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

      // Track boss defeat achievements
      if (monster.name.includes('Dragon') || monster.name.includes('Boss')) {
        updateUserStats(userId, { bosses_defeated: 1 });
      }

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
    // Use new location-based exploration system
    const result = exploreLocation(userId, 'whispering_woods'); // Default to starting location

    if (!result.success) {
      return interaction.reply({ content: `❌ ${result.reason}`, ephemeral: true });
    }

    const { location, encounter, narrative } = result;

    const locationNarrative = await narrate(
      interaction.guildId,
      `${location.ai_prompt} An adventurer explores this mystical place.`,
      `You explore ${location.name}. ${narrative.entry}`
    );

    const embed = new EmbedBuilder()
      .setTitle(`${location.emoji} Exploring ${location.name}`)
      .setColor(location.color)
      .setDescription(locationNarrative)
      .addFields(
        { name: '🎯 Discovery', value: encounter.type.replace('_', ' ').toUpperCase(), inline: true },
        { name: '💎 Potential Rewards', value: `${encounter.rewards.xp} XP, ${encounter.rewards.gold} gold`, inline: true }
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`explore_investigate:${location.id}:${userId}`).setLabel('🔍 Investigate').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`explore_search:${location.id}:${userId}`).setLabel('⚔️ Search for Danger').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`explore_rest:${location.id}:${userId}`).setLabel('🛌 Take a Break').setStyle(ButtonStyle.Secondary)
    );

    return interaction.reply({ embeds: [embed], components: [row] });
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
    if (char.hp <= 0) {
      char.hp = Math.max(1, Math.floor(char.maxHp / 2));
      saveCharacter(userId, char);
      out += '\nYou were defeated but live to fight another day.';
    } else {
      const res = applyXp(userId, char, boss.lvl * 20);
      char = res.char;
      saveCharacter(userId, char);

      // Track boss defeat
      updateUserStats(userId, { bosses_defeated: 1 });

      out += `\nYou survived and earned ${boss.lvl * 20} XP!`;
      if (res.gained > 0) out += `\nLevel up! ${res.oldLvl} → ${res.newLvl}. You gained ${res.gained} skill point(s).`;
    }
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
    } else if (stat === 'def') {
      char.def += amount;
    } else if (stat === 'spd') {
      char.spd += amount;
    } else {
      return interaction.reply({ content: 'Unknown stat. Use hp|maxhp|atk|def|spd', ephemeral: true });
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
    const newClass = interaction.options.getString('class') || char.class;
    // show a confirmation modal before resetting
    const modal = new ModalBuilder().setCustomId(`rpg_reset_confirm:cmd:${userId}:${newClass}`).setTitle('Confirm Reset');
    const input = new TextInputBuilder().setCustomId('confirm_text').setLabel('Type RESET to confirm').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('RESET');
    // modal requires ActionRow-like placement via components
    modal.addComponents({ type: 1, components: [input] });
    await interaction.showModal(modal);
    return;
  }

  if (sub === 'class') {
    const classes = getCharacterClasses();
    const embed = new EmbedBuilder()
      .setTitle('🏛️ Character Classes')
      .setColor(0x0099FF)
      .setDescription('Choose your class when creating a character with `/rpg start`');

    for (const [key, classInfo] of Object.entries(classes)) {
      embed.addFields({
        name: `${classInfo.name}`,
        value: `**Description:** ${classInfo.description}\n**Base Stats:** ❤️ ${classInfo.baseStats.hp} HP, ⚔️ ${classInfo.baseStats.atk} ATK, 🛡️ ${classInfo.baseStats.def} DEF, 💨 ${classInfo.baseStats.spd} SPD\n**Abilities:** ${classInfo.abilities.join(', ')}`,
        inline: false
      });
    }

    return interaction.reply({ embeds: [embed] });
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
