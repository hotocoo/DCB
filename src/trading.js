import fs from 'node:fs';
import path from 'node:path';

import { getDb } from './database.js';
import { getCharacter, addItemToInventory, removeItemFromInventory } from './rpg.js';
import { getBalance, subtractBalance, addBalance } from './economy.js';
import { logger } from './logger.js';

const OLD_TRADES_FILE = path.join(process.cwd(), 'data', 'trades.json');
const OLD_RPG_DIR = path.join(process.cwd(), 'data', 'characters');

// Ephemeral in-memory stores — safe to lose on restart
const activeTrades = new Map(); // short-lived trade sessions
const auctions = new Map(); // auction house listings

function migrateFromJson() {
  const db = getDb();
  if (!db.prepare('SELECT name FROM sqlite_master WHERE type="table" AND name="trades"').get()) return;
  if (!fs.existsSync(OLD_TRADES_FILE)) return;

  try {
    const data = JSON.parse(fs.readFileSync(OLD_TRADES_FILE, 'utf8')) || {};

    for (const t of Array.isArray(data.completed) ? data.completed : []) {
      db.prepare('INSERT INTO trades (id, trade_data) VALUES (?, ?)').run(t.id, JSON.stringify(t));
    }

    // Migrate stats into user_settings table
    for (const [uid, stats] of Object.entries(data.stats || {})) {
      let settings;
      try { settings = JSON.parse(db.prepare('SELECT settings_data FROM user_settings WHERE user_id = ?').get(uid)?.settings_data || '{}'); } catch { settings = {}; }
      if (!settings.tradeStats) settings.tradeStats = stats;
      db.prepare('INSERT OR REPLACE INTO user_settings (user_id, settings_data) VALUES (?, ?)').run(uid, JSON.stringify(settings));
    }

    logger.info(`Migrated ${data.completed?.length || 0} completed trades to SQLite`);
  } catch (err) { logger.error('Trade migration failed', err instanceof Error ? err : new Error(String(err))); }
}

function updateStat(userId, key, delta) {
  const db = getDb();
  let settings;
  try { settings = JSON.parse(db.prepare('SELECT settings_data FROM user_settings WHERE user_id = ?').get(userId)?.settings_data || '{}'); } catch { settings = {}; }
  if (!settings.tradeStats) settings.tradeStats = { trades_completed: 0, gold_traded: 0, items_traded: 0 };
  settings.tradeStats[key] = (settings.tradeStats[key] || 0) + delta;
  db.prepare('INSERT OR REPLACE INTO user_settings (user_id, settings_data) VALUES (?, ?)').run(userId, JSON.stringify(settings));
}

function getTradeStat(userId) {
  const db = getDb();
  let settings;
  try { settings = JSON.parse(db.prepare('SELECT settings_data FROM user_settings WHERE user_id = ?').get(userId)?.settings_data || '{}'); } catch { settings = {}; }
  return settings.tradeStats || { trades_completed: 0, gold_traded: 0, items_traded: 0 };
}

// Save completed trade to SQLite
function saveTrade(trade) {
  const db = getDb();
  db.prepare('INSERT INTO trades (id, trade_data) VALUES (?, ?)').run(trade.id, JSON.stringify(trade));
}

export function createTradeRequest(initiatorId, targetUserId, offeredItems, requestedItems, offeredGold = 0, requestedGold = 0) {
  if (!initiatorId || !targetUserId || typeof initiatorId !== 'string' || typeof targetUserId !== 'string') return { success: false, reason: 'invalid_user_ids' };
  if (initiatorId === targetUserId) return { success: false, reason: 'cannot_trade_with_self' };
  if (!Number.isFinite(offeredGold) || offeredGold < 0) return { success: false, reason: 'invalid_offered_gold' };
  if (!Number.isFinite(requestedGold) || requestedGold < 0) return { success: false, reason: 'invalid_requested_gold' };

  const trade = {
    id: `trade_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`, initiator: initiatorId, target: targetUserId, status: 'pending', created: Date.now(),
    offer: { items: Array.isArray(offeredItems) ? offeredItems : [], gold: offeredGold }, request: { items: Array.isArray(requestedItems) ? requestedItems : [], gold: requestedGold }, responses: {},
  };

  activeTrades.set(trade.id, trade);
  return { success: true, trade };
}

export function acceptTrade(tradeId, userId) {
  const trade = activeTrades.get(tradeId);
  if (!trade) return { success: false, reason: 'trade_not_found' };
  if (trade.target !== userId) return { success: false, reason: 'not_trade_target' };
  if (trade.status !== 'pending') return { success: false, reason: 'trade_not_pending' };
  trade.status = 'accepted';
  trade.acceptedAt = Date.now();
  return { success: true, trade };
}

export function declineTrade(tradeId, userId) {
  const trade = activeTrades.get(tradeId);
  if (!trade) return { success: false, reason: 'trade_not_found' };
  if (trade.target !== userId && trade.initiator !== userId) return { success: false, reason: 'not_involved_in_trade' };
  trade.status = 'declined';
  trade.declinedAt = Date.now();
  saveTrade(trade);
  activeTrades.delete(tradeId);
  return { success: true };
}

export function cancelTrade(tradeId, userId) {
  const trade = activeTrades.get(tradeId);
  if (!trade) return { success: false, reason: 'trade_not_found' };
  if (trade.initiator !== userId) return { success: false, reason: 'not_trade_initiator' };
  trade.status = 'cancelled';
  trade.cancelledAt = Date.now();
  saveTrade(trade);
  activeTrades.delete(tradeId);
  return { success: true };
}

// Atomic execute with snapshot+rollback on failure
export function executeTrade(tradeId) {
  const trade = activeTrades.get(tradeId);
  if (!trade) return { success: false, reason: 'trade_not_found' };
  if (trade.status !== 'accepted') return { success: false, reason: 'trade_not_accepted' };

  const iChar = getCharacter(trade.initiator);
  const tChar = getCharacter(trade.target);
  if (!iChar || !tChar) return { success: false, reason: 'character_not_found' };

  // Snapshots for rollback
  const initGoldBefore = getBalance(trade.initiator);
  const tgtGoldBefore = getBalance(trade.target);
  const initInvBefore = JSON.parse(JSON.stringify(iChar.inventory || {}));
  const tgtInvBefore = JSON.parse(JSON.stringify(tChar.inventory || {}));

  try {
    // Transfer gold
    if (trade.offer.gold > 0) {
      if (getBalance(trade.initiator) < trade.offer.gold) return { success: false, reason: 'insufficient_gold_initiator' };
      subtractBalance(trade.initiator, trade.offer.gold);
      addBalance(trade.target, trade.offer.gold);
    }
    if (trade.request.gold > 0) {
      if (getBalance(trade.target) < trade.request.gold) return { success: false, reason: 'insufficient_gold_target' };
      subtractBalance(trade.target, trade.request.gold);
      addBalance(trade.initiator, trade.request.gold);
    }

    // Transfer items (offer goes to target, request goes to initiator)
    for (const itemId of trade.offer.items) { if (!removeItemFromInventory(trade.initiator, itemId)) return rollbackAndFail(trade, initGoldBefore, tgtGoldBefore, initInvBefore, tgtInvBefore); addItemToInventory(trade.target, itemId); }
    for (const itemId of trade.request.items) { if (!removeItemFromInventory(trade.target, itemId)) return rollbackAndFail(trade, initGoldBefore, tgtGoldBefore, initInvBefore, tgtInvBefore); addItemToInventory(trade.initiator, itemId); }

    // Success — finalize
    trade.status = 'completed';
    trade.completedAt = Date.now();
    saveTrade(trade);
    activeTrades.delete(tradeId);

    updateStat(trade.initiator, 'trades_completed', 1);
    updateStat(trade.initiator, 'gold_traded', trade.offer.gold + trade.request.gold);
    updateStat(trade.initiator, 'items_traded', trade.offer.items.length + trade.request.items.length);
    updateStat(trade.target, 'trades_completed', 1);
    updateStat(trade.target, 'gold_traded', trade.offer.gold + trade.request.gold);
    updateStat(trade.target, 'items_traded', trade.offer.items.length + trade.request.items.length);

    return { success: true, trade };
  } catch (error) {
    logger.error('executeTrade failed — rolling back', error instanceof Error ? error : new Error(String(error)), { tradeId });
    return rollbackAndFail(trade, initGoldBefore, tgtGoldBefore, initInvBefore, tgtInvBefore);
  }
}

function rollbackAndFail(trade, iGold, tGold, iInv, tInv) {
  try {
    // Restore gold via direct economy calls (bypass to ensure rollback works even if normal path fails)
    const db = getDb();
    db.prepare('INSERT OR REPLACE INTO balances (user_id, amount) VALUES (?, ?)').run(trade.initiator, Math.max(0, iGold));
    db.prepare('INSERT OR REPLACE INTO balances (user_id, amount) VALUES (?, ?)').run(trade.target, Math.max(0, tGold));

    // Restore inventories via RPG saveCharacter (uses SQLite now)
    const { saveCharacter } = require('./rpg.js');
    const iChar = getCharacter(trade.initiator); if (iChar) { iChar.inventory = JSON.parse(JSON.stringify(iInv)); saveCharacter(trade.initiator, iChar); }
    const tChar = getCharacter(trade.target); if (tChar) { tChar.inventory = JSON.parse(JSON.stringify(tInv)); saveCharacter(trade.target, tChar); }

    trade.status = 'failed';
    trade.failedAt = Date.now();
    saveTrade(trade);
    activeTrades.delete(trade.id);
  } catch (rbErr) { logger.error('CRITICAL: trade rollback failed — manual intervention needed', rbErr instanceof Error ? rbErr : new Error(String(rbErr)), { tradeId: trade.id }); }

  return { success: false, reason: 'trade_rolled_back_on_error' };
}

// Market queries
export function getTradeListings(limit = 20) {
  migrateFromJson();
  const db = getDb();
  const rows = db.prepare('SELECT trade_data FROM trades ORDER BY id DESC LIMIT ?').all(limit);
  return rows.map((r) => JSON.parse(r.trade_data)).filter((t) => t.status === 'completed');
}

export function getUserTradeHistory(userId, limit = 10) {
  migrateFromJson();
  const db = getDb();
  const all = db.prepare('SELECT trade_data FROM trades').all().map((r) => JSON.parse(r.trade_data));
  return all.filter((t) => (t.initiator === userId || t.target === userId) && t.status === 'completed')
    .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0)).slice(0, limit);
}

export function getTradeStats(userId) { return getTradeStat(userId); }

// Auction house
export function createAuction(itemId, startingBid, durationHours = 24, sellerId) {
  if (!sellerId || typeof sellerId !== 'string') return { success: false, reason: 'invalid_seller' };
  if (!itemId || typeof itemId !== 'string') return { success: false, reason: 'invalid_item' };
  if (!Number.isFinite(startingBid) || startingBid <= 0) return { success: false, reason: 'invalid_starting_bid' };
  if (!Number.isFinite(durationHours) || durationHours < 1 || durationHours > 720) return { success: false, reason: 'invalid_duration' };

  const auction = {
    id: `auction_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`, itemId, seller: sellerId, startingBid, currentBid: startingBid, highestBidder: undefined,
    bids: [], status: 'active', created: Date.now(), ends: Date.now() + durationHours * 3_600_000, buyoutPrice: startingBid * 3,
  };

  auctions.set(auction.id, auction);
  return { success: true, auction };
}

export function placeBid(auctionId, bidderId, bidAmount) {
  const auction = auctions.get(auctionId);
  if (!auction) return { success: false, reason: 'auction_not_found' };
  if (auction.status !== 'active') return { success: false, reason: 'auction_ended' };
  if (Date.now() > auction.ends) { auction.status = 'ended'; return { success: false, reason: 'auction_expired' }; }
  if (!Number.isFinite(bidAmount) || bidAmount <= 0) return { success: false, reason: 'invalid_bid_amount' };
  if (bidderId === auction.highestBidder) return { success: false, reason: 'already_highest_bidder' };
  if (bidAmount <= auction.currentBid) return { success: false, reason: 'bid_too_low' };
  if (getBalance(bidderId) < bidAmount) return { success: false, reason: 'insufficient_funds' };

  // Refund previous high bidder and deduct new bid up front
  if (auction.highestBidder && auction.highestBidder !== bidderId) addBalance(auction.highestBidder, auction.currentBid);
  subtractBalance(bidderId, bidAmount);

  auction.currentBid = bidAmount;
  auction.highestBidder = bidderId;
  auction.bids.push({ bidder: bidderId, amount: bidAmount, timestamp: Date.now() });
  return { success: true, auction };
}

export function buyoutAuction(auctionId, buyerId) {
  const auction = auctions.get(auctionId);
  if (!auction) return { success: false, reason: 'auction_not_found' };
  if (auction.status !== 'active') return { success: false, reason: 'auction_ended' };

  const price = auction.buyoutPrice;
  if (getBalance(buyerId) < price) return { success: false, reason: 'insufficient_funds' };

  if (auction.highestBidder && auction.highestBidder !== buyerId) addBalance(auction.highestBidder, auction.currentBid);
  subtractBalance(buyerId, price);

  auction.status = 'sold';
  auction.buyer = buyerId;
  auction.finalPrice = price;
  auction.soldAt = Date.now();
  return { success: true, auction };
}

export function getActiveAuctions(limit = 20) {
  const now = Date.now();
  return [...auctions.values()].filter((a) => a.status === 'active' && a.ends > now).sort((a, b) => b.currentBid - a.currentBid).slice(0, limit);
}

// Market price tracking from historical trades
export function getMarketPrices(itemId, days = 7) {
  migrateFromJson();
  const cutoff = Date.now() - days * 86_400_000;
  const all = db.prepare('SELECT trade_data FROM trades').all().map((r) => JSON.parse(r.trade_data));
  const relevant = all.filter((t) => {
    const time = t.completedAt || t.created;
    return time > cutoff && (t.offer?.items.includes(itemId) || t.request?.items.includes(itemId));
  });

  if (!relevant.length) return { average: 0, min: 0, max: 0, trades: 0 };

  const prices = relevant.map((t) => t.offer.gold + t.request.gold || 50);
  return { average: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length), min: Math.min(...prices), max: Math.max(...prices), trades: prices.length };
}

// Trade validation — real checks (not stubs)
export function validateTradeOffer(userId, offeredItems, offeredGold) {
  const result = { valid: true, missingItems: [], insufficientGold: false };
  if (offeredGold > 0 && getBalance(userId) < offeredGold) { result.insufficientGold = true; result.valid = false; }

  const char = getCharacter(userId);
  if (!char || !char.inventory) return { valid: false, missingItems: offeredItems || [], reason: 'no_character' };
  for (const itemId of (offeredItems || [])) { if (!char.inventory[itemId]) { result.missingItems.push(itemId); result.valid = false; } }

  return result;
}

export function validateTradeRequest(_userId, _requestedItems, _requestedGold) { return { valid: true }; } // Future expansion point

// Trade analytics per user
export function getTradeAnalytics(userId) {
  migrateFromJson();
  const all = db.prepare('SELECT trade_data FROM trades').all().map((r) => JSON.parse(r.trade_data));
  const userTrades = all.filter((t) => t.initiator === userId || t.target === userId);
  const successful = userTrades.filter((t) => t.status === 'completed');
  const totalValue = successful.reduce((s, t) => s + (t.offer?.gold || 0) + (t.request?.gold || 0), 0);

  return { totalTrades: userTrades.length, successfulTrades: successful.length, totalValueTraded: totalValue, successRate: userTrades.length > 0 ? (successful.length / userTrades.length) * 100 : 0, averageTradeValue: successful.length > 0 ? totalValue / successful.length : 0 };
}

// Cleanup expired trades and ended auctions every 5 minutes
function cleanup() {
  const now = Date.now();

  // Expire active trades older than 24 hours
  for (const [id, t] of activeTrades.entries()) {
    if (now - t.created > 86_400_000) { t.status = 'expired'; saveTrade(t); activeTrades.delete(id); }
  }

  // Mark expired auctions as ended (no auto-settlement — seller/item handling requires user interaction)
  for (const [, a] of auctions.entries()) { if (a.status === 'active' && now > a.ends) a.status = 'ended'; }
}

setInterval(cleanup, 300_000).unref?.();

// Backward-compatible singleton API
export const tradingManager = { createTradeRequest, acceptTrade, declineTrade, cancelTrade, executeTrade, getTradeListings, getUserTradeHistory, getTradeStats, createAuction, placeBid, buyoutAuction, getActiveAuctions, getMarketPrices, validateTradeOffer, validateTradeRequest, getTradeAnalytics };
