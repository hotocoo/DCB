import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';

import {
  getInventory,
  getItemInfo,
  getItemRarityInfo,
  useConsumableItem,
  equipItem,
  unequipItem,
  getInventoryValue,
  addItemToInventory,
  generateRandomItem,
  getCharacter,
  saveCharacter,
  removeItemFromInventory
} from '../rpg.js';
import { CommandError, handleCommandError } from '../errorHandler';

export const data = new SlashCommandBuilder()
  .setName('inventory')
  .setDescription('Manage your RPG inventory and equipment')
  .addSubcommand(sub => sub.setName('view').setDescription('View your inventory and equipment'))
  .addSubcommand(sub => sub.setName('use').setDescription('Use a consumable item').addStringOption(opt => opt.setName('item').setDescription('Item to use').setRequired(true)))
  .addSubcommand(sub => sub.setName('equip').setDescription('Equip a weapon or armor').addStringOption(opt => opt.setName('item').setDescription('Item to equip').setRequired(true)))
  .addSubcommand(sub => sub.setName('unequip').setDescription('Unequip weapon or armor').addStringOption(opt => opt.setName('slot').setDescription('weapon|armor').setRequired(true)));

export async function execute(interaction) {
  try {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    // Input validation
    if (!userId) {
      throw new CommandError('Invalid user ID', 'VALIDATION_ERROR');
    }

    switch (sub) {
      case 'view': {
        const inventory = getInventory(userId);
        const inventoryValue = getInventoryValue(userId);

        if (!inventory || Object.keys(inventory).length === 0) {
          return interaction.reply({ content: '🛄 Your inventory is empty. Go explore to find items!', flags: MessageFlags.Ephemeral });
        }

        // Group items by type
        const itemsByType = {};
        for (const [itemId, quantity] of Object.entries(inventory)) {
          const item = getItemInfo(itemId);
          if (item) {
            if (!itemsByType[item.type]) itemsByType[item.type] = [];
            itemsByType[item.type].push({ itemId, ...item, quantity });
          }
        }

        const embed = new EmbedBuilder()
          .setTitle(`🛄 ${interaction.user.username}'s Inventory`)
          .setColor(0x00_99_FF)
          .setDescription(`💰 Total Value: ${inventoryValue} gold`);

        // Add equipped items section
        const character = getCharacter(userId);
        if (character && (character.equipped?.weapon || character.equipped?.armor)) {
          const equippedItems = [];
          if (character.equipped.weapon) {
            const weapon = getItemInfo(character.equipped.weapon);
            if (weapon) equippedItems.push(`⚔️ ${weapon.name}`);
          }
          if (character.equipped.armor) {
            const armor = getItemInfo(character.equipped.armor);
            if (armor) equippedItems.push(`🛡️ ${armor.name}`);
          }
          embed.addFields({
            name: '⚡ Equipped',
            value: equippedItems.join('\n') || 'None',
            inline: true
          });
        }

        // Add buttons for inventory actions
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`inventory_refresh:${userId}`).setLabel('🔄 Refresh').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`inventory_random:${userId}`).setLabel('🎲 Get Random Item').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`inventory_sell_all:${userId}`).setLabel('💰 Sell All Junk').setStyle(ButtonStyle.Success)
        );

        await interaction.reply({ embeds: [embed], components: [row] });

        // Update embed with actual inventory data
        await updateInventoryEmbed(interaction, itemsByType, inventoryValue);

        break;
      }
      case 'use': {
        const itemName = interaction.options.getString('item');
        const inventory = getInventory(userId);

        // Find item by name
        let targetItemId = null;
        for (const [itemId, quantity] of Object.entries(inventory)) {
          const item = getItemInfo(itemId);
          if (item && item.name.toLowerCase() === itemName.toLowerCase()) {
            targetItemId = itemId;
            break;
          }
        }

        if (!targetItemId) {
          return interaction.reply({ content: `❌ You don't have "${itemName}" in your inventory.`, flags: MessageFlags.Ephemeral });
        }

        // Validate item is consumable
        const item = getItemInfo(targetItemId);
        if (!item || item.type !== 'consumable') {
          return interaction.reply({ content: `❌ "${itemName}" is not a consumable item.`, flags: MessageFlags.Ephemeral });
        }

        const result = useConsumableItem(userId, targetItemId);
        if (!result.success) {
          return interaction.reply({ content: `❌ ${result.reason}`, flags: MessageFlags.Ephemeral });
        }

        let response = `✅ Used ${getItemInfo(targetItemId).name}!`;
        if (result.effects.hp_restored) {
          response += `\n❤️ Restored ${result.effects.hp_restored} HP`;
        }
        if (result.effects.revive) {
          response += '\n🔮 You have been revived!';
        }

        await interaction.reply({ content: response });

        break;
      }
      case 'equip': {
        const itemName = interaction.options.getString('item');
        const inventory = getInventory(userId);

        // Find item by name
        let targetItemId = null;
        for (const [itemId, quantity] of Object.entries(inventory)) {
          const item = getItemInfo(itemId);
          if (item && item.name.toLowerCase() === itemName.toLowerCase()) {
            targetItemId = itemId;
            break;
          }
        }

        if (!targetItemId) {
          return interaction.reply({ content: `❌ You don't have "${itemName}" in your inventory.`, flags: MessageFlags.Ephemeral });
        }

        const item = getItemInfo(targetItemId);
        if (item.type !== 'weapon' && item.type !== 'armor') {
          return interaction.reply({ content: `❌ You can only equip weapons and armor, not ${item.type}s.`, flags: MessageFlags.Ephemeral });
        }

        const character = getCharacter(userId);
        if (!character) {
          return interaction.reply({ content: '❌ You need a character first. Use `/rpg start` to create one.', flags: MessageFlags.Ephemeral });
        }

        const slot = item.type === 'weapon' ? 'weapon' : 'armor';

        // Check if item is already equipped
        if (character.equipped && character.equipped[slot] === targetItemId) {
          return interaction.reply({ content: `❌ **${item.name}** is already equipped in the ${slot} slot.`, flags: MessageFlags.Ephemeral });
        }

        // Unequip current item in that slot if any
        if (character.equipped && character.equipped[slot]) {
          const currentItemId = character.equipped[slot];
          const currentItem = getItemInfo(currentItemId);
          if (currentItem) {
            addItemToInventory(userId, currentItemId, 1);
          }
        }

        // Equip new item
        if (!character.equipped) character.equipped = {};
        character.equipped[slot] = targetItemId;
        removeItemFromInventory(userId, targetItemId, 1);
        saveCharacter(userId, character);

        await interaction.reply({ content: `✅ Equipped **${item.name}** in ${slot} slot!` });

        break;
      }
      case 'unequip': {
        const slot = interaction.options.getString('slot');

        if (slot !== 'weapon' && slot !== 'armor') {
          return interaction.reply({ content: '❌ Invalid slot. Use weapon or armor.', flags: MessageFlags.Ephemeral });
        }

        const character = getCharacter(userId);
        if (!character) {
          return interaction.reply({ content: '❌ You need a character first. Use `/rpg start` to create one.', flags: MessageFlags.Ephemeral });
        }

        if (!character.equipped || !character.equipped[slot]) {
          return interaction.reply({ content: `❌ You don't have anything equipped in the ${slot} slot.`, flags: MessageFlags.Ephemeral });
        }

        const itemId = character.equipped[slot];
        const item = getItemInfo(itemId);

        // Add item back to inventory
        addItemToInventory(userId, itemId, 1);

        // Unequip item
        character.equipped[slot] = null;
        saveCharacter(userId, character);

        await interaction.reply({ content: `✅ Unequipped **${item.name}** from ${slot} slot!` });

        break;
      }
    // No default
    }
  }
  catch (error) {
    return handleCommandError(interaction, error);
  }
}

// Helper function to update inventory embed
async function updateInventoryEmbed(interaction, itemsByType, inventoryValue) {
  const embed = EmbedBuilder.from(interaction.message.embeds[0])
    .setDescription(`💰 Total Value: ${inventoryValue} gold`);

  const fields = [];

  for (const [type, items] of Object.entries(itemsByType)) {
    const typeEmoji = {
      weapon: '⚔️',
      armor: '🛡️',
      consumable: '🧪',
      material: '🔩'
    }[type] || '📦';

    const itemList = items.map(item => {
      const rarityInfo = getItemRarityInfo(item.rarity);
      return `${typeEmoji} **${item.name}** (${item.quantity}x)`;
    }).join('\n');

    fields.push({
      name: `${typeEmoji} ${type.charAt(0).toUpperCase() + type.slice(1)}s`,
      value: itemList || 'None',
      inline: true
    });
  }

  // Clear existing fields and add new ones
  embed.setFields(fields);
  await interaction.editReply({ embeds: [embed] });
}
