// Node AI Maria/EmotionalIntelligence.js
class EmotionalIntelligence {
    constructor() {
        this.emotionDetector = new EmotionDetector();
        this.empathyEngine = new EmpathyEngine();
        this.toneAdapter = new ToneAdapter();
    }

    analyzeEmotionalState(message, context) {
        // Детектируем эмоции
        const emotions = this.emotionDetector.detect(message);
        
        // Анализируем интенсивность
        const intensity = this.emotionDetector.measureIntensity(message, emotions);
        
        // Определяем эмоциональную валентность
        const valence = this.calculateValence(emotions);
        
        // Анализируем эмоциональную траекторию
        const trajectory = this.analyzeTrajectory(context.emotionalHistory, emotions);
        
        return {
            primaryEmotion: emotions[0],
            allEmotions: emotions,
            intensity: intensity,
            valence: valence, // positive, negative, neutral
            trajectory: trajectory, // improving, declining, stable
            needsEmpathy: intensity > 0.7 || valence === 'negative',
            suggestedTone: this.toneAdapter.suggestTone(emotions, intensity, context)
        };
    }

    generateEmpathicResponse(emotionalState, baseResponse) {
        if (!emotionalState.needsEmpathy) {
            return baseResponse;
        }
        
        const empathyPrefix = this.empathyEngine.generatePrefix(emotionalState);
        const adaptedTone = this.toneAdapter.adaptResponse(baseResponse, emotionalState.suggestedTone);
        
        return `${empathyPrefix}\n\n${adaptedTone}`;
    }

    calculateValence(emotions) {
        const positiveEmotions = ['joy', 'excitement', 'satisfaction', 'gratitude', 'hope'];
        const negativeEmotions = ['anger', 'frustration', 'sadness', 'anxiety', 'confusion', 'disappointment'];
        
        let positiveScore = 0;
        let negativeScore = 0;
        
        emotions.forEach(emotion => {
            if (positiveEmotions.includes(emotion.type)) {
                positiveScore += emotion.confidence;
            } else if (negativeEmotions.includes(emotion.type)) {
                negativeScore += emotion.confidence;
            }
        });
        
        if (positiveScore > negativeScore * 1.5) return 'positive';
        if (negativeScore > positiveScore * 1.5) return 'negative';
        return 'neutral';
    }

    analyzeTrajectory(history, currentEmotions) {
        if (!history || history.length < 3) return 'stable';
        
        const recentValences = history.slice(-3).map(h => h.valence);
        const currentValence = this.calculateValence(currentEmotions);
        
        // Проверяем улучшение
        if (recentValences.every(v => v === 'negative') && currentValence === 'positive') {
            return 'improving';
        }
        
        // Проверяем ухудшение
        if (recentValences.every(v => v === 'positive') && currentValence === 'negative') {
            return 'declining';
        }
        
        // Проверяем тренд
        const negativeCount = recentValences.filter(v => v === 'negative').length;
        if (negativeCount >= 2 && currentValence === 'negative') {
            return 'declining';
        }
        
        const positiveCount = recentValences.filter(v => v === 'positive').length;
        if (positiveCount >= 2 && currentValence === 'positive') {
            return 'improving';
        }
        
        return 'stable';
    }
}

class EmotionDetector {
    constructor() {
        this.emotionPatterns = {
            joy: {
                keywords: ['рад', 'счастлив', 'восторг', 'отлично', 'супер', 'класс', 'ура'],
                patterns: [/!+$/, /😊|😃|😄|🎉/],
                weight: 1.0
            },
            gratitude: {
                keywords: ['спасибо', 'благодар', 'признателен', 'ценю'],
                patterns: [/спасибо\s+(?:большое|огромное)/i],
                weight: 0.9
            },
            frustration: {
                keywords: ['достал', 'надоел', 'устал', 'бесит', 'раздражает'],
                patterns: [/не\s+(?:понимаю|получается|работает)/i],
                weight: 1.0
            },
            confusion: {
                keywords: ['непонятн', 'запутал', 'не разобрал', 'сложн'],
                patterns: [/что\s+это\s+значит/i, /не\s+понима/i],
                weight: 0.8
            },
            anger: {
                keywords: ['злой', 'бесит', 'ярость', 'гнев'],
                patterns: [/!{2,}/, /[А-ЯЁ]{4,}/], // множественные ! или капс
                weight: 1.0
            },
            anxiety: {
                keywords: ['беспокоюсь', 'волнуюсь', 'переживаю', 'боюсь'],
                patterns: [/как\s+же/i, /что\s+делать/i],
                weight: 0.7
            },
            disappointment: {
                keywords: ['разочарован', 'жаль', 'печально', 'грустно'],
                patterns: [/не\s+то\s+что\s+ожидал/i],
                weight: 0.8
            },
            excitement: {
                keywords: ['интересно', 'любопытно', 'захватывающе', 'круто'],
                patterns: [/!+/, /😍|🤩|✨/],
                weight: 0.9
            }
        };
    }

    detect(message) {
        const emotions = [];
        const messageLC = message.toLowerCase();
        
        Object.entries(this.emotionPatterns).forEach(([emotionType, config]) => {
            let score = 0;
            
            // Проверяем ключевые слова
            config.keywords.forEach(keyword => {
                if (messageLC.includes(keyword)) {
                    score += 0.3;
                }
            });
            
            // Проверяем паттерны
            config.patterns.forEach(pattern => {
                if (pattern.test(message)) {
                    score += 0.4;
                }
            });
            
            if (score > 0) {
                emotions.push({
                    type: emotionType,
                    confidence: Math.min(score * config.weight, 1.0)
                });
            }
        });
        
        return emotions.sort((a, b) => b.confidence - a.confidence);
    }

    measureIntensity(message, emotions) {
        if (emotions.length === 0) return 0.3;
        
        let intensity = emotions[0].confidence;
        
        // Усиливающие факторы
        if (message.includes('!!!') || message.includes('!!!!')) intensity += 0.2;
        if (/[А-ЯЁ]{5,}/.test(message)) intensity += 0.15; // капс
        if (emotions.length > 2) intensity += 0.1; // смешанные эмоции
        
        return Math.min(intensity, 1.0);
    }
}

class EmpathyEngine {
    generatePrefix(emotionalState) {
        const prefixes = {
            frustration: [
                "Понимаю ваше разочарование.",
                "Вижу, что возникли сложности.",
                "Понимаю, что это может быть непросто."
            ],
            confusion: [
                "Давайте разберём это вместе.",
                "Постараюсь объяснить максимально понятно.",
                "Понимаю, что это может показаться сложным."
            ],
            anger: [
                "Понимаю ваше недовольство.",
                "Извините за доставленные неудобства.",
                "Понимаю, что ситуация вызывает раздражение."
            ],
            anxiety: [
                "Всё будет хорошо, давайте разберёмся.",
                "Не волнуйтесь, мы найдём решение.",
                "Понимаю ваше беспокойство."
            ],
            disappointment: [
                "Понимаю ваше разочарование.",
                "Жаль, что так получилось.",
                "Понимаю, что это не то, что вы ожидали."
            ],
            joy: [
                "Рад, что смог помочь!",
                "Замечательно!",
                "Отлично, что всё получилось!"
            ],
            gratitude: [
                "Всегда рада помочь!",
                "Пожалуйста, обращайтесь!",
                "Рада быть полезной!"
            ]
        };
        
        const emotion = emotionalState.primaryEmotion.type;
        const options = prefixes[emotion] || ["Понимаю."];
        
        return options[Math.floor(Math.random() * options.length)];
    }
}

class ToneAdapter {
    suggestTone(emotions, intensity, context) {
        if (emotions.length === 0) return 'neutral';
        
        const primaryEmotion = emotions[0].type;
        
        // Карта эмоций -> тон ответа
        const toneMap = {
            frustration: intensity > 0.7 ? 'very_supportive' : 'supportive',
            confusion: 'patient_explanatory',
            anger: 'apologetic_calm',
            anxiety: 'reassuring',
            disappointment: 'understanding_helpful',
            joy: 'enthusiastic',
            gratitude: 'warm_friendly',
            excitement: 'engaging'
        };
        
        return toneMap[primaryEmotion] || 'neutral';
    }

    adaptResponse(response, suggestedTone) {
        const toneModifiers = {
            very_supportive: {
                prefix: "Полностью понимаю вашу ситуацию. ",
                style: "empathetic",
                addEncouragement: true
            },
            supportive: {
                prefix: "Понимаю. ",
                style: "helpful",
                addEncouragement: false
            },
            patient_explanatory: {
                prefix: "Давайте разберём по шагам. ",
                style: "clear",
                simplify: true
            },
            apologetic_calm: {
                prefix: "Приношу извинения. ",
                style: "calm",
                addSolution: true
            },
            reassuring: {
                prefix: "Не переживайте. ",
                style: "confident",
                addEncouragement: true
            },
            understanding_helpful: {
                prefix: "Понимаю ваше разочарование. ",
                style: "constructive",
                addAlternatives: true
            },
            enthusiastic: {
                prefix: "Отлично! ",
                style: "energetic",
                addPositiveReinforcement: true
            },
            warm_friendly: {
                prefix: "Рада помочь! ",
                style: "friendly",
                addPersonalTouch: true
            },
            engaging: {
                prefix: "Интересный вопрос! ",
                style: "dynamic",
                addCuriosity: true
            }
        };
        
        const modifier = toneModifiers[suggestedTone] || {};
        let adapted = response;
        
        // Применяем модификации
        if (modifier.simplify) {
            adapted = this.simplifyLanguage(adapted);
        }
        
        if (modifier.addEncouragement) {
            adapted += "\n\nВы на правильном пути!";
        }
        
        if (modifier.addSolution) {
            adapted += "\n\nДавайте найдём решение вместе.";
        }
        
        return adapted;
    }

    simplifyLanguage(text) {
        // Упрощаем сложные конструкции
        return text
            .replace(/тем не менее/gi, 'но')
            .replace(/в связи с тем что/gi, 'потому что')
            .replace(/следовательно/gi, 'поэтому')
            .replace(/таким образом/gi, 'итак');
    }
}

module.exports = { EmotionalIntelligence, EmotionDetector };