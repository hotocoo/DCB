1|import fs from 'node:fs';
2|import path from 'node:path';
3|import { pathToFileURL } from 'node:url';
4|
5|import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
6|
7|async function getAllCommands() {
8|  const commandsPath = path.join(process.cwd(), 'src', 'commands');
9|  const commands = [];
10|
11|  if (fs.existsSync(commandsPath)) {
12|    for (const file of fs.readdirSync(commandsPath)) {
13|      if (file.endsWith('.js')) {
14|        try {
15|          const filePath = path.join(commandsPath, file);
16|          const moduleUrl = pathToFileURL(filePath).href;
17|          const command = await import(moduleUrl);
18|          if (command.data && command.data.name) {
19|            commands.push(command.data);
20|          }
21|        } catch (error) {
22|          logger.error(`Failed to load command ${file}:`, error instanceof Error ? error : new Error(String(error)));
23|        }
24|      }
25|    }
26|  }
27|
28|  return commands;
29|}
30|
31|export const data = new SlashCommandBuilder()
32|  .setName('help')
33|  .setDescription('Shows comprehensive help about all bot features')
34|  .addStringOption((option) =>
35|    option
36|      .setName('category')
37|      .setDescription('Specific category to show help for')
38|      .addChoices(
39|        { name: 'All Commands', value: 'all' },
40|        { name: 'RPG System', value: 'rpg' },
41|        { name: 'Minigames', value: 'games' },
42|        { name: 'Utility', value: 'utility' },
43|        { name: 'Chat & AI', value: 'chat' },
44|        { name: 'Admin & Moderation', value: 'admin' },
45|      ),
46|  );
47|
48|export async function execute(interaction) {
49|  const category = interaction.options.getString('category') || 'all';
50|  const commands = await getAllCommands();
51|
52|  // Organize commands by category
53|  const commandCategories = {
54|    rpg: [],
55|    games: [],
56|    utility: [],
57|    chat: [],
58|    admin: [],
59|  };
60|
61|  for (const cmd of commands) {
62|    const name = cmd.name;
63|    const description = cmd.description || 'No description available';
64|
65|    if (name === 'rpg') commandCategories.rpg.push(`\`/${name}\` - ${description}`);
66|    else if (
67|      ['8ball', 'roll', 'rps', 'minigame', 'novel', 'connect4', 'guess', 'hangman', 'memory', 'tictactoe', 'trivia', 'wordle', 'fun', 'coinflip'].includes(name)
68|    )
69|      commandCategories.games.push(`\`/${name}\` - ${description}`);
70|    else if (['ping', 'echo', 'help', 'setmodel', 'togglechat', 'toggleplay', 'remind', 'poll', 'weather', 'music', 'profile'].includes(name))
71|      commandCategories.utility.push(`\`/${name}\` - ${description}`);
72|    else if (['chat', 'ai', 'api'].includes(name)) commandCategories.chat.push(`\`/${name}\` - ${description}`);
73|    else if (['admin', 'guild', 'achievements', 'economy', 'inventory', 'trade', 'explore'].includes(name))
74|      commandCategories.admin.push(`\`/${name}\` - ${description}`);
75|    else commandCategories.utility.push(`\`/${name}\` - ${description}`);
76|  }
77|
78|  const embed = new EmbedBuilder().setTitle('🤖 Discord Bot Help').setColor(0x00_99_ff).setTimestamp();
79|
80|  switch (category) {
81|    case 'rpg': {
82|      embed.setDescription('**RPG System Commands**\n\n' + commandCategories.rpg.join('\n'));
83|      embed.addFields({
84|        name: 'RPG Features',
85|        value:
86|          '• Character creation and leveling\n• Combat system with monsters\n• Exploration and random events\n• Quest system\n• Skill point allocation\n• Leaderboards and statistics',
87|        inline: false,
88|      });
89|      break;
90|    }
91|
92|    case 'games': {
93|      embed.setDescription('**Minigame Commands**\n\n' + commandCategories.games.join('\n'));
94|      embed.addFields({
95|        name: 'Available Games',
96|        value:
97|          '• **8ball**: Magic 8-ball for questions\n• **roll**: Dice rolling (e.g., 2d6, 1d20)\n• **rps**: Rock Paper Scissors\n• **minigame**: Interactive typing challenges\n• **novel**: AI-generated story creation',
98|        inline: false,
99|      });
100|      break;
101|    }
102|
103|    case 'utility': {
104|      embed.setDescription('**Utility Commands**\n\n' + commandCategories.utility.join('\n'));
105|      embed.addFields({
106|        name: 'Utility Features',
107|        value:
108|          '• **ping**: Check bot latency\n• **echo**: Repeat messages\n• **setmodel**: Configure AI models per server\n• **togglechat**: Enable/disable chat responses\n• **toggleplay**: Enable/disable playful responses',
109|        inline: false,
110|      });
111|      break;
112|    }
113|
114|    case 'chat': {
115|      embed.setDescription('**Chat & AI Features**\n\n' + commandCategories.chat.join('\n'));
116|      embed.addFields({
117|        name: 'AI Integration',
118|        value:
119|          '• DM the bot or mention it to start chatting\n• Supports OpenAI GPT models\n• Compatible with local AI models\n• Conversation history and context\n• Type `!clear` to reset conversation\n• Configurable per-server AI settings',
120|        inline: false,
121|      });
122|      break;
123|    }
124|
125|    case 'admin': {
126|      embed.setDescription('**Admin & Moderation Commands**\n\n' + commandCategories.admin.join('\n'));
127|      embed.addFields({
128|        name: 'Admin Features',
129|        value:
130|          '• **admin**: Server administration tools\n• **guild**: Guild management\n• **achievements**: Achievement system\n• **economy**: Currency and trading\n• **inventory**: Player items\n• **trade**: Marketplace system\n• **explore**: Adventure system',
131|        inline: false,
132|      });
133|      break;
134|    }
135|
136|    default: {
137|      embed.setDescription(
138|        '**All Available Commands**\n\n' +
139|          '🏆 **RPG System**\n' +
140|          commandCategories.rpg.join('\n') +
141|          '\n\n' +
142|          '🛡️ **Admin & Moderation**\n' +
143|          commandCategories.admin.join('\n') +
144|          '\n\n' +
145|          '🎮 **Games & Fun**\n' +
146|          commandCategories.games.join('\n') +
147|          '\n\n' +
148|          '🔧 **Utilities**\n' +
149|          commandCategories.utility.join('\n'),
150|      );
151|
152|      embed.addFields(
153|        {
154|          name: '💬 Chat & AI',
155|          value: 'DM the bot or mention it to chat!\nSupports OpenAI and local models.',
156|          inline: true,
157|        },
158|        {
159|          name: '📚 More Info',
160|          value: 'Use `/help category:rpg`, `/help category:admin`, `/help category:games`, or `/help category:utility` for more details',
161|          inline: true,
162|        },
163|      );
164|    }
165|  }
166|
167|  await interaction.reply({ embeds: [embed], ephemeral: true });
168|}
169|
170|export { getAllCommands };
171|