import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType , MessageFlags} from 'discord.js';
import { updateUserStats } from '../achievements.js';

const triviaQuestions = [
  {
    question: "What is the capital of France?",
    options: ["London", "Berlin", "Paris", "Madrid"],
    correct: 2,
    category: "Geography"
  },
  {
    question: "Which planet is known as the Red Planet?",
    options: ["Venus", "Mars", "Jupiter", "Saturn"],
    correct: 1,
    category: "Science"
  },
  {
    question: "What is 2 + 2 × 3?",
    options: ["8", "10", "12", "14"],
    correct: 0,
    category: "Math"
  },
  {
    question: "Who painted the Mona Lisa?",
    options: ["Vincent van Gogh", "Pablo Picasso", "Leonardo da Vinci", "Michelangelo"],
    correct: 2,
    category: "Art"
  },
  {
    question: "What is the largest mammal in the world?",
    options: ["African Elephant", "Blue Whale", "Giraffe", "Hippopotamus"],
    correct: 1,
    category: "Nature"
  },
  {
    question: "In which year did World War II end?",
    options: ["1944", "1945", "1946", "1947"],
    correct: 1,
    category: "History"
  },
  {
    question: "What is the chemical symbol for gold?",
    options: ["Go", "Gd", "Au", "Ag"],
    correct: 2,
    category: "Science"
  },
  {
    question: "Which programming language is known as the 'mother of all languages'?",
    options: ["Python", "C", "Assembly", "Java"],
    correct: 1,
    category: "Technology"
  }
];

export const data = new SlashCommandBuilder()
  .setName('trivia')
  .setDescription('Start an interactive trivia quiz game')
  .addIntegerOption(option =>
    option.setName('questions')
      .setDescription('Number of questions (1-10, default: 5)')
      .setMinValue(1)
      .setMaxValue(10)
      .setRequired(false))
  .addStringOption(option =>
    option.setName('category')
      .setDescription('Trivia category')
      .addChoices(
        { name: 'All Categories', value: 'all' },
        { name: 'Geography', value: 'Geography' },
        { name: 'Science', value: 'Science' },
        { name: 'Math', value: 'Math' },
        { name: 'Art', value: 'Art' },
        { name: 'Nature', value: 'Nature' },
        { name: 'History', value: 'History' },
        { name: 'Technology', value: 'Technology' }
      )
      .setRequired(false));

export async function execute(interaction) {
  const questionCount = interaction.options.getInteger('questions') || 5;
  const category = interaction.options.getString('category') || 'all';

  // Filter questions by category if specified
  let availableQuestions = triviaQuestions;
  if (category !== 'all') {
    availableQuestions = triviaQuestions.filter(q => q.category === category);
  }

  if (availableQuestions.length < questionCount) {
    return interaction.reply({
      content: `❌ Not enough questions available in ${category === 'all' ? 'all categories' : category} category. Available: ${availableQuestions.length}, Requested: ${questionCount}`,
      flags: MessageFlags.Ephemeral
    });
  }

  // Select random questions
  const selectedQuestions = [];
  const usedIndices = new Set();

  while (selectedQuestions.length < questionCount && usedIndices.size < availableQuestions.length) {
    const randomIndex = Math.floor(Math.random() * availableQuestions.length);
    if (!usedIndices.has(randomIndex)) {
      usedIndices.add(randomIndex);
      selectedQuestions.push(availableQuestions[randomIndex]);
    }
  }

  const gameState = {
    questions: selectedQuestions,
    currentQuestion: 0,
    score: 0,
    answers: [],
    startTime: Date.now()
  };

  await sendQuestion(interaction, gameState);
}

async function sendQuestion(interaction, gameState) {
  const question = gameState.questions[gameState.currentQuestion];

  if (!question) {
    await sendResults(interaction, gameState);
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`🧠 Trivia Quiz - Question ${gameState.currentQuestion + 1}/${gameState.questions.length}`)
    .setDescription(`**${question.question}**`)
    .setColor(0x0099FF)
    .addFields({
      name: 'Category',
      value: question.category,
      inline: true
    })
    .setFooter({ text: `Score: ${gameState.score}/${gameState.currentQuestion}` })
    .setTimestamp();

  const buttons = question.options.map((option, index) =>
    new ButtonBuilder()
      .setCustomId(`trivia_${index}`)
      .setLabel(`${String.fromCharCode(65 + index)}) ${option}`)
      .setStyle(ButtonStyle.Primary)
  );

  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) {
    const row = new ActionRowBuilder().addComponents(buttons.slice(i, i + 2));
    rows.push(row);
  }

  const filter = (i) => i.customId.startsWith('trivia_') && i.user.id === interaction.user.id;
  const collector = interaction.channel.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter,
    time: 30000,
    max: 1
  });

  collector.on('collect', async (i) => {
    const selectedAnswer = parseInt(i.customId.split('_')[1]);
    const isCorrect = selectedAnswer === question.correct;

    if (isCorrect) {
      gameState.score++;
    }

    gameState.answers.push({
      question: question.question,
      selectedAnswer: selectedAnswer,
      correctAnswer: question.correct,
      isCorrect: isCorrect,
      userChoice: question.options[selectedAnswer],
      correctChoice: question.options[question.correct]
    });

    gameState.currentQuestion++;

    // Send feedback and next question
    const feedbackEmbed = new EmbedBuilder()
      .setTitle(isCorrect ? '✅ Correct!' : '❌ Incorrect!')
      .setDescription(`**${question.question}**\n\nYour answer: **${question.options[selectedAnswer]}**\nCorrect answer: **${question.options[question.correct]}**`)
      .setColor(isCorrect ? 0x00FF00 : 0xFF0000)
      .setFooter({ text: `Score: ${gameState.score}/${gameState.currentQuestion}` });

    await i.reply({ embeds: [feedbackEmbed], flags: MessageFlags.Ephemeral });

    // Wait a moment before sending next question
    setTimeout(() => {
      sendQuestion(interaction, gameState);
    }, 2000);
  });

  collector.on('end', async (collected) => {
    if (collected.size === 0) {
      const timeoutEmbed = new EmbedBuilder()
        .setTitle('⏰ Time\'s Up!')
        .setDescription(`You didn't answer in time. Moving to next question...`)
        .setColor(0xFFA500);

      await interaction.followUp({ embeds: [timeoutEmbed], flags: MessageFlags.Ephemeral });

      gameState.answers.push({
        question: question.question,
        selectedAnswer: null,
        correctAnswer: question.correct,
        isCorrect: false,
        timeout: true
      });

      gameState.currentQuestion++;

      setTimeout(() => {
        sendQuestion(interaction, gameState);
      }, 2000);
    }
  });

  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ embeds: [embed], components: rows, flags: MessageFlags.Ephemeral });
  } else {
    await interaction.reply({ embeds: [embed], components: rows, flags: MessageFlags.Ephemeral });
  }
}

async function sendResults(interaction, gameState) {
  const totalTime = Math.round((Date.now() - gameState.startTime) / 1000);
  const percentage = Math.round((gameState.score / gameState.questions.length) * 100);

  let resultMessage = '';
  if (percentage >= 90) resultMessage = '🏆 Outstanding! You\'re a trivia master!';
  else if (percentage >= 70) resultMessage = '🥇 Great job! You know your stuff!';
  else if (percentage >= 50) resultMessage = '🥈 Not bad! Keep practicing!';
  else resultMessage = '📚 Keep learning and try again!';

  // Track trivia achievements
  const correctAnswers = gameState.answers.filter(a => a.isCorrect).length;
  updateUserStats(interaction.user.id, {
    trivia_correct: correctAnswers,
    features_tried: 1
  });

  const embed = new EmbedBuilder()
    .setTitle('🎯 Trivia Quiz Complete!')
    .setDescription(`${resultMessage}\n\n**Final Score: ${gameState.score}/${gameState.questions.length} (${percentage}%)**\n⏱️ Time: ${totalTime}s`)
    .setColor(percentage >= 70 ? 0x00FF00 : percentage >= 50 ? 0xFFA500 : 0xFF0000)
    .setTimestamp();

  // Add detailed results
  gameState.answers.forEach((answer, index) => {
    const emoji = answer.isCorrect ? '✅' : answer.timeout ? '⏰' : '❌';
    const status = answer.isCorrect ? 'Correct' : answer.timeout ? 'Timeout' : 'Incorrect';
    embed.addFields({
      name: `Q${index + 1}: ${status}`,
      value: `${emoji} **${answer.question}**\n${answer.isCorrect ? 'Your answer: ' + answer.userChoice : `Your answer: ${answer.userChoice}\nCorrect: ${answer.correctChoice}`}`,
      inline: false
    });
  });

  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
  } else {
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}