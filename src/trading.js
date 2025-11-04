import fs from 'node:fs';
import path from 'node:path';

import { getCharacter, addItemToInventory, removeItemFromInventory } from './rpg.js';
import { getBalance, subtractBalance, transferBalance, addBalance } from './economy.js';

const TRADES_FILE = path.join(process.cwd(), 'data', 'trades.json');

// Advanced Trading System for Player Economy
class TradingManager {
  constructor() {
    this.ensureStorage();
    this.loadTrades();
    this.activeTrades = new Map(); // In-memory storage for active trade sessions
  }

  ensureStorage() {
    const dir = path.dirname(TRADES_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(TRADES_FILE)) {
      fs.writeFileSync(TRADES_FILE, JSON.stringify({ completed: [], stats: {} }));
    }
  }

  loadTrades() {
    try {
      const data = JSON.parse(fs.readFileSync(TRADES_FILE));
      this.completedTrades = data.completed || [];
      this.tradeStats = data.stats || {};
    }
    catch (error) {
      console.error('Failed to load trades:', error);
      this.completedTrades = [];
      this.tradeStats = {};
    }
  }

  saveTrades() {
    try {
      const data = {
        completed: this.completedTrades,
        stats: this.tradeStats
      };
      fs.writeFileSync(TRADES_FILE, JSON.stringify(data, null, 2));
    }
    catch (error) {
      console.error('Failed to save trades:', error);
    }
  }

  // Trade Creation and Management
  createTradeRequest(initiatorId, targetUserId, offeredItems, requestedItems, offeredGold = 0, requestedGold = 0) {
    const tradeId = `trade_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    const trade = {
      id: tradeId,
      initiator: initiatorId,
      target: targetUserId,
      status: 'pending',
      created: Date.now(),
      offer: {
        items: offeredItems || [],
        gold: offeredGold
      },
      request: {
        items: requestedItems || [],
        gold: requestedGold
      },
      responses: {}
    };

    this.activeTrades.set(tradeId, trade);
    return { success: true, trade };
  }

  acceptTrade(tradeId, userId) {
    const trade = this.activeTrades.get(tradeId);
    if (!trade) return { success: false, reason: 'trade_not_found' };
    if (trade.target !== userId) return { success: false, reason: 'not_trade_target' };
    if (trade.status !== 'pending') return { success: false, reason: 'trade_not_pending' };

    trade.status = 'accepted';
    trade.acceptedAt = Date.now();
    return { success: true, trade };
  }

  declineTrade(tradeId, userId) {
    const trade = this.activeTrades.get(tradeId);
    if (!trade) return { success: false, reason: 'trade_not_found' };
    if (trade.target !== userId && trade.initiator !== userId) {
      return { success: false, reason: 'not_involved_in_trade' };
    }

    trade.status = 'declined';
    trade.declinedAt = Date.now();

    // Move to completed trades
    this.completedTrades.push({ ...trade });
    this.activeTrades.delete(tradeId);

    this.saveTrades();
    return { success: true };
  }

  cancelTrade(tradeId, userId) {
    const trade = this.activeTrades.get(tradeId);
    if (!trade) return { success: false, reason: 'trade_not_found' };
    if (trade.initiator !== userId) return { success: false, reason: 'not_trade_initiator' };

    trade.status = 'cancelled';
    trade.cancelledAt = Date.now();

    // Move to completed trades
    this.completedTrades.push({ ...trade });
    this.activeTrades.delete(tradeId);

    this.saveTrades();
    return { success: true };
  }

  executeTrade(tradeId) {
    const trade = this.activeTrades.get(tradeId);
    if (!trade) return { success: false, reason: 'trade_not_found' };
    if (trade.status !== 'accepted') return { success: false, reason: 'trade_not_accepted' };

    // Implement actual item/gold transfer

    const initiatorChar = getCharacter(trade.initiator);
    const targetChar = getCharacter(trade.target);

    if (!initiatorChar || !targetChar) {
      return { success: false, reason: 'character_not_found' };
    }

    // Transfer gold
    if (trade.offer.gold > 0) {
      const initiatorBalance = getBalance(trade.initiator);
      if (initiatorBalance < trade.offer.gold) {
        return { success: false, reason: 'insufficient_gold_initiator' };
      }
      subtractBalance(trade.initiator, trade.offer.gold);
      addBalance(trade.target, trade.offer.gold);
    }

    if (trade.request.gold > 0) {
      const targetBalance = getBalance(trade.target);
      if (targetBalance < trade.request.gold) {
        return { success: false, reason: 'insufficient_gold_target' };
      }
      subtractBalance(trade.target, trade.request.gold);
      addBalance(trade.initiator, trade.request.gold);
    }

    // Transfer items
    for (const itemId of trade.offer.items) {
      const result = removeItemFromInventory(trade.initiator, itemId, 1);
      if (!result.success) {
        return { success: false, reason: 'item_transfer_failed' };
      }
      addItemToInventory(trade.target, itemId, 1);
    }

    for (const itemId of trade.request.items) {
      const result = removeItemFromInventory(trade.target, itemId, 1);
      if (!result.success) {
        return { success: false, reason: 'item_transfer_failed' };
      }
      addItemToInventory(trade.initiator, itemId, 1);
    }

    trade.status = 'completed';
    trade.completedAt = Date.now();

    // Move to completed trades
    this.completedTrades.push({ ...trade });
    this.activeTrades.delete(tradeId);

    // Update trade statistics
    this.updateTradeStats(trade);

    this.saveTrades();
    return { success: true, trade };
  }

  updateTradeStats(trade) {
    const initiatorId = trade.initiator;
    const targetId = trade.target;

    if (!this.tradeStats[initiatorId]) {
      this.tradeStats[initiatorId] = { trades_completed: 0, gold_traded: 0, items_traded: 0 };
    }
    if (!this.tradeStats[targetId]) {
      this.tradeStats[targetId] = { trades_completed: 0, gold_traded: 0, items_traded: 0 };
    }

    this.tradeStats[initiatorId].trades_completed++;
    this.tradeStats[initiatorId].gold_traded += trade.offer.gold + trade.request.gold;
    this.tradeStats[initiatorId].items_traded += trade.offer.items.length + trade.request.items.length;

    this.tradeStats[targetId].trades_completed++;
    this.tradeStats[targetId].gold_traded += trade.offer.gold + trade.request.gold;
    this.tradeStats[targetId].items_traded += trade.offer.items.length + trade.request.items.length;
  }

  // Trade Browsing and Market System
  getTradeListings(limit = 20) {
    // Return recent completed trades for market research
    return this.completedTrades
      .filter(trade => trade.status === 'completed')
      .sort((a, b) => b.completedAt - a.completedAt)
      .slice(0, limit);
  }

  getUserTradeHistory(userId, limit = 10) {
    return this.completedTrades
      .filter(trade =>
        (trade.initiator === userId || trade.target === userId) &&
        trade.status === 'completed'
      )
      .sort((a, b) => b.completedAt - a.completedAt)
      .slice(0, limit);
  }

  getTradeStats(userId) {
    return this.tradeStats[userId] || { trades_completed: 0, gold_traded: 0, items_traded: 0 };
  }

  // Auction House System
  createAuction(itemId, startingBid, durationHours = 24, sellerId) {
    const auctionId = `auction_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    const auction = {
      id: auctionId,
      itemId,
      seller: sellerId,
      startingBid,
      currentBid: startingBid,
      highestBidder: null,
      bids: [],
      status: 'active',
      created: Date.now(),
      ends: Date.now() + (durationHours * 60 * 60 * 1000),
      buyoutPrice: startingBid * 3 // Buyout at 3x starting price
    };

    this.auctions = this.auctions || new Map();
    this.auctions.set(auctionId, auction);

    return { success: true, auction };
  }

  placeBid(auctionId, bidderId, bidAmount) {
    const auction = this.auctions?.get(auctionId);
    if (!auction) return { success: false, reason: 'auction_not_found' };
    if (auction.status !== 'active') return { success: false, reason: 'auction_ended' };
    if (Date.now() > auction.ends) {
      auction.status = 'ended';
      return { success: false, reason: 'auction_expired' };
    }
    if (bidAmount <= auction.currentBid) return { success: false, reason: 'bid_too_low' };

    // Refund previous highest bidder if exists
    if (auction.highestBidder && auction.highestBidder !== bidderId) {
      addBalance(auction.highestBidder, auction.currentBid);
    }

    auction.currentBid = bidAmount;
    auction.highestBidder = bidderId;
    auction.bids.push({
      bidder: bidderId,
      amount: bidAmount,
      timestamp: Date.now()
    });

    return { success: true, auction };
  }

  buyoutAuction(auctionId, buyerId) {
    const auction = this.auctions?.get(auctionId);
    if (!auction) return { success: false, reason: 'auction_not_found' };
    if (auction.status !== 'active') return { success: false, reason: 'auction_ended' };

    auction.status = 'sold';
    auction.buyer = buyerId;
    auction.finalPrice = auction.buyoutPrice;
    auction.soldAt = Date.now();

    return { success: true, auction };
  }

  getActiveAuctions(limit = 20) {
    if (!this.auctions) return [];

    const now = Date.now();
    return [...this.auctions.values()]
      .filter(auction => auction.status === 'active' && auction.ends > now)
      .sort((a, b) => b.currentBid - a.currentBid)
      .slice(0, limit);
  }

  // Market Price Tracking
  getMarketPrices(itemId, days = 7) {
    const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);

    const relevantTrades = this.completedTrades.filter(trade => {
      const tradeTime = trade.completedAt || trade.created;
      return tradeTime > cutoffTime &&
             (trade.offer.items.includes(itemId) || trade.request.items.includes(itemId));
    });

    if (relevantTrades.length === 0) {
      return { average: 0, min: 0, max: 0, trades: 0 };
    }

    const prices = relevantTrades.map(trade => {
      // Calculate price based on gold involved in trade
      return (trade.offer.gold + trade.request.gold) || 50; // Use gold amount or default
    });

    return {
      average: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
      min: Math.min(...prices),
      max: Math.max(...prices),
      trades: prices.length
    };
  }

  // Trade Security and Validation
  validateTradeOffer(userId, offeredItems, offeredGold) {
    // Check if user has the items and gold they're offering
    // This would integrate with inventory and character systems
    return {
      valid: true,
      missingItems: [],
      insufficientGold: false
    };
  }

  validateTradeRequest(userId, requestedItems, requestedGold) {
    // Check if requested items are reasonable (not asking for impossible items)
    return { valid: true };
  }

  // Trade Analytics
  getTradeAnalytics(userId) {
    const userTrades = this.completedTrades.filter(trade =>
      trade.initiator === userId || trade.target === userId
    );

    const successfulTrades = userTrades.filter(t => t.status === 'completed');
    const totalValue = successfulTrades.reduce((sum, trade) =>
      sum + trade.offer.gold + trade.request.gold, 0
    );

    return {
      totalTrades: userTrades.length,
      successfulTrades: successfulTrades.length,
      totalValueTraded: totalValue,
      successRate: userTrades.length > 0 ? (successfulTrades.length / userTrades.length) * 100 : 0,
      averageTradeValue: successfulTrades.length > 0 ? totalValue / successfulTrades.length : 0
    };
  }

  // Cleanup expired trades and auctions
  cleanup() {
    const now = Date.now();

    // Clean up expired active trades (older than 24 hours)
    for (const [tradeId, trade] of this.activeTrades) {
      if (now - trade.created > 24 * 60 * 60 * 1000) {
        trade.status = 'expired';
        this.completedTrades.push({ ...trade });
        this.activeTrades.delete(tradeId);
      }
    }

    // Clean up ended auctions
    if (this.auctions) {
      for (const [auctionId, auction] of this.auctions) {
        if (auction.status === 'active' && now > auction.ends) {
          auction.status = 'ended';
          if (auction.highestBidder) {
            auction.status = 'sold';
            auction.finalPrice = auction.currentBid;
          }
        }
      }
    }

    this.saveTrades();
  }
}

// Export singleton instance
export const tradingManager = new TradingManager();

// Convenience functions
export function createTradeRequest(initiatorId, targetUserId, offeredItems, requestedItems, offeredGold = 0, requestedGold = 0) {
  return tradingManager.createTradeRequest(initiatorId, targetUserId, offeredItems, requestedItems, offeredGold, requestedGold);
}

export function acceptTrade(tradeId, userId) {
  return tradingManager.acceptTrade(tradeId, userId);
}

export function declineTrade(tradeId, userId) {
  return tradingManager.declineTrade(tradeId, userId);
}

export function cancelTrade(tradeId, userId) {
  return tradingManager.cancelTrade(tradeId, userId);
}

export function executeTrade(tradeId) {
  return tradingManager.executeTrade(tradeId);
}

export function getTradeListings(limit = 20) {
  return tradingManager.getTradeListings(limit);
}

export function getUserTradeHistory(userId, limit = 10) {
  return tradingManager.getUserTradeHistory(userId, limit);
}

export function getTradeStats(userId) {
  return tradingManager.getTradeStats(userId);
}

export function createAuction(itemId, startingBid, durationHours, sellerId) {
  return tradingManager.createAuction(itemId, startingBid, durationHours, sellerId);
}

export function placeBid(auctionId, bidderId, bidAmount) {
  return tradingManager.placeBid(auctionId, bidderId, bidAmount);
}

export function buyoutAuction(auctionId, buyerId) {
  return tradingManager.buyoutAuction(auctionId, buyerId);
}

export function getActiveAuctions(limit = 20) {
  return tradingManager.getActiveAuctions(limit);
}

export function getMarketPrices(itemId, days = 7) {
  return tradingManager.getMarketPrices(itemId, days);
}

export function getTradeAnalytics(userId) {
  return tradingManager.getTradeAnalytics(userId);
}

// Auto-cleanup every 5 minutes
setInterval(() => {
  tradingManager.cleanup();
}, 5 * 60 * 1000);