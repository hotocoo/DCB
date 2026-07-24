import fs from 'node:fs';
import path from 'node:path';

import { logger } from './logger.js';

const ECONOMY_FILE = path.join(process.cwd(), 'data', 'economy.json');

// Helper to mutate balances in-place without immediate persistence (for batching).
function _setBalanceInPlace(data, userId, amount) {
  data.userBalances[userId] = Math.max(0, Number(amount) || 0);
}

function _addBalanceInPlace(data, userId, amount) {
  const cur = data.userBalances[userId] ?? 0;
  _setBalanceInPlace(data, userId, cur + Number(amount));
}

function _subBalanceInPlace(data, userId, amount) {
  const cur = data.userBalances[userId] ?? 0;
  _setBalanceInPlace(data, userId, cur - Number(amount));
}

// Advanced Economy System with Banking and Marketplace
class EconomyManager {
  constructor() {
    this.ensureStorage();
    this.loadEconomy();
    this.marketPrices = new Map();
    this.priceHistory = new Map();
    this.initializeMarket();
  }

  ensureStorage() {
    const dir = path.dirname(ECONOMY_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(ECONOMY_FILE)) {
      fs.writeFileSync(
        ECONOMY_FILE,
        JSON.stringify({
          userBalances: {},
          transactions: [],
          marketItems: {},
          businessData: {},
          investments: {},
        }),
      );
    }
  }

  loadEconomy() {
    try {
      const data = JSON.parse(fs.readFileSync(ECONOMY_FILE));
      this.economyData = data;
    } catch (error) {
      logger.error('Failed to load economy:', error);
      this.economyData = {
        userBalances: {},
        transactions: [],
        marketItems: {},
        businessData: {},
        investments: {},
      };
    }
  }

  saveEconomy() {
    try {
      fs.writeFileSync(ECONOMY_FILE, JSON.stringify(this.economyData, null, 2));
    } catch (error) {
      logger.error('Failed to save economy:', error);
    }
  }

  // Advanced Banking System
  getBalance(userId) {
    return this.economyData.userBalances[userId] || 0;
  }

  setBalance(userId, amount) {
    this.economyData.userBalances[userId] = Math.max(0, amount);
    this.saveEconomy();
    return this.economyData.userBalances[userId];
  }

  addBalance(userId, amount) {
    const current = this.getBalance(userId);
    return this.setBalance(userId, current + amount);
  }

  subtractBalance(userId, amount) {
    const current = this.getBalance(userId);
    return this.setBalance(userId, current - amount);
  }

  transferBalance(fromUserId, toUserId, amount) {
    if (amount <= 0) return { success: false, reason: 'invalid_amount' };
    // TOCTOU-safe: single in-memory check + single atomic-ish balance mutation,
    // then ONE saveEconomy() call at the end (not one per leg).
    if (this.getBalance(fromUserId) < amount) return { success: false, reason: 'insufficient_funds' };
    const fromCurrent = this.economyData.userBalances[fromUserId] || 0;
    const toCurrent = this.economyData.userBalances[toUserId] || 0;
    this.economyData.userBalances[fromUserId] = Math.max(0, fromCurrent - amount);
    this.economyData.userBalances[toUserId] = Math.max(0, toCurrent + amount);

    // Log transaction
    this.logTransaction({
      type: 'transfer',
      from: fromUserId,
      to: toUserId,
      amount,
      timestamp: Date.now(),
    });

    this.saveEconomy();
    return { success: true };
  }

  // Advanced Transaction System
  logTransaction(transaction) {
    transaction.id = `txn_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    this.economyData.transactions.push(transaction);

    // Keep only last 10000 transactions
    if (this.economyData.transactions.length > 10_000) {
      this.economyData.transactions = this.economyData.transactions.slice(-10_000);
    }

    this.saveEconomy();
    return transaction;
  }

  getTransactionHistory(userId, limit = 50) {
    return this.economyData.transactions
      .filter((txn) => txn.from === userId || txn.to === userId)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  // Business and Investment System
  createBusiness(userId, businessType, initialInvestment) {
    if (!userId || typeof userId !== 'string') {
      return { success: false, reason: 'invalid_user' };
    }
    if (typeof initialInvestment !== 'number' || initialInvestment <= 0) {
      return { success: false, reason: 'invalid_investment' };
    }
    if (this.getBalance(userId) < initialInvestment) {
      return { success: false, reason: 'insufficient_funds' };
    }

    const businessId = `business_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    const business = {
      id: businessId,
      owner: userId,
      type: businessType,
      level: 1,
      income: this.getBusinessIncome(businessType, 1),
      lastCollected: Date.now(),
      created: Date.now(),
      upgrades: 0,
      employees: 1,
    };

    if (!this.economyData.businessData[userId]) {
      this.economyData.businessData[userId] = [];
    }

    this.economyData.businessData[userId].push(business);
    // In-place balance update so we don't double-write (subtractBalance persists).
    const current = this.economyData.userBalances[userId] || 0;
    this.economyData.userBalances[userId] = Math.max(0, current - initialInvestment);
    this.saveEconomy();

    return { success: true, business };
  }

  getBusinessIncome(businessType, level) {
    const baseIncomes = {
      shop: 50,
      farm: 30,
      mine: 75,
      factory: 100,
      bank: 25,
      casino: 150,
    };

    const baseIncome = baseIncomes[businessType] || 25;
    return Math.floor(baseIncome * (1 + (level - 1) * 0.5));
  }

  getUserBusinesses(userId) {
    return this.economyData.businessData[userId] || [];
  }

  upgradeBusiness(userId, businessId) {
    if (!this.economyData.businessData[userId]) {
      return { success: false, reason: 'no_businesses' };
    }

    const business = this.economyData.businessData[userId].find((b) => b.id === businessId);
    if (!business) {
      return { success: false, reason: 'business_not_found' };
    }

    const upgradeCost = business.level * 500;
    if (this.getBalance(userId) < upgradeCost) {
      return { success: false, reason: 'insufficient_funds' };
    }

    // Single atomic write: balance + business update + transaction log all in one save.
    _subBalanceInPlace(this.economyData, userId, upgradeCost);
    business.level++;
    business.income = this.getBusinessIncome(business.type, business.level);
    business.upgrades++;

    const txnId = `txn_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    this.economyData.transactions.push({
      id: txnId,
      type: 'business_upgrade',
      user: userId,
      businessId,
      amount: upgradeCost,
      newLevel: business.level,
      timestamp: Date.now(),
    });

    // Keep only last 10000 transactions (same limit as logTransaction)
    if (this.economyData.transactions.length > 10_000) {
      this.economyData.transactions = this.economyData.transactions.slice(-10_000);
    }

    this.saveEconomy();
    return { success: true, business };
  }

  collectBusinessIncome(userId) {
    if (!this.economyData.businessData[userId]) {
      return { success: false, reason: 'no_businesses' };
    }

    let totalIncome = 0;
    const now = Date.now();

    for (const business of this.economyData.businessData[userId]) {
      const hoursSinceCollection = (now - business.lastCollected) / (1000 * 60 * 60);
      const income = Math.floor(business.income * hoursSinceCollection);

      if (income > 0) {
        totalIncome += income;
        business.lastCollected = now;
      }
    }

    if (totalIncome > 0) {
      // Single atomic write: balance + lastCollected timestamps + transaction log.
      _addBalanceInPlace(this.economyData, userId, totalIncome);

      const txnId = `txn_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      this.economyData.transactions.push({
        id: txnId,
        type: 'business_income',
        user: userId,
        amount: totalIncome,
        timestamp: Date.now(),
      });

      // Keep only last 10000 transactions (same limit as logTransaction)
      if (this.economyData.transactions.length > 10_000) {
        this.economyData.transactions = this.economyData.transactions.slice(-10_000);
      }

      this.saveEconomy();
    }

    return {
      success: true,
      income: totalIncome,
      businesses: this.economyData.businessData[userId].length,
    };
  }

  // Investment System
  createInvestment(userId, investmentType, amount) {
    if (!userId || typeof userId !== 'string') {
      return { success: false, reason: 'invalid_user' };
    }
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return { success: false, reason: 'invalid_amount' };
    }
    const types = this.getInvestmentTypes();
    const typeKey = typeof investmentType === 'string' ? investmentType : Object.keys(types).find((k) => types[k] === investmentType);
    if (!typeKey || !types[typeKey]) {
      return { success: false, reason: 'invalid_investment_type' };
    }
    const typeConfig = types[typeKey];
    if (amount < typeConfig.minAmount) {
      return { success: false, reason: 'below_minimum_amount', minimum: typeConfig.minAmount };
    }
    if (this.getBalance(userId) < amount) {
      return { success: false, reason: 'insufficient_funds' };
    }

    const investmentId = `investment_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    const investment = {
      id: investmentId,
      user: userId,
      type: typeConfig.name || typeKey,
      amount,
      created: Date.now(),
      maturity: Date.now() + typeConfig.duration * 24 * 60 * 60 * 1000,
      rate: typeConfig.rate,
      status: 'active',
    };

    if (!this.economyData.investments[userId]) {
      this.economyData.investments[userId] = [];
    }

    // Single atomic write: balance + investment record together.
    _subBalanceInPlace(this.economyData, userId, amount);
    this.economyData.investments[userId].push(investment);
    this.saveEconomy();

    return { success: true, investment };
  }

  getUserInvestments(userId) {
    return this.economyData.investments[userId] || [];
  }

  // Define investment types
  getInvestmentTypes() {
    return {
      bank: { name: 'Bank Deposit', rate: 0.05, duration: 30, minAmount: 100 },
      stock: { name: 'Stock Market', rate: 0.1, duration: 30, minAmount: 500 },
      venture: { name: 'High Risk Venture', rate: 0.2, duration: 30, minAmount: 1000 },
      real_estate: { name: 'Real Estate', rate: 0.15, duration: 45, minAmount: 2000 },
      crypto: { name: 'Cryptocurrency', rate: 0.25, duration: 15, minAmount: 300, risk: 'high' },
      bond: { name: 'Government Bond', rate: 0.03, duration: 60, minAmount: 500, risk: 'low' },
    };
  }

  processMatureInvestments() {
    const now = Date.now();
    let anyChanged = false;

    for (const userId in this.economyData.investments) {
      const userInvestments = this.economyData.investments[userId];

      for (let i = userInvestments.length - 1; i >= 0; i--) {
        const investment = userInvestments[i];

        if (investment.status === 'active' && now >= investment.maturity) {
          try {
            anyChanged = true;
            const returnAmount = Math.floor(investment.amount * (1 + investment.rate));
            _addBalanceInPlace(this.economyData, userId, returnAmount);

            investment.status = 'matured';
            investment.returned = returnAmount;
            investment.maturedAt = now;

            const txnId = `txn_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
            this.economyData.transactions.push({
              id: txnId,
              type: 'investment_return',
              user: userId,
              amount: returnAmount,
              investmentType: typeof investment.type === 'object' && investment.type.name ? investment.type.name : String(investment.type),
              timestamp: now,
            });
          } catch (error) {
            logger.error('[ECONOMY] Failed to process mature investment, skipping:', error instanceof Error ? error : new Error(String(error)), { userId, investmentId: investment.id });
          }
        }
      }
    }

    // Keep only last 10000 transactions (same limit as logTransaction)
    if (this.economyData.transactions.length > 10_000) {
      this.economyData.transactions = this.economyData.transactions.slice(-10_000);
    }

    if (anyChanged) {
      this.saveEconomy();
    }
  }

  // Advanced Marketplace
  initializeMarket() {
    // Initialize market prices for various items. Persist item metadata to
    // economyData.marketItems so updateMarketPrices can read volatility values.
    const marketItems = {
      health_potion: { basePrice: 25, volatility: 0.1 },
      mana_potion: { basePrice: 40, volatility: 0.15 },
      iron_ore: { basePrice: 5, volatility: 0.2 },
      magic_crystal: { basePrice: 100, volatility: 0.3 },
      dragon_scale: { basePrice: 500, volatility: 0.1 },
    };

    for (const [itemId, data] of Object.entries(marketItems)) {
      // Persist metadata to economyData so price updates use real volatilities
      this.economyData.marketItems[itemId] = data;
      const currentPrice = data.basePrice + (Math.random() - 0.5) * data.basePrice * data.volatility;
      this.marketPrices.set(itemId, Math.max(1, Math.round(currentPrice)));
    }

    // Start price fluctuation. `unref()` so this timer doesn't keep
    // the Node event loop alive in one-shot scripts / CI tests.
    const priceTimer = setInterval(() => this.updateMarketPrices(), 300_000); // Every 5 minutes
    if (typeof priceTimer.unref === 'function') priceTimer.unref();
  }

  updateMarketPrices() {
    for (const [itemId, currentPrice] of this.marketPrices) {
      const itemData = this.economyData.marketItems[itemId];
      // Fallback to default volatility if metadata missing (shouldn't happen after initializeMarket fix)
      if (!itemData) continue;

      const change = (Math.random() - 0.5) * itemData.volatility * currentPrice;
      const newPrice = Math.max(1, Math.round(currentPrice + change));

      this.marketPrices.set(itemId, newPrice);

      // Store price history
      if (!this.priceHistory.has(itemId)) {
        this.priceHistory.set(itemId, []);
      }

      const history = this.priceHistory.get(itemId);
      history.push({ price: newPrice, timestamp: Date.now() });

      // Keep only last 100 price points
      if (history.length > 100) {
        history.shift();
      }
    }
  }

  getMarketPrice(itemId) {
    return this.marketPrices.get(itemId) || 1;
  }

  getPriceHistory(itemId, days = 1) {
    const history = this.priceHistory.get(itemId) || [];
    const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;

    return history.filter((h) => h.timestamp >= cutoffTime);
  }

  buyFromMarket(userId, itemId, quantity = 1) {
    if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0 || Math.floor(quantity) !== quantity) {
      return { success: false, reason: 'invalid_quantity' };
    }

    const price = this.getMarketPrice(itemId);
    const totalCost = price * quantity;

    if (this.getBalance(userId) < totalCost) {
      return { success: false, reason: 'insufficient_funds' };
    }

    // Single atomic write: balance + transaction log together.
    _subBalanceInPlace(this.economyData, userId, totalCost);

    const txnId = `txn_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    this.economyData.transactions.push({
      id: txnId,
      type: 'market_purchase',
      user: userId,
      item: itemId,
      quantity,
      amount: totalCost,
      timestamp: Date.now(),
    });

    // Keep only last 10000 transactions (same limit as logTransaction)
    if (this.economyData.transactions.length > 10_000) {
      this.economyData.transactions = this.economyData.transactions.slice(-10_000);
    }

    this.saveEconomy();

    return {
      success: true,
      item: itemId,
      quantity,
      totalCost,
      pricePerUnit: price,
    };
  }

  sellToMarket(userId, itemId, quantity = 1) {
    if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0 || Math.floor(quantity) !== quantity) {
      return { success: false, reason: 'invalid_quantity' };
    }

    const price = Math.floor(this.getMarketPrice(itemId) * 0.8); // Sell for 80% of market price
    const totalEarnings = price * quantity;

    // Single atomic write: balance + transaction log together.
    _addBalanceInPlace(this.economyData, userId, totalEarnings);

    const txnId = `txn_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    this.economyData.transactions.push({
      id: txnId,
      type: 'market_sale',
      user: userId,
      item: itemId,
      quantity,
      amount: totalEarnings,
      timestamp: Date.now(),
    });

    // Keep only last 10000 transactions (same limit as logTransaction)
    if (this.economyData.transactions.length > 10_000) {
      this.economyData.transactions = this.economyData.transactions.slice(-10_000);
    }

    this.saveEconomy();

    return {
      success: true,
      item: itemId,
      quantity,
      totalEarnings,
      pricePerUnit: price,
    };
  }

  // User Economy Statistics
  getUserEconomyStats(userId) {
    const balance = this.getBalance(userId);
    const transactions = this.getTransactionHistory(userId, 100);
    const businesses = this.economyData.businessData[userId] || [];
    const investments = this.economyData.investments[userId] || [];

    // Calculate statistics
    const incomeTransactions = transactions.filter((t) => t.type === 'business_income' || t.type === 'investment_return');
    const expenseTransactions = transactions.filter((t) => t.type === 'market_purchase' || (t.type === 'transfer' && t.from === userId));

    const totalIncome = incomeTransactions.reduce((sum, t) => sum + t.amount, 0);
    const totalExpenses = expenseTransactions.reduce((sum, t) => sum + t.amount, 0);

    return {
      balance,
      totalIncome,
      totalExpenses,
      netWorth: balance + totalIncome - totalExpenses,
      businesses: businesses.length,
      investments: investments.filter((i) => i.status === 'active').length,
      transactionCount: transactions.length,
      averageTransaction: transactions.length > 0 ? Math.round((totalIncome + totalExpenses) / transactions.length) : 0,
    };
  }

  // Advanced Features
  createLottery(userId, ticketPrice, prizePool) {
    if (this.getBalance(userId) < ticketPrice) {
      return { success: false, reason: 'insufficient_funds' };
    }

    const lotteryNumber = Math.floor(Math.random() * 1000);
    const winningNumber = Math.floor(Math.random() * 1000);

    const isWinner = lotteryNumber === winningNumber;
    let winnings = 0;

    // Single atomic write: balance + transaction log together.
    _subBalanceInPlace(this.economyData, userId, ticketPrice);

    if (isWinner) {
      winnings = prizePool;
      _addBalanceInPlace(this.economyData, userId, winnings);
    }

    const txnId = `txn_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    this.economyData.transactions.push({
      id: txnId,
      type: 'lottery',
      user: userId,
      amount: isWinner ? winnings - ticketPrice : -ticketPrice,
      ticketPrice,
      isWinner,
      timestamp: Date.now(),
    });

    // Keep only last 10000 transactions (same limit as logTransaction)
    if (this.economyData.transactions.length > 10_000) {
      this.economyData.transactions = this.economyData.transactions.slice(-10_000);
    }

    this.saveEconomy();

    return {
      success: true,
      isWinner,
      winnings,
      lotteryNumber,
      winningNumber,
    };
  }

  // Economy Analytics
  getEconomyAnalytics() {
    const totalMoney = Object.values(this.economyData.userBalances).reduce((sum, balance) => sum + balance, 0);
    const totalTransactions = this.economyData.transactions.length;
    const uniqueUsers = Object.keys(this.economyData.userBalances).length;

    // Calculate market health
    const marketVolume = this.economyData.transactions
      .filter((t) => t.type === 'market_purchase' || t.type === 'market_sale')
      .reduce((sum, t) => sum + (t.amount || 0), 0);

    return {
      totalMoney,
      totalTransactions,
      uniqueUsers,
      marketVolume,
      averageBalance: uniqueUsers > 0 ? Math.round(totalMoney / uniqueUsers) : 0,
      marketHealth: marketVolume > 10_000 ? 'excellent' : marketVolume > 5000 ? 'good' : 'developing',
    };
  }

  // Daily/Weekly Economy Reports
  generateEconomyReport(userId) {
    const stats = this.getUserEconomyStats(userId);
    const recentTransactions = this.getTransactionHistory(userId, 10);

    return {
      userStats: stats,
      recentActivity: recentTransactions,
      recommendations: this.generateEconomyRecommendations(stats),
      marketTrends: this.getMarketTrends(),
    };
  }

  generateEconomyRecommendations(stats) {
    const recommendations = [];

    if (stats.balance < 100) {
      recommendations.push('💡 Consider starting a business to generate passive income!');
    }

    if (stats.businesses === 0) {
      recommendations.push('🏪 Businesses provide steady income. Use `/business create` to start!');
    }

    if (stats.investments === 0 && stats.balance > 500) {
      recommendations.push('📈 Consider investing your gold for long-term growth!');
    }

    if (stats.transactionCount < 10) {
      recommendations.push('🤝 More trading activity can increase your economy level!');
    }

    return recommendations;
  }

  getMarketTrends() {
    const trends = [];

    for (const [itemId, history] of this.priceHistory) {
      if (history.length >= 2) {
        const recent = history.slice(-5);
        const avgRecent = recent.reduce((sum, h) => sum + h.price, 0) / recent.length;
        const avgOld = history.slice(0, 5).reduce((sum, h) => sum + h.price, 0) / Math.min(5, history.length);

        const change = ((avgRecent - avgOld) / avgOld) * 100;

        trends.push({
          item: itemId,
          change: Math.round(change),
          trend: change > 5 ? '📈' : change < -5 ? '📉' : '➡️',
        });
      }
    }

    return trends.slice(0, 5);
  }

  // Tax System (for server economy balance)
  collectTaxes(guildId, taxRate = 0.05) {
    let totalTaxed = 0;

    for (const userId in this.economyData.userBalances) {
      const balance = this.economyData.userBalances[userId];
      if (balance > 1000) {
        // Only tax users with significant balance
        const tax = Math.floor(balance * taxRate);
        _subBalanceInPlace(this.economyData, userId, tax);
        totalTaxed += tax;
      }
    }

    if (totalTaxed > 0) {
      const txnId = `txn_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      this.economyData.transactions.push({
        id: txnId,
        type: 'tax_collection',
        guild: guildId,
        amount: totalTaxed,
        timestamp: Date.now(),
      });

      // Keep only last 10000 transactions (same limit as logTransaction)
      if (this.economyData.transactions.length > 10_000) {
        this.economyData.transactions = this.economyData.transactions.slice(-10_000);
      }

      this.saveEconomy();
    }

    return totalTaxed;
  }

  // Daily Rewards System
  claimDailyReward(userId) {
    const now = Date.now();
    const lastClaim = this.economyData.dailyRewards?.[userId]?.lastClaim || 0;
    const oneDay = 24 * 60 * 60 * 1000;

    if (now - lastClaim < oneDay) {
      const hoursLeft = Math.ceil((oneDay - (now - lastClaim)) / (60 * 60 * 1000));
      return { success: false, reason: 'daily_cooldown', hoursLeft };
    }

    // Calculate reward based on streak
    const streak = this.economyData.dailyRewards?.[userId]?.streak || 0;
    const baseReward = 50;
    const streakBonus = Math.min(streak * 10, 100);
    const reward = baseReward + streakBonus;

    // Single atomic write: balance + streak record + transaction log.
    _addBalanceInPlace(this.economyData, userId, reward);

    if (!this.economyData.dailyRewards) this.economyData.dailyRewards = {};
    this.economyData.dailyRewards[userId] = {
      lastClaim: now,
      streak: streak + 1,
    };

    const txnId = `txn_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    this.economyData.transactions.push({
      id: txnId,
      type: 'daily_reward',
      user: userId,
      amount: reward,
      streak: streak + 1,
      timestamp: now,
    });

    // Keep only last 10000 transactions (same limit as logTransaction)
    if (this.economyData.transactions.length > 10_000) {
      this.economyData.transactions = this.economyData.transactions.slice(-10_000);
    }

    this.saveEconomy();

    return { success: true, reward, streak: streak + 1 };
  }

  // Test/Cleanup helper: fully wipe a user's economy data. Returns true
  // if anything was actually removed. Intended for test teardown so
  // automated runs don't pollute the committed `data/economy.json` with
  // balances, transactions, investments, or businesses for fake user ids.
  // Not exposed in any user-facing command surface.
  resetUser(userId) {
    if (!userId || typeof userId !== 'string') return false;
    let removed = false;

    if (this.economyData.userBalances[userId] !== undefined) {
      delete this.economyData.userBalances[userId];
      removed = true;
    }
    if (this.economyData.businessData[userId] !== undefined) {
      delete this.economyData.businessData[userId];
      removed = true;
    }
    if (this.economyData.investments[userId] !== undefined) {
      delete this.economyData.investments[userId];
      removed = true;
    }

    // Investments are tracked by id elsewhere; scrub any investments
    // owned by this user.
    if (this.economyData.investments && typeof this.economyData.investments === 'object') {
      for (const [invId, inv] of Object.entries(this.economyData.investments)) {
        if (inv && inv.userId === userId) {
          delete this.economyData.investments[invId];
          removed = true;
        }
      }
    }

    // Filter transactions involving this user.
    const before = this.economyData.transactions.length;
    this.economyData.transactions = this.economyData.transactions.filter((txn) => txn.from !== userId && txn.to !== userId && txn.user !== userId);
    if (this.economyData.transactions.length !== before) removed = true;

    if (removed) this.saveEconomy();
    return removed;
  }

  // Cleanup and Maintenance
  cleanup() {
    try {
      // Process mature investments (handles its own save internally when needed)
      this.processMatureInvestments();

      let changed = false;

      // Clean up old transaction history (keep only last 30 days)
      const cutoffTime = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const beforeLen = this.economyData.transactions.length;
      this.economyData.transactions = this.economyData.transactions.filter((t) => t.timestamp > cutoffTime);
      if (this.economyData.transactions.length !== beforeLen) changed = true;

      // Clean up price history maps (keep only last 50 entries per item) — do NOT delete market prices.
      for (const [itemId, history] of this.priceHistory.entries()) {
        if (history.length > 50) {
          this.priceHistory.set(itemId, history.slice(-50));
          changed = true;
          logger.debug(`[ECONOMY] Cleaned up price history for ${itemId}: ${history.length} -> 50 entries`);
        }
      }

      if (changed) {
        this.saveEconomy();
      }
    } catch (error) {
      logger.error('[ECONOMY] cleanup() failed:', error instanceof Error ? error : new Error(String(error)));
    }
  }
}

// Export singleton instance
export const economyManager = new EconomyManager();

// Convenience functions
export function getBalance(userId) {
  return economyManager.getBalance(userId);
}

export function addBalance(userId, amount) {
  return economyManager.addBalance(userId, amount);
}

export function subtractBalance(userId, amount) {
  return economyManager.subtractBalance(userId, amount);
}

export function transferBalance(fromUserId, toUserId, amount) {
  return economyManager.transferBalance(fromUserId, toUserId, amount);
}

export function createBusiness(userId, businessType, initialInvestment) {
  return economyManager.createBusiness(userId, businessType, initialInvestment);
}

export function collectBusinessIncome(userId) {
  return economyManager.collectBusinessIncome(userId);
}

export function getMarketPrice(itemId) {
  return economyManager.getMarketPrice(itemId);
}

export function buyFromMarket(userId, itemId, quantity = 1) {
  return economyManager.buyFromMarket(userId, itemId, quantity);
}

export function sellToMarket(userId, itemId, quantity = 1) {
  return economyManager.sellToMarket(userId, itemId, quantity);
}

export function getUserEconomyStats(userId) {
  return economyManager.getUserEconomyStats(userId);
}

export function getTransactionHistory(userId, limit = 50) {
  return economyManager.getTransactionHistory(userId, limit);
}

export function createLottery(userId, ticketPrice, prizePool) {
  return economyManager.createLottery(userId, ticketPrice, prizePool);
}

export function getUserBusinesses(userId) {
  return economyManager.getUserBusinesses(userId);
}

export function upgradeBusiness(userId, businessId) {
  return economyManager.upgradeBusiness(userId, businessId);
}

export function getInvestmentTypes() {
  return economyManager.getInvestmentTypes();
}

export function claimDailyReward(userId) {
  return economyManager.claimDailyReward(userId);
}

export function createInvestment(userId, investmentType, amount) {
  return economyManager.createInvestment(userId, investmentType, amount);
}

export function getUserInvestments(userId) {
  return economyManager.getUserInvestments(userId);
}

// Test/Cleanup helper exposed at the module level for symmetry with the
// other convenience functions. See EconomyManager.resetUser for details.
export function resetUserEconomyData(userId) {
  return economyManager.resetUser(userId);
}

// Scheduled cleanup: process mature investments + trim transactions/history every 5 minutes.
// `unref()` so this timer doesn't keep the Node event loop alive in one-shot scripts / CI tests.
const economyCleanupInterval = setInterval(() => {
  economyManager.cleanup();
}, 5 * 60 * 1000); // every 5 minutes
if (typeof economyCleanupInterval.unref === 'function') economyCleanupInterval.unref();

// End of file
