import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

const TOKEN = process.env.DISCORD_TOKEN;

console.log('🔍 Testing Discord Token...\n');

if (!TOKEN || TOKEN.includes('your-') || TOKEN.length < 50) {
  console.error('❌ INVALID TOKEN in .env file');
  console.log('\n📋 To fix this:');
  console.log('1. Go to https://discord.com/developers/applications');
  console.log('2. Select your bot application');
  console.log('3. Go to "Bot" section');
  console.log('4. Click "Reset Token"');
  console.log('5. Copy the new token to .env file');
  process.exit(1);
}

const tokenParts = TOKEN.split('.');
if (tokenParts.length !== 3) {
  console.error('❌ Token format is wrong - should have 3 parts separated by dots');
  process.exit(1);
}

console.log('✅ Token format looks correct');
console.log('🔄 Testing connection to Discord...');

const testClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ]
});

testClient.on('ready', () => {
  console.log('✅ SUCCESS! Token is working!');
  console.log(`🤖 Connected as: ${testClient.user.tag}`);
  testClient.destroy();
  process.exit(0);
});

testClient.on('error', (error) => {
  console.error('❌ CONNECTION FAILED:', error.message);
  console.log('\nThis usually means:');
  console.log('- Token is expired or revoked');
  console.log('- Bot is disabled in Discord');
  console.log('- Missing required intents');
  testClient.destroy();
  process.exit(1);
});

testClient.login(TOKEN);
