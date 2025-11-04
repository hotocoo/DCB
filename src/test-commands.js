import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

(async() => {
  console.log('🔍 Testing command loading...\n');

  const commandsPath = path.join(process.cwd(), 'src', 'commands');

  if (!fs.existsSync(commandsPath)) {
    console.error('❌ Commands directory not found');
    process.exit(1);
  }

  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
  console.log(`📁 Found ${commandFiles.length} command files`);

  let loadedCount = 0;
  let failedCommands = [];

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    console.log(`\n📋 Testing ${file}...`);

    try {
      // Test if file can be imported
      const moduleUrl = pathToFileURL(filePath).href;
      const module = await import(moduleUrl);
      loadedCount++;

      // Validate command structure
      if (!module.data || !module.data.name) {
        console.error(`❌ ${file}: Missing data.name`);
        failedCommands.push(file);
        continue;
      }

      if (!module.execute || typeof module.execute !== 'function') {
        console.error(`❌ ${file}: Missing or invalid execute function`);
        failedCommands.push(file);
        continue;
      }

      console.log(`✅ ${file}: Loaded successfully (${module.data.name})`);

    }
    catch (error) {
      console.error(`❌ ${file}: Failed to load`);
      console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
      failedCommands.push(file);
    }
  }

  console.log('\n📊 Results:');
  console.log(`✅ Successfully loaded: ${loadedCount}`);
  console.log(`❌ Failed to load: ${failedCommands.length}`);

  if (failedCommands.length > 0) {
    console.log('\n❌ Failed commands:');
    for (const cmd of failedCommands) console.log(`   - ${cmd}`);
  }
  else {
    console.log('\n🎉 All commands loaded successfully!');
  }
})();
