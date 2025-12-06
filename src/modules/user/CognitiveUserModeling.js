// Node AI Maria/CognitiveUserModeling.js
class CognitiveUserModeling {
    constructor() {
        this.userProfiles = new Map();
        this.beliefNetwork = new BeliefNetwork();
        this.goalInferenceEngine = new GoalInferenceEngine();
        this.knowledgeEstimator = new KnowledgeEstimator();
    }

    buildUserModel(sessionId, interactions) {
        if (!this.userProfiles.has(sessionId)) {
            this.userProfiles.set(sessionId, new UserCognitiveProfile(sessionId));
        }

        const profile = this.userProfiles.get(sessionId);

        // Обновляем когнитивную модель
        profile.updateFromInteraction(interactions);

        // Инферируем скрытые цели
        const inferredGoals = this.goalInferenceEngine.inferGoals(
            interactions,
            profile.knownGoals,
            profile.behaviorPatterns
        );

        profile.addInferredGoals(inferredGoals);

        // Оцениваем уровень знаний
        const knowledgeLevel = this.knowledgeEstimator.estimate(
            interactions,
            profile.domainKnowledge
        );

        profile.updateKnowledgeLevel(knowledgeLevel);

        // Моделируем убеждения
        const beliefs = this.beliefNetwork.inferBeliefs(
            interactions,
            profile.expressedBeliefs
        );

        profile.updateBeliefs(beliefs);

        return profile;
    }

    predictNextQuestion(profile, currentContext) {
        const predictions = [];

        // Анализ паттернов вопросов
        const questionPatterns = this.analyzeQuestionPatterns(profile.interactionHistory);

        // Предсказание на основе целей
        profile.currentGoals.forEach(goal => {
            const nextSteps = this.goalInferenceEngine.predictNextSteps(goal, currentContext);
            predictions.push(...nextSteps.map(step => ({
                question: step.likelyQuestion,
                probability: step.probability,
                reasoning: `Следующий шаг к цели: ${goal.description}`
            })));
        });

        // Предсказание на основе паттернов
        questionPatterns.forEach(pattern => {
            if (pattern.confidence > 0.6) {
                predictions.push({
                    question: pattern.nextQuestion,
                    probability: pattern.confidence,
                    reasoning: `Паттерн поведения: ${pattern.patternType}`
                });
            }
        });

        // Предсказание на основе пробелов в знаниях
        const knowledgeGaps = this.identifyKnowledgeGaps(profile, currentContext);
        knowledgeGaps.forEach(gap => {
            predictions.push({
                question: gap.likelyQuestion,
                probability: gap.importance,
                reasoning: `Пробел в знаниях: ${gap.topic}`
            });
        });

        return predictions
            .sort((a, b) => b.probability - a.probability)
            .slice(0, 5);
    }

    analyzeQuestionPatterns(history) {
        const patterns = [];

        // Последовательные паттерны
        for (let i = 0; i < history.length - 2; i++) {
            const sequence = history.slice(i, i + 3);
            const pattern = this.detectSequencePattern(sequence);
            if (pattern) patterns.push(pattern);
        }

        // Циклические паттерны
        const cyclicPattern = this.detectCyclicPattern(history);
        if (cyclicPattern) patterns.push(cyclicPattern);

        // Паттерны углубления
        const deepeningPattern = this.detectDeepeningPattern(history);
        if (deepeningPattern) patterns.push(deepeningPattern);

        return patterns;
    }

    detectSequencePattern(sequence) {
        // Определяем тип последовательности вопросов
        const types = sequence.map(q => q.queryType);

        if (types[0] === 'definition' && types[1] === 'process' && types[2] === 'application') {
            return {
                patternType: 'learning_progression',
                nextQuestion: 'Какие есть примеры применения?',
                confidence: 0.8
            };
        }

        if (types.every(t => t === 'comparison')) {
            return {
                patternType: 'systematic_comparison',
                nextQuestion: 'Какой вариант лучше для моего случая?',
                confidence: 0.75
            };
        }

        return null;
    }

    detectCyclicPattern(history) {
        // Ищем повторяющиеся темы
        const topics = history.map(h => h.mainTopic);
        const topicCounts = {};

        topics.forEach(topic => {
            topicCounts[topic] = (topicCounts[topic] || 0) + 1;
        });

        const repeatedTopics = Object.entries(topicCounts)
            .filter(([_, count]) => count > 2)
            .map(([topic, count]) => ({ topic, count }));

        if (repeatedTopics.length > 0) {
            const mainTopic = repeatedTopics[0].topic;
            return {
                patternType: 'cyclic_exploration',
                nextQuestion: `Есть ли что-то ещё важное про ${mainTopic}?`,
                confidence: 0.7
            };
        }

        return null;
    }

    detectDeepeningPattern(history) {
        // Проверяем углубление в тему
        if (history.length < 3) return null;

        const recentTopics = history.slice(-3).map(h => h.mainTopic);
        const uniqueTopics = new Set(recentTopics);

        if (uniqueTopics.size === 1) {
            const topic = recentTopics[0];
            const complexityLevels = history.slice(-3).map(h => h.complexityLevel);

            if (complexityLevels[0] < complexityLevels[1] && complexityLevels[1] < complexityLevels[2]) {
                return {
                    patternType: 'progressive_deepening',
                    nextQuestion: `Какие продвинутые аспекты ${topic} стоит изучить?`,
                    confidence: 0.85
                };
            }
        }

        return null;
    }

    identifyKnowledgeGaps(profile, currentContext) {
        const gaps = [];

        // Анализируем упомянутые концепты
        const mentionedConcepts = new Set(
            profile.interactionHistory.flatMap(h => h.entities.map(e => e.name))
        );

        // Находим связанные концепты, которые не были упомянуты
        mentionedConcepts.forEach(concept => {
            const relatedConcepts = this.findRelatedConcepts(concept);

            relatedConcepts.forEach(related => {
                if (!mentionedConcepts.has(related.name)) {
                    gaps.push({
                        topic: related.name,
                        likelyQuestion: `Что такое ${related.name}?`,
                        importance: related.relevance,
                        reasoning: `Связано с ${concept}`
                    });
                }
            });
        });

        return gaps.sort((a, b) => b.importance - a.importance).slice(0, 3);
    }

    findRelatedConcepts(concept) {
        // Используем базу знаний для поиска связанных концептов
        if (!global.knowledgeBase) return [];

        const related = [];
        const conceptLC = concept.toLowerCase();

        global.knowledgeBase.forEach(item => {
            if (item.title.toLowerCase().includes(conceptLC) ||
                item.content.toLowerCase().includes(conceptLC)) {

                // Извлекаем связанные термины из тегов
                item.tags.forEach(tag => {
                    if (tag.toLowerCase() !== conceptLC) {
                        related.push({
                            name: tag,
                            relevance: 0.7
                        });
                    }
                });
            }
        });

        return related.slice(0, 5);
    }
}

class UserCognitiveProfile {
    constructor(sessionId) {
        this.sessionId = sessionId;
        this.createdAt = Date.now();

        // Когнитивные характеристики
        this.knownGoals = [];
        this.currentGoals = [];
        this.inferredGoals = [];

        this.domainKnowledge = new Map(); // topic -> level (0-1)
        this.expressedBeliefs = [];
        this.inferredBeliefs = [];

        this.behaviorPatterns = {
            questioningStyle: 'exploratory', // exploratory, focused, systematic
            learningPace: 'medium', // slow, medium, fast
            detailPreference: 'balanced', // brief, balanced, detailed
            interactionStyle: 'collaborative' // directive, collaborative, passive
        };

        this.interactionHistory = [];
        this.emotionalTrajectory = [];
        this.cognitiveLoad = 0.5; // 0-1, текущая когнитивная нагрузка
    }

    updateFromInteraction(interaction) {
        if (!this.interactionHistory) {
            this.interactionHistory = [];
        }

        // Проверяем обязательные поля
        const safeInteraction = {
            timestamp: Date.now(),
            message: interaction.message || '',
            entities: interaction.entities || [],
            queryType: interaction.queryType || 'general',
            complexityLevel: interaction.complexity || 'medium',
            mainTopic: interaction.mainTopic || 'general',
            emotionalState: interaction.emotionalState || 'neutral'
        };

        this.interactionHistory.push(safeInteraction);

        // Обновляем эмоциональную траекторию
        this.emotionalTrajectory.push({
            timestamp: Date.now(),
            state: interaction.emotionalState,
            intensity: interaction.emotionalIntensity || 0.5
        });

        // Оцениваем когнитивную нагрузку
        this.updateCognitiveLoad(interaction);

        // Адаптируем стиль взаимодействия
        this.adaptBehaviorPatterns(interaction);
    }

    updateCognitiveLoad(interaction) {
        // Факторы увеличения нагрузки
        let loadIncrease = 0;

        if (interaction.complexity === 'high') loadIncrease += 0.2;
        if (interaction.entities && interaction.entities.length > 5) loadIncrease += 0.1;
        if (interaction.emotionalState === 'confused') loadIncrease += 0.15;

        // Факторы снижения нагрузки
        let loadDecrease = 0;

        if (interaction.emotionalState === 'positive') loadDecrease += 0.1;
        if (interaction.responseQuality > 0.8) loadDecrease += 0.1;

        // Обновляем с затуханием
        this.cognitiveLoad = Math.max(0, Math.min(1,
            this.cognitiveLoad * 0.9 + loadIncrease - loadDecrease
        ));
    }

    adaptBehaviorPatterns(interaction) {
        // Проверяем и инициализируем interactionHistory если необходимо
        if (!this.interactionHistory) {
            this.interactionHistory = [];
        }

        // Адаптируем стиль вопросов
        const definitionQuestions = this.interactionHistory.filter(h =>
            h && h.queryType === 'definition'
        );

        if (interaction.queryType === 'definition' && definitionQuestions.length > 3) {
            this.behaviorPatterns.questioningStyle = 'systematic';
        }

        // Адаптируем темп обучения
        const recentInteractions = this.interactionHistory.slice(-5).filter(Boolean);
        const avgTimeBetween = this.calculateAvgTimeBetween(recentInteractions);

        if (avgTimeBetween < 30000) { // < 30 секунд
            this.behaviorPatterns.learningPace = 'fast';
        } else if (avgTimeBetween > 120000) { // > 2 минуты
            this.behaviorPatterns.learningPace = 'slow';
        }

        // Адаптируем предпочтение детализации
        if (interaction.message && (interaction.message.includes('подробн') || interaction.message.includes('детальн'))) {
            this.behaviorPatterns.detailPreference = 'detailed';
        } else if (interaction.message && (interaction.message.includes('коротк') || interaction.message.includes('кратк'))) {
            this.behaviorPatterns.detailPreference = 'brief';
        }
    }
    
    calculateAvgTimeBetween(interactions) {
        if (!interactions || interactions.length < 2) return 60000;

        // Фильтруем null/undefined и проверяем наличие timestamp
        const validInteractions = interactions.filter(i => i && i.timestamp);
        if (validInteractions.length < 2) return 60000;

        let totalTime = 0;
        for (let i = 1; i < validInteractions.length; i++) {
            totalTime += validInteractions[i].timestamp - validInteractions[i - 1].timestamp;
        }

        return totalTime / (validInteractions.length - 1);
    }

    addInferredGoals(goals) {
        goals.forEach(goal => {
            if (!this.inferredGoals.find(g => g.description === goal.description)) {
                this.inferredGoals.push(goal);

                if (goal.confidence > 0.7) {
                    this.currentGoals.push(goal);
                }
            }
        });
    }

    updateKnowledgeLevel(knowledgeAssessment) {
        knowledgeAssessment.forEach(({ topic, level }) => {
            this.domainKnowledge.set(topic, level);
        });
    }

    updateBeliefs(beliefs) {
        beliefs.forEach(belief => {
            if (!this.inferredBeliefs.find(b => b.statement === belief.statement)) {
                this.inferredBeliefs.push(belief);
            }
        });
    }

    getAdaptedResponseStrategy() {
        return {
            detailLevel: this.behaviorPatterns.detailPreference,
            pace: this.behaviorPatterns.learningPace,
            style: this.behaviorPatterns.interactionStyle,
            shouldSimplify: this.cognitiveLoad > 0.7,
            shouldEncourage: this.emotionalTrajectory.slice(-3).every(e => e.state === 'negative'),
            anticipateQuestions: this.behaviorPatterns.questioningStyle === 'systematic'
        };
    }
}

class GoalInferenceEngine {
    inferGoals(interactions, knownGoals, behaviorPatterns) {
        const inferredGoals = [];

        // Анализ последовательности вопросов
        const questionSequence = interactions.slice(-5);

        // Паттерн обучения
        if (this.isLearningPattern(questionSequence)) {
            inferredGoals.push({
                type: 'learning',
                description: `Изучить ${questionSequence[0].mainTopic}`,
                confidence: 0.8,
                evidence: 'Последовательные вопросы от базовых к сложным'
            });
        }

        // Паттерн решения проблемы
        if (this.isProblemSolvingPattern(questionSequence)) {
            inferredGoals.push({
                type: 'problem_solving',
                description: 'Решить конкретную проблему',
                confidence: 0.75,
                evidence: 'Вопросы о процессах и инструкциях'
            });
        }

        // Паттерн принятия решения
        if (this.isDecisionMakingPattern(questionSequence)) {
            inferredGoals.push({
                type: 'decision_making',
                description: 'Принять обоснованное решение',
                confidence: 0.85,
                evidence: 'Множественные сравнения и оценки'
            });
        }

        // Паттерн исследования
        if (this.isExplorationPattern(questionSequence)) {
            inferredGoals.push({
                type: 'exploration',
                description: 'Исследовать новую область',
                confidence: 0.7,
                evidence: 'Широкий спектр вопросов по разным аспектам'
            });
        }

        return inferredGoals;
    }

    isLearningPattern(sequence) {
        if (sequence.length < 3) return false;

        const hasDefinition = sequence.some(q => q.queryType === 'definition');
        const hasProcess = sequence.some(q => q.queryType === 'process');
        const hasExample = sequence.some(q => q.queryType === 'example' ||
            q.message.includes('пример'));

        return hasDefinition && (hasProcess || hasExample);
    }

    isProblemSolvingPattern(sequence) {
        const problemIndicators = ['как', 'решить', 'исправить', 'сделать', 'получить'];

        return sequence.filter(q =>
            problemIndicators.some(indicator => q.message.toLowerCase().includes(indicator))
        ).length >= 2;
    }

    isDecisionMakingPattern(sequence) {
        const decisionIndicators = ['лучше', 'выбрать', 'сравни', 'отличие', 'разница'];

        return sequence.filter(q =>
            decisionIndicators.some(indicator => q.message.toLowerCase().includes(indicator))
        ).length >= 2;
    }

    isExplorationPattern(sequence) {
        const topics = new Set(sequence.map(q => q.mainTopic));
        return topics.size >= 3 && sequence.length >= 4;
    }

    predictNextSteps(goal, currentContext) {
        const steps = [];

        switch (goal.type) {
            case 'learning':
                steps.push({
                    likelyQuestion: 'Какие есть практические примеры?',
                    probability: 0.8
                });
                steps.push({
                    likelyQuestion: 'Как это применяется на практике?',
                    probability: 0.75
                });
                break;

            case 'problem_solving':
                steps.push({
                    likelyQuestion: 'Какие есть альтернативные решения?',
                    probability: 0.7
                });
                steps.push({
                    likelyQuestion: 'Что делать если это не сработает?',
                    probability: 0.65
                });
                break;

            case 'decision_making':
                steps.push({
                    likelyQuestion: 'Какие есть плюсы и минусы каждого варианта?',
                    probability: 0.85
                });
                steps.push({
                    likelyQuestion: 'Что рекомендуют эксперты?',
                    probability: 0.7
                });
                break;

            case 'exploration':
                steps.push({
                    likelyQuestion: 'Какие смежные темы стоит изучить?',
                    probability: 0.6
                });
                break;
        }

        return steps;
    }
}

class KnowledgeEstimator {
    estimate(interactions, currentKnowledge) {
        const assessment = [];

        // Группируем по темам
        const topicGroups = this.groupByTopic(interactions);

        topicGroups.forEach((questions, topic) => {
            const level = this.estimateTopicKnowledge(questions, currentKnowledge.get(topic) || 0);
            assessment.push({ topic, level });
        });

        return assessment;
    }

    groupByTopic(interactions) {
        const groups = new Map();

        interactions.forEach(interaction => {
            const topic = interaction.mainTopic;
            if (!groups.has(topic)) {
                groups.set(topic, []);
            }
            groups.get(topic).push(interaction);
        });

        return groups;
    }

    estimateTopicKnowledge(questions, currentLevel) {
        let estimatedLevel = currentLevel;

        // Базовые вопросы снижают оценку
        const basicQuestions = questions.filter(q =>
            q.queryType === 'definition' || q.message.includes('что такое')
        ).length;

        if (basicQuestions > 0) {
            estimatedLevel = Math.max(0.2, estimatedLevel - 0.1);
        }

        // Продвинутые вопросы повышают оценку
        const advancedQuestions = questions.filter(q =>
            q.complexityLevel === 'high' || q.queryType === 'analysis'
        ).length;

        if (advancedQuestions > 0) {
            estimatedLevel = Math.min(1.0, estimatedLevel + 0.2);
        }

        // Постепенное повышение с каждым взаимодействием
        estimatedLevel = Math.min(1.0, estimatedLevel + questions.length * 0.05);

        return estimatedLevel;
    }
}

class BeliefNetwork {
    inferBeliefs(interactions, expressedBeliefs) {
        const beliefs = [];

        // Анализируем утверждения пользователя
        interactions.forEach(interaction => {
            const statements = this.extractStatements(interaction.message);

            statements.forEach(statement => {
                const belief = this.analyzeStatement(statement);
                if (belief) {
                    beliefs.push(belief);
                }
            });
        });

        return beliefs;
    }

    extractStatements(message) {
        // Простое извлечение утверждений
        const statements = [];

        // Ищем утверждения с "я думаю", "я считаю", "мне кажется"
        const beliefPatterns = [
            /я\s+(?:думаю|считаю|полагаю|уверен|знаю),?\s+что\s+(.+)/gi,
            /мне\s+кажется,?\s+что\s+(.+)/gi,
            /по-моему,?\s+(.+)/gi
        ];

        beliefPatterns.forEach(pattern => {
            const matches = [...message.matchAll(pattern)];
            matches.forEach(match => {
                if (match[1]) {
                    statements.push(match[1].trim());
                }
            });
        });

        return statements;
    }

    analyzeStatement(statement) {
        // Определяем тип убеждения
        const statementLC = statement.toLowerCase();

        if (statementLC.includes('лучше') || statementLC.includes('хуже')) {
            return {
                type: 'preference',
                statement: statement,
                confidence: 0.7
            };
        }

        if (statementLC.includes('должен') || statementLC.includes('нужно')) {
            return {
                type: 'normative',
                statement: statement,
                confidence: 0.75
            };
        }

        if (statementLC.includes('всегда') || statementLC.includes('никогда')) {
            return {
                type: 'absolute',
                statement: statement,
                confidence: 0.8
            };
        }

        return {
            type: 'general',
            statement: statement,
            confidence: 0.6
        };
    }
}

module.exports = { CognitiveUserModeling, UserCognitiveProfile };