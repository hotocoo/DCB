import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

const TOKEN = process.env.DISCORD_TOKEN;

console.log('🚀 Starting Simple Bot Test...\n');

if (!TOKEN || TOKEN.includes('your-') || TOKEN.length < 50) {
  console.error('❌ INVALID TOKEN - Please get a valid Discord bot token');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
  ],
});

console.log('🔄 Connecting to Discord...');

client.once('clientReady', () => {
  console.log('🎉 SUCCESS! Bot is connected and ready!');
  console.log(`🤖 Bot: ${client.user.tag}`);
  console.log(`🌐 Servers: ${client.guilds.cache.size}`);
  console.log(`👥 Users: ${client.guilds.cache.reduce((total, guild) => total + guild.memberCount, 0)}`);

  setTimeout(() => {
    console.log('\n✅ Simple bot test completed successfully!');
    client.destroy();
    process.exit(0);
  }, 5000);
});

client.on('error', (error) => {
  console.error('❌ Connection error:', error.message);
  process.exit(1);
});

client.login(TOKEN);
