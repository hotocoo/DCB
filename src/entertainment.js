import fs from 'fs';
import path from 'path';

const ENTERTAINMENT_FILE = path.join(process.cwd(), 'data', 'entertainment.json');

// Advanced Entertainment and Fun System
class EntertainmentManager {
  constructor() {
    this.ensureStorage();
    this.loadEntertainment();
    this.jokeCache = new Map();
    this.funStats = new Map();
    this.contentCache = new Map(); // Cache for recently generated content
    this.MAX_CACHE_SIZE = 1000;
  }

  ensureStorage() {
    const dir = path.dirname(ENTERTAINMENT_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(ENTERTAINMENT_FILE)) {
      fs.writeFileSync(ENTERTAINMENT_FILE, JSON.stringify({
        funStats: {},
        jokeRatings: {},
        gameScores: {},
        entertainmentHistory: []
      }));
    }
  }

  loadEntertainment() {
    try {
      const data = JSON.parse(fs.readFileSync(ENTERTAINMENT_FILE, 'utf8'));
      this.entertainmentData = data;
    } catch (error) {
      console.error('Failed to load entertainment data:', error);
      this.entertainmentData = {
        funStats: {},
        jokeRatings: {},
        gameScores: {},
        entertainmentHistory: []
      };
    }
  }

  saveEntertainment() {
    try {
      fs.writeFileSync(ENTERTAINMENT_FILE, JSON.stringify(this.entertainmentData, null, 2));
    } catch (error) {
      console.error('Failed to save entertainment data:', error);
    }
  }

  // Advanced Joke System
  getRandomJoke(category = 'general') {
    const jokes = {
      general: [
        "Why don't scientists trust atoms? Because they make up everything!",
        "What do you call fake spaghetti? An impasta!",
        "Why did the scarecrow win an award? He was outstanding in his field!",
        "Why don't eggs tell jokes? They'd crack each other up!",
        "What do you call cheese that isn't yours? Nacho cheese!",
        "Why did the bicycle fall over? Because it was two-tired!",
        "What do you call a bear with no teeth? A gummy bear!",
        "Why don't skeletons fight each other? They don't have the guts!"
      ],
      programming: [
        "Why do programmers prefer dark mode? Because light attracts bugs!",
        "How many programmers does it take to change a light bulb? None – that's a hardware problem!",
        "Why do Java developers wear glasses? Because they can't C#!",
        "A SQL query walks into a bar, approaches two tables and asks: 'Can I join you?'",
        "Why did the programmer quit his job? Because he didn't get arrays!",
        "There are 10 types of people in the world: those who understand binary and those who don't!",
        "Why do programmers always mix up Halloween and Christmas? Because Oct 31 == Dec 25!",
        "How do you comfort a JavaScript bug? You console it!"
      ],
      dad: [
        "I'm reading a book about anti-gravity. It's impossible to put down!",
        "Did you hear about the restaurant on the moon? Great food, no atmosphere!",
        "What do you call a fish with no eyes? Fsh!",
        "Why did the golfer bring two pairs of pants? In case he got a hole in one!",
        "What do you call someone with no body and no nose? Nobody knows!",
        "Why can't you hear a pterodactyl go to the bathroom? Because the 'P' is silent!",
        "What does a zombie vegetarian eat? 'GRRRAAAINNS!'",
        "Why did the math book look sad? Because it had too many problems!"
      ],
      math: [
        "Why was the equal sign so humble? Because it knew it wasn't less than or greater than anyone else!",
        "What do you call friends who love math? Algebros!",
        "Why is the obtuse triangle always so frustrated? Because it's never right!",
        "Why did the student wear glasses in math class? To improve di-vision!",
        "What did the zero say to the eight? 'Nice belt!'",
        "Why was the math book sad? Because it had too many problems!",
        "What do you call a number that can't keep still? A roamin' numeral!",
        "Why did the two fours skip lunch? They already eight!"
      ],
      science: [
        "Why can't you trust atoms? They make up everything!",
        "What did one ocean say to the other ocean? Nothing, they just waved!",
        "Why did the physicist break up with the biologist? There was no chemistry!",
        "What do you call an educated tube? A graduated cylinder!",
        "Why are chemists excellent for solving problems? They have all the solutions!",
        "What do you do with a dead scientist? You barium!",
        "Why did the photon refuse to check a bag at the airport? Because it was traveling light!",
        "What is a physicist's favorite food? Fission chips!"
      ]
    };

    const categoryJokes = jokes[category] || jokes.general;
    const joke = categoryJokes[Math.floor(Math.random() * categoryJokes.length)];

    // Track joke usage
    this.trackJokeUsage(category);

    return {
      joke,
      category,
      id: `joke_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
  }

  trackJokeUsage(category) {
    if (!this.entertainmentData.funStats[category]) {
      this.entertainmentData.funStats[category] = { jokesTold: 0, ratings: [] };
    }
    this.entertainmentData.funStats[category].jokesTold++;
    this.saveEntertainment();
  }

  rateJoke(jokeId, rating) {
    if (!this.entertainmentData.jokeRatings[jokeId]) {
      this.entertainmentData.jokeRatings[jokeId] = [];
    }
    this.entertainmentData.jokeRatings[jokeId].push({
      rating,
      timestamp: Date.now()
    });
    this.saveEntertainment();
    return true;
  }

  // Advanced Storytelling System
  generateStory(prompt, genre = 'fantasy') {
    const storyTemplates = {
      fantasy: [
        `In the enchanted kingdom of Eldoria, where dragons soar and magic flows like rivers...`,
        `Deep in the mystical forest of Eldertree, ancient secrets wait to be discovered...`,
        `Upon the floating islands of Aetheria, where wind spirits dance and stars whisper...`
      ],
      adventure: [
        `The brave explorer set forth on a perilous journey across uncharted lands...`,
        `With map in hand and courage in heart, the adventurer faced the unknown...`,
        `The call to adventure echoed through the hero's soul, impossible to ignore...`
      ],
      mystery: [
        `Shadows concealed secrets in the old mansion, waiting for a detective's keen eye...`,
        `The puzzle pieces scattered like autumn leaves, hiding the truth from view...`,
        `Whispers of conspiracy filled the air, drawing the investigator deeper...`
      ],
      sciFi: [
        `In the year 2147, aboard the starship Odyssey, humanity's fate hung in the balance...`,
        `The quantum computer hummed with artificial consciousness, questioning its existence...`,
        `Across the galaxy, alien civilizations watched as Earth reached for the stars...`
      ]
    };

    const templates = storyTemplates[genre] || storyTemplates.fantasy;
    const baseStory = templates[Math.floor(Math.random() * templates.length)];

    // Generate creative continuation
    const continuations = [
      `${prompt} became the catalyst for an extraordinary tale of courage and discovery.`,
      `What began as ${prompt} evolved into a legendary saga of heroism and wonder.`,
      `The threads of fate wove ${prompt} into an epic narrative of triumph and magic.`
    ];

    const continuation = continuations[Math.floor(Math.random() * continuations.length)];
    const story = `${baseStory} ${continuation}`;

    const content = {
      story,
      genre,
      prompt,
      length: 'medium',
      type: 'story',
      id: `story_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };

    // Store for sharing
    this.storeContentForSharing(content);

    return content;
  }

  // Riddle and Puzzle System
  getRiddle(difficulty = 'medium') {
    const riddles = {
      easy: [
        { riddle: "What has keys but can't open locks?", answer: "piano" },
        { riddle: "What gets wetter as it dries?", answer: "towel" },
        { riddle: "What has a head, a tail, is brown, and has no legs?", answer: "penny" },
        { riddle: "What can you catch but not throw?", answer: "cold" }
      ],
      medium: [
        { riddle: "I speak without a mouth and hear without ears. I have no body, but I come alive with the wind. What am I?", answer: "echo" },
        { riddle: "The more you take, the more you leave behind. What are they?", answer: "footsteps" },
        { riddle: "What has many teeth but can't bite?", answer: "comb" },
        { riddle: "What is full of holes but still holds water?", answer: "sponge" }
      ],
      hard: [
        { riddle: "I am not alive, but I grow; I don't have lungs, but I need air; I don't have a mouth, but water kills me. What am I?", answer: "fire" },
        { riddle: "The person who makes it, sells it. The person who buys it never uses it. The person who uses it never knows they're using it. What is it?", answer: "coffin" },
        { riddle: "What has 13 hearts, but no other organs?", answer: "deck of cards" },
        { riddle: "I have cities, but no houses. I have mountains, but no trees. I have water, but no fish. What am I?", answer: "map" }
      ]
    };

    const difficultyRiddles = riddles[difficulty] || riddles.medium;
    const riddle = difficultyRiddles[Math.floor(Math.random() * difficultyRiddles.length)];

    return {
      ...riddle,
      difficulty,
      id: `riddle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
  }

  // Fun Fact System
  getFunFact(category = 'random') {
    const facts = {
      animals: [
        "Octopuses have three hearts and blue blood!",
        "A group of flamingos is called a 'flamboyance'!",
        "Butterflies taste with their feet!",
        "Penguins can jump as high as 6 feet in the air!"
      ],
      space: [
        "There are more stars in the universe than grains of sand on all the Earth's beaches!",
        "A day on Venus is longer than its year!",
        "Jupiter has 79 confirmed moons!",
        "The footprints on the Moon will be there for 100 million years!"
      ],
      science: [
        "Bananas are berries, but strawberries aren't!",
        "A single cloud can weigh more than a million pounds!",
        "Your brain uses about 20% of your body's energy!",
        "There are more possible games of chess than atoms in the observable universe!"
      ],
      history: [
        "The shortest war in history lasted only 38-45 minutes!",
        "Ancient Romans used urine as mouthwash!",
        "The first computer mouse was made of wood!",
        "Cleopatra lived closer in time to the Moon landing than to the construction of the Great Pyramid!"
      ]
    };

    if (category === 'random') {
      const categories = Object.keys(facts);
      category = categories[Math.floor(Math.random() * categories.length)];
    }

    const categoryFacts = facts[category] || facts.science;
    const fact = categoryFacts[Math.floor(Math.random() * categoryFacts.length)];

    const content = {
      fact,
      category,
      type: 'fact',
      id: `fact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };

    // Store for sharing
    this.storeContentForSharing(content);

    return content;
  }

  // Quote System
  getRandomQuote(category = 'inspirational') {
    const quotes = {
      inspirational: [
        { quote: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
        { quote: "Innovation distinguishes between a leader and a follower.", author: "Steve Jobs" },
        { quote: "Success is not final, failure is not fatal: It is the courage to continue that counts.", author: "Winston Churchill" },
        { quote: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" }
      ],
      motivational: [
        { quote: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
        { quote: "It always seems impossible until it's done.", author: "Nelson Mandela" },
        { quote: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
        { quote: "The only limit to our realization of tomorrow will be our doubts of today.", author: "Franklin D. Roosevelt" }
      ],
      wisdom: [
        { quote: "The only true wisdom is in knowing you know nothing.", author: "Socrates" },
        { quote: "Knowing yourself is the beginning of all wisdom.", author: "Aristotle" },
        { quote: "The unexamined life is not worth living.", author: "Socrates" },
        { quote: "Be kind, for everyone you meet is fighting a hard battle.", author: "Plato" }
      ],
      humor: [
        { quote: "I'm writing a book. I've got the page numbers done.", author: "Steven Wright" },
        { quote: "I always wanted to be somebody, but now I realize I should have been more specific.", author: "Lily Tomlin" },
        { quote: "Why is the math book sad? Because it has too many problems.", author: "Unknown" },
        { quote: "I told my wife she was drawing her eyebrows too high. She looked surprised.", author: "Unknown" }
      ]
    };

    const categoryQuotes = quotes[category] || quotes.inspirational;
    const quote = categoryQuotes[Math.floor(Math.random() * categoryQuotes.length)];

    const content = {
      ...quote,
      category,
      type: 'quote',
      id: `quote_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };

    // Store for sharing
    this.storeContentForSharing(content);

    return content;
  }

  // Tongue Twister Generator
  generateTongueTwister() {
    const twisters = [
      "She sells seashells by the seashore.",
      "Peter Piper picked a peck of pickled peppers.",
      "How much wood would a woodchuck chuck if a woodchuck could chuck wood?",
      "Fuzzy Wuzzy was a bear. Fuzzy Wuzzy had no hair. Fuzzy Wuzzy wasn't very fuzzy, was he?",
      "I saw Susie sitting in a shoeshine shop.",
      "Six sick slick seals sit by the sea.",
      "Black bug bit a big black bear.",
      "How can a clam cram in a clean cream can?"
    ];

    return twisters[Math.floor(Math.random() * twisters.length)];
  }

  // Magic 8-Ball Enhanced
  magic8Ball(question) {
    const responses = [
      // Affirmative
      "It is certain.", "It is decidedly so.", "Without a doubt.", "Yes definitely.",
      "You may rely on it.", "As I see it, yes.", "Most likely.", "Outlook good.",
      "Yes.", "Signs point to yes.",

      // Non-committal
      "Reply hazy, try again.", "Ask again later.", "Better not tell you now.",
      "Cannot predict now.", "Concentrate and ask again.",

      // Negative
      "Don't count on it.", "My reply is no.", "My sources say no.", "Outlook not so good.",
      "Very doubtful."
    ];

    const response = responses[Math.floor(Math.random() * responses.length)];

    return {
      question,
      answer: response,
      id: `8ball_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
  }

  // Fun Name Generator
  generateFunName(type = 'superhero') {
    const names = {
      superhero: [
        "Captain Awesome", "The Amazing Wonder", "Super Spectacular", "Mighty Marvel",
        "Incredible Hero", "Fantastic Force", "Dynamic Defender", "Ultimate Champion"
      ],
      villain: [
        "Dr. Disaster", "The Evil Genius", "Chaos Master", "Shadow Lord",
        "Dark Destroyer", "The Terrible Tyrant", "Wicked Warlock", "Sinister Sorcerer"
      ],
      fantasy: [
        "Mystic Mage", "Dragon Rider", "Elven Archer", "Dwarven Warrior",
        "Phoenix Knight", "Shadow Assassin", "Crystal Sorceress", "Storm Caller"
      ],
      sciFi: [
        "Cyber Warrior", "Space Ranger", "Quantum Hacker", "Nano Engineer",
        "Star Captain", "Robot Commander", "Laser Knight", "Plasma Pilot"
      ]
    };

    const typeNames = names[type] || names.superhero;
    const name = typeNames[Math.floor(Math.random() * typeNames.length)];

    return {
      name,
      type,
      id: `name_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
  }

  // Personality Test System
  getPersonalityQuestion() {
    const questions = [
      {
        question: "How do you prefer to spend your free time?",
        options: ["Reading or learning", "Socializing with friends", "Creating art or music", "Playing sports or games"],
        traits: ["intellectual", "social", "creative", "active"]
      },
      {
        question: "What's your ideal vacation?",
        options: ["Cultural city tour", "Beach relaxation", "Adventure trip", "Staycation at home"],
        traits: ["cultural", "relaxed", "adventurous", "homebody"]
      },
      {
        question: "How do you make decisions?",
        options: ["Based on logic and facts", "Based on feelings and values", "After consulting others", "Spontaneously"],
        traits: ["logical", "emotional", "collaborative", "spontaneous"]
      }
    ];

    return questions[Math.floor(Math.random() * questions.length)];
  }

  // Content retrieval for sharing
  getContentForSharing(contentId) {
    // Check cache first
    if (this.contentCache.has(contentId)) {
      return this.contentCache.get(contentId);
    }

    // For now, content is generated on-demand and not persistently stored
    // In a real implementation, you might store recent content in the JSON file
    return null;
  }

  // Store content for potential sharing (recently generated content)
  storeContentForSharing(content) {
    if (this.contentCache.size >= this.MAX_CACHE_SIZE) {
      // Remove oldest entry
      const firstKey = this.contentCache.keys().next().value;
      this.contentCache.delete(firstKey);
    }

    this.contentCache.set(content.id, {
      ...content,
      timestamp: Date.now()
    });
  }

  // Fun Statistics
  getEntertainmentStats(userId) {
    return this.entertainmentData.funStats[userId] || {
      jokesHeard: 0,
      riddlesSolved: 0,
      storiesGenerated: 0,
      factsLearned: 0,
      gamesPlayed: 0
    };
  }

  updateEntertainmentStats(userId, activity) {
    if (!this.entertainmentData.funStats[userId]) {
      this.entertainmentData.funStats[userId] = {
        jokesHeard: 0,
        riddlesSolved: 0,
        storiesGenerated: 0,
        factsLearned: 0,
        gamesPlayed: 0
      };
    }

    if (this.entertainmentData.funStats[userId][activity] !== undefined) {
      this.entertainmentData.funStats[userId][activity]++;
    }

    this.saveEntertainment();
    return this.entertainmentData.funStats[userId];
  }

  // Advanced Features
  createFunChallenge(type = 'daily') {
    const challenges = {
      daily: [
        "Tell 5 jokes to different people today!",
        "Learn 3 new fun facts and share them!",
        "Create an original story with your friends!",
        "Solve 5 riddles or brain teasers!",
        "Try 3 different types of games!"
      ],
      weekly: [
        "Complete 10 different achievements!",
        "Try every game mode available!",
        "Create and share 5 original jokes!",
        "Reach level 10 in the RPG system!",
        "Build the ultimate trading empire!"
      ],
      monthly: [
        "Become a guild leader!",
        "Master all game difficulties!",
        "Build a business empire!",
        "Complete 50 achievements!",
        "Become a legendary trader!"
      ]
    };

    const typeChallenges = challenges[type] || challenges.daily;
    const challenge = typeChallenges[Math.floor(Math.random() * typeChallenges.length)];

    return {
      challenge,
      type,
      id: `challenge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      reward: this.getChallengeReward(type)
    };
  }

  getChallengeReward(type) {
    const rewards = {
      daily: "50 bonus achievement points",
      weekly: "Special badge + 200 points",
      monthly: "Exclusive title + 500 points + Special role"
    };

    return rewards[type] || rewards.daily;
  }

  // Fun Leaderboard
  getFunLeaderboard(category = 'jokes', limit = 10) {
    const stats = [];

    for (const [userId, userStats] of Object.entries(this.entertainmentData.funStats)) {
      const score = userStats[category] || 0;
      if (score > 0) {
        stats.push({ userId, score });
      }
    }

    return stats
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  // Cleanup and Maintenance
  cleanup() {
    // Clean old joke ratings
    const cutoffTime = Date.now() - (30 * 24 * 60 * 60 * 1000); // 30 days

    for (const jokeId in this.entertainmentData.jokeRatings) {
      this.entertainmentData.jokeRatings[jokeId] = this.entertainmentData.jokeRatings[jokeId]
        .filter(rating => rating.timestamp > cutoffTime);
    }

    this.saveEntertainment();
  }
}

// Export singleton instance
export const entertainmentManager = new EntertainmentManager();

// Convenience functions
export function getRandomJoke(category = 'general') {
  return entertainmentManager.getRandomJoke(category);
}

export function generateStory(prompt, genre = 'fantasy') {
  return entertainmentManager.generateStory(prompt, genre);
}

export function getRiddle(difficulty = 'medium') {
  return entertainmentManager.getRiddle(difficulty);
}

export function getFunFact(category = 'random') {
  return entertainmentManager.getFunFact(category);
}

export function getRandomQuote(category = 'inspirational') {
  return entertainmentManager.getRandomQuote(category);
}

export function magic8Ball(question) {
  return entertainmentManager.magic8Ball(question);
}

export function generateFunName(type = 'superhero') {
  return entertainmentManager.generateFunName(type);
}

export function getPersonalityQuestion() {
  return entertainmentManager.getPersonalityQuestion();
}

export function updateEntertainmentStats(userId, activity) {
  return entertainmentManager.updateEntertainmentStats(userId, activity);
}

export function getEntertainmentStats(userId) {
  return entertainmentManager.getEntertainmentStats(userId);
}

export function createFunChallenge(type = 'daily') {
  return entertainmentManager.createFunChallenge(type);
}

export function getFunLeaderboard(category = 'jokes', limit = 10) {
  return entertainmentManager.getFunLeaderboard(category, limit);
}

export function getContentForSharing(contentId) {
  return entertainmentManager.getContentForSharing(contentId);
}

// Auto-cleanup every hour
setInterval(() => {
  entertainmentManager.cleanup();
}, 60 * 60 * 1000);