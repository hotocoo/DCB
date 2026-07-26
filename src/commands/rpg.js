import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';

import {
  createCharacter,
  getCharacter,
  resetCharacter,
  applyXp,
  saveCharacter,
  addItemToInventory,
  removeItemFromInventory,
  equipItem,
  unequipItem,
  getCraftingRecipes,
  craftItem,
  canCraftItem,
  encounterMonster,
  fightTurn,
  generateRandomQuest,
  createQuest as rpgCreateQuest,
  completeQuest,
  randomEventType,
  bossEncounter,
} from '../rpg.js';
import { updateStats as updateUserStats } from '../achievements.js';

export const data = new SlashCommandBuilder()
  .setName('rpg')
  .setDescription('RPG character management and adventure system')
  .addSubcommand((sub) =>
    sub
      .setName('start')
      .setDescription('Create your first RPG character')
      .addStringOption((opt) => opt.setName('name').setDescription('Character name').setRequired(true))
      .addStringOption((opt) =>
        opt
          .setName('class')
          .setDescription('Character class (warrior/mage/rogue/cleric/ranger)')
          .addChoices(
            { name: '⚔️ Warrior', value: 'warrior' },
            { name: '🧙 Mage', value: 'mage' },
            { name: '🗡️ Rogue', value: 'rogue' },
            { name: '⛪ Cleric', value: 'cleric' },
            { name: '🏹 Ranger', value: 'ranger' },
          ),
      ),
  )
  .addSubcommand((sub) => sub.setName('stats').setDescription('View your character stats'))
  .addSubcommand((sub) =>
    sub
      .setName('inventory')
      .setDescription('View or manage your inventory')
      .addStringOption((opt) => opt.setName('action').setDescription('view/use/equip/drop')).addStringOption((opt) => opt.setName('item').setDescription('Item name')))
  .addSubcommand((sub) => sub.setName('explore').setDescription('Explore and find loot!'))
  .addSubcommand((sub) =>
    sub
      .setName('upgrade')
      .setDescription('Upgrade a stat with gold (costs vary)')
      .addStringOption((opt) => opt.setName('stat').setDescription('hp/atk/def/spd/mp').setRequired(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName('battle')
      .setDescription('Fight an enemy!')
      .addStringOption((opt) =>
        opt.setName('enemy').setDescription('slime/goblin/skeleton/dragon/boss'),
      ),
  )
  .addSubcommand((sub) => sub.setName('classes').setDescription('View available character classes'))
  .addSubcommand((sub) =>
    sub
      .setName('quest')
      .setDescription('Quest management')
      .addStringOption((opt) => opt.setName('action').setDescription('create/list/complete').setRequired(true))
      .addStringOption((opt) => opt.setName('title').setDescription('Quest title'))
      .addStringOption((opt) => opt.setName('desc').setDescription('Quest description'))
      .addStringOption((opt) => opt.setName('id').setDescription('Quest ID')),
  )
  .addSubcommand((sub) =>
    sub
      .setName('craft')
      .setDescription('Craft items from materials')
      .addStringOption((opt) => opt.setName('item').setDescription('health_potion/mana_potion/fire_sword/ice_staff').setRequired(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName('reset')
      .setDescription('Reset character (keeps class, resets stats/items)'),
  );

export async function execute(interaction) {
  try {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    if (sub === 'start') {
      const name = interaction.options.getString('name');
      const charClass = interaction.options.getString('class') || 'warrior';
      const char = createCharacter(userId, name, charClass);
      if (!char) return interaction.reply({ content: 'You already have a character.', flags: MessageFlags.Ephemeral });

      // Track achievements
      const achievementResult = updateUserStats(userId, {
        characters_created: 1,
        classes_tried: 1,
        features_tried: 1,
      });

      // Check if user earned "Born to Adventure" achievement
      if (achievementResult.newAchievements.length > 0) {
        const newAchievement = achievementResult.newAchievements[0];
        await interaction.reply({
          content: `🎉 **Achievement Unlocked!** ${newAchievement.icon} ${newAchievement.name}\n${newAchievement.description}\n💎 +${newAchievement.points} points!`,
        });
      } else {
        const embed = new EmbedBuilder()
          .setTitle('⚔️ Character Created!')
          .setColor(0xff_a5_00)
          .setDescription(`Welcome, ${name} the ${charClass}!\n\n❤ HP: ${char.hp}/${char.maxHp}\n⚔ ATK: ${char.atk}\n🛡 DEF: ${char.def}\n💨 SPD: ${char.spd}\n💎 Gold: ${char.gold}`);
        await interaction.reply({ embeds: [embed] });
      }
      return;
    }

    if (sub === 'reset') {
      const char = getCharacter(userId);
      if (!char) return interaction.reply({ content: 'You have no character to reset.', flags: MessageFlags.Ephemeral });

      const modal = new ModalBuilder().setCustomId(`rpg_reset_confirm:${userId}`).setTitle('Confirm Character Reset');
      const textInput = new TextInputBuilder()
        .setCustomId('confirm_text')
        .setLabel('Type RESET to confirm')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(textInput));
      await interaction.showModal(modal);
      return;
    }

    const char = getCharacter(userId);
    if (!char && sub !== 'start') {
      return interaction.reply({
        content: 'You don\'t have a character! Use `/rpg start` to create one.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'stats' || sub === 'profile') {
      const embed = new EmbedBuilder()
        .setTitle(`👤 ${char.name} the ${char.class}`)
        .setColor(0x5865F2)
        .setDescription(`Level: ${char.lvl} | XP: ${char.xp}/${char.maxXp}`)
        .addFields(
          { name: '❤️ HP', value: `${char.hp}/${char.maxHp}`, inline: true },
          { name: '⚔️ ATK', value: `${char.atk}`, inline: true },
          { name: '🛡 DEF', value: `${char.def}`, inline: true },
          { name: '💨 SPD', value: `${char.spd}`, inline: true },
          { name: '💎 Gold', value: `${char.gold}`, inline: true },
          { name: '🏆 Wins', value: `${char.wins || 0}`, inline: true },
        );
      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (sub === 'inventory') {
      const action = interaction.options.getString('action');
      const itemParam = interaction.options.getString('item');

      // Inventory is stored as an object, not array
      const items = char.inventory || {};
      const inventoryList = Object.entries(items);

      if (!action || action === 'view') {
        const embed = new EmbedBuilder().setTitle('🎒 Inventory').setColor(0x7289da);
        if (inventoryList.length === 0) {
          embed.setDescription('Your inventory is empty!');
        } else {
          embed.setDescription(inventoryList.map(([id, item]) => `${typeof item === 'object' && item.name ? item.name : id} x${item.quantity || 1}`).join('\n') || 'Empty inventory');
        }
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      } else if (action === 'drop' || action === 'remove') {
        const success = removeItemFromInventory(userId, itemParam, 1);
        await interaction.reply({ content: success ? `✅ Dropped ${itemParam}` : '❌ Item not found or cannot be removed.', flags: MessageFlags.Ephemeral });
      } else if (action === 'equip') {
        const success = equipItem(userId, itemParam);
        await interaction.reply({ content: success ? `✅ Equipped ${itemParam}` : '❌ Cannot equip this item.', flags: MessageFlags.Ephemeral });
      } else if (action === 'unequip') {
        const slot = itemParam || (inventoryList.find(([id]) => id.includes('weapon')) ? 'weapon' : 'armor');
        const success = unequipItem(userId, slot);
        await interaction.reply({ content: success ? `✅ Unequipped ${slot}` : '❌ Nothing to unequip.', flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content: '❌ Unknown action. Use view/equip/unequip/drop', flags: MessageFlags.Ephemeral });
      }
      return;
    }

    if (sub === 'explore') {
      const charAfter = getCharacter(userId);
      // Simple exploration logic using available rpg.js functions
      const eventType = randomEventType();
      let message, xpGain = 0, goldGain = 0;

      if (eventType === 'combat') {
        const monster = encounterMonster(char.lvl);
        const result = fightTurn(char, monster);
        xpGain += Math.floor(monster.xpReward * 0.5);
        goldGain += Math.max(0, monster.goldReward - Math.floor(Math.random() * monster.goldReward));
        message = `🗡️ Found a ${monster.name} (Lv.${Math.round(monster.level)})! You dealt ${result.damage} damage!\n+${xpGain} XP, +${goldGain} gold`;
      } else if (eventType === 'treasure') {
        const itemValue = char.lvl * 5;
        xpGain += Math.floor(itemValue / 2);
        goldGain += itemValue;
        message = `💎 Discovered a treasure chest!\n+${xpGain} XP, +${goldGain} gold`;
      } else if (eventType === 'rest') {
        char.hp = char.maxHp;
        char.mp = char.maxMp;
        xpGain += 2;
        message = `🏕️ Found a safe resting spot! Fully restored your HP and MP.\n+${xpGain} XP`;
      } else if (eventType === 'trap') {
        const dmg = Math.floor(char.hp * 0.15);
        char.hp = Math.max(1, char.hp - dmg);
        xpGain += 3;
        message = `💥 Triggered a trap! Lost ${dmg} HP.\n+${xpGain} XP for surviving.`;
      } else {
        xpGain += char.lvl * 2;
        goldGain += char.lvl;
        message = `✨ Had an interesting encounter!\n+${xpGain} XP, +${goldGain} gold`;
      }

      const resultAfterApplyXp = applyXp(userId, charAfter, xpGain);
      if (goldGain > 0) charAfter.gold = (charAfter.gold || 0) + goldGain;
      saveCharacter(userId, charAfter);

      let finalMsg = message;
      if (resultAfterApplyXp.gained > 0) {
        finalMsg += `\n🎉 **LEVEL UP!** You are now level ${resultAfterApplyXp.newLvl}! (+${resultAfterApplyXp.gained} skill points)`;
      }

      await interaction.reply({ content: finalMsg, flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'upgrade') {
      const stat = interaction.options.getString('stat').toLowerCase();
      const validStats = ['hp', 'max_hp', 'atk', 'def', 'spd', 'mp', 'max_mp'];
      if (!validStats.includes(stat)) {
        return interaction.reply({ content: `❌ Invalid stat. Choose from: ${validStats.join(', ')}`, flags: MessageFlags.Ephemeral });
      }

      const cost = char.lvl * 20;
      if ((char.gold || 0) < cost) {
        return interaction.reply({ content: `❌ Not enough gold! Need ${cost} gold (you have ${char.gold || 0}).`, flags: MessageFlags.Ephemeral });
      }

      if ((char.skillPoints || 0) < 1) {
        return interaction.reply({ content: '❌ No skill points available! Level up to earn more.', flags: MessageFlags.Ephemeral });
      }

      char.gold -= cost;
      const oldValue = char[stat] || 0;
      char[stat] = oldValue + 1;
      if (stat === 'hp') char.maxHp = char.maxHp + 1;
      if (stat === 'mp') char.maxMp = char.maxMp + 1;

      saveCharacter(userId, char);

      await interaction.reply({ content: `✅ Upgraded ${stat.toUpperCase()}! ${oldValue} → ${char[stat]} (-${cost} gold, -1 skill point)`, flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'battle') {
      const enemyType = interaction.options.getString('enemy') || 'slime';
      let monster;
      const charLevel = char.lvl || 1;

      switch (enemyType) {
        case 'boss':
          monster = bossEncounter(Math.min(charLevel + 2, 20));
          break;
        default:
          monster = encounterMonster(charLevel);
          break;
      }

      // Turn-based combat simulation
      let rounds = 0;
      const maxRounds = 30;
      let battleLog = [`⚔️ **${char.name}** (Lv.${char.lvl}) vs ${monster.name}!`];

      while (char.hp > 0 && monster.hp > 0 && rounds < maxRounds) {
        rounds++;
        const playerHit = fightTurn(char, monster);
        battleLog.push(`Round ${rounds}: You hit for ${playerHit.damage} damage (${monster.hp}/${monster.maxHp} HP left)`);

        if (monster.hp <= 0) break;

        const monsterHit = fightTurn(monster, char);
        battleLog.push(`${monster.name} hits back for ${monsterHit.damage}! (${char.hp}/${char.maxHp} HP left)`);
      }

      let xpGain, goldGain, message;
      if (char.hp <= 0) {
        message = `💀 **You were defeated!**\n${monster.name} won in ${rounds} rounds.`;
        xpGain = Math.floor(monster.xpReward * 0.2);
        goldGain = 0;
      } else if (monster.hp <= 0) {
        message = `⚔️ **Victory!** You defeated ${monster.name} in ${rounds} rounds!`;
        xpGain = monster.xpReward || charLevel * 10;
        goldGain = monster.goldReward || charLevel * 5;
      } else {
        message = '🕐 Battle timed out after max rounds. It\'s a draw.';
        xpGain = charLevel * 3;
        goldGain = Math.floor(charLevel * 2);
      }

      const resultAfterApplyXp = applyXp(userId, char, xpGain);
      if (goldGain > 0) char.gold = (char.gold || 0) + goldGain;
      saveCharacter(userId, char);

      message += `\n+${xpGain} XP, +${goldGain} gold`;
      if (resultAfterApplyXp.gained > 0) {
        message += `\n🎉 **LEVEL UP!** You are now level ${resultAfterApplyXp.newLvl}! (+${resultAfterApplyXp.gained} skill points)`;
      }

      const embed = new EmbedBuilder()
        .setTitle(char.hp > 0 ? '⚔️ Battle Results' : '💀 Defeat')
        .setColor(char.hp > 0 ? 0x2ecc71 : 0xe74c3c)
        .setDescription(message)
        .setFooter({ text: `${battleLog.length} rounds fought` });

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'classes') {
      const classes = ['warrior', 'mage', 'rogue', 'cleric', 'ranger'];
      const icons = { warrior: '⚔️', mage: '🧙', rogue: '🗡️', cleric: '⛪', ranger: '🏹' };

      const embed = new EmbedBuilder().setTitle('👥 Character Classes').setColor(0x5865F2);
      for (const cls of classes) {
        const classInfo = getCharacterClassInfo(cls);
        if (!classInfo) continue;
        embed.addFields({
          name: `${icons[cls] || ''} ${cls.charAt(0).toUpperCase() + cls.slice(1)}`,
          value: `**Description:** ${classInfo.description}\n**Base Stats:** ❤️ ${classInfo.baseStats.hp} HP, ⚔️ ${classInfo.baseStats.atk} ATK, 🛡️ ${classInfo.baseStats.def} DEF, 💨 ${classInfo.baseStats.spd} SPD\n**Abilities:** ${classInfo.abilities.join(', ')}`,
          inline: false,
        });
      }

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'quest') {
      const action = interaction.options.getString('action');
      if (action === 'create') {
        const title = interaction.options.getString('title') || 'A simple quest';
        const desc = interaction.options.getString('desc') || 'Do something heroic.';
        const q = rpgCreateQuest(userId, title, desc);
        return interaction.reply({ content: `Quest created: ${q.title} (id=${q.id})`, flags: MessageFlags.Ephemeral });
      }
      if (action === 'list') {
        return interaction.reply({ content: 'Use `/rpg quest find` to discover a new quest.', flags: MessageFlags.Ephemeral });
      }
      if (action === 'find') {
        const q = generateRandomQuest(userId, char.lvl || 1);
        return interaction.reply({ content: `New quest available:\n**${q.title}**: ${q.desc}`, flags: MessageFlags.Ephemeral });
      }
      if (action === 'complete') {
        const result = completeQuest(userId, interaction.options.getString('id'));
        if (!result) return interaction.reply({ content: 'Quest not found or cannot be completed.', flags: MessageFlags.Ephemeral });
        return interaction.reply({ content: `🎉 Quest completed! +20 XP`, flags: MessageFlags.Ephemeral });
      }
      return interaction.reply({ content: 'Unknown quest action. Use create/list/find/complete', flags: MessageFlags.Ephemeral });
    }

    if (sub === 'craft') {
      const itemId = interaction.options.getString('item');
      const recipes = getCraftingRecipes();
      const recipe = Array.isArray(recipes) ? recipes.find((r) => r.id === itemId) : recipes[itemId];

      if (!recipe) {
        return interaction.reply({ content: `❌ "${itemId}" is not a craftable item.`, flags: MessageFlags.Ephemeral });
      }

      const canCraftResult = canCraftItem(userId, itemId);

      if (!canCraftResult) {
        return interaction.reply({ content: `❌ Cannot craft this item (requirements not met).`, flags: MessageFlags.Ephemeral });
      }

      const result = craftItem(userId, itemId);

      if (result) {
        await interaction.reply({ content: `🔨 Successfully crafted ${itemId}!`, flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content: '❌ Failed to craft item.', flags: MessageFlags.Ephemeral });
      }
      return;
    }

    // Fallback — unknown subcommand
    await interaction.reply({ content: '❌ Unknown RPG command.', flags: MessageFlags.Ephemeral });
  } catch (error) {
    logger.error('[RPG] Error in /rpg:', error);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '❌ Something went wrong with the RPG command.', flags: MessageFlags.Ephemeral });
      }
    } catch (_) { /* reply also failed, ignore */ }
  }
}

function getCharacterClassInfo(cls) {
  const classes = {
    warrior: {
      description: 'A mighty fighter clad in heavy armor.',
      baseStats: { hp: 120, atk: 15, def: 12, spd: 8 },
      abilities: ['Power Strike', 'Defensive Stance'],
    },
    mage: {
      description: 'A master of arcane magic and elemental power.',
      baseStats: { hp: 80, atk: 20, def: 6, spd: 10 },
      abilities: ['Fireball', 'Ice Wall', 'Mana Shield'],
    },
    rogue: {
      description: 'A cunning stealth fighter who strikes from shadows.',
      baseStats: { hp: 90, atk: 14, def: 7, spd: 18 },
      abilities: ['Backstab', 'Poison Blade'],
    },
    cleric: {
      description: 'A holy warrior who heals allies and smites evil.',
      baseStats: { hp: 100, atk: 10, def: 10, spd: 9 },
      abilities: ['Heal', 'Smite Evil'],
    },
    ranger: {
      description: 'An expert archer attuned with nature.',
      baseStats: { hp: 95, atk: 13, def: 8, spd: 15 },
      abilities: ['Piercing Shot', 'Nature\'s Blessing'],
    },
  };
  return classes[cls] || null;
}
