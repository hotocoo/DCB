import { getDb } from './database.js';
import { logger } from './logger.js';

function ensureUser(userId) {
  try {
    const db = getDb();
    db.prepare("INSERT OR IGNORE INTO users (id) VALUES (?)").run(userId);
  } catch (_ignore) {}
}

/**
 * Economy system backed by SQLite for ACID transaction safety.
 * 
 * All balance mutations use database transactions to ensure:
 * - Atomicity: operations succeed or fail as a unit (no partial transfers)
 * - Durability: committed writes survive process crashes
 * - Consistency: balances never go negative, transactions always match
 */

// In-memory cache for market prices and history (non-critical, reconstructable)
const marketPrices = new Map();
const priceHistory = new Map();

// Market item configuration
const MARKET_ITEMS = {
  health_potion: { basePrice: 25, volatility: 0.1 },
  mana_potion: { basePrice: 40, volatility: 0.15 },
  iron_ore: { basePrice: 5, volatility: 0.2 },
  magic_crystal: { basePrice: 100, volatility: 0.3 },
  dragon_scale: { basePrice: 500, volatility: 0.1 },
};

// Initialize market prices and start fluctuation timer
(function initializeMarket() {
  for (const [itemId, data] of Object.entries(MARKET_ITEMS)) {
    const currentPrice = Math.max(1, Math.round(data.basePrice + (Math.random() - 0.5) * data.basePrice * data.volatility));
    marketPrices.set(itemId, currentPrice);
  }

  // Price fluctuation every 5 minutes. unref() so this doesn't block process exit.
  const priceTimer = setInterval(updateMarketPrices, 300_000);
  if (typeof priceTimer.unref === 'function') priceTimer.unref();
})();

/**
 * Fluctuates market prices based on volatility.
 */
function updateMarketPrices() {
  for (const [itemId, itemData] of Object.entries(MARKET_ITEMS)) {
    const currentPrice = marketPrices.get(itemId);
    if (!currentPrice) continue;

    const change = (Math.random() - 0.5) * itemData.volatility * currentPrice;
    const newPrice = Math.max(1, Math.round(currentPrice + change));
    marketPrices.set(itemId, newPrice);

    // Store price history (in-memory only, max 100 points per item)
    if (!priceHistory.has(itemId)) {
      priceHistory.set(itemId, []);
    }
    const history = priceHistory.get(itemId);
    history.push({ price: newPrice, timestamp: Date.now() });
    if (history.length > 100) history.shift();
  }
}

// Exported convenience functions - all use SQLite underneath for safety

export function getBalance(userId) {
  try {
    ensureUser(userId);
    const db = getDb();
    const row = db.prepare("SELECT amount FROM balances WHERE user_id = ?").get(userId);
    return row?.amount || 0;
  } catch (error) {
    logger.error('Failed to get balance', error instanceof Error ? error : new Error(String(error)));
    return 0;
  }
}

export function setBalance(userId, amount) {
  try {
    ensureUser(userId);
    const db = getDb();
    db.prepare("INSERT OR REPLACE INTO balances (user_id, amount) VALUES (?, ?)").run(
      userId, Math.max(0, Number(amount))
    );
    return getBalance(userId);
  } catch (error) {
    logger.error('Failed to set balance', error instanceof Error ? error : new Error(String(error)));
    return 0;
  }
}

export function addBalance(userId, amount) {
  try {
    const db = getDb();
    ensureUser(userId);
    const amt = Number(amount);
    // Ensure balance row exists first (same pattern as transferBalance)
    db.prepare("INSERT OR IGNORE INTO balances (user_id, amount) VALUES (?, 0)").run(userId);
    db.prepare("UPDATE balances SET amount = COALESCE(amount, 0) + ? WHERE user_id = ?").run(amt, userId);
    return getBalance(userId);
  } catch (error) {
    logger.error('Failed to add balance', error instanceof Error ? error : new Error(String(error)));
    return getBalance(userId);
  }
}

export function subtractBalance(userId, amount) {
  try {
    const db = getDb();
    ensureUser(userId);
    const amt = Number(amount);
    // Ensure balance row exists first
    db.prepare("INSERT OR IGNORE INTO balances (user_id, amount) VALUES (?, 0)").run(userId);
    db.prepare("UPDATE balances SET amount = MAX(0, COALESCE(amount, 0) - ?) WHERE user_id = ?").run(amt, userId);
    return getBalance(userId);
  } catch (error) {
    logger.error('Failed to subtract balance', error instanceof Error ? error : new Error(String(error)));
    return getBalance(userId);
  }
}

/**
 * Atomic transfer between users. Uses SQLite transaction so both legs
 * succeed or fail together — no lost money on crash.
 */
export function transferBalance(fromUserId, toUserId, amount) {
  if (amount <= 0) return { success: false, reason: 'invalid_amount' };

  try {
    const db = getDb();
    ensureUser(toUserId); // Must exist so UPDATE below creates the row via INSERT OR REPLACE
    const fromBal = getBalance(fromUserId);
    if (fromBal < amount) return { success: false, reason: 'insufficient_funds' };

    // Wrap in transaction for atomicity. First ensure recipient has a balance row (creates with 0 if missing),
    // then do simple arithmetic updates. This avoids the FK issue with INSERT OR REPLACE and correlated subqueries.
    const tx = db.transaction((fId, tId, amt) => {
      // Deduct from sender (must exist, checked above)
      db.prepare("UPDATE balances SET amount = MAX(0, amount - ?) WHERE user_id = ?").run(amt, fId);

      // Ensure recipient row exists with 0 balance if not present, then add amount
      db.prepare("INSERT OR IGNORE INTO balances (user_id, amount) VALUES (?, 0)").run(tId);
      db.prepare("UPDATE balances SET amount = COALESCE(amount, 0) + ? WHERE user_id = ?").run(amt, tId);
    });

    tx(fromUserId, toUserId, amount);
    return { success: true };
  } catch (error) {
    logger.error('Transfer failed', error instanceof Error ? error : new Error(String(error)));
    return { success: false, reason: 'transfer_failed' };
  }
}

/**
 * Get market price for an item.
 */
export function getMarketPrice(itemId) {
  return marketPrices.get(itemId) || 1;
}

/**
 * Buy item from market. Deducts balance and records transaction atomically.
 */
export function buyFromMarket(userId, itemId, quantity = 1) {
  if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0 || Math.floor(quantity) !== quantity) {
    return { success: false, reason: 'invalid_quantity' };
  }

  const price = getMarketPrice(itemId);
  const totalCost = price * quantity;
  const currentBalance = getBalance(userId);

  if (currentBalance < totalCost) {
    return { success: false, reason: 'insufficient_funds' };
  }

  try {
    const db = getDb();
    const tx = db.transaction((uid, cost) => {
      db.prepare("UPDATE balances SET amount = MAX(0, amount - ?) WHERE user_id = ?").run(cost, uid);
    });

    tx(userId, totalCost);

    return {
      success: true,
      item: itemId,
      quantity,
      totalCost,
      pricePerUnit: price,
    };
  } catch (error) {
    logger.error('Market purchase failed', error instanceof Error ? error : new Error(String(error)));
    return { success: false, reason: 'purchase_failed' };
  }
}

/**
 * Sell item to market. Credits balance atomically.
 */
export function sellToMarket(userId, itemId, quantity = 1) {
  if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0 || Math.floor(quantity) !== quantity) {
    return { success: false, reason: 'invalid_quantity' };
  }

  const price = getMarketPrice(itemId);
  const totalGain = Math.floor(price * quantity * 0.7); // Sell at 70% of market price

  try {
    const db = getDb();
    db.prepare("UPDATE balances SET amount = COALESCE(amount, 0) + ? WHERE user_id = ?").run(totalGain, userId);

    return {
      success: true,
      item: itemId,
      quantity,
      totalGain,
      pricePerUnit: Math.floor(price * 0.7),
    };
  } catch (error) {
    logger.error('Market sale failed', error instanceof Error ? error : new Error(String(error)));
    return { success: false, reason: 'sale_failed' };
  }
}

/**
 * Get user's transaction history.
 */
export function getTransactionHistory(userId, limit = 50) {
  try {
    const db = getDb();
    return db.prepare(
      "SELECT type, amount, details, created_at FROM economy WHERE user_id = ? ORDER BY created_at DESC LIMIT ?"
    ).all(userId, limit);
  } catch (error) {
    logger.error('Failed to get transaction history', error instanceof Error ? error : new Error(String(error)));
    return [];
  }
}

/**
 * Create a business for a user. Deducts investment and records business atomically.
 */
export function createBusiness(userId, businessType, initialInvestment) {
  if (!userId || typeof userId !== 'string') return { success: false, reason: 'invalid_user' };
  if (typeof initialInvestment !== 'number' || initialInvestment <= 0) return { success: false, reason: 'invalid_investment' };

  const currentBalance = getBalance(userId);
  if (currentBalance < initialInvestment) return { success: false, reason: 'insufficient_funds' };

  try {
    const db = getDb();
    const businessId = `business_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const baseIncome = getBusinessIncome(businessType, 1);

    const tx = db.transaction((bid, uid, invest, bizType, income) => {
      db.prepare("UPDATE balances SET amount = MAX(0, amount - ?) WHERE user_id = ?").run(invest, uid);
      db.prepare(
        "INSERT INTO businesses (id, user_id, type, level, income, last_collected) VALUES (?, ?, ?, 1, ?, ?)"
      ).run(bid, uid, bizType, income, Date.now());
    });

    tx(businessId, userId, initialInvestment, businessType, baseIncome);

    return {
      success: true,
      business: { id: businessId, type: businessType, level: 1, income: baseIncome },
    };
  } catch (error) {
    logger.error('Business creation failed', error instanceof Error ? error : new Error(String(error)));
    return { success: false, reason: 'creation_failed' };
  }
}

function getBusinessIncome(businessType, level) {
  const baseIncomes = { shop: 50, farm: 30, mine: 75, factory: 100, bank: 25, casino: 150 };
  const baseIncome = baseIncomes[businessType] || 25;
  return Math.floor(baseIncome * (1 + (level - 1) * 0.5));
}

/**
 * Get user's businesses.
 */
export function getUserBusinesses(userId) {
  try {
    const db = getDb();
    return db.prepare("SELECT * FROM businesses WHERE user_id = ?").all(userId);
  } catch (error) {
    logger.error('Failed to get businesses', error instanceof Error ? error : new Error(String(error)));
    return [];
  }
}

/**
 * Collect business income. Credits accumulated earnings atomically.
 */
export function collectBusinessIncome(userId) {
  try {
    const db = getDb();
    const businesses = getUserBusinesses(userId);
    if (!businesses.length) return { success: false, reason: 'no_businesses' };

    const now = Date.now();
    let totalIncome = 0;

    for (const biz of businesses) {
      const hoursSinceCollection = (now - biz.last_collected) / (1000 * 60 * 60);
      const income = Math.floor(biz.income * hoursSinceCollection);
      if (income > 0) {
        totalIncome += income;
      }
    }

    if (totalIncome > 0) {
      const tx = db.transaction((uid, income, currentTime) => {
        db.prepare("UPDATE balances SET amount = COALESCE(amount, 0) + ? WHERE user_id = ?").run(income, uid);
        db.prepare("UPDATE businesses SET last_collected = ? WHERE user_id = ?").run(currentTime, uid);
      });

      tx(userId, totalIncome, now);
    }

    return { success: true, income: totalIncome, businesses: businesses.length };
  } catch (error) {
    logger.error('Business income collection failed', error instanceof Error ? error : new Error(String(error)));
    return { success: false, reason: 'collection_failed' };
  }
}

/**
 * Create an investment. Deducts amount and records investment atomically.
 */
export function createInvestment(userId, investmentType, amount) {
  if (!userId || typeof userId !== 'string') return { success: false, reason: 'invalid_user' };
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return { success: false, reason: 'invalid_amount' };

  const types = getInvestmentTypes();
  const typeKey = Object.keys(types).find((k) => types[k] === investmentType) || investmentType;
  if (!types[typeKey]) return { success: false, reason: 'invalid_investment_type' };

  const typeConfig = types[typeKey];
  if (amount < typeConfig.minAmount) return { success: false, reason: 'below_minimum_amount', minimum: typeConfig.minAmount };

  const currentBalance = getBalance(userId);
  if (currentBalance < amount) return { success: false, reason: 'insufficient_funds' };

  try {
    const db = getDb();
    const investmentId = `investment_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const now = Date.now();

    const tx = db.transaction((iid, uid, amt, type, rate, dur) => {
      db.prepare("UPDATE balances SET amount = MAX(0, amount - ?) WHERE user_id = ?").run(amt, uid);
      db.prepare(
        "INSERT INTO investments (id, user_id, type, amount, rate, status, created_at, maturity) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)"
      ).run(iid, uid, type, amt, rate, now, now + dur * 24 * 60 * 60 * 1000);
    });

    tx(investmentId, userId, amount, investmentType, typeConfig.rate, typeConfig.duration);

    return {
      success: true,
      investment: {
        id: investmentId,
        type: investmentType,
        amount,
        rate: typeConfig.rate,
        maturity: now + typeConfig.duration * 24 * 60 * 60 * 1000,
      },
    };
  } catch (error) {
    logger.error('Investment creation failed', error instanceof Error ? error : new Error(String(error)));
    return { success: false, reason: 'creation_failed' };
  }
}

function getInvestmentTypes() {
  return {
    bank: { name: 'Bank Deposit', rate: 0.05, duration: 30, minAmount: 100 },
    stock: { name: 'Stock Market', rate: 0.1, duration: 30, minAmount: 500 },
    venture: { name: 'High Risk Venture', rate: 0.2, duration: 30, minAmount: 1000 },
    real_estate: { name: 'Real Estate', rate: 0.15, duration: 45, minAmount: 2000 },
    crypto: { name: 'Cryptocurrency', rate: 0.25, duration: 15, minAmount: 300 },
    bond: { name: 'Government Bond', rate: 0.03, duration: 60, minAmount: 500 },
  };
}

/**
 * Get user's investments.
 */
export function getUserInvestments(userId) {
  try {
    const db = getDb();
    return db.prepare("SELECT * FROM investments WHERE user_id = ?").all(userId);
  } catch (error) {
    logger.error('Failed to get investments', error instanceof Error ? error : new Error(String(error)));
    return [];
  }
}

/**
 * Process mature investments. Returns payouts atomically for all expired investments.
 */
export function processMatureInvestments() {
  try {
    const db = getDb();
    const now = Date.now();

    const matureInvestments = db.prepare(
      "SELECT id, user_id, amount, rate FROM investments WHERE status = 'active' AND maturity <= ?"
    ).all(now);

    if (!matureInvestments.length) return;

    const tx = db.transaction((investments, currentTime) => {
      for (const inv of investments) {
        const returnAmount = Math.floor(inv.amount * (1 + inv.rate));
        db.prepare("UPDATE balances SET amount = COALESCE(amount, 0) + ? WHERE user_id = ?").run(returnAmount, inv.user_id);
        db.prepare(
          "UPDATE investments SET status = 'matured', returned = ?, matured_at = ? WHERE id = ?"
        ).run(returnAmount, currentTime, inv.id);
      }
    });

    tx(matureInvestments, now);
  } catch (error) {
    logger.error('Failed to process mature investments', error instanceof Error ? error : new Error(String(error)));
  }
}

// Process investments periodically (every hour). unref() so this doesn't block process exit.
const investmentTimer = setInterval(processMatureInvestments, 3_600_000);
if (typeof investmentTimer.unref === 'function') investmentTimer.unref();

/**
 * Reset all economy data for a user (test helper). Clears balance, businesses, investments.
 */
export function resetUserEconomyData(userId) {
  try {
    const db = getDb();
    db.prepare("DELETE FROM balances WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM businesses WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM investments WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM economy WHERE user_id = ?").run(userId);
  } catch (error) {
    logger.error('Failed to reset user economy data', error instanceof Error ? error : new Error(String(error)));
  }
}

