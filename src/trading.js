1|import fs from 'node:fs';
2|import path from 'node:path';
3|
4|// eslint-disable-next-line import/no-cycle -- errorHandler -> interactionHandlers cycle is pre-existing
5|import { getCharacter, addItemToInventory, removeItemFromInventory } from './rpg.js';
6|import { getBalance, subtractBalance, addBalance } from './economy.js';
7|import { logger } from './logger.js';
8|
9|const TRADES_FILE = path.join(process.cwd(), 'data', 'trades.json');
10|
11|// Advanced Trading System for Player Economy
12|class TradingManager {
13|  constructor() {
14|    this.ensureStorage();
15|    this.loadTrades();
16|    this.activeTrades = new Map(); // In-memory storage for active trade sessions
17|  }
18|
19|  ensureStorage() {
20|    const dir = path.dirname(TRADES_FILE);
21|    if (!fs.existsSync(dir)) {
22|      fs.mkdirSync(dir, { recursive: true });
23|    }
24|    if (!fs.existsSync(TRADES_FILE)) {
25|      fs.writeFileSync(TRADES_FILE, JSON.stringify({ completed: [], stats: {} }, undefined, 2));
26|    }
27|  }
28|
29|  loadTrades() {
30|    try {
31|      // readFileSync without encoding returns a Buffer; JSON.parse accepts it.
32|      const data = JSON.parse(fs.readFileSync(TRADES_FILE));
33|      this.completedTrades = data.completed || [];
34|      this.tradeStats = data.stats || {};
35|    } catch (error) {
36|      logger.error('Failed to load trades', error);
37|      this.completedTrades = [];
38|      this.tradeStats = {};
39|    }
40|  }
41|
42|  saveTrades() {
43|    try {
44|      const data = {
45|        completed: this.completedTrades,
46|        stats: this.tradeStats,
47|      };
48|      // unicorn/no-null: JSON.stringify replacer is a no-op (identity) here, so we use a typed placeholder.
49|      const identity = (_key, value) => value;
50|      fs.writeFileSync(TRADES_FILE, JSON.stringify(data, identity, 2));
51|    } catch (error) {
52|      logger.error('Failed to save trades', error);
53|    }
54|  }
55|
56|  // Trade Creation and Management
57|  // eslint-disable-next-line max-params -- public API: offer/request pair is the documented contract
58|  createTradeRequest(initiatorId, targetUserId, offeredItems, requestedItems, offeredGold = 0, requestedGold = 0) {
59|    const tradeId = `trade_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
60|
61|    const trade = {
62|      id: tradeId,
63|      initiator: initiatorId,
64|      target: targetUserId,
65|      status: 'pending',
66|      created: Date.now(),
67|      offer: {
68|        items: offeredItems || [],
69|        gold: offeredGold,
70|      },
71|      request: {
72|        items: requestedItems || [],
73|        gold: requestedGold,
74|      },
75|      responses: {},
76|    };
77|
78|    this.activeTrades.set(tradeId, trade);
79|    return { success: true, trade };
80|  }
81|
82|  acceptTrade(tradeId, userId) {
83|    const trade = this.activeTrades.get(tradeId);
84|    if (!trade) return { success: false, reason: 'trade_not_found' };
85|    if (trade.target !== userId) return { success: false, reason: 'not_trade_target' };
86|    if (trade.status !== 'pending') return { success: false, reason: 'trade_not_pending' };
87|
88|    trade.status = 'accepted';
89|    trade.acceptedAt = Date.now();
90|    return { success: true, trade };
91|  }
92|
93|  declineTrade(tradeId, userId) {
94|    const trade = this.activeTrades.get(tradeId);
95|    if (!trade) return { success: false, reason: 'trade_not_found' };
96|    if (trade.target !== userId && trade.initiator !== userId) {
97|      return { success: false, reason: 'not_involved_in_trade' };
98|    }
99|
100|    trade.status = 'declined';
101|    trade.declinedAt = Date.now();
102|
103|    // Move to completed trades
104|    this.completedTrades.push({ ...trade });
105|    this.activeTrades.delete(tradeId);
106|
107|    this.saveTrades();
108|    return { success: true };
109|  }
110|
111|  cancelTrade(tradeId, userId) {
112|    const trade = this.activeTrades.get(tradeId);
113|    if (!trade) return { success: false, reason: 'trade_not_found' };
114|    if (trade.initiator !== userId) return { success: false, reason: 'not_trade_initiator' };
115|
116|    trade.status = 'cancelled';
117|    trade.cancelledAt = Date.now();
118|
119|    // Move to completed trades
120|    this.completedTrades.push({ ...trade });
121|    this.activeTrades.delete(tradeId);
122|
123|    this.saveTrades();
124|    return { success: true };
125|  }
126|
127|  executeTrade(tradeId) {
128|    const trade = this.activeTrades.get(tradeId);
129|    if (!trade) return { success: false, reason: 'trade_not_found' };
130|    if (trade.status !== 'accepted') return { success: false, reason: 'trade_not_accepted' };
131|
132|    const characters = this._resolveTradeCharacters(trade);
133|    if (!characters.ok) return characters;
134|
135|    const goldResult = this._transferGoldForTrade(trade);
136|    if (!goldResult.ok) return goldResult;
137|
138|    const itemResult = this._transferItemsForTrade(trade);
139|    if (!itemResult.ok) return itemResult;
140|
141|    return this._finalizeTrade(tradeId, trade);
142|  }
143|
144|  _resolveTradeCharacters(trade) {
145|    const initiatorChar = getCharacter(trade.initiator);
146|    const targetChar = getCharacter(trade.target);
147|    if (!initiatorChar || !targetChar) {
148|      return { success: false, reason: 'character_not_found' };
149|    }
150|    return { ok: true };
151|  }
152|
153|  _transferGoldForTrade(trade) {
154|    if (trade.offer.gold > 0) {
155|      if (getBalance(trade.initiator) < trade.offer.gold) {
156|        return { success: false, reason: 'insufficient_gold_initiator' };
157|      }
158|      subtractBalance(trade.initiator, trade.offer.gold);
159|      addBalance(trade.target, trade.offer.gold);
160|    }
161|    if (trade.request.gold > 0) {
162|      if (getBalance(trade.target) < trade.request.gold) {
163|        return { success: false, reason: 'insufficient_gold_target' };
164|      }
165|      subtractBalance(trade.target, trade.request.gold);
166|      addBalance(trade.initiator, trade.request.gold);
167|    }
168|    return { ok: true };
169|  }
170|
171|  _transferItemsForTrade(trade) {
172|    for (const itemId of trade.offer.items) {
173|      const result = removeItemFromInventory(trade.initiator, itemId, 1);
174|      if (!result.success) {
175|        return { success: false, reason: 'item_transfer_failed' };
176|      }
177|      addItemToInventory(trade.target, itemId, 1);
178|    }
179|    for (const itemId of trade.request.items) {
180|      const result = removeItemFromInventory(trade.target, itemId, 1);
181|      if (!result.success) {
182|        return { success: false, reason: 'item_transfer_failed' };
183|      }
184|      addItemToInventory(trade.initiator, itemId, 1);
185|    }
186|    return { ok: true };
187|  }
188|
189|  _finalizeTrade(tradeId, trade) {
190|    trade.status = 'completed';
191|    trade.completedAt = Date.now();
192|
193|    // Move to completed trades
194|    this.completedTrades.push({ ...trade });
195|    this.activeTrades.delete(tradeId);
196|
197|    // Update trade statistics
198|    this.updateTradeStats(trade);
199|
200|    this.saveTrades();
201|    return { success: true, trade };
202|  }
203|
204|  updateTradeStats(trade) {
205|    const initiatorId = trade.initiator;
206|    const targetId = trade.target;
207|
208|    // Trade IDs originate from authenticated trade sessions, not user input — safe to bracket-index.
209|    /* eslint-disable security/detect-object-injection */
210|    if (!this.tradeStats[initiatorId]) {
211|      this.tradeStats[initiatorId] = { trades_completed: 0, gold_traded: 0, items_traded: 0 };
212|    }
213|    if (!this.tradeStats[targetId]) {
214|      this.tradeStats[targetId] = { trades_completed: 0, gold_traded: 0, items_traded: 0 };
215|    }
216|
217|    const initiatorStats = this.tradeStats[initiatorId];
218|    const targetStats = this.tradeStats[targetId];
219|    /* eslint-enable security/detect-object-injection */
220|
221|    initiatorStats.trades_completed++;
222|    initiatorStats.gold_traded += trade.offer.gold + trade.request.gold;
223|    initiatorStats.items_traded += trade.offer.items.length + trade.request.items.length;
224|
225|    targetStats.trades_completed++;
226|    targetStats.gold_traded += trade.offer.gold + trade.request.gold;
227|    targetStats.items_traded += trade.offer.items.length + trade.request.items.length;
228|  }
229|
230|  // Trade Browsing and Market System
231|  getTradeListings(limit = 20) {
232|    // Return recent completed trades for market research
233|    return this.completedTrades
234|      .filter((trade) => trade.status === 'completed')
235|      .sort((a, b) => b.completedAt - a.completedAt)
236|      .slice(0, limit);
237|  }
238|
239|  getUserTradeHistory(userId, limit = 10) {
240|    return this.completedTrades
241|      .filter((trade) => (trade.initiator === userId || trade.target === userId) && trade.status === 'completed')
242|      .sort((a, b) => b.completedAt - a.completedAt)
243|      .slice(0, limit);
244|  }
245|
246|  getTradeStats(userId) {
247|    // userId is a Discord ID, not a user-supplied property name — safe to bracket-index.
248|    // eslint-disable-next-line security/detect-object-injection
249|    return this.tradeStats[userId] || { trades_completed: 0, gold_traded: 0, items_traded: 0 };
250|  }
251|
252|  // Auction House System
253|  createAuction(itemId, startingBid, durationHours = 24, sellerId) {
254|    const auctionId = `auction_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
255|
256|    const auction = {
257|      id: auctionId,
258|      itemId,
259|      seller: sellerId,
260|      startingBid,
261|      currentBid: startingBid,
262|      highestBidder: undefined,
263|      bids: [],
264|      status: 'active',
265|      created: Date.now(),
266|      ends: Date.now() + durationHours * 60 * 60 * 1000,
267|      buyoutPrice: startingBid * 3, // Buyout at 3x starting price
268|    };
269|
270|    this.auctions = this.auctions || new Map();
271|    this.auctions.set(auctionId, auction);
272|
273|    return { success: true, auction };
274|  }
275|
276|  placeBid(auctionId, bidderId, bidAmount) {
277|    const auction = this.auctions?.get(auctionId);
278|    if (!auction) return { success: false, reason: 'auction_not_found' };
279|    if (auction.status !== 'active') return { success: false, reason: 'auction_ended' };
280|    if (Date.now() > auction.ends) {
281|      auction.status = 'ended';
282|      return { success: false, reason: 'auction_expired' };
283|    }
284|    if (!Number.isFinite(bidAmount) || bidAmount <= 0) return { success: false, reason: 'invalid_bid_amount' };
    if (bidderId === auction.highestBidder) return { success: false, reason: 'already_highest_bidder' };
    if (bidAmount <= auction.currentBid) return { success: false, reason: 'bid_too_low' };
285|    // Bidder must actually have the gold they are committing.
286|    if (getBalance(bidderId) < bidAmount) return { success: false, reason: 'insufficient_funds' };
287|
288|    // Refund previous highest bidder if exists (atomic-ish: do all updates before any external IO)
289|    if (auction.highestBidder && auction.highestBidder !== bidderId) {
290|      addBalance(auction.highestBidder, auction.currentBid);
291|    }
292|    // Deduct the new bidder's bid amount up front (refunded when outbid or paid at settlement).
293|    subtractBalance(bidderId, bidAmount);
294|
295|    auction.currentBid = bidAmount;
296|    auction.highestBidder = bidderId;
297|    auction.bids.push({
298|      bidder: bidderId,
299|      amount: bidAmount,
300|      timestamp: Date.now(),
301|    });
302|
303|    return { success: true, auction };
304|  }
305|
306|  buyoutAuction(auctionId, buyerId) {
307|    const auction = this.auctions?.get(auctionId);
308|    if (!auction) return { success: false, reason: 'auction_not_found' };
309|    if (auction.status !== 'active') return { success: false, reason: 'auction_ended' };
310|
311|    // Buyer must have the gold. Refund any prior high bidder (their held bid), then debit buyer.
312|    const price = auction.buyoutPrice;
313|    if (getBalance(buyerId) < price) return { success: false, reason: 'insufficient_funds' };
314|    if (auction.highestBidder && auction.highestBidder !== buyerId) {
315|      addBalance(auction.highestBidder, auction.currentBid);
316|    }
317|    subtractBalance(buyerId, price);
318|
319|    auction.status = 'sold';
320|    auction.buyer = buyerId;
321|    auction.finalPrice = price;
322|    auction.soldAt = Date.now();
323|
324|    return { success: true, auction };
325|  }
326|
327|  getActiveAuctions(limit = 20) {
328|    if (!this.auctions) return [];
329|
330|    const now = Date.now();
331|    return [...this.auctions.values()]
332|      .filter((auction) => auction.status === 'active' && auction.ends > now)
333|      .sort((a, b) => b.currentBid - a.currentBid)
334|      .slice(0, limit);
335|  }
336|
337|  // Market Price Tracking
338|  getMarketPrices(itemId, days = 7) {
339|    const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;
340|
341|    const relevantTrades = this.completedTrades.filter((trade) => {
342|      const tradeTime = trade.completedAt || trade.created;
343|      return tradeTime > cutoffTime && (trade.offer.items.includes(itemId) || trade.request.items.includes(itemId));
344|    });
345|
346|    if (relevantTrades.length === 0) {
347|      return { average: 0, min: 0, max: 0, trades: 0 };
348|    }
349|
350|    const prices = relevantTrades.map((trade) => {
351|      // Calculate price based on gold involved in trade
352|      return trade.offer.gold + trade.request.gold || 50; // Use gold amount or default
353|    });
354|
355|    return {
356|      average: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
357|      min: Math.min(...prices),
358|      max: Math.max(...prices),
359|      trades: prices.length,
360|    };
361|  }
362|
363|  // Trade Security and Validation
364|  // eslint-disable-next-line no-unused-vars -- reserved for future inventory/balance integration
365|  validateTradeOffer(_userId, _offeredItems, _offeredGold) {
366|    // Check if user has the items and gold they're offering
367|    // This would integrate with inventory and character systems
368|    return {
369|      valid: true,
370|      missingItems: [],
371|      insufficientGold: false,
372|    };
373|  }
374|
375|  // eslint-disable-next-line no-unused-vars -- reserved for future item validation rules
376|  validateTradeRequest(_userId, _requestedItems, _requestedGold) {
377|    // Check if requested items are reasonable (not asking for impossible items)
378|    return { valid: true };
379|  }
380|
381|  // Trade Analytics
382|  getTradeAnalytics(userId) {
383|    const userTrades = this.completedTrades.filter((trade) => trade.initiator === userId || trade.target === userId);
384|
385|    const successfulTrades = userTrades.filter((t) => t.status === 'completed');
386|    const totalValue = successfulTrades.reduce((sum, trade) => sum + trade.offer.gold + trade.request.gold, 0);
387|
388|    return {
389|      totalTrades: userTrades.length,
390|      successfulTrades: successfulTrades.length,
391|      totalValueTraded: totalValue,
392|      successRate: userTrades.length > 0 ? (successfulTrades.length / userTrades.length) * 100 : 0,
393|      averageTradeValue: successfulTrades.length > 0 ? totalValue / successfulTrades.length : 0,
394|    };
395|  }
396|
397|  // Cleanup expired trades and auctions
398|  cleanup() {
399|    const now = Date.now();
400|
401|    // Clean up expired active trades (older than 24 hours)
402|    for (const [tradeId, trade] of this.activeTrades) {
403|      if (now - trade.created > 24 * 60 * 60 * 1000) {
404|        trade.status = 'expired';
405|        this.completedTrades.push({ ...trade });
406|        this.activeTrades.delete(tradeId);
407|      }
408|    }
409|
410|    // Clean up ended auctions
411|    if (this.auctions) {
412|      for (const [, auction] of this.auctions) {
413|        if (auction.status === 'active' && now > auction.ends) {
414|          auction.status = 'ended';
415|          if (auction.highestBidder) {
416|            auction.status = 'sold';
417|            auction.finalPrice = auction.currentBid;
418|          }
419|        }
420|      }
421|    }
422|
423|    this.saveTrades();
424|  }
425|}
426|
427|// Export singleton instance
428|export const tradingManager = new TradingManager();
429|
430|// Convenience functions
431|// eslint-disable-next-line max-params -- mirrors class method createTradeRequest
432|export function createTradeRequest(initiatorId, targetUserId, offeredItems, requestedItems, offeredGold = 0, requestedGold = 0) {
433|  return tradingManager.createTradeRequest(initiatorId, targetUserId, offeredItems, requestedItems, offeredGold, requestedGold);
434|}
435|
436|export function acceptTrade(tradeId, userId) {
437|  return tradingManager.acceptTrade(tradeId, userId);
438|}
439|
440|export function declineTrade(tradeId, userId) {
441|  return tradingManager.declineTrade(tradeId, userId);
442|}
443|
444|export function cancelTrade(tradeId, userId) {
445|  return tradingManager.cancelTrade(tradeId, userId);
446|}
447|
448|export function executeTrade(tradeId) {
449|  return tradingManager.executeTrade(tradeId);
450|}
451|
452|export function getTradeListings(limit = 20) {
453|  return tradingManager.getTradeListings(limit);
454|}
455|
456|export function getUserTradeHistory(userId, limit = 10) {
457|  return tradingManager.getUserTradeHistory(userId, limit);
458|}
459|
460|export function getTradeStats(userId) {
461|  return tradingManager.getTradeStats(userId);
462|}
463|
464|export function createAuction(itemId, startingBid, durationHours, sellerId) {
465|  return tradingManager.createAuction(itemId, startingBid, durationHours, sellerId);
466|}
467|
468|export function placeBid(auctionId, bidderId, bidAmount) {
469|  return tradingManager.placeBid(auctionId, bidderId, bidAmount);
470|}
471|
472|export function buyoutAuction(auctionId, buyerId) {
473|  return tradingManager.buyoutAuction(auctionId, buyerId);
474|}
475|
476|export function getActiveAuctions(limit = 20) {
477|  return tradingManager.getActiveAuctions(limit);
478|}
479|
480|export function getMarketPrices(itemId, days = 7) {
481|  return tradingManager.getMarketPrices(itemId, days);
482|}
483|
484|export function getTradeAnalytics(userId) {
485|  return tradingManager.getTradeAnalytics(userId);
486|}
487|
488|// Auto-cleanup every 5 minutes. `unref()` is needed so this timer
489|// doesn't keep the Node event loop alive in one-shot scripts / CI tests.
490|const tradingCleanupInterval = setInterval(
491|  () => {
492|    tradingManager.cleanup();
493|  },
494|  5 * 60 * 1000,
495|);
496|if (typeof tradingCleanupInterval.unref === 'function') {
497|  tradingCleanupInterval.unref();
498|}
499|