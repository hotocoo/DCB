import path from 'node:path';
import { readJSON, writeJSON } from './utils/fileStorage.js';
import { Cache } from './utils/cache.js';
import { validateNumber, validateUserId } from './utils/validators.js';
import { metrics } from './utils/metrics.js';
import { logger } from './logger.js';

const ECONOMY_FILE = path.join(process.cwd(), 'data', 'economy.json');

// Advanced Economy System with Banking and Marketplace
class EconomyManager {
  constructor() {
    this.economyData = null;
    this.marketPrices = new Map();
    this.priceHistory = new Map();
    this.cache = new Cache('economy', { ttl: 300000, maxSize: 500 });
    this.locks = new Map();
    this.init();
  }

  async init() {
    await this.loadEconomy();
    this.initializeMarket();
  }

  async loadEconomy() {
    try {
      const data = await readJSON(ECONOMY_FILE, {
        userBalances: {},
        transactions: [],
        marketItems: {},
        businessData: {},
        investments: {},
        dailyRewards: {}
      });
      this.economyData = data;
      logger.info('Economy data loaded successfully');
    } catch (error) {
      logger.error('Failed to load economy', error);
      this.economyData = {
        userBalances: {},
        transactions: [],
        marketItems: {},
        businessData: {},
        investments: {},
        dailyRewards: {}
      };
    }
  }

  async saveEconomy() {
    return await metrics.collector.time('economy_save', async () => {
      try {
        const success = await writeJSON(ECONOMY_FILE, this.economyData);
        if (!success) {
          logger.error('Failed to save economy data');
        }
        return success;
      } catch (error) {
        logger.error('Failed to save economy', error);
        return false;
      }
    });
  }

  async acquireLock(lockKey) {
    while (this.locks.has(lockKey)) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    this.locks.set(lockKey, true);
    return () => this.locks.delete(lockKey);
  }

  // Advanced Banking System
  getBalance(userId) {
    const validation = validateUserId(userId);
    if (!validation.valid) {
      logger.warn('Invalid userId for getBalance', { userId });
      return 0;
    }

    const cacheKey = `balance:${userId}`;
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const balance = this.economyData.userBalances[userId] || 0;
    this.cache.set(cacheKey, balance, 60000);
    return balance;
  }

  async setBalance(userId, amount) {
    const validation = validateUserId(userId);
    if (!validation.valid) {
      logger.error('Invalid userId for setBalance', null, { userId });
      return 0;
    }

    const amountValidation = validateNumber(amount, { min: 0 });
    if (!amountValidation.valid) {
      logger.error('Invalid amount for setBalance', null, { userId, amount });
      return this.getBalance(userId);
    }

    const release = await this.acquireLock(`balance:${userId}`);
    try {
      this.economyData.userBalances[userId] = Math.max(0, amount);
      this.cache.delete(`balance:${userId}`);
      await this.saveEconomy();
      metrics.collector.increment('economy_balance_set', 1, { userId });
      return this.economyData.userBalances[userId];
    } finally {
      release();
    }
  }

  async addBalance(userId, amount) {
    const amountValidation = validateNumber(amount, { min: 0 });
    if (!amountValidation.valid) {
      logger.error('Invalid amount for addBalance', null, { userId, amount });
      return this.getBalance(userId);
    }

    const current = this.getBalance(userId);
    return await this.setBalance(userId, current + amount);
  }

  async subtractBalance(userId, amount) {
    const amountValidation = validateNumber(amount, { min: 0 });
    if (!amountValidation.valid) {
      logger.error('Invalid amount for subtractBalance', null, { userId, amount });
      return this.getBalance(userId);
    }

    const current = this.getBalance(userId);
    return await this.setBalance(userId, current - amount);
  }

  async transferBalance(fromUserId, toUserId, amount) {
    return await metrics.collector.time('economy_transfer', async () => {
      const amountValidation = validateNumber(amount, { positive: true });
      if (!amountValidation.valid) {
        logger.warn('Invalid transfer amount', { fromUserId, toUserId, amount });
        return { success: false, reason: 'invalid_amount' };
      }

      if (this.getBalance(fromUserId) < amount) {
        return { success: false, reason: 'insufficient_funds' };
      }

      const release = await this.acquireLock(`transfer:${fromUserId}:${toUserId}`);
      try {
        await this.subtractBalance(fromUserId, amount);
        await this.addBalance(toUserId, amount);

        await this.logTransaction({
          type: 'transfer',
          from: fromUserId,
          to: toUserId,
          amount,
          timestamp: Date.now()
        });

        logger.info('Balance transfer completed', { fromUserId, toUserId, amount });
        metrics.collector.increment('economy_transfer_success', 1);
        return { success: true };
      } catch (error) {
        logger.error('Transfer failed', error, { fromUserId, toUserId, amount });
        metrics.collector.increment('economy_transfer_error', 1);
        return { success: false, reason: 'transfer_error' };
      } finally {
        release();
      }
    });
  }

  // Advanced Transaction System
  async logTransaction(transaction) {
    const release = await this.acquireLock('transactions');
    try {
      transaction.id = `txn_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      this.economyData.transactions.push(transaction);

      // Keep only last 10000 transactions
      if (this.economyData.transactions.length > 10_000) {
        this.economyData.transactions = this.economyData.transactions.slice(-10_000);
      }

      await this.saveEconomy();
      metrics.collector.increment('economy_transaction_logged', 1, { type: transaction.type });
      return transaction;
    } finally {
      release();
    }
  }

  getTransactionHistory(userId, limit = 50) {
    const validation = validateUserId(userId);
    if (!validation.valid) {
      logger.warn('Invalid userId for getTransactionHistory', { userId });
      return [];
    }

    const limitValidation = validateNumber(limit, { min: 1, max: 1000, integer: true });
    const validLimit = limitValidation.valid ? limitValidation.value : 50;

    const cacheKey = `transactions:${userId}:${validLimit}`;
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const transactions = this.economyData.transactions
      .filter(txn => txn.from === userId || txn.to === userId)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, validLimit);

    this.cache.set(cacheKey, transactions, 30000);
    return transactions;
  }

  // Business and Investment System
  async createBusiness(userId, businessType, initialInvestment) {
    return await metrics.collector.time('economy_create_business', async () => {
      const validation = validateUserId(userId);
      if (!validation.valid) {
        return { success: false, reason: 'invalid_user_id' };
      }

      const investmentValidation = validateNumber(initialInvestment, { positive: true });
      if (!investmentValidation.valid) {
        return { success: false, reason: 'invalid_investment' };
      }

      if (this.getBalance(userId) < initialInvestment) {
        return { success: false, reason: 'insufficient_funds' };
      }

      const release = await this.acquireLock(`business:${userId}`);
      try {
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
          employees: 1
        };

        if (!this.economyData.businessData[userId]) {
          this.economyData.businessData[userId] = [];
        }

        this.economyData.businessData[userId].push(business);
        await this.subtractBalance(userId, initialInvestment);
        await this.saveEconomy();

        logger.info('Business created', { userId, businessType, businessId });
        metrics.collector.increment('economy_business_created', 1, { type: businessType });
        return { success: true, business };
      } finally {
        release();
      }
    });
  }

  getBusinessIncome(businessType, level) {
    const baseIncomes = {
      'shop': 50,
      'farm': 30,
      'mine': 75,
      'factory': 100,
      'bank': 25,
      'casino': 150
    };

    const baseIncome = baseIncomes[businessType] || 25;
    return Math.floor(baseIncome * (1 + (level - 1) * 0.5));
  }

  getUserBusinesses(userId) {
    const validation = validateUserId(userId);
    if (!validation.valid) {
      logger.warn('Invalid userId for getUserBusinesses', { userId });
      return [];
    }
    return this.economyData.businessData[userId] || [];
  }

  async upgradeBusiness(userId, businessId) {
    return await metrics.collector.time('economy_upgrade_business', async () => {
      const validation = validateUserId(userId);
      if (!validation.valid) {
        return { success: false, reason: 'invalid_user_id' };
      }

      if (!this.economyData.businessData[userId]) {
        return { success: false, reason: 'no_businesses' };
      }

      const release = await this.acquireLock(`business:${userId}:${businessId}`);
      try {
        const business = this.economyData.businessData[userId].find(b => b.id === businessId);
        if (!business) {
          return { success: false, reason: 'business_not_found' };
        }

        const upgradeCost = business.level * 500;
        if (this.getBalance(userId) < upgradeCost) {
          return { success: false, reason: 'insufficient_funds' };
        }

        await this.subtractBalance(userId, upgradeCost);
        business.level++;
        business.income = this.getBusinessIncome(business.type, business.level);
        business.upgrades++;

        await this.logTransaction({
          type: 'business_upgrade',
          user: userId,
          businessId,
          amount: upgradeCost,
          newLevel: business.level,
          timestamp: Date.now()
        });

        await this.saveEconomy();
        logger.info('Business upgraded', { userId, businessId, newLevel: business.level });
        metrics.collector.increment('economy_business_upgraded', 1);
        return { success: true, business };
      } finally {
        release();
      }
    });
  }

  async collectBusinessIncome(userId) {
    return await metrics.collector.time('economy_collect_business_income', async () => {
      const validation = validateUserId(userId);
      if (!validation.valid) {
        return { success: false, reason: 'invalid_user_id' };
      }

      if (!this.economyData.businessData[userId]) {
        return { success: false, reason: 'no_businesses' };
      }

      const release = await this.acquireLock(`business_income:${userId}`);
      try {
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
          await this.addBalance(userId, totalIncome);

          await this.logTransaction({
            type: 'business_income',
            user: userId,
            amount: totalIncome,
            timestamp: Date.now()
          });

          await this.saveEconomy();
          logger.info('Business income collected', { userId, totalIncome });
          metrics.collector.increment('economy_business_income_collected', 1);
        }

        return {
          success: true,
          income: totalIncome,
          businesses: this.economyData.businessData[userId].length
        };
      } finally {
        release();
      }
    });
  }

  // Investment System
  async createInvestment(userId, investmentType, amount) {
    return await metrics.collector.time('economy_create_investment', async () => {
      const validation = validateUserId(userId);
      if (!validation.valid) {
        return { success: false, reason: 'invalid_user_id' };
      }

      const amountValidation = validateNumber(amount, { positive: true });
      if (!amountValidation.valid) {
        return { success: false, reason: 'invalid_amount' };
      }

      if (this.getBalance(userId) < amount) {
        return { success: false, reason: 'insufficient_funds' };
      }

      const release = await this.acquireLock(`investment:${userId}`);
      try {
        const investmentId = `investment_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

        const investment = {
          id: investmentId,
          user: userId,
          type: investmentType,
          amount,
          created: Date.now(),
          maturity: Date.now() + (investmentType.duration * 24 * 60 * 60 * 1000),
          rate: investmentType.rate,
          status: 'active'
        };

        if (!this.economyData.investments[userId]) {
          this.economyData.investments[userId] = [];
        }

        this.economyData.investments[userId].push(investment);
        await this.subtractBalance(userId, amount);
        await this.saveEconomy();

        logger.info('Investment created', { userId, investmentId, amount });
        metrics.collector.increment('economy_investment_created', 1, { type: investmentType.name });
        return { success: true, investment };
      } finally {
        release();
      }
    });
  }

  getUserInvestments(userId) {
    const validation = validateUserId(userId);
    if (!validation.valid) {
      logger.warn('Invalid userId for getUserInvestments', { userId });
      return [];
    }
    return this.economyData.investments[userId] || [];
  }

  // Define investment types
  getInvestmentTypes() {
    return {
      'bank': { name: 'Bank Deposit', rate: 0.05, duration: 30, minAmount: 100 },
      'stock': { name: 'Stock Market', rate: 0.1, duration: 30, minAmount: 500 },
      'venture': { name: 'High Risk Venture', rate: 0.2, duration: 30, minAmount: 1000 },
      'real_estate': { name: 'Real Estate', rate: 0.15, duration: 45, minAmount: 2000 },
      'crypto': { name: 'Cryptocurrency', rate: 0.25, duration: 15, minAmount: 300, risk: 'high' },
      'bond': { name: 'Government Bond', rate: 0.03, duration: 60, minAmount: 500, risk: 'low' }
    };
  }

  async processMatureInvestments() {
    return await metrics.collector.time('economy_process_investments', async () => {
      const now = Date.now();
      let processedCount = 0;

      for (const userId in this.economyData.investments) {
        const userInvestments = this.economyData.investments[userId];

        for (let i = userInvestments.length - 1; i >= 0; i--) {
          const investment = userInvestments[i];

          if (investment.status === 'active' && now >= investment.maturity) {
            const returnAmount = Math.floor(investment.amount * (1 + investment.rate));
            await this.addBalance(userId, returnAmount);

            investment.status = 'matured';
            investment.returned = returnAmount;
            investment.maturedAt = now;

            await this.logTransaction({
              type: 'investment_return',
              user: userId,
              amount: returnAmount,
              investmentType: investment.type.name,
              timestamp: now
            });

            processedCount++;
          }
        }
      }

      if (processedCount > 0) {
        await this.saveEconomy();
        logger.info('Processed mature investments', { count: processedCount });
        metrics.collector.increment('economy_investments_matured', processedCount);
      }
    });
  }

  // Advanced Marketplace
  initializeMarket() {
    // Initialize market prices for various items
    const marketItems = {
      'health_potion': { basePrice: 25, volatility: 0.1 },
      'mana_potion': { basePrice: 40, volatility: 0.15 },
      'iron_ore': { basePrice: 5, volatility: 0.2 },
      'magic_crystal': { basePrice: 100, volatility: 0.3 },
      'dragon_scale': { basePrice: 500, volatility: 0.1 }
    };

    for (const [itemId, data] of Object.entries(marketItems)) {
      const currentPrice = data.basePrice + (Math.random() - 0.5) * data.basePrice * data.volatility;
      this.marketPrices.set(itemId, Math.max(1, Math.round(currentPrice)));
    }

    // Start price fluctuation
    setInterval(() => this.updateMarketPrices(), 300_000); // Every 5 minutes
  }

  updateMarketPrices() {
    for (const [itemId, currentPrice] of this.marketPrices) {
      const itemData = this.economyData.marketItems[itemId];
      if (itemData) {
        const change = (Math.random() - 0.5) * itemData.volatility * currentPrice;
        const newPrice = Math.max(1, Math.round(currentPrice + change));

        this.marketPrices.set(itemId, newPrice);

        if (!this.priceHistory.has(itemId)) {
          this.priceHistory.set(itemId, []);
        }

        const history = this.priceHistory.get(itemId);
        history.push({ price: newPrice, timestamp: Date.now() });

        if (history.length > 100) {
          history.shift();
        }
      }
    }
    logger.debug('Market prices updated');
    metrics.collector.increment('economy_market_price_update', 1);
  }

  getMarketPrice(itemId) {
    return this.marketPrices.get(itemId) || 1;
  }

  getPriceHistory(itemId, days = 1) {
    const history = this.priceHistory.get(itemId) || [];
    const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);

    return history.filter(h => h.timestamp >= cutoffTime);
  }

  async buyFromMarket(userId, itemId, quantity = 1) {
    return await metrics.collector.time('economy_market_buy', async () => {
      const validation = validateUserId(userId);
      if (!validation.valid) {
        return { success: false, reason: 'invalid_user_id' };
      }

      const quantityValidation = validateNumber(quantity, { positive: true, integer: true });
      if (!quantityValidation.valid) {
        return { success: false, reason: 'invalid_quantity' };
      }

      const price = this.getMarketPrice(itemId);
      const totalCost = price * quantity;

      if (this.getBalance(userId) < totalCost) {
        return { success: false, reason: 'insufficient_funds' };
      }

      const release = await this.acquireLock(`market:${userId}`);
      try {
        await this.subtractBalance(userId, totalCost);

        await this.logTransaction({
          type: 'market_purchase',
          user: userId,
          item: itemId,
          quantity,
          amount: totalCost,
          timestamp: Date.now()
        });

        logger.info('Market purchase', { userId, itemId, quantity, totalCost });
        metrics.collector.increment('economy_market_purchase', 1, { item: itemId });
        return {
          success: true,
          item: itemId,
          quantity,
          totalCost,
          pricePerUnit: price
        };
      } finally {
        release();
      }
    });
  }

  async sellToMarket(userId, itemId, quantity = 1) {
    return await metrics.collector.time('economy_market_sell', async () => {
      const validation = validateUserId(userId);
      if (!validation.valid) {
        return { success: false, reason: 'invalid_user_id' };
      }

      const quantityValidation = validateNumber(quantity, { positive: true, integer: true });
      if (!quantityValidation.valid) {
        return { success: false, reason: 'invalid_quantity' };
      }

      const price = Math.floor(this.getMarketPrice(itemId) * 0.8);
      const totalEarnings = price * quantity;

      const release = await this.acquireLock(`market:${userId}`);
      try {
        await this.addBalance(userId, totalEarnings);

        await this.logTransaction({
          type: 'market_sale',
          user: userId,
          item: itemId,
          quantity,
          amount: totalEarnings,
          timestamp: Date.now()
        });

        logger.info('Market sale', { userId, itemId, quantity, totalEarnings });
        metrics.collector.increment('economy_market_sale', 1, { item: itemId });
        return {
          success: true,
          item: itemId,
          quantity,
          totalEarnings,
          pricePerUnit: price
        };
      } finally {
        release();
      }
    });
  }

  // User Economy Statistics
  getUserEconomyStats(userId) {
    const validation = validateUserId(userId);
    if (!validation.valid) {
      logger.warn('Invalid userId for getUserEconomyStats', { userId });
      return null;
    }

    const cacheKey = `stats:${userId}`;
    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const balance = this.getBalance(userId);
    const transactions = this.getTransactionHistory(userId, 100);
    const businesses = this.economyData.businessData[userId] || [];
    const investments = this.economyData.investments[userId] || [];

    const incomeTransactions = transactions.filter(t => t.type === 'business_income' || t.type === 'investment_return');
    const expenseTransactions = transactions.filter(t => t.type === 'market_purchase' || t.type === 'transfer' && t.from === userId);

    const totalIncome = incomeTransactions.reduce((sum, t) => sum + t.amount, 0);
    const totalExpenses = expenseTransactions.reduce((sum, t) => sum + t.amount, 0);

    const stats = {
      balance,
      totalIncome,
      totalExpenses,
      netWorth: balance + totalIncome - totalExpenses,
      businesses: businesses.length,
      investments: investments.filter(i => i.status === 'active').length,
      transactionCount: transactions.length,
      averageTransaction: transactions.length > 0 ? Math.round((totalIncome + totalExpenses) / transactions.length) : 0
    };

    this.cache.set(cacheKey, stats, 60000);
    return stats;
  }

  // Advanced Features
  async createLottery(userId, ticketPrice, prizePool) {
    return await metrics.collector.time('economy_lottery', async () => {
      const validation = validateUserId(userId);
      if (!validation.valid) {
        return { success: false, reason: 'invalid_user_id' };
      }

      const priceValidation = validateNumber(ticketPrice, { positive: true });
      if (!priceValidation.valid) {
        return { success: false, reason: 'invalid_ticket_price' };
      }

      if (this.getBalance(userId) < ticketPrice) {
        return { success: false, reason: 'insufficient_funds' };
      }

      const release = await this.acquireLock(`lottery:${userId}`);
      try {
        await this.subtractBalance(userId, ticketPrice);

        const lotteryNumber = Math.floor(Math.random() * 1000);
        const winningNumber = Math.floor(Math.random() * 1000);

        const isWinner = lotteryNumber === winningNumber;
        let winnings = 0;

        if (isWinner) {
          winnings = prizePool;
          await this.addBalance(userId, winnings);
        }

        await this.logTransaction({
          type: 'lottery',
          user: userId,
          amount: isWinner ? winnings - ticketPrice : -ticketPrice,
          ticketPrice,
          isWinner,
          timestamp: Date.now()
        });

        logger.info('Lottery played', { userId, isWinner, winnings });
        metrics.collector.increment('economy_lottery_played', 1, { result: isWinner ? 'win' : 'lose' });
        return {
          success: true,
          isWinner,
          winnings,
          lotteryNumber,
          winningNumber
        };
      } finally {
        release();
      }
    });
  }

  // Economy Analytics
  getEconomyAnalytics() {
    const totalMoney = Object.values(this.economyData.userBalances).reduce((sum, balance) => sum + balance, 0);
    const totalTransactions = this.economyData.transactions.length;
    const uniqueUsers = Object.keys(this.economyData.userBalances).length;

    // Calculate market health
    const marketVolume = this.economyData.transactions
      .filter(t => t.type === 'market_purchase' || t.type === 'market_sale')
      .reduce((sum, t) => sum + (t.amount || 0), 0);

    return {
      totalMoney,
      totalTransactions,
      uniqueUsers,
      marketVolume,
      averageBalance: uniqueUsers > 0 ? Math.round(totalMoney / uniqueUsers) : 0,
      marketHealth: marketVolume > 10_000 ? 'excellent' : (marketVolume > 5000 ? 'good' : 'developing')
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
      marketTrends: this.getMarketTrends()
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
          trend: change > 5 ? '📈' : (change < -5 ? '📉' : '➡️')
        });
      }
    }

    return trends.slice(0, 5);
  }

  // Tax System (for server economy balance)
  async collectTaxes(guildId, taxRate = 0.05) {
    return await metrics.collector.time('economy_collect_taxes', async () => {
      const taxRateValidation = validateNumber(taxRate, { min: 0, max: 1 });
      if (!taxRateValidation.valid) {
        logger.error('Invalid tax rate', null, { guildId, taxRate });
        return 0;
      }

      let totalTaxed = 0;
      const release = await this.acquireLock('taxes');
      
      try {
        for (const userId in this.economyData.userBalances) {
          const balance = this.economyData.userBalances[userId];
          if (balance > 1000) {
            const tax = Math.floor(balance * taxRate);
            await this.subtractBalance(userId, tax);
            totalTaxed += tax;
          }
        }

        if (totalTaxed > 0) {
          await this.logTransaction({
            type: 'tax_collection',
            guild: guildId,
            amount: totalTaxed,
            timestamp: Date.now()
          });
          logger.info('Taxes collected', { guildId, totalTaxed });
          metrics.collector.increment('economy_taxes_collected', 1);
        }

        return totalTaxed;
      } finally {
        release();
      }
    });
  }

  // Daily Rewards System
  async claimDailyReward(userId) {
    return await metrics.collector.time('economy_daily_reward', async () => {
      const validation = validateUserId(userId);
      if (!validation.valid) {
        return { success: false, reason: 'invalid_user_id' };
      }

      const now = Date.now();
      const lastClaim = this.economyData.dailyRewards?.[userId]?.lastClaim || 0;
      const oneDay = 24 * 60 * 60 * 1000;

      if (now - lastClaim < oneDay) {
        const hoursLeft = Math.ceil((oneDay - (now - lastClaim)) / (60 * 60 * 1000));
        return { success: false, reason: 'daily_cooldown', hoursLeft };
      }

      const release = await this.acquireLock(`daily:${userId}`);
      try {
        const streak = this.economyData.dailyRewards?.[userId]?.streak || 0;
        const baseReward = 50;
        const streakBonus = Math.min(streak * 10, 100);
        const reward = baseReward + streakBonus;

        await this.addBalance(userId, reward);

        if (!this.economyData.dailyRewards) this.economyData.dailyRewards = {};
        this.economyData.dailyRewards[userId] = {
          lastClaim: now,
          streak: streak + 1
        };

        await this.logTransaction({
          type: 'daily_reward',
          user: userId,
          amount: reward,
          streak: streak + 1,
          timestamp: now
        });

        await this.saveEconomy();
        logger.info('Daily reward claimed', { userId, reward, streak: streak + 1 });
        metrics.collector.increment('economy_daily_reward_claimed', 1);
        return { success: true, reward, streak: streak + 1 };
      } finally {
        release();
      }
    });
  }

  // Cleanup and Maintenance
  async cleanup() {
    return await metrics.collector.time('economy_cleanup', async () => {
      await this.processMatureInvestments();

      const cutoffTime = Date.now() - (30 * 24 * 60 * 60 * 1000);
      this.economyData.transactions = this.economyData.transactions.filter(t => t.timestamp > cutoffTime);

      for (const [itemId, history] of this.priceHistory.entries()) {
        if (history.length > 50) {
          this.priceHistory.set(itemId, history.slice(-50));
          logger.debug('Cleaned up price history', { itemId, oldLength: history.length, newLength: 50 });
        }
      }

      const recentTransactions = this.economyData.transactions.filter(t =>
        t.type === 'market_purchase' || t.type === 'market_sale'
      );
      const activeItems = new Set(recentTransactions.map(t => t.item).filter(Boolean));

      for (const [itemId] of this.marketPrices.entries()) {
        if (!activeItems.has(itemId)) {
          this.marketPrices.delete(itemId);
          this.priceHistory.delete(itemId);
          logger.debug('Cleaned up stale market data', { itemId });
        }
      }

      await this.saveEconomy();
      logger.info('Economy cleanup completed');
      metrics.collector.increment('economy_cleanup_completed', 1);
    });
  }
}

// Export singleton instance
const economyManager = new EconomyManager();

// Wait for initialization
await economyManager.init();

export { economyManager };

// Convenience functions
export async function getBalance(userId) {
  return economyManager.getBalance(userId);
}

export async function addBalance(userId, amount) {
  return await economyManager.addBalance(userId, amount);
}

export async function subtractBalance(userId, amount) {
  return await economyManager.subtractBalance(userId, amount);
}

export async function transferBalance(fromUserId, toUserId, amount) {
  return await economyManager.transferBalance(fromUserId, toUserId, amount);
}

export async function createBusiness(userId, businessType, initialInvestment) {
  return await economyManager.createBusiness(userId, businessType, initialInvestment);
}

export async function collectBusinessIncome(userId) {
  return await economyManager.collectBusinessIncome(userId);
}

export function getMarketPrice(itemId) {
  return economyManager.getMarketPrice(itemId);
}

export async function buyFromMarket(userId, itemId, quantity = 1) {
  return await economyManager.buyFromMarket(userId, itemId, quantity);
}

export async function sellToMarket(userId, itemId, quantity = 1) {
  return await economyManager.sellToMarket(userId, itemId, quantity);
}

export function getUserEconomyStats(userId) {
  return economyManager.getUserEconomyStats(userId);
}

export function getTransactionHistory(userId, limit = 50) {
  return economyManager.getTransactionHistory(userId, limit);
}

export async function createLottery(userId, ticketPrice, prizePool) {
  return await economyManager.createLottery(userId, ticketPrice, prizePool);
}

export function getUserBusinesses(userId) {
  return economyManager.getUserBusinesses(userId);
}

export async function upgradeBusiness(userId, businessId) {
  return await economyManager.upgradeBusiness(userId, businessId);
}

export function getInvestmentTypes() {
  return economyManager.getInvestmentTypes();
}

export async function claimDailyReward(userId) {
  return await economyManager.claimDailyReward(userId);
}

export async function createInvestment(userId, investmentType, amount) {
  return await economyManager.createInvestment(userId, investmentType, amount);
}

export function getUserInvestments(userId) {
  return economyManager.getUserInvestments(userId);
}

// End of file
