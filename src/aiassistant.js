/**
 * Advanced AI Assistant System for Discord bot.
 * Provides multiple AI models, personalities, and content generation capabilities.
 */

import 'dotenv/config';
import { getGuild } from './storage.js';
import { logger } from './logger.js';

/**
 * Configuration constants for AI assistant.
 */
const CACHE_DURATION_MS = 300000; // 5 minutes
const MAX_CONVERSATION_HISTORY = 10;

/**
 * Advanced AI Assistant System with Multiple AI Models and Capabilities.
 */
class AIAssistantManager {
  constructor() {
    this.conversationHistory = new Map();
    this.aiModels = new Map();
    this.responseCache = new Map();
    this.personalityProfiles = new Map();
    this.initializeAI();
  }

  /**
   * Initializes AI models and personality profiles.
   */
  initializeAI() {
    logger.info('Initializing AI models and personality profiles');

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

    logger.info('AI initialization completed', {
      modelsCount: this.aiModels.size,
      personalitiesCount: this.personalityProfiles.size
    });
  }

  /**
   * Generates an AI response based on user message and options.
   * @param {string} userId - User identifier
   * @param {string} message - User message
   * @param {object} options - Generation options
   * @returns {Promise<string>} AI response
   */
  async generateResponse(userId, message, options = {}) {
    const {
      model = 'helpful',
      personality = 'friendly',
      guildId = null,
      context = ''
    } = options;

    if (!message || typeof message !== 'string') {
      throw new Error('Invalid message provided');
    }

    const cacheKey = `${userId}_${message.substring(0, 50)}_${model}_${personality}`;
    const cached = this.responseCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION_MS) {
      logger.debug('Using cached response', { userId, cacheKey });
      return cached.response;
    }

    try {
      logger.debug('Generating AI response', { userId, model, personality, messageLength: message.length });

      // Build enhanced context
      const history = this.conversationHistory.get(userId) || [];
      const modelConfig = this.aiModels.get(model);
      const personalityConfig = this.personalityProfiles.get(personality);

      if (!modelConfig) {
        throw new Error(`Unknown model: ${model}`);
      }

      if (!personalityConfig) {
        throw new Error(`Unknown personality: ${personality}`);
      }

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
        logger.debug('Attempting local AI call', { userId, localUrl });
        response = await this.callLocalAI(localUrl, systemPrompt, modelConfig);
      }

      // Fallback to OpenAI
      if (!response && process.env.OPENAI_API_KEY) {
        logger.debug('Attempting OpenAI call', { userId });
        response = await this.callOpenAI(systemPrompt, modelConfig);
      }

      // Enhanced fallback with personality
      if (!response) {
        logger.debug('Using fallback response', { userId, model, personality });
        response = this.generateFallbackResponse(message, model, personality);
      }

      // Store in history
      history.push({ role: 'user', content: message });
      history.push({ role: 'assistant', content: response });
      if (history.length > MAX_CONVERSATION_HISTORY) {
        history.splice(0, history.length - MAX_CONVERSATION_HISTORY);
      }
      this.conversationHistory.set(userId, history);

      // Cache response
      this.responseCache.set(cacheKey, {
        response,
        timestamp: Date.now()
      });

      logger.debug('Response generated successfully', { userId, responseLength: response.length });
      return response;

    } catch (error) {
      logger.error('AI Assistant error', error, { userId, model, personality });
      return this.generateFallbackResponse(message, model, personality);
    }
  }

  /**
   * Calls a local AI model.
   * @param {string} url - Local model URL
   * @param {string} prompt - Prompt to send
   * @param {object} config - Model configuration
   * @returns {Promise<string|null>} Response or null if failed
   */
  async callLocalAI(url, prompt, config) {
    try {
      logger.debug('Calling local AI', { url, maxTokens: config.maxTokens, temperature: config.temperature });

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
        const content = data.choices?.[0]?.message?.content;
        return content || 'No response from local AI';
      }

      logger.warn('Local AI call failed with status', { status: response.status, url });
    } catch (error) {
      logger.error('Local AI call error', error, { url });
    }
    return null;
  }

  /**
   * Calls OpenAI API.
   * @param {string} prompt - Prompt to send
   * @param {object} config - Model configuration
   * @returns {Promise<string|null>} Response or null if failed
   */
  async callOpenAI(prompt, config) {
    try {
      logger.debug('Calling OpenAI API', { maxTokens: config.maxTokens, temperature: config.temperature });

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
        const content = data.choices?.[0]?.message?.content;
        return content || 'No response from OpenAI';
      }

      logger.warn('OpenAI call failed with status', { status: response.status });
    } catch (error) {
      logger.error('OpenAI call error', error);
    }
    return null;
  }

  /**
   * Generates a fallback response when AI models are unavailable.
   * @param {string} message - Original user message
   * @param {string} model - AI model type
   * @param {string} personality - Personality type
   * @returns {string} Fallback response
   */
  generateFallbackResponse(message, model, personality) {
    logger.debug('Generating fallback response', { model, personality, messageLength: message.length });

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
    const response = modelResponses[Math.floor(Math.random() * modelResponses.length)];

    logger.debug('Fallback response generated', { model, responseLength: response.length });
    return response;
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
      'javascript': this.generateJavaScriptSnippet(description),
      'python': this.generatePythonSnippet(description),
      'java': this.generateJavaSnippet(description),
      'cpp': this.generateCppSnippet(description),
      'c#': this.generateCSharpSnippet(description),
      'go': this.generateGoSnippet(description),
      'rust': this.generateRustSnippet(description),
      'php': this.generatePhpSnippet(description),
      'ruby': this.generateRubySnippet(description),
      'swift': this.generateSwiftSnippet(description)
    };

    return snippets[language.toLowerCase()] || this.generateJavaScriptSnippet(description);
  }

  generateJavaScriptSnippet(description) {
    const lowerDesc = description.toLowerCase();
    if (lowerDesc.includes('function') || lowerDesc.includes('method')) {
      return `// ${description}\nfunction performTask(data) {\n  // Implementation for ${description.toLowerCase()}\n  try {\n    // Your logic here\n    return processData(data);\n  } catch (error) {\n    console.error('Error:', error.message);\n    throw error;\n  }\n}\n\n// Usage example\nconst result = performTask(inputData);`;
    } else if (lowerDesc.includes('class') || lowerDesc.includes('object')) {
      return `// ${description}\nclass DataProcessor {\n  constructor(options = {}) {\n    this.options = options;\n    this.cache = new Map();\n  }\n\n  // Main method implementation\n  process(data) {\n    // Implementation for ${description.toLowerCase()}\n    if (this.cache.has(data)) {\n      return this.cache.get(data);\n    }\n\n    const result = this.transformData(data);\n    this.cache.set(data, result);\n    return result;\n  }\n\n  transformData(data) {\n    // Transform logic here\n    return data;\n  }\n}`;
    }
    return `// ${description}\n// Implementation example\nconst ${description.replace(/\s+/g, '').toLowerCase()} = (input) => {\n  // Your implementation here\n  return input;\n};\n\n// Usage\nconst result = ${description.replace(/\s+/g, '').toLowerCase()}(inputValue);`;
  }

  generatePythonSnippet(description) {
    const lowerDesc = description.toLowerCase();
    if (lowerDesc.includes('function') || lowerDesc.includes('method')) {
      return `# ${description}\ndef perform_task(data):\n    """\n    Implementation for ${description.lower()}\n    """\n    try:\n        # Your logic here\n        return process_data(data)\n    except Exception as e:\n        print(f"Error: {e}")\n        raise\n\n# Usage example\nresult = perform_task(input_data)`;
    } else if (lowerDesc.includes('class') || lowerDesc.includes('object')) {
      return `# ${description}\nclass DataProcessor:\n    def __init__(self, options=None):\n        self.options = options or {}\n        self.cache = {}\n\n    def process(self, data):\n        """\n        Implementation for ${description.lower()}\n        """\n        if data in self.cache:\n            return self.cache[data]\n\n        result = self.transform_data(data)\n        self.cache[data] = result\n        return result\n\n    def transform_data(self, data):\n        """Transform logic here"""\n        return data\n\n# Usage\nprocessor = DataProcessor()\nresult = processor.process(input_data)`;
    }
    return `# ${description}\ndef ${description.replace(/\s+/g, '_').lower()}():\n    # Your implementation here\n    return input_value`;
  }

  generateJavaSnippet(description) {
    const lowerDesc = description.toLowerCase();
    if (lowerDesc.includes('function') || lowerDesc.includes('method')) {
      return `// ${description}\npublic class TaskProcessor {\n    public static Object performTask(Object data) {\n        try {\n            // Implementation for ${description.toLowerCase()}\n            return processData(data);\n        } catch (Exception e) {\n            System.err.println("Error: " + e.getMessage());\n            throw e;\n        }\n    }\n\n    private static Object processData(Object data) {\n        // Your logic here\n        return data;\n    }\n\n    // Usage\n    public static void main(String[] args) {\n        Object result = performTask(inputData);\n    }\n}`;
    } else if (lowerDesc.includes('class') || lowerDesc.includes('object')) {
      return `// ${description}\npublic class DataProcessor {\n    private Map<Object, Object> cache;\n    private Map<String, Object> options;\n\n    public DataProcessor(Map<String, Object> options) {\n        this.options = options;\n        this.cache = new HashMap<>();\n    }\n\n    public Object process(Object data) {\n        // Implementation for ${description.toLowerCase()}\n        if (cache.containsKey(data)) {\n            return cache.get(data);\n        }\n\n        Object result = transformData(data);\n        cache.put(data, result);\n        return result;\n    }\n\n    private Object transformData(Object data) {\n        // Transform logic here\n        return data;\n    }\n}`;
    }
    return `// ${description}\n// Implementation example\npublic class ${description.replace(/\s+/g, '')} {\n    public static void main(String[] args) {\n        // Your implementation here\n    }\n}`;
  }

  generateCppSnippet(description) {
    return `// ${description}\n#include <iostream>\n#include <string>\n#include <map>\n\nclass DataProcessor {\nprivate:\n    std::map<std::string, std::string> cache;\n    std::map<std::string, std::string> options;\n\npublic:\n    DataProcessor() {}\n\n    // Implementation for ${description.toLowerCase()}\n    std::string process(std::string data) {\n        if (cache.find(data) != cache.end()) {\n            return cache[data];\n        }\n\n        std::string result = transformData(data);\n        cache[data] = result;\n        return result;\n    }\n\nprivate:\n    std::string transformData(std::string data) {\n        // Transform logic here\n        return data;\n    }\n};\n\n// Usage\nint main() {\n    DataProcessor processor;\n    std::string result = processor.process("input");\n    return 0;\n}`;
  }

  generateCSharpSnippet(description) {
    return `// ${description}\nusing System;\nusing System.Collections.Generic;\n\npublic class DataProcessor\n{\n    private Dictionary<string, object> cache;\n    private Dictionary<string, object> options;\n\n    public DataProcessor(Dictionary<string, object> options = null)\n    {\n        this.options = options ?? new Dictionary<string, object>();\n        this.cache = new Dictionary<string, object>();\n    }\n\n    // Implementation for ${description.toLowerCase()}\n    public object Process(object data)\n    {\n        string key = data.ToString();\n        if (cache.ContainsKey(key))\n        {\n            return cache[key];\n        }\n\n        object result = TransformData(data);\n        cache[key] = result;\n        return result;\n    }\n\n    private object TransformData(object data)\n    {\n        // Transform logic here\n        return data;\n    }\n}\n\n// Usage\nclass Program\n{\n    static void Main()\n    {\n        var processor = new DataProcessor();\n        var result = processor.Process("input");\n    }\n}`;
  }

  generateGoSnippet(description) {
    return `// ${description}\npackage main\n\nimport (\n\t"fmt"\n\t"sync"\n)\n\ntype DataProcessor struct {\n\tcache   map[string]interface{}\n\toptions map[string]interface{}\n\tmutex   sync.RWMutex\n}\n\nfunc NewDataProcessor(options map[string]interface{}) *DataProcessor {\n\treturn &DataProcessor{\n\t\tcache:   make(map[string]interface{}),\n\t\toptions: options,\n\t}\n}\n\n// Implementation for ${description.toLowerCase()}\nfunc (dp *DataProcessor) Process(data interface{}) interface{} {\n\tkey := fmt.Sprintf("%v", data)\n\tdp.mutex.RLock()\n\tif result, exists := dp.cache[key]; exists {\n\t\tdp.mutex.RUnlock()\n\t\treturn result\n\t}\n\tdp.mutex.RUnlock()\n\n\tresult := dp.transformData(data)\n\tdp.mutex.Lock()\n\tdp.cache[key] = result\n\tdp.mutex.Unlock()\n\treturn result\n}\n\nfunc (dp *DataProcessor) transformData(data interface{}) interface{} {\n\t// Transform logic here\n\treturn data\n}\n\n// Usage\nfunc main() {\n\tprocessor := NewDataProcessor(nil)\n\tresult := processor.Process("input")\n\tfmt.Println(result)\n}`;
  }

  generateRustSnippet(description) {
    return `// ${description}\nuse std::collections::HashMap;\n\nstruct DataProcessor {\n    cache: HashMap<String, String>,\n    options: HashMap<String, String>,\n}\n\nimpl DataProcessor {\n    fn new(options: HashMap<String, String>) -> Self {\n        DataProcessor {\n            cache: HashMap::new(),\n            options,\n        }\n    }\n\n    // Implementation for ${description.toLowerCase()}\n    fn process(&mut self, data: &str) -> String {\n        if let Some(result) = self.cache.get(data) {\n            return result.clone();\n        }\n\n        let result = self.transform_data(data);\n        self.cache.insert(data.to_string(), result.clone());\n        result\n    }\n\n    fn transform_data(&self, data: &str) -> String {\n        // Transform logic here\n        data.to_string()\n    }\n}\n\n// Usage\nfn main() {\n    let mut processor = DataProcessor::new(HashMap::new());\n    let result = processor.process("input");\n    println!("{}", result);\n}`;
  }

  generatePhpSnippet(description) {
    return `<?php\n// ${description}\nclass DataProcessor {\n    private $cache = [];\n    private $options = [];\n\n    public function __construct(array $options = []) {\n        $this->options = $options;\n    }\n\n    // Implementation for ${description.toLowerCase()}\n    public function process($data) {\n        $key = serialize($data);\n        if (isset($this->cache[$key])) {\n            return $this->cache[$key];\n        }\n\n        $result = $this->transformData($data);\n        $this->cache[$key] = $result;\n        return $result;\n    }\n\n    private function transformData($data) {\n        // Transform logic here\n        return $data;\n    }\n}\n\n// Usage\n$processor = new DataProcessor();\n$result = $processor->process('input');\necho $result;\n?>`;
  }

  generateRubySnippet(description) {
    return `# ${description}\nclass DataProcessor\n  def initialize(options = {})\n    @cache = {}\n    @options = options\n  end\n\n  # Implementation for ${description.lower()}\n  def process(data)\n    key = data.hash\n    return @cache[key] if @cache.key?(key)\n\n    result = transform_data(data)\n    @cache[key] = result\n    result\n  end\n\n  private\n\n  def transform_data(data)\n    # Transform logic here\n    data\n  end\nend\n\n# Usage\nprocessor = DataProcessor.new\nresult = processor.process('input')\nputs result`;
  }

  generateSwiftSnippet(description) {
    return `// ${description}\nimport Foundation\n\nclass DataProcessor {\n    private var cache: [String: Any] = [:]\n    private var options: [String: Any]\n\n    init(options: [String: Any] = [:]) {\n        self.options = options\n    }\n\n    // Implementation for ${description.lower()}\n    func process(_ data: Any) -> Any {\n        let key = String(describing: data)\n        if let cached = cache[key] {\n            return cached\n        }\n\n        let result = transformData(data)\n        cache[key] = result\n        return result\n    }\n\n    private func transformData(_ data: Any) -> Any {\n        // Transform logic here\n        return data\n    }\n}\n\n// Usage\nlet processor = DataProcessor()\nlet result = processor.process("input")\nprint(result)`;
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