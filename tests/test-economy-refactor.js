/**
 * Test for refactored economy.js module
 * Verifies that the async refactoring works correctly
 */

import { economyManager } from '../src/economy.js';

async function runTests() {
  console.log('🧪 Starting economy.js refactoring tests...\n');
  
  let passed = 0;
  let failed = 0;
  
  // Test 1: Check that economyManager is initialized
  try {
    if (economyManager && economyManager.economyData) {
      console.log('✅ Test 1: EconomyManager initialized');
      passed++;
    } else {
      console.log('❌ Test 1: EconomyManager not properly initialized');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 1: Error -', error.message);
    failed++;
  }
  
  // Test 2: Test getBalance (synchronous method with validation)
  try {
    const balance = economyManager.getBalance('123456789012345678');
    if (typeof balance === 'number') {
      console.log('✅ Test 2: getBalance returns a number:', balance);
      passed++;
    } else {
      console.log('❌ Test 2: getBalance did not return a number');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 2: Error -', error.message);
    failed++;
  }
  
  // Test 3: Test setBalance (async method)
  try {
    const testUserId = '123456789012345678';
    const newBalance = await economyManager.setBalance(testUserId, 1000);
    if (newBalance === 1000) {
      console.log('✅ Test 3: setBalance works correctly');
      passed++;
    } else {
      console.log('❌ Test 3: setBalance returned unexpected value:', newBalance);
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 3: Error -', error.message);
    failed++;
  }
  
  // Test 4: Test addBalance (async method)
  try {
    const testUserId = '123456789012345678';
    await economyManager.setBalance(testUserId, 100);
    const newBalance = await economyManager.addBalance(testUserId, 50);
    if (newBalance === 150) {
      console.log('✅ Test 4: addBalance works correctly');
      passed++;
    } else {
      console.log('❌ Test 4: addBalance returned unexpected value:', newBalance);
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 4: Error -', error.message);
    failed++;
  }
  
  // Test 5: Test transferBalance (async method with locks)
  try {
    const fromUserId = '123456789012345678';
    const toUserId = '987654321098765432';
    await economyManager.setBalance(fromUserId, 500);
    await economyManager.setBalance(toUserId, 0);
    
    const result = await economyManager.transferBalance(fromUserId, toUserId, 200);
    
    if (result.success === true) {
      const fromBalance = economyManager.getBalance(fromUserId);
      const toBalance = economyManager.getBalance(toUserId);
      
      if (fromBalance === 300 && toBalance === 200) {
        console.log('✅ Test 5: transferBalance works correctly with locks');
        passed++;
      } else {
        console.log('❌ Test 5: Balance mismatch after transfer');
        failed++;
      }
    } else {
      console.log('❌ Test 5: Transfer failed');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 5: Error -', error.message);
    failed++;
  }
  
  // Test 6: Test input validation (invalid userId)
  try {
    const balance = economyManager.getBalance('invalid');
    if (balance === 0) {
      console.log('✅ Test 6: Invalid userId validation works');
      passed++;
    } else {
      console.log('❌ Test 6: Invalid userId should return 0');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 6: Error -', error.message);
    failed++;
  }
  
  // Test 7: Test caching (should return same value quickly)
  try {
    const testUserId = '123456789012345678';
    await economyManager.setBalance(testUserId, 1234);
    
    const start = Date.now();
    const balance1 = economyManager.getBalance(testUserId);
    const balance2 = economyManager.getBalance(testUserId);
    const duration = Date.now() - start;
    
    if (balance1 === balance2 && balance1 === 1234 && duration < 10) {
      console.log('✅ Test 7: Caching works correctly');
      passed++;
    } else {
      console.log('❌ Test 7: Caching issue detected');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 7: Error -', error.message);
    failed++;
  }
  
  // Test 8: Test metrics tracking
  try {
    if (economyManager.cache && economyManager.locks) {
      console.log('✅ Test 8: Cache and locks properly initialized');
      passed++;
    } else {
      console.log('❌ Test 8: Cache or locks not initialized');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 8: Error -', error.message);
    failed++;
  }
  
  // Test 9: Test getTransactionHistory with validation
  try {
    const testUserId = '123456789012345678';
    const history = economyManager.getTransactionHistory(testUserId, 10);
    if (Array.isArray(history)) {
      console.log('✅ Test 9: getTransactionHistory returns array');
      passed++;
    } else {
      console.log('❌ Test 9: getTransactionHistory should return array');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 9: Error -', error.message);
    failed++;
  }
  
  // Test 10: Test getUserEconomyStats
  try {
    const testUserId = '123456789012345678';
    const stats = economyManager.getUserEconomyStats(testUserId);
    if (stats && typeof stats.balance === 'number') {
      console.log('✅ Test 10: getUserEconomyStats works correctly');
      passed++;
    } else {
      console.log('❌ Test 10: getUserEconomyStats returned invalid data');
      failed++;
    }
  } catch (error) {
    console.log('❌ Test 10: Error -', error.message);
    failed++;
  }
  
  // Summary
  console.log('\n📊 Test Results:');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log('\n⚠️ Some tests failed.');
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
