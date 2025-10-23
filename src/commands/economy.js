import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import {
  getBalance,
  addBalance,
  transferBalance,
  createBusiness,
  collectBusinessIncome,
  getMarketPrice,
  buyFromMarket,
  sellToMarket,
  getUserEconomyStats,
  getTransactionHistory,
  createLottery,
  getUserBusinesses,
  claimDailyReward
} from '../economy.js';

export const data = new SlashCommandBuilder()
  .setName('economy')
  .setDescription('Advanced economy system with banking, businesses, and marketplace')
  .addSubcommand(sub => sub.setName('balance').setDescription('Check your gold balance').addUserOption(opt => opt.setName('user').setDescription('User to check')))
  .addSubcommand(sub => sub.setName('transfer').setDescription('Transfer gold to another user')
    .addUserOption(opt => opt.setName('user').setDescription('User to transfer to').setRequired(true))
    .addIntegerOption(opt => opt.setName('amount').setDescription('Amount to transfer').setRequired(true)))
  .addSubcommand(sub => sub.setName('business').setDescription('Business management')
    .addStringOption(opt => opt.setName('action').setDescription('create|collect|list').setRequired(true))
    .addStringOption(opt => opt.setName('type').setDescription('shop|farm|mine|factory|bank|casino'))
    .addIntegerOption(opt => opt.setName('investment').setDescription('Initial investment amount')))
  .addSubcommand(sub => sub.setName('market').setDescription('Marketplace').addStringOption(opt => opt.setName('action').setDescription('buy|sell|prices').setRequired(true)).addStringOption(opt => opt.setName('item').setDescription('Item to buy/sell')).addIntegerOption(opt => opt.setName('quantity').setDescription('Quantity')))
  .addSubcommand(sub => sub.setName('lottery').setDescription('Play the lottery').addIntegerOption(opt => opt.setName('ticket_price').setDescription('Ticket price').setRequired(true)))
  .addSubcommand(sub => sub.setName('history').setDescription('Transaction history').addIntegerOption(opt => opt.setName('limit').setDescription('Number of transactions')))
  .addSubcommand(sub => sub.setName('stats').setDescription('Economy statistics'))
  .addSubcommand(sub => sub.setName('daily').setDescription('Claim your daily reward'));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'balance') {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const balance = getBalance(targetUser.id);

    const embed = new EmbedBuilder()
      .setTitle('💰 Balance Check')
      .setColor(0xFFD700)
      .setDescription(`**${targetUser.username}** has **${balance}** gold coins.`)
      .setThumbnail(targetUser.displayAvatarURL());

    if (targetUser.id === interaction.user.id) {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`economy_transfer:${interaction.user.id}`).setLabel('💸 Transfer').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`economy_market:${interaction.user.id}`).setLabel('🛒 Market').setStyle(ButtonStyle.Secondary)
      );
      await interaction.reply({ embeds: [embed], components: [row] });
    } else {
      await interaction.reply({ embeds: [embed] });
    }

  } else if (sub === 'transfer') {
    const targetUser = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');

    if (targetUser.id === interaction.user.id) {
      return interaction.reply({ content: '❌ You cannot transfer gold to yourself!', ephemeral: true });
    }

    if (amount <= 0) {
      return interaction.reply({ content: '❌ Transfer amount must be positive!', ephemeral: true });
    }

    const balance = getBalance(interaction.user.id);
    if (balance < amount) {
      return interaction.reply({ content: `❌ Insufficient funds! You have ${balance} gold but need ${amount} gold.`, ephemeral: true });
    }

    const result = transferBalance(interaction.user.id, targetUser.id, amount);

    if (result.success) {
      const embed = new EmbedBuilder()
        .setTitle('💸 Transfer Complete!')
        .setColor(0x00FF00)
        .setDescription(`Successfully transferred **${amount}** gold to **${targetUser.username}**!`)
        .addFields(
          { name: 'From', value: interaction.user.username, inline: true },
          { name: 'To', value: targetUser.username, inline: true },
          { name: 'Amount', value: `${amount} gold`, inline: true }
        );

      await interaction.reply({ embeds: [embed] });
    } else {
      await interaction.reply({ content: `❌ Transfer failed: ${result.reason}`, ephemeral: true });
    }

  } else if (sub === 'business') {
    const action = interaction.options.getString('action');

    if (action === 'create') {
      const businessType = interaction.options.getString('type');
      const investment = interaction.options.getInteger('investment') || 100;

      const validTypes = ['shop', 'farm', 'mine', 'factory', 'bank', 'casino'];
      if (!validTypes.includes(businessType)) {
        return interaction.reply({ content: '❌ Invalid business type. Use: shop, farm, mine, factory, bank, casino', ephemeral: true });
      }

      if (investment < 50) {
        return interaction.reply({ content: '❌ Minimum investment is 50 gold.', ephemeral: true });
      }

      const result = createBusiness(interaction.user.id, businessType, investment);

      if (result.success) {
        const embed = new EmbedBuilder()
          .setTitle('🏪 Business Created!')
          .setColor(0x00FF00)
          .setDescription(`You opened a **${businessType}** with ${investment} gold investment!`)
          .addFields(
            { name: '💼 Type', value: businessType, inline: true },
            { name: '💰 Investment', value: `${investment} gold`, inline: true },
            { name: '📈 Income', value: `~${result.business.income}/hour`, inline: true }
          );

        await interaction.reply({ embeds: [embed] });
      } else {
        await interaction.reply({ content: `❌ Failed to create business: ${result.reason}`, ephemeral: true });
      }

    } else if (action === 'collect') {
      const result = collectBusinessIncome(interaction.user.id);

      if (result.success) {
        if (result.income > 0) {
          const embed = new EmbedBuilder()
            .setTitle('💰 Business Income Collected!')
            .setColor(0x00FF00)
            .setDescription(`Collected **${result.income}** gold from your ${result.businesses} business(es)!`);

          await interaction.reply({ embeds: [embed] });
        } else {
          await interaction.reply({ content: '💤 No income available to collect yet. Check back later!', ephemeral: true });
        }
      } else {
        await interaction.reply({ content: `❌ ${result.reason}`, ephemeral: true });
      }

    } else if (action === 'list') {
      const businesses = getUserBusinesses(interaction.user.id);

      if (businesses.length === 0) {
        return interaction.reply({ content: '🏢 You have no businesses yet. Use `/economy business action:create` to start one!', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle('🏢 Your Businesses')
        .setColor(0xFFD700)
        .setDescription('Manage your business empire!');

      businesses.forEach((business, index) => {
        const now = Date.now();
        const hoursSinceCollection = (now - business.lastCollected) / (1000 * 60 * 60);
        const pendingIncome = Math.floor(business.income * hoursSinceCollection);

        embed.addFields({
          name: `${index + 1}. ${business.type.charAt(0).toUpperCase() + business.type.slice(1)} (${business.level})`,
          value: `💰 Income: ${business.income}/hour\n🕐 Pending: ${pendingIncome} gold\n👥 Employees: ${business.employees}\n🔧 Upgrades: ${business.upgrades}`,
          inline: true
        });
      });

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }

  } else if (sub === 'market') {
    const action = interaction.options.getString('action');
    const item = interaction.options.getString('item');
    const quantity = interaction.options.getInteger('quantity') || 1;

    if (action === 'prices') {
      const embed = new EmbedBuilder()
        .setTitle('📈 Market Prices')
        .setColor(0x0099FF);

      const items = ['health_potion', 'mana_potion', 'iron_ore', 'magic_crystal', 'dragon_scale'];
      items.forEach(itemId => {
        const price = getMarketPrice(itemId);
        embed.addFields({
          name: itemId.replace('_', ' ').toUpperCase(),
          value: `💰 ${price} gold each`,
          inline: true
        });
      });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`economy_buy:${interaction.user.id}`).setLabel('🛒 Buy').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`economy_sell:${interaction.user.id}`).setLabel('💸 Sell').setStyle(ButtonStyle.Success)
      );

      await interaction.reply({ embeds: [embed], components: [row] });

    } else if (action === 'buy') {
      if (!item) {
        return interaction.reply({ content: '❌ Please specify an item to buy!', ephemeral: true });
      }

      const price = getMarketPrice(item);
      const totalCost = price * quantity;

      const result = buyFromMarket(interaction.user.id, item, quantity);

      if (result.success) {
        const embed = new EmbedBuilder()
          .setTitle('🛒 Purchase Complete!')
          .setColor(0x00FF00)
          .setDescription(`Bought **${quantity}x ${item}** for **${totalCost}** gold!`)
          .addFields(
            { name: '📦 Item', value: item, inline: true },
            { name: '🔢 Quantity', value: quantity, inline: true },
            { name: '💰 Price per Unit', value: `${price} gold`, inline: true }
          );

        await interaction.reply({ embeds: [embed] });
      } else {
        await interaction.reply({ content: `❌ Purchase failed: ${result.reason}`, ephemeral: true });
      }

    } else if (action === 'sell') {
      if (!item) {
        return interaction.reply({ content: '❌ Please specify an item to sell!', ephemeral: true });
      }

      const sellPrice = Math.floor(getMarketPrice(item) * 0.8);
      const totalEarnings = sellPrice * quantity;

      const result = sellToMarket(interaction.user.id, item, quantity);

      if (result.success) {
        const embed = new EmbedBuilder()
          .setTitle('💸 Sale Complete!')
          .setColor(0x00FF00)
          .setDescription(`Sold **${quantity}x ${item}** for **${totalEarnings}** gold!`)
          .addFields(
            { name: '📦 Item', value: item, inline: true },
            { name: '🔢 Quantity', value: quantity, inline: true },
            { name: '💰 Earnings', value: `${totalEarnings} gold`, inline: true }
          );

        await interaction.reply({ embeds: [embed] });
      } else {
        await interaction.reply({ content: `❌ Sale failed: ${result.reason}`, ephemeral: true });
      }
    }

  } else if (sub === 'lottery') {
    const ticketPrice = interaction.options.getInteger('ticket_price');

    if (ticketPrice <= 0) {
      return interaction.reply({ content: '❌ Ticket price must be positive!', ephemeral: true });
    }

    const currentBalance = getBalance(interaction.user.id);
    if (currentBalance < ticketPrice) {
      return interaction.reply({ content: `❌ Insufficient funds! You need ${ticketPrice} gold but only have ${currentBalance}.`, ephemeral: true });
    }

    // Simple lottery with 1/1000 chance of winning
    const prizePool = ticketPrice * 10; // 10x return for winners
    const result = createLottery(interaction.user.id, ticketPrice, prizePool);

    if (result.success) {
      if (result.isWinner) {
        const embed = new EmbedBuilder()
          .setTitle('🎉 LOTTERY WINNER!')
          .setColor(0xFFD700)
          .setDescription(`🎊 **JACKPOT!** You won the lottery!`)
          .addFields(
            { name: '🎫 Your Number', value: result.lotteryNumber, inline: true },
            { name: '🏆 Winning Number', value: result.winningNumber, inline: true },
            { name: '💰 Prize', value: `${result.winnings} gold!`, inline: true }
          );

        await interaction.reply({ embeds: [embed] });
      } else {
        await interaction.reply({ content: `🎫 **Lottery Ticket Purchased!**\nYour number: **${result.lotteryNumber}**\n💰 Cost: ${ticketPrice} gold\n🏆 Jackpot: ${prizePool} gold\n\n*Better luck next time!*`, ephemeral: true });
      }
    }

  } else if (sub === 'history') {
    const limit = interaction.options.getInteger('limit') || 10;
    const transactions = getTransactionHistory(interaction.user.id, limit);

    if (transactions.length === 0) {
      return interaction.reply({ content: '📋 No transaction history found.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('📋 Transaction History')
      .setColor(0x0099FF)
      .setDescription(`Your recent ${transactions.length} transactions`);

    transactions.forEach((txn, index) => {
      const timestamp = new Date(txn.timestamp).toLocaleString();
      const amount = txn.amount > 0 ? `+${txn.amount}` : txn.amount;

      embed.addFields({
        name: `${index + 1}. ${txn.type.toUpperCase()}`,
        value: `💰 **${amount}** gold\n📅 ${timestamp}`,
        inline: true
      });
    });

    await interaction.reply({ embeds: [embed], ephemeral: true });

  } else if (sub === 'stats') {
    const stats = getUserEconomyStats(interaction.user.id);
    const balance = getBalance(interaction.user.id);

    const embed = new EmbedBuilder()
      .setTitle('📊 Economy Statistics')
      .setColor(0xFFD700)
      .setDescription(`**${interaction.user.username}**'s financial overview`)
      .addFields(
        { name: '💰 Current Balance', value: `${balance} gold`, inline: true },
        { name: '📈 Total Income', value: `${stats.totalIncome} gold`, inline: true },
        { name: '📉 Total Expenses', value: `${stats.totalExpenses} gold`, inline: true },
        { name: '🏆 Net Worth', value: `${stats.netWorth} gold`, inline: true },
        { name: '🏢 Businesses', value: stats.businesses, inline: true },
        { name: '📈 Investments', value: stats.investments, inline: true },
        { name: '💼 Transactions', value: stats.transactionCount, inline: true }
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`economy_business:${interaction.user.id}`).setLabel('🏪 Manage Business').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`economy_invest:${interaction.user.id}`).setLabel('📈 Investments').setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  } else if (sub === 'daily') {
    const result = claimDailyReward(interaction.user.id);

    if (result.success) {
      const embed = new EmbedBuilder()
        .setTitle('🎁 Daily Reward Claimed!')
        .setColor(0x00FF00)
        .setDescription(`You claimed your daily reward!`)
        .addFields(
          { name: '💰 Reward', value: `${result.reward} gold`, inline: true },
          { name: '🔥 Streak', value: `${result.streak} days`, inline: true }
        );

      await interaction.reply({ embeds: [embed] });
    } else {
      const embed = new EmbedBuilder()
        .setTitle('⏰ Daily Reward Not Available')
        .setColor(0xFFA500)
        .setDescription(`Your daily reward will be available in ${result.hoursLeft} hours.`);

      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
}