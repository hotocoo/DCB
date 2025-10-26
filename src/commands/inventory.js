import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
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

export const data = new SlashCommandBuilder()
  .setName('inventory')
  .setDescription('Manage your RPG inventory and equipment')
  .addSubcommand(sub => sub.setName('view').setDescription('View your inventory and equipment'))
  .addSubcommand(sub => sub.setName('use').setDescription('Use a consumable item').addStringOption(opt => opt.setName('item').setDescription('Item to use').setRequired(true)))
  .addSubcommand(sub => sub.setName('equip').setDescription('Equip a weapon or armor').addStringOption(opt => opt.setName('item').setDescription('Item to equip').setRequired(true)))
  .addSubcommand(sub => sub.setName('unequip').setDescription('Unequip weapon or armor').addStringOption(opt => opt.setName('slot').setDescription('weapon|armor').setRequired(true)));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const userId = interaction.user.id;

  if (sub === 'view') {
    const inventory = getInventory(userId);
    const inventoryValue = getInventoryValue(userId);

    if (Object.keys(inventory).length === 0) {
      return interaction.reply({ content: '🛄 Your inventory is empty. Go explore to find items!', ephemeral: true });
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
      .setColor(0x0099FF)
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

  } else if (sub === 'use') {
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
      return interaction.reply({ content: `❌ You don't have "${itemName}" in your inventory.`, ephemeral: true });
    }

    const result = useConsumableItem(userId, targetItemId);
    if (!result.success) {
      return interaction.reply({ content: `❌ ${result.reason}`, ephemeral: true });
    }

    let response = `✅ Used ${getItemInfo(targetItemId).name}!`;
    if (result.effects.hp_restored) {
      response += `\n❤️ Restored ${result.effects.hp_restored} HP`;
    }
    if (result.effects.revive) {
      response += `\n🔮 You have been revived!`;
    }

    await interaction.reply({ content: response });
  } else if (sub === 'equip') {
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
      return interaction.reply({ content: `❌ You don't have "${itemName}" in your inventory.`, ephemeral: true });
    }

    const item = getItemInfo(targetItemId);
    if (item.type !== 'weapon' && item.type !== 'armor') {
      return interaction.reply({ content: `❌ You can only equip weapons and armor, not ${item.type}s.`, ephemeral: true });
    }

    const character = getCharacter(userId);
    if (!character) {
      return interaction.reply({ content: '❌ You need a character first. Use /rpg start', ephemeral: true });
    }

    const slot = item.type === 'weapon' ? 'weapon' : 'armor';

    // Unequip current item in that slot if any
    if (character.equipped && character.equipped[slot]) {
      const currentItem = getItemInfo(character.equipped[slot]);
      addItemToInventory(userId, character.equipped[slot], 1);
    }

    // Equip new item
    if (!character.equipped) character.equipped = {};
    character.equipped[slot] = targetItemId;
    removeItemFromInventory(userId, targetItemId, 1);
    saveCharacter(userId, character);

    await interaction.reply({ content: `✅ Equipped **${item.name}** in ${slot} slot!` });
  } else if (sub === 'unequip') {
    const slot = interaction.options.getString('slot');

    if (slot !== 'weapon' && slot !== 'armor') {
      return interaction.reply({ content: '❌ Invalid slot. Use weapon or armor.', ephemeral: true });
    }

    const character = getCharacter(userId);
    if (!character) {
      return interaction.reply({ content: '❌ You need a character first. Use /rpg start', ephemeral: true });
    }

    if (!character.equipped || !character.equipped[slot]) {
      return interaction.reply({ content: `❌ You don't have anything equipped in the ${slot} slot.`, ephemeral: true });
    }

    const itemId = character.equipped[slot];
    const item = getItemInfo(itemId);

    // Add item back to inventory
    addItemToInventory(userId, itemId, 1);

    // Unequip item
    character.equipped[slot] = null;
    saveCharacter(userId, character);

    await interaction.reply({ content: `✅ Unequipped **${item.name}** from ${slot} slot!` });
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