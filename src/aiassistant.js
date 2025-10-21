import 'dotenv/config';
import { getGuild } from './storage.js';

// Advanced AI Assistant System with Multiple AI Models and Capabilities
class AIAssistantManager {
  constructor() {
    this.conversationHistory = new Map();
    this.aiModels = new Map();
    this.responseCache = new Map();
    this.personalityProfiles = new Map();
    this.initializeAI();
  }

  initializeAI() {
    // Initialize different AI model configurations
    this.aiModels.set('creative', {
      name: 'Creative Writer',
      description: 'Specialized in creative writing, stories, and artistic content',
      prompt: 'You are a creative writing AI. Write engaging, imaginative content with vivid descriptions and compelling narratives.',
      temperature: 0.8,
      maxTokens: 800
    });

    this.aiModels.set('technical', {
      name: 'Technical Expert',
      description: 'Specialized in programming, technology, and technical explanations',
      prompt: 'You are a technical expert AI. Provide accurate, detailed technical information with code examples when relevant.',
      temperature: 0.3,
      maxTokens: 600
    });

    this.aiModels.set('helpful', {
      name: 'Helpful Assistant',
      description: 'General purpose helpful AI for everyday questions',
      prompt: 'You are a helpful AI assistant. Provide clear, accurate, and useful responses to help users with their questions.',
      temperature: 0.5,
      maxTokens: 500
    });

    this.aiModels.set('funny', {
      name: 'Comedy Bot',
      description: 'Specialized in humor, jokes, and entertaining responses',
      prompt: 'You are a comedy AI. Make people laugh with witty, clever, and appropriate humor.',
      temperature: 0.7,
      maxTokens: 400
    });

    this.aiModels.set('educational', {
      name: 'Teacher Bot',
      description: 'Specialized in education and learning',
      prompt: 'You are an educational AI. Explain concepts clearly, provide examples, and help users learn new things.',
      temperature: 0.4,
      maxTokens: 700
    });

    // Initialize personality profiles
    this.personalityProfiles.set('professional', {
      name: 'Professional',
      style: 'formal, precise, and business-like',
      responses: 'structured and informative'
    });

    this.personalityProfiles.set('friendly', {
      name: 'Friendly',
      style: 'warm, approachable, and casual',
      responses: 'conversational and engaging'
    });

    this.personalityProfiles.set('energetic', {
      name: 'Energetic',
      style: 'exciting, enthusiastic, and dynamic',
      responses: 'lively and motivating'
    });

    this.personalityProfiles.set('wise', {
      name: 'Wise Mentor',
      style: 'thoughtful, reflective, and insightful',
      responses: 'profound and meaningful'
    });
  }

  async generateResponse(userId, message, options = {}) {
    const {
      model = 'helpful',
      personality = 'friendly',
      guildId = null,
      context = ''
    } = options;

    const cacheKey = `${userId}_${message.substring(0, 50)}_${model}`;
    const cached = this.responseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 300000) { // 5 minute cache
      return cached.response;
    }

    try {
      // Build enhanced context
      const history = this.conversationHistory.get(userId) || [];
      const modelConfig = this.aiModels.get(model);
      const personalityConfig = this.personalityProfiles.get(personality);

      const systemPrompt = `${modelConfig.prompt}

Personality: ${personalityConfig.style}
Response style: ${personalityConfig.responses}

Context: ${context}
Previous conversation:
${history.slice(-3).map(h => `${h.role}: ${h.content}`).join('\n')}

User message: ${message}

Provide a response that matches the specified model and personality.`;

      let response;

      // Try local model first if configured
      const guildCfg = guildId ? getGuild(guildId) : null;
      const localUrl = guildCfg?.modelUrl || process.env.LOCAL_MODEL_URL;

      if (localUrl) {
        response = await this.callLocalAI(localUrl, systemPrompt, modelConfig);
      }

      // Fallback to OpenAI
      if (!response && process.env.OPENAI_API_KEY) {
        response = await this.callOpenAI(systemPrompt, modelConfig);
      }

      // Enhanced fallback with personality
      if (!response) {
        response = this.generateFallbackResponse(message, model, personality);
      }

      // Store in history
      history.push({ role: 'user', content: message });
      history.push({ role: 'assistant', content: response });
      if (history.length > 10) history.splice(0, history.length - 10);
      this.conversationHistory.set(userId, history);

      // Cache response
      this.responseCache.set(cacheKey, {
        response,
        timestamp: Date.now()
      });

      return response;

    } catch (error) {
      console.error('AI Assistant error:', error);
      return this.generateFallbackResponse(message, model, personality);
    }
  }

  async callLocalAI(url, prompt, config) {
    try {
      const response = await fetch(`${url.replace(/\/$/, '')}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'local-model',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: config.maxTokens,
          temperature: config.temperature
        })
      });

      if (response.ok) {
        const data = await response.json();
        return data.choices?.[0]?.message?.content || 'No response from local AI';
      }
    } catch (error) {
      console.error('Local AI call failed:', error);
    }
    return null;
  }

  async callOpenAI(prompt, config) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: config.maxTokens,
          temperature: config.temperature
        })
      });

      if (response.ok) {
        const data = await response.json();
        return data.choices?.[0]?.message?.content || 'No response from OpenAI';
      }
    } catch (error) {
      console.error('OpenAI call failed:', error);
    }
    return null;
  }

  generateFallbackResponse(message, model, personality) {
    const responses = {
      creative: [
        `🎨 Creatively speaking about "${message}" - I imagine a world where ideas flow like rivers of color!`,
        `✨ My artistic mind sees "${message}" as a canvas of infinite possibilities and beautiful expressions.`,
        `🎭 In the theater of imagination, "${message}" becomes a masterpiece of creativity and wonder.`
      ],
      technical: [
        `🔧 Analyzing "${message}" from a technical perspective reveals interesting possibilities and considerations.`,
        `⚙️ From an engineering standpoint, "${message}" presents several technical angles worth exploring.`,
        `💻 The technical analysis of "${message}" suggests multiple approaches and solutions.`
      ],
      helpful: [
        `🤝 I'd be happy to help with "${message}". Let me provide you with some useful information and guidance.`,
        `💡 Regarding "${message}", here are some helpful insights and suggestions to consider.`,
        `🌟 I'm here to assist with "${message}". Let's explore this together and find the best approach.`
      ],
      funny: [
        `😂 "${message}"? That's hilarious! Let me respond with some witty commentary and humorous observations.`,
        `🤣 Oh man, "${message}" cracks me up! Here's my comedic take on this situation.`,
        `😄 I love the humor in "${message}"! Let me match that energy with some clever wit.`
      ],
      educational: [
        `📚 Let's learn about "${message}". This is a great opportunity to explore new concepts and understanding.`,
        `🎓 From an educational perspective, "${message}" offers valuable learning opportunities and insights.`,
        `🔬 Scientifically examining "${message}" reveals fascinating principles and concepts to understand.`
      ]
    };

    const modelResponses = responses[model] || responses.helpful;
    return modelResponses[Math.floor(Math.random() * modelResponses.length)];
  }

  // Advanced AI Features
  async analyzeSentiment(text) {
    // Simple sentiment analysis
    const positiveWords = ['good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'love', 'like', 'awesome', 'brilliant'];
    const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'dislike', 'worst', 'horrible', 'angry', 'sad', 'disappointed'];

    const lowerText = text.toLowerCase();
    const positiveCount = positiveWords.reduce((count, word) => count + (lowerText.includes(word) ? 1 : 0), 0);
    const negativeCount = negativeWords.reduce((count, word) => count + (lowerText.includes(word) ? 1 : 0), 0);

    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  async generateSummary(text, maxLength = 200) {
    // Simple text summarization
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const summary = sentences.slice(0, 2).join('. ') + '.';

    return summary.length > maxLength ? summary.substring(0, maxLength - 3) + '...' : summary;
  }

  async translateText(text, targetLanguage = 'es') {
    const translations = {
      'hello': { 'es': 'hola', 'fr': 'bonjour', 'de': 'hallo', 'it': 'ciao' },
      'goodbye': { 'es': 'adiós', 'fr': 'au revoir', 'de': 'tschüss', 'it': 'ciao' },
      'thank you': { 'es': 'gracias', 'fr': 'merci', 'de': 'danke', 'it': 'grazie' },
      'yes': { 'es': 'sí', 'fr': 'oui', 'de': 'ja', 'it': 'sì' },
      'no': { 'es': 'no', 'fr': 'non', 'de': 'nein', 'it': 'no' }
    };

    const lowerText = text.toLowerCase();
    for (const [english, translations] of Object.entries(translations)) {
      if (lowerText.includes(english)) {
        return translations[targetLanguage] || text;
      }
    }

    return `Translation to ${targetLanguage}: ${text}`;
  }

  // AI Model Management
  getAvailableModels() {
    return Array.from(this.aiModels.entries()).map(([key, config]) => ({
      id: key,
      name: config.name,
      description: config.description
    }));
  }

  getAvailablePersonalities() {
    return Array.from(this.personalityProfiles.entries()).map(([key, config]) => ({
      id: key,
      name: config.name,
      style: config.style
    }));
  }

  // Advanced Context Management
  setUserContext(userId, context) {
    if (!this.conversationHistory.has(userId)) {
      this.conversationHistory.set(userId, []);
    }
    this.conversationHistory.get(userId).context = context;
  }

  getUserContext(userId) {
    const history = this.conversationHistory.get(userId);
    return history?.context || null;
  }

  clearUserHistory(userId) {
    this.conversationHistory.delete(userId);
  }

  // AI-Powered Content Generation
  async generateIdeas(topic, count = 5) {
    const ideas = [
      `Revolutionary ${topic} concept with unprecedented innovation`,
      `Creative ${topic} solution that breaks traditional boundaries`,
      `Unique ${topic} approach combining multiple disciplines`,
      `Futuristic ${topic} design with cutting-edge technology`,
      `Elegant ${topic} solution that simplifies complex problems`
    ];

    return ideas.slice(0, count);
  }

  async generateCodeSnippet(language, description) {
    const snippets = {
      'javascript': `// ${description}\nfunction example() {\n  console.log('Hello, World!');\n  // TODO: Implement ${description}\n}`,
      'python': `# ${description}\ndef example():\n    print('Hello, World!')\n    # TODO: Implement ${description}\n    pass`,
      'java': `// ${description}\npublic class Example {\n    public static void main(String[] args) {\n        System.out.println('Hello, World!');\n        // TODO: Implement ${description}\n    }\n}`
    };

    return snippets[language.toLowerCase()] || snippets.javascript;
  }

  // AI Learning and Improvement
  async analyzeResponseQuality(userId, message, response, rating) {
    // Store response quality data for model improvement
    const qualityData = {
      userId,
      message,
      response,
      rating,
      timestamp: Date.now(),
      length: response.length,
      complexity: this.calculateComplexity(response)
    };

    // In a real implementation, this would be used to fine-tune models
    console.log('Response quality data:', qualityData);
  }

  calculateComplexity(text) {
    const words = text.split(' ').length;
    const sentences = text.split(/[.!?]+/).length;
    const avgWordLength = text.replace(/[^a-zA-Z]/g, '').length / Math.max(1, words);

    return {
      wordCount: words,
      sentenceCount: sentences,
      avgWordLength: Math.round(avgWordLength * 100) / 100
    };
  }

  // Multi-Model Response Generation
  async generateMultiModelResponse(userId, message, models = ['helpful', 'creative']) {
    const responses = {};

    for (const model of models) {
      try {
        const response = await this.generateResponse(userId, message, { model });
        responses[model] = response;
      } catch (error) {
        responses[model] = `Error generating response from ${model} model`;
      }
    }

    return responses;
  }

  // AI-Powered Recommendations
  async generateRecommendations(userId, type = 'general') {
    const history = this.conversationHistory.get(userId) || [];

    if (history.length === 0) {
      return [
        "Try asking me about games - I have trivia, RPG adventures, and more!",
        "Ask me to tell you a joke or share a fun fact!",
        "Want to play a game? Try /tictactoe or /connect4!",
        "Create an RPG character and start your adventure!"
      ];
    }

    const recommendations = {
      gaming: [
        "🎮 Try the new Connect Four game with AI opponents!",
        "🧠 Challenge yourself with a trivia quiz!",
        "⚔️ Continue your RPG adventure!",
        "🎯 Play some strategy games!"
      ],
      learning: [
        "📚 Ask me about programming or technology!",
        "🔢 Want to learn something new with fun facts?",
        "💻 I can help with coding questions!",
        "🧪 Explore scientific concepts!"
      ],
      fun: [
        "😂 Let me tell you a joke!",
        "🎭 Generate a fun superhero name!",
        "🔮 Ask the magic 8-ball a question!",
        "📖 Want me to create a story for you?"
      ],
      social: [
        "👥 Check out the guild system!",
        "💰 Try the economy and trading features!",
        "🏆 View your achievements and profile!",
        "🤝 Join a party for multiplayer fun!"
      ]
    };

    return recommendations[type] || recommendations.general;
  }
}

// Export singleton instance
export const aiAssistant = new AIAssistantManager();

// Convenience functions
export async function generateResponse(userId, message, options = {}) {
  return aiAssistant.generateResponse(userId, message, options);
}

export async function analyzeSentiment(text) {
  return aiAssistant.analyzeSentiment(text);
}

export async function generateSummary(text, maxLength = 200) {
  return aiAssistant.generateSummary(text, maxLength);
}

export async function translateText(text, targetLanguage = 'es') {
  return aiAssistant.translateText(text, targetLanguage);
}

export function getAvailableModels() {
  return aiAssistant.getAvailableModels();
}

export function getAvailablePersonalities() {
  return aiAssistant.getAvailablePersonalities();
}

export function clearUserHistory(userId) {
  return aiAssistant.clearUserHistory(userId);
}

export async function generateIdeas(topic, count = 5) {
  return aiAssistant.generateIdeas(topic, count);
}

export async function generateCodeSnippet(language, description) {
  return aiAssistant.generateCodeSnippet(language, description);
}

export async function generateRecommendations(userId, type = 'general') {
  return aiAssistant.generateRecommendations(userId, type);
}