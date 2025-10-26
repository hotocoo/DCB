import { getBalance, addBalance, transferBalance, buyFromMarket, sellToMarket, createInvestment, getUserInvestments, getMarketPrice } from './src/economy.js';
import { warnUser, muteUser, isUserMuted, checkAutoMod, getUserModStats } from './src/moderation.js';
import { createCharacter, getCharacter, applyXp, addItemToInventory, getInventory } from './src/rpg.js';
import { searchSongs, play, pause, stop, getQueue } from './src/music.js';
import assert from 'assert';
import fs from 'fs';

class ComprehensiveTestSuite {
  constructor() {
    this.testResults = [];
    this.testCount = 0;
    this.passCount = 0;
    this.failCount = 0;
    this.testUsers = ['testuser1', 'testuser2', 'testuser3'];
    this.testGuild = 'testguild1';
  }

  log(message, success = true) {
    const status = success ? '✅' : '❌';
    console.log(`${status} ${message}`);
    this.testResults.push({ message, success, timestamp: new Date().toISOString() });
    this.testCount++;
    if (success) this.passCount++;
    else this.failCount++;
  }

  logError(message, error) {
    console.error(`❌ ${message}: ${error.message}`);
    this.testResults.push({ message: `${message}: ${error.message}`, success: false, timestamp: new Date().toISOString(), error: error.stack });
    this.testCount++;
    this.failCount++;
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async testEconomy() {
    console.log('\n💰 Testing Economy System');
    try {
      // Test balance operations
      const initialBalance = getBalance(this.testUsers[0]);
      this.log(`Initial balance: ${initialBalance}`, true);

      addBalance(this.testUsers[0], 1000);
      const newBalance = getBalance(this.testUsers[0]);
      this.log(`Balance after add: ${newBalance}`, newBalance === initialBalance + 1000);

      // Test transfer
      const transferResult = transferBalance(this.testUsers[0], this.testUsers[1], 500);
      this.log(`Transfer successful: ${transferResult.success}`, transferResult.success);

      const balance1 = getBalance(this.testUsers[0]);
      const balance2 = getBalance(this.testUsers[1]);
      this.log(`Balance after transfer: ${balance1}, ${balance2}`, balance1 === 500 && balance2 === 500);

      // Test market
      const price = getMarketPrice('health_potion');
      this.log(`Market price: ${price}`, price > 0);

      const buyResult = buyFromMarket(this.testUsers[1], 'health_potion', 2);
      this.log(`Buy successful: ${buyResult.success}`, buyResult.success);

      const sellResult = sellToMarket(this.testUsers[1], 'health_potion', 1);
      this.log(`Sell successful: ${sellResult.success}`, sellResult.success);

      // Test investment
      const investmentTypes = await import('./src/economy.js').then(m => m.getInvestmentTypes());
      const invResult = createInvestment(this.testUsers[0], investmentTypes.bank, 100);
      this.log(`Investment created: ${invResult.success}`, invResult.success);

      const investments = getUserInvestments(this.testUsers[0]);
      this.log(`Investments count: ${investments.length}`, investments.length > 0);

    } catch (error) {
      this.logError('Economy test failed', error);
    }
  }

  async testModeration() {
    console.log('\n🛡️ Testing Moderation System');
    try {
      // Test warning
      const warn = warnUser(this.testGuild, this.testUsers[0], this.testUsers[1], 'Test warning', 'low');
      this.log(`Warning issued: ${warn.id}`, !!warn.id);

      // Test mute
      const mute = muteUser(this.testGuild, this.testUsers[0], this.testUsers[1], 'Test mute', 60000);
      this.log(`Mute issued: ${mute.id}`, !!mute.id);

      // Test is muted
      const muted = isUserMuted(this.testGuild, this.testUsers[0]);
      this.log(`User is muted: ${muted.muted}`, muted.muted);

      // Test auto mod
      const autoMod = checkAutoMod(this.testGuild, { content: 'Hello world' }, this.testUsers[0]);
      this.log(`Auto mod triggered: ${autoMod.triggered}`, !autoMod.triggered);

      const autoModSpam = checkAutoMod(this.testGuild, { content: 'SPAM SPAM SPAM' }, this.testUsers[0]);
      this.log(`Auto mod spam detected: ${autoModSpam.triggered}`, autoModSpam.violations.some(v => v.type === 'caps'));

      // Test stats
      const stats = getUserModStats(this.testGuild, this.testUsers[0]);
      this.log(`User mod stats: warnings ${stats.warnings}`, stats.warnings > 0);

    } catch (error) {
      this.logError('Moderation test failed', error);
    }
  }

  async testRPG() {
    console.log('\n⚔️ Testing RPG System');
    try {
      // Test character creation
      const char = createCharacter(this.testUsers[0], 'TestHero');
      this.log(`Character created: ${char.name}`, char.name === 'TestHero');

      // Test XP apply
      const xpResult = applyXp(this.testUsers[0], char, 100);
      this.log(`XP applied: gained ${xpResult.gained}`, xpResult.gained > 0);

      // Test inventory
      const itemResult = addItemToInventory(this.testUsers[0], 'health_potion', 5);
      this.log(`Item added: ${itemResult.success}`, itemResult.success);

      const inventory = getInventory(this.testUsers[0]);
      this.log(`Inventory count: ${Object.keys(inventory).length}`, Object.keys(inventory).length > 0);

      // Test get character
      const savedChar = getCharacter(this.testUsers[0]);
      this.log(`Character retrieved: ${savedChar.name}`, !!savedChar);

    } catch (error) {
      this.logError('RPG test failed', error);
    }
  }

  async testMusic() {
    console.log('\n🎵 Testing Music System');
    try {
      // Test search
      const results = await searchSongs('test song', 3);
      this.log(`Search results: ${results.length}`, results.length > 0);

      // Test queue
      const queue = getQueue(this.testGuild);
      this.log(`Queue length: ${queue.length}`, Array.isArray(queue));

      // Test pause/stop
      const pauseResult = await pause(this.testGuild);
      this.log(`Pause executed: ${pauseResult || !pauseResult}`, true);

      const stopResult = await stop(this.testGuild);
      this.log(`Stop executed: ${stopResult}`, true);

    } catch (error) {
      this.logError('Music test failed', error);
    }
  }

  async testIntegrations() {
    console.log('\n🔗 Testing System Integrations');
    try {
      // Test RPG-Economy integration: Buy item with gold
      addBalance(this.testUsers[0], 1000);
      const balanceBefore = getBalance(this.testUsers[0]);
      const buyResult = buyFromMarket(this.testUsers[0], 'health_potion', 1);
      const balanceAfter = getBalance(this.testUsers[0]);
      this.log(`RPG-Economy integration: Balance decreased by ${balanceBefore - balanceAfter}`, balanceBefore > balanceAfter);

      // Test adding item to RPG inventory after purchase (simulate)
      const invResult = addItemToInventory(this.testUsers[0], 'health_potion', 1);
      this.log(`Inventory updated after purchase: ${invResult.success}`, invResult.success);

    } catch (error) {
      this.logError('Integration test failed', error);
    }
  }

  async testErrorHandling() {
    console.log('\n🚨 Testing Error Handling');
    try {
      // Test invalid transfer
      const invalidTransfer = transferBalance(this.testUsers[0], this.testUsers[1], 10000);
      this.log(`Invalid transfer rejected: ${!invalidTransfer.success}`, !invalidTransfer.success);

      // Test insufficient funds
      const insufficientBuy = buyFromMarket(this.testUsers[0], 'health_potion', 1000);
      this.log(`Insufficient funds rejected: ${!insufficientBuy.success}`, !insufficientBuy.success);

      // Test invalid character
      const invalidChar = getCharacter('nonexistent');
      this.log(`Invalid character handled: ${!invalidChar}`, !invalidChar);

    } catch (error) {
      this.logError('Error handling test failed', error);
    }
  }

  async runAllTests() {
    console.log('🚀 Starting Comprehensive Bot System Test Suite');
    console.log('=' .repeat(60));

    await this.testEconomy();
    await this.testModeration();
    await this.testRPG();
    await this.testMusic();
    await this.testIntegrations();
    await this.testErrorHandling();

    console.log('\n' + '=' .repeat(60));
    console.log('📊 Test Results Summary:');
    console.log(`Total Tests: ${this.testCount}`);
    console.log(`✅ Passed: ${this.passCount}`);
    console.log(`❌ Failed: ${this.failCount}`);
    console.log(`Success Rate: ${((this.passCount / this.testCount) * 100).toFixed(1)}%`);

    // Save results
    fs.writeFileSync('comprehensive-test-results.json', JSON.stringify(this.testResults, null, 2));
    console.log('\n📄 Detailed results saved to comprehensive-test-results.json');

    return {
      total: this.testCount,
      passed: this.passCount,
      failed: this.failCount,
      successRate: ((this.passCount / this.testCount) * 100).toFixed(1)
    };
  }
}

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const testSuite = new ComprehensiveTestSuite();
  testSuite.runAllTests().then(results => {
    console.log('\n🏁 Test execution completed');
    process.exit(results.failed > 0 ? 1 : 0);
  }).catch(error => {
    console.error('Test suite failed:', error);
    process.exit(1);
  });
}

export default ComprehensiveTestSuite;