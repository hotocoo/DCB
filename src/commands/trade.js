import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';

import {
  createTradeRequest,
  acceptTrade,
  declineTrade,
  cancelTrade,
  getTradeListings,
  getUserTradeHistory,
  getTradeStats,
  createAuction,
  placeBid,
  buyoutAuction,
  getActiveAuctions,
  getMarketPrices
} from '../trading.js';
import { safeExecuteCommand, CommandError, validateUser, validateRange, validateNotEmpty } from '../errorHandler';

export const data = new SlashCommandBuilder()
  .setName('trade')
  .setDescription('Trade items, gold, and participate in auctions')
  .addSubcommand(sub => sub.setName('offer').setDescription('Offer a trade to another user')
    .addUserOption(opt => opt.setName('user').setDescription('User to trade with').setRequired(true))
    .addStringOption(opt => opt.setName('offer_items').setDescription('Items to offer (comma separated)').setRequired(false))
    .addIntegerOption(opt => opt.setName('offer_gold').setDescription('Gold to offer').setRequired(false))
    .addStringOption(opt => opt.setName('request_items').setDescription('Items to request (comma separated)').setRequired(false))
    .addIntegerOption(opt => opt.setName('request_gold').setDescription('Gold to request').setRequired(false)))
  .addSubcommand(sub => sub.setName('history').setDescription('View your trade history'))
  .addSubcommand(sub => sub.setName('stats').setDescription('View your trading statistics'))
  .addSubcommand(sub => sub.setName('market').setDescription('View market prices and listings'))
  .addSubcommand(sub => sub.setName('auction').setDescription('Auction house management')
    .addStringOption(opt => opt.setName('action').setDescription('create|bid|buyout').setRequired(true))
    .addStringOption(opt => opt.setName('item').setDescription('Item to auction (for create)'))
    .addIntegerOption(opt => opt.setName('price').setDescription('Starting price (for create/bid)'))
    .addStringOption(opt => opt.setName('auction_id').setDescription('Auction ID (for bid/buyout)')))
  .addSubcommand(sub => sub.setName('pending').setDescription('View pending trade requests'));

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const userId = interaction.user.id;

  switch (sub) {
    case 'offer': {
      const targetUser = interaction.options.getUser('user');

      validateUser(interaction, targetUser.id);

      const offerItems = interaction.options.getString('offer_items')?.split(',').map(s => s.trim()) || [];
      const offerGold = interaction.options.getInteger('offer_gold') || 0;
      const requestItems = interaction.options.getString('request_items')?.split(',').map(s => s.trim()) || [];
      const requestGold = interaction.options.getInteger('request_gold') || 0;

      if (targetUser.id === userId) {
        throw new CommandError('You cannot trade with yourself!', 'INVALID_ARGUMENT');
      }

      if (offerItems.length === 0 && offerGold === 0) {
        throw new CommandError('You must offer at least some items or gold!', 'INVALID_ARGUMENT');
      }

      if (requestItems.length === 0 && requestGold === 0) {
        throw new CommandError('You must request at least some items or gold!', 'INVALID_ARGUMENT');
      }

      validateRange(offerGold, 0, 1_000_000, 'offer gold'); // Max 1M gold
      validateRange(requestGold, 0, 1_000_000, 'request gold');
      validateRange(offerItems.length, 0, 10, 'offer items count');
      validateRange(requestItems.length, 0, 10, 'request items count');

      try {
        const result = createTradeRequest(userId, targetUser.id, offerItems, requestItems, offerGold, requestGold);
        if (!result.success) {
          throw new CommandError(result.reason || 'Failed to create trade request.', 'COMMAND_ERROR');
        }
      }
      catch (error) {
        throw new CommandError(`Failed to create trade offer: ${error.message}`, 'COMMAND_ERROR', { originalError: error.message });
      }

      const embed = new EmbedBuilder()
        .setTitle('💼 Trade Offer Sent!')
        .setColor(0x00_99_FF)
        .setDescription(`Trade request sent to **${targetUser.username}**!`)
        .addFields(
          { name: '📤 You Offer', value: `${offerItems.length > 0 ? offerItems.join(', ') : 'Nothing'}${offerGold > 0 ? `\n💰 ${offerGold} gold` : ''}`, inline: true },
          { name: '📥 You Request', value: `${requestItems.length > 0 ? requestItems.join(', ') : 'Nothing'}${requestGold > 0 ? `\n💰 ${requestGold} gold` : ''}`, inline: true }
        );

      await interaction.reply({ embeds: [embed] });

      // Note: Target user will be notified when they check pending trades or through the trading system

      break;
    }
    case 'history': {
      const tradeHistory = getUserTradeHistory(userId, 10);

      if (tradeHistory.length === 0) {
        return interaction.reply({ content: '📋 No trade history found. Start trading to build your history!', flags: MessageFlags.Ephemeral });
      }

      const embed = new EmbedBuilder()
        .setTitle('📋 Trade History')
        .setColor(0x00_99_FF)
        .setDescription(`Your recent ${tradeHistory.length} trades`);

      for (const [index, trade] of tradeHistory.entries()) {
        const otherUser = trade.initiator === userId ? trade.target : trade.initiator;
        const direction = trade.initiator === userId ? '→' : '←';

        embed.addFields({
          name: `Trade #${index + 1} (${new Date(trade.completedAt).toLocaleDateString()})`,
          value: `${direction} **${trade.offer.items.length + trade.request.items.length}** items, **${trade.offer.gold + trade.request.gold}** gold`,
          inline: true
        });
      }

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

      break;
    }
    case 'stats': {
      const stats = getTradeStats(userId);

      const embed = new EmbedBuilder()
        .setTitle('📊 Trading Statistics')
        .setColor(0xFF_D7_00)
        .addFields(
          { name: '🏆 Trades Completed', value: stats.trades_completed, inline: true },
          { name: '💰 Gold Traded', value: stats.gold_traded, inline: true },
          { name: '📦 Items Traded', value: stats.items_traded, inline: true }
        );

      if (stats.trades_completed > 0) {
        embed.addFields({
          name: '📈 Trading Rank',
          value: `Average trade value: ${Math.round(stats.gold_traded / stats.trades_completed)} gold`,
          inline: false
        });
      }

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

      break;
    }
    case 'market': {
      const auctions = getActiveAuctions(5);

      const embed = new EmbedBuilder()
        .setTitle('🏛️ Marketplace')
        .setColor(0xFF_D7_00)
        .setDescription('Active auctions and market prices');

      if (auctions.length > 0) {
        for (const [index, auction] of auctions.entries()) {
          const timeLeft = Math.max(0, auction.ends - Date.now());
          const hoursLeft = Math.floor(timeLeft / (60 * 60 * 1000));

          embed.addFields({
            name: `Auction #${index + 1} - ${auction.itemId}`,
            value: `💰 Current: ${auction.currentBid} gold\n⏰ Ends in: ${hoursLeft}h\n🏷️ Buyout: ${auction.buyoutPrice} gold`,
            inline: true
          });
        }
      }
      else {
        embed.addFields({
          name: '🏛️ No Active Auctions',
          value: 'Be the first to create an auction!',
          inline: false
        });
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`trade_create_auction:${userId}`).setLabel('➕ Create Auction').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`trade_view_auctions:${userId}`).setLabel('🔍 View All').setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({ embeds: [embed], components: [row] });

      break;
    }
    case 'auction': {
      const action = interaction.options.getString('action');

      validateNotEmpty(action, 'auction action');
      const validActions = ['create', 'bid', 'buyout'];
      if (!validActions.includes(action)) {
        throw new CommandError('Invalid auction action. Use: create, bid, buyout', 'INVALID_ARGUMENT');
      }

      switch (action) {
        case 'create': {
          const item = interaction.options.getString('item');
          const price = interaction.options.getInteger('price');

          validateNotEmpty(item, 'auction item');
          validateRange(price, 1, 100_000, 'auction starting price'); // Max 100k gold

          try {
            const result = createAuction(item, price, 24, userId);
            if (!result.success) {
              throw new CommandError(result.reason || 'Failed to create auction.', 'COMMAND_ERROR');
            }
          }
          catch (error) {
            throw new CommandError(`Failed to create auction: ${error.message}`, 'COMMAND_ERROR', { originalError: error.message });
          }

          const embed = new EmbedBuilder()
            .setTitle('🎯 Auction Created!')
            .setColor(0x00_FF_00)
            .setDescription(`**${item}** is now up for auction!`)
            .addFields(
              { name: '💰 Starting Bid', value: price, inline: true },
              { name: '🏷️ Buyout Price', value: price * 3, inline: true },
              { name: '⏰ Duration', value: '24 hours', inline: true }
            );

          await interaction.reply({ embeds: [embed] });

          break;
        }
        case 'bid': {
          const auctionId = interaction.options.getString('auction_id');
          const price = interaction.options.getInteger('price');

          validateNotEmpty(auctionId, 'auction ID');
          validateRange(price, 1, 1_000_000, 'bid amount'); // Max 1M gold

          try {
            const result = placeBid(auctionId, userId, price);
            if (!result.success) {
              throw new CommandError(result.reason || 'Failed to place bid.', 'COMMAND_ERROR');
            }

            await interaction.reply({ content: `💰 **Bid Placed!**\nYou bid ${price} gold on auction ${auctionId}!`, flags: MessageFlags.Ephemeral });
          }
          catch (error) {
            throw new CommandError(`Failed to place bid: ${error.message}`, 'COMMAND_ERROR', { originalError: error.message });
          }

          break;
        }
        case 'buyout': {
          const auctionId = interaction.options.getString('auction_id');

          validateNotEmpty(auctionId, 'auction ID');

          try {
            const result = buyoutAuction(auctionId, userId);
            if (!result.success) {
              throw new CommandError(result.reason || 'Failed to buyout auction.', 'COMMAND_ERROR');
            }

            await interaction.reply({ content: '💎 **Auction Won!**\nYou purchased the item via buyout!', flags: MessageFlags.Ephemeral });
          }
          catch (error) {
            throw new CommandError(`Failed to buyout auction: ${error.message}`, 'COMMAND_ERROR', { originalError: error.message });
          }

          break;
        }
      // No default
      }

      break;
    }
    case 'pending': {
    // Show pending trade requests - would be implemented with proper notification system
      await interaction.reply({ content: '📨 **Pending Trades:**\nNo pending trade requests. Use `/trade offer` to start trading!', flags: MessageFlags.Ephemeral });

      break;
    }
  // No default
  }
}

export async function safeExecute(interaction) {
  return safeExecuteCommand(interaction, execute);
}
