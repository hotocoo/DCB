import assert from 'node:assert';

import { getRandomJoke, generateStory, getRiddle, getFunFact, getRandomQuote, magic8Ball, generateFunName, createFunChallenge, updateEntertainmentStats, getFunLeaderboard } from '../src/entertainment.js';

class FunCommandTestSuite {
  constructor() {
    this.testResults = [];
    this.testCount = 0;
    this.passCount = 0;
    this.failCount = 0;
    this.testUserId = `testuser_fun_${Date.now()}`;
  }

  log(message, success = true) {
    const status = success ? '✅' : '❌';
    console.log(`${status} ${message}`);
    this.testResults.push({ message, success, timestamp: new Date().toISOString() });
    this.testCount++;
    if (success) this.passCount++;
    else this.failCount++;
  }

  logError(message, error) {
    console.error(`❌ ${message}: ${error.message}`);
    this.testResults.push({ message: `${message}: ${error.message}`, success: false, timestamp: new Date().toISOString(), error: error.stack });
    this.testCount++;
    this.failCount++;
  }

  async testJokeFunctionality() {
    console.log('\n😂 Testing Joke Functionality');
    try {
      // Test different joke categories
      const categories = ['general', 'programming', 'dad', 'math', 'science'];

      for (const category of categories) {
        const joke = getRandomJoke(category);
        assert(joke && typeof joke.joke === 'string' && joke.joke.length > 0, `Joke for category ${category} should be valid`);
        assert(joke.category === category, `Joke category should match ${category}`);
        assert(joke.id, 'Joke should have an ID');
        this.log(`Joke category ${category}: OK`);
      }

      // Test invalid category falls back to general
      const invalidCategoryJoke = getRandomJoke('invalid');
      assert(invalidCategoryJoke && invalidCategoryJoke.joke, 'Invalid category should fallback');
      this.log('Invalid category fallback: OK');

    }
    catch (error) {
      this.logError('Joke functionality test failed', error);
    }
  }

  async testStoryFunctionality() {
    console.log('\n📖 Testing Story Functionality');
    try {
      const testPrompt = 'a brave knight fighting a dragon';
      const testGenre = 'fantasy';

      const story = generateStory(testPrompt, testGenre);
      assert(story && typeof story.story === 'string' && story.story.length > 0, 'Story should be generated');
      assert(story.genre === testGenre, 'Story genre should match');
      assert(story.prompt === testPrompt, 'Story prompt should match');
      assert(story.id, 'Story should have an ID');

      // Test story contains prompt elements
      assert(story.story.toLowerCase().includes('knight') || story.story.toLowerCase().includes('brave'), 'Story should incorporate prompt elements');

      this.log('Story generation: OK');

      // Test different genres
      const genres = ['fantasy', 'adventure', 'mystery', 'sciFi'];
      for (const genre of genres) {
        const genreStory = generateStory('test prompt', genre);
        assert(genreStory.genre === genre, `Genre ${genre} should be set correctly`);
        this.log(`Story genre ${genre}: OK`);
      }

    }
    catch (error) {
      this.logError('Story functionality test failed', error);
    }
  }

  async testRiddleFunctionality() {
    console.log('\n🧩 Testing Riddle Functionality');
    try {
      const difficulties = ['easy', 'medium', 'hard'];

      for (const difficulty of difficulties) {
        const riddle = getRiddle(difficulty);
        assert(riddle && typeof riddle.riddle === 'string' && riddle.riddle.length > 0, `Riddle for difficulty ${difficulty} should be valid`);
        assert(riddle.difficulty === difficulty, `Riddle difficulty should match ${difficulty}`);
        assert(riddle.answer, 'Riddle should have an answer');
        assert(riddle.id, 'Riddle should have an ID');
        this.log(`Riddle difficulty ${difficulty}: OK`);
      }

      // Test invalid difficulty falls back to medium
      const invalidDifficultyRiddle = getRiddle('invalid');
      assert(invalidDifficultyRiddle && invalidDifficultyRiddle.riddle, 'Invalid difficulty should fallback');
      this.log('Invalid difficulty fallback: OK');

    }
    catch (error) {
      this.logError('Riddle functionality test failed', error);
    }
  }

  async testFunFactFunctionality() {
    console.log('\n🧠 Testing Fun Fact Functionality');
    try {
      const categories = ['random', 'animals', 'space', 'science', 'history'];

      for (const category of categories) {
        const fact = getFunFact(category);
        assert(fact && typeof fact.fact === 'string' && fact.fact.length > 0, `Fun fact for category ${category} should be valid`);
        assert(fact.id, 'Fun fact should have an ID');
        this.log(`Fun fact category ${category}: OK`);
      }

    }
    catch (error) {
      this.logError('Fun fact functionality test failed', error);
    }
  }

  async testQuoteFunctionality() {
    console.log('\n💬 Testing Quote Functionality');
    try {
      const categories = ['inspirational', 'motivational', 'wisdom', 'humor'];

      for (const category of categories) {
        const quote = getRandomQuote(category);
        assert(quote && typeof quote.quote === 'string' && quote.quote.length > 0, `Quote for category ${category} should be valid`);
        assert(quote.author, 'Quote should have an author');
        assert(quote.category === category, `Quote category should match ${category}`);
        assert(quote.id, 'Quote should have an ID');
        this.log(`Quote category ${category}: OK`);
      }

    }
    catch (error) {
      this.logError('Quote functionality test failed', error);
    }
  }

  async testMagic8BallFunctionality() {
    console.log('\n🔮 Testing Magic 8-Ball Functionality');
    try {
      const testQuestion = 'Will I be rich?';

      const result = magic8Ball(testQuestion);
      assert(result && typeof result.answer === 'string' && result.answer.length > 0, '8-ball should return an answer');
      assert(result.question === testQuestion, '8-ball should return the question');
      assert(result.id, '8-ball should have an ID');

      // Test that answers are from the predefined list
      const validResponses = [
        'It is certain.', 'It is decidedly so.', 'Without a doubt.', 'Yes definitely.',
        'You may rely on it.', 'As I see it, yes.', 'Most likely.', 'Outlook good.',
        'Yes.', 'Signs point to yes.',
        'Reply hazy, try again.', 'Ask again later.', 'Better not tell you now.',
        'Cannot predict now.', 'Concentrate and ask again.',
        "Don't count on it.", 'My reply is no.', 'My sources say no.', 'Outlook not so good.',
        'Very doubtful.'
      ];

      assert(validResponses.includes(result.answer), '8-ball answer should be from predefined list');

      this.log('Magic 8-ball: OK');

    }
    catch (error) {
      this.logError('Magic 8-ball functionality test failed', error);
    }
  }

  async testFunNameFunctionality() {
    console.log('\n🎭 Testing Fun Name Functionality');
    try {
      const types = ['superhero', 'villain', 'fantasy', 'sciFi'];

      for (const type of types) {
        const nameResult = generateFunName(type);
        assert(nameResult && typeof nameResult.name === 'string' && nameResult.name.length > 0, `Fun name for type ${type} should be valid`);
        assert(nameResult.type === type, `Fun name type should match ${type}`);
        assert(nameResult.id, 'Fun name should have an ID');
        this.log(`Fun name type ${type}: OK`);
      }

    }
    catch (error) {
      this.logError('Fun name functionality test failed', error);
    }
  }

  async testChallengeFunctionality() {
    console.log('\n🎯 Testing Fun Challenge Functionality');
    try {
      const types = ['daily', 'weekly', 'monthly'];

      for (const type of types) {
        const challenge = createFunChallenge(type);
        assert(challenge && typeof challenge.challenge === 'string' && challenge.challenge.length > 0, `Challenge for type ${type} should be valid`);
        assert(challenge.type === type, `Challenge type should match ${type}`);
        assert(challenge.reward, 'Challenge should have a reward');
        assert(challenge.id, 'Challenge should have an ID');
        this.log(`Challenge type ${type}: OK`);
      }

    }
    catch (error) {
      this.logError('Challenge functionality test failed', error);
    }
  }

  async testEntertainmentStats() {
    console.log('\n📊 Testing Entertainment Stats');
    try {
      // Test updating stats
      const initialStats = updateEntertainmentStats(this.testUserId, 'jokesHeard');
      assert(initialStats && typeof initialStats.jokesHeard === 'number', 'Stats should be updated');

      // Update multiple activities
      updateEntertainmentStats(this.testUserId, 'storiesGenerated');
      updateEntertainmentStats(this.testUserId, 'riddlesSolved');
      updateEntertainmentStats(this.testUserId, 'factsLearned');

      // Import function to get stats
      const { getEntertainmentStats } = await import('../src/entertainment.js');
      const stats = getEntertainmentStats(this.testUserId);

      assert(stats.jokesHeard >= 1, 'Jokes heard should be incremented');
      assert(stats.storiesGenerated >= 1, 'Stories generated should be incremented');
      assert(stats.riddlesSolved >= 1, 'Riddles solved should be incremented');
      assert(stats.factsLearned >= 1, 'Facts learned should be incremented');

      this.log('Entertainment stats: OK');

    }
    catch (error) {
      this.logError('Entertainment stats test failed', error);
    }
  }

  async testLeaderboard() {
    console.log('\n🏆 Testing Fun Leaderboard');
    try {
      // Add some test data
      updateEntertainmentStats(this.testUserId, 'jokesHeard');
      updateEntertainmentStats(this.testUserId, 'storiesGenerated');

      // Test leaderboard retrieval
      const jokeLeaderboard = getFunLeaderboard('jokesHeard', 10);
      const storyLeaderboard = getFunLeaderboard('storiesGenerated', 10);

      assert(Array.isArray(jokeLeaderboard), 'Joke leaderboard should be an array');
      assert(Array.isArray(storyLeaderboard), 'Story leaderboard should be an array');

      // Check if our test user appears in leaderboard
      const jokeEntry = jokeLeaderboard.find(entry => entry.userId === this.testUserId);
      const storyEntry = storyLeaderboard.find(entry => entry.userId === this.testUserId);

      if (jokeEntry) {
        assert(typeof jokeEntry.score === 'number' && jokeEntry.score >= 1, 'Joke leaderboard entry should have valid score');
      }

      if (storyEntry) {
        assert(typeof storyEntry.score === 'number' && storyEntry.score >= 1, 'Story leaderboard entry should have valid score');
      }

      this.log('Fun leaderboard: OK');

    }
    catch (error) {
      this.logError('Fun leaderboard test failed', error);
    }
  }

  async runAllTests() {
    console.log('🎪 Starting Fun Command Test Suite');
    console.log('=' .repeat(50));

    await this.testJokeFunctionality();
    await this.testStoryFunctionality();
    await this.testRiddleFunctionality();
    await this.testFunFactFunctionality();
    await this.testQuoteFunctionality();
    await this.testMagic8BallFunctionality();
    await this.testFunNameFunctionality();
    await this.testChallengeFunctionality();
    await this.testEntertainmentStats();
    await this.testLeaderboard();

    console.log('\n' + '=' .repeat(50));
    console.log('📊 Fun Command Test Results Summary:');
    console.log(`Total Tests: ${this.testCount}`);
    console.log(`✅ Passed: ${this.passCount}`);
    console.log(`❌ Failed: ${this.failCount}`);
    console.log(`Success Rate: ${((this.passCount / this.testCount) * 100).toFixed(1)}%`);

    return {
      total: this.testCount,
      passed: this.passCount,
      failed: this.failCount,
      successRate: ((this.passCount / this.testCount) * 100).toFixed(1)
    };
  }
}

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const testSuite = new FunCommandTestSuite();
  testSuite.runAllTests().then(results => {
    console.log('\n🎪 Fun command test execution completed');
    process.exit(results.failed > 0 ? 1 : 0);
  }).catch(error => {
    console.error('Fun command test suite failed:', error);
    process.exit(1);
  });
}

export default FunCommandTestSuite;
