import fs from 'node:fs';
import path from 'node:path';

const ECONOMY_FILE = path.join(process.cwd(), 'data', 'economy.json');

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
      fs.writeFileSync(ECONOMY_FILE, JSON.stringify({
        userBalances: {},
        transactions: [],
        marketItems: {},
        businessData: {},
        investments: {}
      }));
    }
  }

  loadEconomy() {
    try {
      const data = JSON.parse(fs.readFileSync(ECONOMY_FILE));
      this.economyData = data;
    }
    catch (error) {
      console.error('Failed to load economy:', error);
      this.economyData = {
        userBalances: {},
        transactions: [],
        marketItems: {},
        businessData: {},
        investments: {}
      };
    }
  }

  saveEconomy() {
    try {
      fs.writeFileSync(ECONOMY_FILE, JSON.stringify(this.economyData, null, 2));
    }
    catch (error) {
      console.error('Failed to save economy:', error);
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
    if (this.getBalance(fromUserId) < amount) return { success: false, reason: 'insufficient_funds' };

    this.subtractBalance(fromUserId, amount);
    this.addBalance(toUserId, amount);

    // Log transaction
    this.logTransaction({
      type: 'transfer',
      from: fromUserId,
      to: toUserId,
      amount,
      timestamp: Date.now()
    });

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
      .filter(txn => txn.from === userId || txn.to === userId)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  // Business and Investment System
  createBusiness(userId, businessType, initialInvestment) {
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
      employees: 1
    };

    if (!this.economyData.businessData[userId]) {
      this.economyData.businessData[userId] = [];
    }

    this.economyData.businessData[userId].push(business);
    this.subtractBalance(userId, initialInvestment);
    this.saveEconomy();

    return { success: true, business };
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
    return this.economyData.businessData[userId] || [];
  }

  upgradeBusiness(userId, businessId) {
    if (!this.economyData.businessData[userId]) {
      return { success: false, reason: 'no_businesses' };
    }

    const business = this.economyData.businessData[userId].find(b => b.id === businessId);
    if (!business) {
      return { success: false, reason: 'business_not_found' };
    }

    const upgradeCost = business.level * 500; // Cost increases with level
    if (this.getBalance(userId) < upgradeCost) {
      return { success: false, reason: 'insufficient_funds' };
    }

    this.subtractBalance(userId, upgradeCost);
    business.level++;
    business.income = this.getBusinessIncome(business.type, business.level);
    business.upgrades++;

    this.logTransaction({
      type: 'business_upgrade',
      user: userId,
      businessId,
      amount: upgradeCost,
      newLevel: business.level,
      timestamp: Date.now()
    });

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
      this.addBalance(userId, totalIncome);

      this.logTransaction({
        type: 'business_income',
        user: userId,
        amount: totalIncome,
        timestamp: Date.now()
      });

      this.saveEconomy();
    }

    return {
      success: true,
      income: totalIncome,
      businesses: this.economyData.businessData[userId].length
    };
  }

  // Investment System
  createInvestment(userId, investmentType, amount) {
    if (this.getBalance(userId) < amount) {
      return { success: false, reason: 'insufficient_funds' };
    }

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
    this.subtractBalance(userId, amount);
    this.saveEconomy();

    return { success: true, investment };
  }

  getUserInvestments(userId) {
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

  processMatureInvestments() {
    const now = Date.now();

    for (const userId in this.economyData.investments) {
      const userInvestments = this.economyData.investments[userId];

      for (let i = userInvestments.length - 1; i >= 0; i--) {
        const investment = userInvestments[i];

        if (investment.status === 'active' && now >= investment.maturity) {
          const returnAmount = Math.floor(investment.amount * (1 + investment.rate));
          this.addBalance(userId, returnAmount);

          investment.status = 'matured';
          investment.returned = returnAmount;
          investment.maturedAt = now;

          this.logTransaction({
            type: 'investment_return',
            user: userId,
            amount: returnAmount,
            investmentType: investment.type.name,
            timestamp: now
          });
        }
      }
    }

    this.saveEconomy();
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
  }

  getMarketPrice(itemId) {
    return this.marketPrices.get(itemId) || 1;
  }

  getPriceHistory(itemId, days = 1) {
    const history = this.priceHistory.get(itemId) || [];
    const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);

    return history.filter(h => h.timestamp >= cutoffTime);
  }

  buyFromMarket(userId, itemId, quantity = 1) {
    const price = this.getMarketPrice(itemId);
    const totalCost = price * quantity;

    if (this.getBalance(userId) < totalCost) {
      return { success: false, reason: 'insufficient_funds' };
    }

    this.subtractBalance(userId, totalCost);

    this.logTransaction({
      type: 'market_purchase',
      user: userId,
      item: itemId,
      quantity,
      amount: totalCost,
      timestamp: Date.now()
    });

    return {
      success: true,
      item: itemId,
      quantity,
      totalCost,
      pricePerUnit: price
    };
  }

  sellToMarket(userId, itemId, quantity = 1) {
    const price = Math.floor(this.getMarketPrice(itemId) * 0.8); // Sell for 80% of market price
    const totalEarnings = price * quantity;

    this.addBalance(userId, totalEarnings);

    this.logTransaction({
      type: 'market_sale',
      user: userId,
      item: itemId,
      quantity,
      amount: totalEarnings,
      timestamp: Date.now()
    });

    return {
      success: true,
      item: itemId,
      quantity,
      totalEarnings,
      pricePerUnit: price
    };
  }

  // User Economy Statistics
  getUserEconomyStats(userId) {
    const balance = this.getBalance(userId);
    const transactions = this.getTransactionHistory(userId, 100);
    const businesses = this.economyData.businessData[userId] || [];
    const investments = this.economyData.investments[userId] || [];

    // Calculate statistics
    const incomeTransactions = transactions.filter(t => t.type === 'business_income' || t.type === 'investment_return');
    const expenseTransactions = transactions.filter(t => t.type === 'market_purchase' || t.type === 'transfer' && t.from === userId);

    const totalIncome = incomeTransactions.reduce((sum, t) => sum + t.amount, 0);
    const totalExpenses = expenseTransactions.reduce((sum, t) => sum + t.amount, 0);

    return {
      balance,
      totalIncome,
      totalExpenses,
      netWorth: balance + totalIncome - totalExpenses,
      businesses: businesses.length,
      investments: investments.filter(i => i.status === 'active').length,
      transactionCount: transactions.length,
      averageTransaction: transactions.length > 0 ? Math.round((totalIncome + totalExpenses) / transactions.length) : 0
    };
  }

  // Advanced Features
  createLottery(userId, ticketPrice, prizePool) {
    if (this.getBalance(userId) < ticketPrice) {
      return { success: false, reason: 'insufficient_funds' };
    }

    this.subtractBalance(userId, ticketPrice);

    // Simple lottery system
    const lotteryNumber = Math.floor(Math.random() * 1000);
    const winningNumber = Math.floor(Math.random() * 1000);

    const isWinner = lotteryNumber === winningNumber;
    let winnings = 0;

    if (isWinner) {
      winnings = prizePool;
      this.addBalance(userId, winnings);
    }

    this.logTransaction({
      type: 'lottery',
      user: userId,
      amount: isWinner ? winnings - ticketPrice : -ticketPrice,
      ticketPrice,
      isWinner,
      timestamp: Date.now()
    });

    return {
      success: true,
      isWinner,
      winnings,
      lotteryNumber,
      winningNumber
    };
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
  collectTaxes(guildId, taxRate = 0.05) {
    let totalTaxed = 0;

    for (const userId in this.economyData.userBalances) {
      const balance = this.economyData.userBalances[userId];
      if (balance > 1000) { // Only tax users with significant balance
        const tax = Math.floor(balance * taxRate);
        this.subtractBalance(userId, tax);
        totalTaxed += tax;
      }
    }

    if (totalTaxed > 0) {
      this.logTransaction({
        type: 'tax_collection',
        guild: guildId,
        amount: totalTaxed,
        timestamp: Date.now()
      });
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

    this.addBalance(userId, reward);

    // Update streak
    if (!this.economyData.dailyRewards) this.economyData.dailyRewards = {};
    this.economyData.dailyRewards[userId] = {
      lastClaim: now,
      streak: streak + 1
    };

    this.logTransaction({
      type: 'daily_reward',
      user: userId,
      amount: reward,
      streak: streak + 1,
      timestamp: now
    });

    this.saveEconomy();

    return { success: true, reward, streak: streak + 1 };
  }

  // Cleanup and Maintenance
  cleanup() {
    // Process mature investments
    this.processMatureInvestments();

    // Clean up old transaction history
    const cutoffTime = Date.now() - (30 * 24 * 60 * 60 * 1000); // 30 days
    this.economyData.transactions = this.economyData.transactions.filter(t => t.timestamp > cutoffTime);

    // Clean up price history maps (keep only last 50 entries per item)
    for (const [itemId, history] of this.priceHistory.entries()) {
      if (history.length > 50) {
        this.priceHistory.set(itemId, history.slice(-50));
        console.log(`[ECONOMY] Cleaned up price history for ${itemId}: ${history.length} -> 50 entries`);
      }
    }

    // Clean up stale market prices (remove items with no recent activity)
    const recentTransactions = this.economyData.transactions.filter(t =>
      t.type === 'market_purchase' || t.type === 'market_sale'
    );
    const activeItems = new Set(recentTransactions.map(t => t.item).filter(Boolean));

    for (const [itemId] of this.marketPrices.entries()) {
      if (!activeItems.has(itemId)) {
        this.marketPrices.delete(itemId);
        this.priceHistory.delete(itemId);
        console.log(`[ECONOMY] Cleaned up stale market data for ${itemId}`);
      }
    }

    this.saveEconomy();
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

// End of file
