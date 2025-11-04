// Test script specifically for button interaction handlers
import assert from 'node:assert';

import { handleButtonInteraction } from '../src/interactionHandlers';

// Mock interaction object
const mockInteraction = {
  user: {
    id: '123456789012345678',
    username: 'testuser'
  },
  customId: 'test_button_action:test_param',
  guild: {
    id: '987654321098765432',
    name: 'Test Guild'
  },
  message: {
    id: '111111111111111111',
    embeds: [{}],
    components: []
  },
  /** @param {*} options */
  reply: async(options) => {
    console.log('Mock reply called with:', options.content);
    return;
  },
  /** @param {*} options */
  update: async(options) => {
    console.log('Mock update called with:', options.content);
    return;
  },
  /** @param {*} modal */
  showModal: async(modal) => {
    console.log('Mock showModal called with:', modal.customId);
    return;
  }
};

// Mock client
const mockClient = /** @type {*} */({
  commands: new Map()
});

async function testButtonHandlers() {
  console.log('🧪 Testing Button Interaction Handlers');

  try {
    // Test 1: Unknown button action (should handle gracefully)
    console.log('\n1. Testing unknown button action...');
    await handleButtonInteraction(/** @type {*} */({
      ...mockInteraction,
      customId: 'unknown_action:param'
    }), mockClient);
    console.log('✅ Unknown action handled gracefully');

    // Test 2: Music pause button
    console.log('\n2. Testing music pause button...');
    await handleButtonInteraction(/** @type {*} */({
      ...mockInteraction,
      customId: 'music_pause:testguild'
    }), mockClient);
    console.log('✅ Music pause handled gracefully');

    // Test 3: Economy market button
    console.log('\n3. Testing economy market button...');
    await handleButtonInteraction(/** @type {*} */({
      ...mockInteraction,
      customId: 'economy_market:123456789012345678'
    }), mockClient);
    console.log('✅ Economy market handled gracefully');

    // Test 4: RPG leaderboard button
    console.log('\n4. Testing RPG leaderboard button...');
    await handleButtonInteraction(/** @type {*} */({
      ...mockInteraction,
      customId: 'rpg_leaderboard:0:123456789012345678'
    }), mockClient);
    console.log('✅ RPG leaderboard handled gracefully');

    // Test 5: Memory game button
    console.log('\n5. Testing memory game button...');
    await handleButtonInteraction(/** @type {*} */({
      ...mockInteraction,
      customId: 'memory_reset:123456789012345678'
    }), mockClient);
    console.log('✅ Memory game handled gracefully');

    console.log('\n🎉 All button interaction tests passed!');
    return { success: true, message: 'All button handlers work correctly' };

  }
  catch (error) {
    console.error('❌ Button interaction test failed:', String((/** @type {*} */(error)).message));
    console.error('Stack:', String((/** @type {*} */(error)).stack));
    return { success: false, message: String((/** @type {*} */(error)).message), error };
  }
}

// Run the test if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testButtonHandlers().then(result => {
    console.log('\n🏁 Button interaction test completed');
    console.log('Result:', result);
    process.exit(result.success ? 0 : 1);
  }).catch(error => {
    console.error('Test suite failed:', error);
    process.exit(1);
  });
}

export default testButtonHandlers;
