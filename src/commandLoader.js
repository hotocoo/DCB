import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

export async function loadCommands(client) {
  const commandsPath = path.join(process.cwd(), 'src', 'commands');
  console.log('Commands path:', commandsPath);
  if (fs.existsSync(commandsPath)) {
    console.log('Commands directory exists, reading files...');
    const files = fs.readdirSync(commandsPath);
    console.log('Found files:', files);
    for (const file of files) {
      if (file.endsWith('.js') || file.endsWith('.mjs') || file.endsWith('.cjs')) {
        console.log('Loading command file:', file);
        try {
          const moduleUrl = pathToFileURL(path.join(commandsPath, file)).href;
          const { data, execute } = await import(moduleUrl);
          console.log('Loaded command:', data.name);
          client.commands.set(data.name, { data, execute });
        } catch (error) {
          console.error(`Failed to load command ${file}:`, error.message);
        }
      }
    }
    console.log('Finished loading commands');
  } else {
    console.log('Commands directory does not exist');
  }
}