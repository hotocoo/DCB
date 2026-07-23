import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

console.log('🔍 Testing modules one by one...\n');

const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN || TOKEN.includes('your-') || TOKEN.length < 50) {
  console.error('❌ INVALID TOKEN - Please get a valid Discord bot token');
  process.exit(1);
}

console.log('✅ Token format valid');

// Test 1: Basic Discord client only
console.log('\n📋 Test 1: Basic Discord client only');
const basicClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
});

basicClient.once('clientReady', () => {
  console.log('✅ Basic client connected successfully!');
  console.log(`🤖 Bot: ${basicClient.user.tag}`);

  basicClient.destroy();
  testNext();
});

basicClient.login(TOKEN);

async function testNext() {
  // Test 2: Add logger
  console.log('\n📋 Test 2: Adding logger module');
  try {
    const { logger } = await import('./logger.js');
    console.log('✅ Logger loaded successfully');
    testNext2();
  } catch (error) {
    console.error('❌ Logger failed:', error.message);
    console.error('🔧 This is the issue! The logger module has ES6/CommonJS conflicts');
    return;
  }
}

async function testNext2() {
  // Test 3: Add chat module
  console.log('\n📋 Test 3: Adding chat module');
  try {
    const { handleMessage } = await import('./chat.js');
    console.log('✅ Chat module loaded successfully');
    testNext3();
  } catch (error) {
    console.error('❌ Chat module failed:', error.message);
    return;
  }
}

async function testNext3() {
  // Test 4: Add cooldowns module
  console.log('\n📋 Test 4: Adding cooldowns module');
  try {
    const { isOnCooldown } = await import('./cooldowns.js');
    console.log('✅ Cooldowns module loaded successfully');
    testNext4();
  } catch (error) {
    console.error('❌ Cooldowns module failed:', error.message);
    return;
  }
}

async function testNext4() {
  // Test 5: Add locations module
  console.log('\n📋 Test 5: Adding locations module');
  try {
    const { getLocations } = await import('./locations.js');
    console.log('✅ Locations module loaded successfully');
    testNext5();
  } catch (error) {
    console.error('❌ Locations module failed:', error.message);
    return;
  }
}

async function testNext5() {
  console.log('\n📋 Test 6: Adding trading module');
  try {
    const { getActiveAuctions } = await import('./trading.js');
    console.log('✅ Trading module loaded successfully');
    console.log('\n🎉 All core modules loaded successfully!');
  } catch (error) {
    console.error('❌ Trading module failed:', error.message);
    return;
  }
}
