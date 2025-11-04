import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';

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
import { safeExecuteCommand, CommandError, validateRange, validateNotEmpty, validateUser } from '../errorHandler.js';

export const data = new SlashCommandBuilder()
  .setName('economy')
  .setDescription('Advanced economy system with banking, businesses, and marketplace')
  .addSubcommand(sub => sub.setName('balance').setDescription('Check your gold balance').addUserOption(opt => opt.setName('user').setDescription('User to check')))
  .addSubcommand(sub => sub.setName('transfer').setDescription('Transfer gold to another user')
    .addUserOption(opt => opt.setName('user').setDescription('User to transfer to').setRequired(true))
    .addIntegerOption(opt => opt.setName('amount').setDescription('Amount to transfer').setRequired(true)))
  .addSubcommand(sub => sub.setName('business').setDescription('Business management')
    .addStringOption(opt => opt.setName('action').setDescription('create|collect|list|upgrade').setRequired(true))
    .addStringOption(opt => opt.setName('type').setDescription('shop|farm|mine|factory|bank|casino|restaurant|tech|trading'))
    .addIntegerOption(opt => opt.setName('investment').setDescription('Initial investment amount'))
    .addStringOption(opt => opt.setName('business_id').setDescription('Business ID to upgrade')))
  .addSubcommand(sub => sub.setName('market').setDescription('Marketplace').addStringOption(opt => opt.setName('action').setDescription('buy|sell|prices').setRequired(true)).addStringOption(opt => opt.setName('item').setDescription('Item to buy/sell')).addIntegerOption(opt => opt.setName('quantity').setDescription('Quantity')))
  .addSubcommand(sub => sub.setName('lottery').setDescription('Play the lottery').addIntegerOption(opt => opt.setName('ticket_price').setDescription('Ticket price').setRequired(true)))
  .addSubcommand(sub => sub.setName('history').setDescription('Transaction history').addIntegerOption(opt => opt.setName('limit').setDescription('Number of transactions')))
  .addSubcommand(sub => sub.setName('stats').setDescription('Economy statistics'))
  .addSubcommand(sub => sub.setName('daily').setDescription('Claim your daily reward'));

export async function execute(interaction) {
  return safeExecuteCommand(interaction, async() => {
    const sub = interaction.options.getSubcommand();

    switch (sub) {
      case 'balance': {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const balance = getBalance(targetUser.id);

        const embed = new EmbedBuilder()
          .setTitle('💰 Balance Check')
          .setColor(0xFF_D7_00)
          .setDescription(`**${targetUser.username}** has **${balance}** gold coins.`)
          .setThumbnail(targetUser.displayAvatarURL());

        if (targetUser.id === interaction.user.id) {
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`economy_transfer:${interaction.user.id}`).setLabel('💸 Transfer').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`economy_market:${interaction.user.id}`).setLabel('🛒 Market').setStyle(ButtonStyle.Secondary)
          );
          await interaction.reply({ embeds: [embed], components: [row] });
        }
        else {
          await interaction.reply({ embeds: [embed] });
        }

        break;
      }
      case 'transfer': {
        const targetUser = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');

        // Validate user input
        validateNotEmpty(targetUser, 'target user');
        validateRange(amount, 1, Number.MAX_SAFE_INTEGER, 'transfer amount');

        if (targetUser.id === interaction.user.id) {
          throw new CommandError('You cannot transfer gold to yourself!', 'INVALID_ARGUMENT');
        }

        const balance = getBalance(interaction.user.id);
        if (balance < amount) {
          throw new CommandError(`Insufficient funds! You have ${balance} gold but need ${amount} gold.`, 'INSUFFICIENT_FUNDS');
        }

        const result = transferBalance(interaction.user.id, targetUser.id, amount);

        if (result.success) {
          const embed = new EmbedBuilder()
            .setTitle('💸 Transfer Complete!')
            .setColor(0x00_FF_00)
            .setDescription(`Successfully transferred **${amount}** gold to **${targetUser.username}**!`)
            .addFields(
              { name: 'From', value: interaction.user.username, inline: true },
              { name: 'To', value: targetUser.username, inline: true },
              { name: 'Amount', value: `${amount} gold`, inline: true }
            );

          await interaction.reply({ embeds: [embed] });
        }
        else {
          throw new CommandError(`Transfer failed: ${result.reason}`, 'COMMAND_ERROR');
        }

        break;
      }
      case 'business': {
        const action = interaction.options.getString('action');

        switch (action) {
          case 'create': {
            const businessType = interaction.options.getString('type');
            const investment = interaction.options.getInteger('investment') || 100;

            // Validate inputs
            validateNotEmpty(businessType, 'business type');
            validateRange(investment, 50, Number.MAX_SAFE_INTEGER, 'investment amount');

            const validTypes = ['shop', 'farm', 'mine', 'factory', 'bank', 'casino', 'restaurant', 'tech', 'trading'];
            if (!validTypes.includes(businessType)) {
              throw new CommandError(`Invalid business type. Use: ${validTypes.join(', ')}`, 'INVALID_ARGUMENT');
            }

            const result = createBusiness(interaction.user.id, businessType, investment);

            if (result.success) {
              const embed = new EmbedBuilder()
                .setTitle('🏪 Business Created!')
                .setColor(0x00_FF_00)
                .setDescription(`You opened a **${businessType}** with ${investment} gold investment!`)
                .addFields(
                  { name: '💼 Type', value: businessType, inline: true },
                  { name: '💰 Investment', value: `${investment} gold`, inline: true },
                  { name: '📈 Income', value: `~${result.business.income}/hour`, inline: true }
                );

              await interaction.reply({ embeds: [embed] });
            }
            else {
              throw new CommandError(`Failed to create business: ${result.reason}`, 'COMMAND_ERROR');
            }

            break;
          }
          case 'collect': {
            const result = collectBusinessIncome(interaction.user.id);

            if (result.success) {
              if (result.income > 0) {
                const embed = new EmbedBuilder()
                  .setTitle('💰 Business Income Collected!')
                  .setColor(0x00_FF_00)
                  .setDescription(`Collected **${result.income}** gold from your ${result.businesses} business(es)!`);

                await interaction.reply({ embeds: [embed] });
              }
              else {
                const embed = new EmbedBuilder()
                  .setTitle('💤 No Income Available')
                  .setColor(0xFF_A5_00)
                  .setDescription('No income available to collect yet. Check back later!');

                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
              }
            }
            else {
              throw new CommandError(result.reason, 'COMMAND_ERROR');
            }

            break;
          }
          case 'list': {
            const businesses = getUserBusinesses(interaction.user.id);

            if (businesses.length === 0) {
              return interaction.reply({ content: '🏢 You have no businesses yet. Use `/economy business action:create` to start one!', flags: MessageFlags.Ephemeral });
            }

            const embed = new EmbedBuilder()
              .setTitle('🏢 Your Businesses')
              .setColor(0xFF_D7_00)
              .setDescription('Manage your business empire!');

            for (const [index, business] of businesses.entries()) {
              const now = Date.now();
              const hoursSinceCollection = (now - business.lastCollected) / (1000 * 60 * 60);
              const pendingIncome = Math.floor(business.income * hoursSinceCollection);
              const upgradeCost = business.level * 500;

              embed.addFields({
                name: `${index + 1}. ${business.type.charAt(0).toUpperCase() + business.type.slice(1)} (${business.level}) [${business.id}]`,
                value: `💰 Income: ${business.income}/hour\n🕐 Pending: ${pendingIncome} gold\n👥 Employees: ${business.employees}\n🔧 Upgrades: ${business.upgrades}\n💸 Next Upgrade: ${upgradeCost} gold`,
                inline: true
              });
            }

            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`economy_business:${interaction.user.id}`).setLabel('🏪 Collect Income').setStyle(ButtonStyle.Primary),
              new ButtonBuilder().setCustomId(`economy_invest:${interaction.user.id}`).setLabel('📈 Investments').setStyle(ButtonStyle.Secondary)
            );

            await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });

            break;
          }
          case 'upgrade': {
            const businessId = interaction.options.getString('business_id');

            validateNotEmpty(businessId, 'business ID');

            const { upgradeBusiness } = await import('../economy.js');
            const result = upgradeBusiness(interaction.user.id, businessId);

            if (result.success) {
              const embed = new EmbedBuilder()
                .setTitle('🔧 Business Upgraded!')
                .setColor(0x00_FF_00)
                .setDescription(`Successfully upgraded your **${result.business.type}** business!`)
                .addFields(
                  { name: '🏢 Business', value: `${result.business.type} (Level ${result.business.level})`, inline: true },
                  { name: '💰 New Income', value: `${result.business.income}/hour`, inline: true },
                  { name: '🔧 Total Upgrades', value: result.business.upgrades, inline: true }
                );

              await interaction.reply({ embeds: [embed] });
            }
            else {
              throw new CommandError(`Upgrade failed: ${result.reason}`, 'COMMAND_ERROR');
            }

            break;
          }
        // No default
        }

        break;
      }
      case 'market': {
        const action = interaction.options.getString('action');
        const item = interaction.options.getString('item');
        const quantity = interaction.options.getInteger('quantity') || 1;

        switch (action) {
          case 'prices': {
            const embed = new EmbedBuilder()
              .setTitle('📈 Market Prices')
              .setColor(0x00_99_FF);

            const items = ['health_potion', 'mana_potion', 'iron_ore', 'magic_crystal', 'dragon_scale'];
            for (const itemId of items) {
              const price = getMarketPrice(itemId);
              embed.addFields({
                name: itemId.replace('_', ' ').toUpperCase(),
                value: `💰 ${price} gold each`,
                inline: true
              });
            }

            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`economy_buy:${interaction.user.id}`).setLabel('🛒 Buy').setStyle(ButtonStyle.Primary),
              new ButtonBuilder().setCustomId(`economy_sell:${interaction.user.id}`).setLabel('💸 Sell').setStyle(ButtonStyle.Success)
            );

            await interaction.reply({ embeds: [embed], components: [row] });

            break;
          }
          case 'buy': {
            validateNotEmpty(item, 'item to buy');
            validateRange(quantity, 1, 1000, 'quantity'); // Reasonable limit

            const price = getMarketPrice(item);
            if (price === 0) {
              throw new CommandError(`Item '${item}' is not available in the market.`, 'NOT_FOUND');
            }

            const totalCost = price * quantity;
            const balance = getBalance(interaction.user.id);
            if (balance < totalCost) {
              throw new CommandError(`Insufficient funds! You need ${totalCost} gold but only have ${balance} gold.`, 'INSUFFICIENT_FUNDS');
            }

            const result = buyFromMarket(interaction.user.id, item, quantity);

            if (result.success) {
              const embed = new EmbedBuilder()
                .setTitle('🛒 Purchase Complete!')
                .setColor(0x00_FF_00)
                .setDescription(`Bought **${quantity}x ${item}** for **${totalCost}** gold!`)
                .addFields(
                  { name: '📦 Item', value: item, inline: true },
                  { name: '🔢 Quantity', value: quantity, inline: true },
                  { name: '💰 Price per Unit', value: `${price} gold`, inline: true }
                );

              await interaction.reply({ embeds: [embed] });
            }
            else {
              throw new CommandError(`Purchase failed: ${result.reason}`, 'COMMAND_ERROR');
            }

            break;
          }
          case 'sell': {
            validateNotEmpty(item, 'item to sell');
            validateRange(quantity, 1, 1000, 'quantity'); // Reasonable limit

            const marketPrice = getMarketPrice(item);
            if (marketPrice === 0) {
              throw new CommandError(`Item '${item}' is not available in the market.`, 'NOT_FOUND');
            }

            const sellPrice = Math.floor(marketPrice * 0.8);
            const totalEarnings = sellPrice * quantity;

            const result = sellToMarket(interaction.user.id, item, quantity);

            if (result.success) {
              const embed = new EmbedBuilder()
                .setTitle('💸 Sale Complete!')
                .setColor(0x00_FF_00)
                .setDescription(`Sold **${quantity}x ${item}** for **${totalEarnings}** gold!`)
                .addFields(
                  { name: '📦 Item', value: item, inline: true },
                  { name: '🔢 Quantity', value: quantity, inline: true },
                  { name: '💰 Earnings', value: `${totalEarnings} gold`, inline: true }
                );

              await interaction.reply({ embeds: [embed] });
            }
            else {
              throw new CommandError(`Sale failed: ${result.reason}`, 'COMMAND_ERROR');
            }

            break;
          }
        // No default
        }

        break;
      }
      case 'lottery': {
        const ticketPrice = interaction.options.getInteger('ticket_price');

        validateRange(ticketPrice, 1, 10_000, 'ticket price'); // Reasonable limits

        const currentBalance = getBalance(interaction.user.id);
        if (currentBalance < ticketPrice) {
          throw new CommandError(`Insufficient funds! You need ${ticketPrice} gold but only have ${currentBalance}.`, 'INSUFFICIENT_FUNDS');
        }

        // Simple lottery with 1/1000 chance of winning
        const prizePool = ticketPrice * 10; // 10x return for winners
        const result = createLottery(interaction.user.id, ticketPrice, prizePool);

        if (result.success) {
          if (result.isWinner) {
            const embed = new EmbedBuilder()
              .setTitle('🎉 LOTTERY WINNER!')
              .setColor(0xFF_D7_00)
              .setDescription('🎊 **JACKPOT!** You won the lottery!')
              .addFields(
                { name: '🎫 Your Number', value: result.lotteryNumber, inline: true },
                { name: '🏆 Winning Number', value: result.winningNumber, inline: true },
                { name: '💰 Prize', value: `${result.winnings} gold!`, inline: true }
              );

            await interaction.reply({ embeds: [embed] });
          }
          else {
            const embed = new EmbedBuilder()
              .setTitle('🎫 Lottery Ticket Purchased')
              .setColor(0xFF_A5_00)
              .setDescription(`Your number: **${result.lotteryNumber}**\n💰 Cost: ${ticketPrice} gold\n🏆 Jackpot: ${prizePool} gold\n\n*Better luck next time!*`);

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
          }
        }
        else {
          throw new CommandError('Failed to create lottery ticket.', 'COMMAND_ERROR');
        }

        break;
      }
      case 'history': {
        const limit = interaction.options.getInteger('limit') || 10;
        validateRange(limit, 1, 50, 'transaction limit'); // Reasonable limit

        const transactions = getTransactionHistory(interaction.user.id, limit);

        if (transactions.length === 0) {
          const embed = new EmbedBuilder()
            .setTitle('📋 Transaction History')
            .setColor(0xFF_A5_00)
            .setDescription('No transaction history found.');

          return await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const embed = new EmbedBuilder()
          .setTitle('📋 Transaction History')
          .setColor(0x00_99_FF)
          .setDescription(`Your recent ${transactions.length} transactions`);

        for (const [index, txn] of transactions.entries()) {
          const timestamp = new Date(txn.timestamp).toLocaleString();
          const amount = txn.amount > 0 ? `+${txn.amount}` : txn.amount;

          embed.addFields({
            name: `${index + 1}. ${txn.type.toUpperCase()}`,
            value: `💰 **${amount}** gold\n📅 ${timestamp}`,
            inline: true
          });
        }

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

        break;
      }
      case 'stats': {
        const stats = getUserEconomyStats(interaction.user.id);
        const balance = getBalance(interaction.user.id);

        const embed = new EmbedBuilder()
          .setTitle('📊 Economy Statistics')
          .setColor(0xFF_D7_00)
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

        await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });

        break;
      }
      case 'daily': {
        const result = claimDailyReward(interaction.user.id);

        if (result.success) {
          const embed = new EmbedBuilder()
            .setTitle('🎁 Daily Reward Claimed!')
            .setColor(0x00_FF_00)
            .setDescription('You claimed your daily reward!')
            .addFields(
              { name: '💰 Reward', value: `${result.reward} gold`, inline: true },
              { name: '🔥 Streak', value: `${result.streak} days`, inline: true }
            );

          await interaction.reply({ embeds: [embed] });
        }
        else {
          const embed = new EmbedBuilder()
            .setTitle('⏰ Daily Reward Not Available')
            .setColor(0xFF_A5_00)
            .setDescription(`Your daily reward will be available in ${result.hoursLeft} hours.`);

          await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        break;
      }
    // No default
    }
  }, {
    command: 'economy'
  });
}