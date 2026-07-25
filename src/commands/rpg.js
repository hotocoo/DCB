import {
import { sanitizeInput } from '../validation.js'
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
  upgradeStat,
  gainXp,
  addItemToInventory,
  removeItemFromInventory,
  equipItem,
  useItem,
  getItemsByRarity,
  combatRound,
  exploreLocation,
  findQuest,
  acceptQuest,
  completeQuest,
  startQuest,
  listQuests,
  createQuest,
  canCraftItem,
  craftItem,
  getCraftingRecipes,
} from '../rpg.js';
import { updateUserStats } from '../achievements.js';

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

      if (!action || action === 'view') {
        const items = char.inventory || [];
        const embed = new EmbedBuilder().setTitle('🎒 Inventory').setColor(0x7289da);
        if (items.length === 0) {
          embed.setDescription('Your inventory is empty!');
        } else {
          embed.setDescription(items.map((i) => `${i.icon || '📦'} ${i.name} x${i.quantity || 1}`).join('\n') || 'Empty inventory');
        }
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      } else {
        const result = action === 'use' ? useItem(userId, itemParam) : action === 'equip' ? equipItem(userId, itemParam) : removeItemFromInventory(userId, itemParam);
        await interaction.reply({
          content: result.success ? `✅ ${result.message}` : `❌ ${result.reason}`,
          flags: MessageFlags.Ephemeral,
        });
      }
      return;
    }

    if (sub === 'explore') {
      const location = interaction.options.getString('location') || 'random';
      const result = exploreLocation(userId, location);
      await interaction.reply({ content: result.message, flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'upgrade') {
      const stat = interaction.options.getString('stat');
      const result = upgradeStat(userId, stat);
      await interaction.reply({
        content: result.success ? `✅ Upgraded ${stat.toUpperCase()}! New value: ${result.newValue}` : `❌ Failed to upgrade: ${result.reason}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'battle') {
      const enemyType = interaction.options.getString('enemy') || 'slime';
      let result;
      try {
        result = await combatRound(userId, enemyType);
      } catch (e) {
        console.error(`[RPG] Battle error for ${userId}:`, e);
        return interaction.reply({ content: '❌ Something went wrong during battle.', flags: MessageFlags.Ephemeral });
      }

      const embed = new EmbedBuilder()
        .setTitle(result.victory ? '⚔️ Victory!' : '💀 Defeat...')
        .setColor(result.victory ? 0x2ecc71 : 0xe74c3c)
        .setDescription(result.message);
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
        const q = createQuest(userId, title, desc);
        return interaction.reply({ content: `Quest created: ${q.title} (id=${q.id})`, flags: MessageFlags.Ephemeral });
      }
      if (action === 'list') {
        const qs = listQuests(userId);
        if (qs.length === 0) return interaction.reply({ content: 'No quests.', flags: MessageFlags.Ephemeral });
        return interaction.reply(qs.map((q) => `${q.id} - ${q.title} [${q.status}]`).join('\n'));
      }
      if (action === 'complete') {
        const id = interaction.options.getString('id');
        const q = completeQuest(userId, id);
        if (!q) return interaction.reply({ content: 'Quest not found.', flags: MessageFlags.Ephemeral });
        const rewardText = q.xpReward && q.goldReward ? `\n🎉 **Rewards:** ${q.xpReward} XP, ${q.goldReward} gold!` : '';
        return interaction.reply({ content: `Quest completed: ${q.title}${rewardText}`, flags: MessageFlags.Ephemeral });
      }
      return interaction.reply({ content: 'Unknown quest action. Use create|list|complete', flags: MessageFlags.Ephemeral });
    }

    if (sub === 'craft') {
      const itemId = interaction.options.getString('item');
      const recipes = getCraftingRecipes();

      if (!recipes[itemId]) {
        return interaction.reply({ content: `❌ "${itemId}" is not a craftable item.`, flags: MessageFlags.Ephemeral });
      }

      const canCraft = canCraftItem(userId, itemId);

      if (!canCraft.success) {
        if (canCraft.reason === 'level_too_low') {
          return interaction.reply({ content: `❌ You need to be level ${canCraft.required} to craft this item.`, flags: MessageFlags.Ephemeral });
        } else if (canCraft.reason === 'missing_materials') {
          return interaction.reply({ content: `❌ You're missing materials. You need: ${canCraft.missing}`, flags: MessageFlags.Ephemeral });
        }
        return interaction.reply({ content: `❌ Cannot craft this item: ${canCraft.reason}`, flags: MessageFlags.Ephemeral });
      }

      const result = craftItem(userId, itemId);

      if (result.success) {
        const recipe = recipes[itemId];
        const embed = new EmbedBuilder()
          .setTitle('🔨 Item Crafted!')
          .setColor(0x00_ff_00)
          .setDescription(`Successfully crafted **${result.item.name}**!`)
          .addFields(
            { name: '📦 Item', value: `${result.item.name} (${result.item.rarity})`, inline: true },
            { name: '⭐ XP Gained', value: `${result.xpGained} XP`, inline: true },
            { name: '📋 Description', value: result.item.description, inline: false },
          );

        // Track crafting achievement
        updateUserStats(userId, { items_crafted: 1 });

        await interaction.reply({ embeds: [embed] });
      } else {
        await interaction.reply({ content: `❌ Failed to craft item: ${result.reason}`, flags: MessageFlags.Ephemeral });
      }
      return;
    }

    // Fallback — unknown subcommand  
    await interaction.reply({ content: '❌ Unknown RPG command.', flags: MessageFlags.Ephemeral });
  } catch (error) {
    console.error('[RPG] Error in /rpg:', error);
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
