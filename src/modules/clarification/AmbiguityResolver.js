class AmbiguityResolver {
    constructor() {
        this.ambiguousTerms = new Map([
            ['банк', ['финансовое учреждение', 'емкость для хранения', 'берег реки']],
            ['лук', ['овощ', 'оружие']],
            ['ключ', ['инструмент для замка', 'источник воды', 'музыкальный знак', 'разгадка']],
            ['мышь', ['животное', 'компьютерное устройство']],
            ['язык', ['орган речи', 'система общения', 'программирование']],
            ['операция', ['хирургическое вмешательство', 'военная операция', 'математическое действие']],
            ['программа', ['компьютерная программа', 'план мероприятий', 'телевизионная передача']],
            ['система', ['компьютерная система', 'организационная система', 'биологическая система']]
        ]);

        this.contextualClues = new Map([
            ['медицинский', ['здоровье', 'больница', 'врач', 'лечение', 'болезнь']],
            ['компьютерный', ['программа', 'интернет', 'сайт', 'файл', 'данные']],
            ['финансовый', ['деньги', 'счет', 'кредит', 'платеж', 'карта']],
            ['военный', ['армия', 'солдат', 'война', 'стратегия', 'команда']],
            ['природный', ['река', 'лес', 'животное', 'растение', 'среда']]
        ]);
    }

    detectAmbiguity(message, entities) {
        const ambiguities = [];
        const messageLC = message.toLowerCase();

        // Проверяем каждую найденную сущность на неоднозначность
        entities.forEach(entity => {
            const ambiguousVariants = this.ambiguousTerms.get(entity.name.toLowerCase());
            
            if (ambiguousVariants) {
                const contextualMeaning = this.resolveByContext(messageLC, entity.name.toLowerCase(), ambiguousVariants);
                
                ambiguities.push({
                    term: entity.name,
                    variants: ambiguousVariants,
                    suggestedMeaning: contextualMeaning.meaning,
                    confidence: contextualMeaning.confidence,
                    needsClarification: contextualMeaning.confidence < 0.7
                });
            }
        });

        // Проверяем прямое упоминание неоднозначных терминов
        for (const [term, variants] of this.ambiguousTerms.entries()) {
            if (messageLC.includes(term) && !ambiguities.find(a => a.term.toLowerCase() === term)) {
                const contextualMeaning = this.resolveByContext(messageLC, term, variants);
                
                ambiguities.push({
                    term: term,
                    variants: variants,
                    suggestedMeaning: contextualMeaning.meaning,
                    confidence: contextualMeaning.confidence,
                    needsClarification: contextualMeaning.confidence < 0.6
                });
            }
        }

        return {
            isAmbiguous: ambiguities.length > 0,
            ambiguities: ambiguities,
            clarificationNeeded: ambiguities.filter(a => a.needsClarification),
            totalAmbiguities: ambiguities.length
        };
    }

    resolveByContext(messageLC, term, variants) {
        let bestMatch = {
            meaning: variants[0],
            confidence: 0.3
        };

        // Ищем контекстуальные подсказки
        for (const [contextType, clueWords] of this.contextualClues.entries()) {
            let contextScore = 0;
            
            clueWords.forEach(clue => {
                if (messageLC.includes(clue)) {
                    contextScore += 0.2;
                }
            });

            if (contextScore > bestMatch.confidence) {
                const contextualVariant = this.matchContextToVariant(contextType, variants);
                if (contextualVariant) {
                    bestMatch = {
                        meaning: contextualVariant,
                        confidence: Math.min(0.9, 0.5 + contextScore)
                    };
                }
            }
        }

        return bestMatch;
    }

    matchContextToVariant(contextType, variants) {
        const contextMappings = {
            'медицинский': ['хирургическое вмешательство', 'орган речи', 'здоровье'],
            'компьютерный': ['компьютерное устройство', 'компьютерная программа', 'система общения'],
            'финансовый': ['финансовое учреждение', 'счет'],
            'военный': ['оружие', 'военная операция', 'стратегия'],
            'природный': ['животное', 'источник воды', 'берег реки']
        };

        const contextWords = contextMappings[contextType] || [];
        
        for (const variant of variants) {
            if (contextWords.some(word => variant.includes(word) || word.includes(variant))) {
                return variant;
            }
        }

        return null;
    }

    generateClarificationQuestion(ambiguity) {
        const questions = [
            `Уточните, пожалуйста, что именно вы имеете в виду под "${ambiguity.term}"? Возможные варианты: ${ambiguity.variants.join(', ')}.`,
            `Термин "${ambiguity.term}" может означать разные вещи. Вы имеете в виду: ${ambiguity.variants.join(' или ')}?`,
            `Для более точного ответа уточните значение "${ambiguity.term}". Это может быть: ${ambiguity.variants.join(', ')}.`
        ];

        return questions[Math.floor(Math.random() * questions.length)];
    }

    processClarificationResponse(originalAmbiguity, userResponse) {
        const responseLC = userResponse.toLowerCase();
        
        // Ищем прямое указание на вариант
        for (const variant of originalAmbiguity.variants) {
            if (responseLC.includes(variant.toLowerCase())) {
                return {
                    resolved: true,
                    chosenMeaning: variant,
                    confidence: 0.95
                };
            }
        }

        // Ищем частичные совпадения или ключевые слова
        let bestMatch = { meaning: null, score: 0 };
        
        for (const variant of originalAmbiguity.variants) {
            const variantWords = variant.toLowerCase().split(/\s+/);
            let score = 0;
            
            variantWords.forEach(word => {
                if (responseLC.includes(word)) {
                    score += 1 / variantWords.length;
                }
            });

            if (score > bestMatch.score) {
                bestMatch = { meaning: variant, score };
            }
        }

        if (bestMatch.score > 0.3) {
            return {
                resolved: true,
                chosenMeaning: bestMatch.meaning,
                confidence: Math.min(0.9, bestMatch.score)
            };
        }

        return {
            resolved: false,
            confidence: 0,
            suggestion: 'Попробуйте переформулировать или выбрать один из предложенных вариантов'
        };
    }

    handleMultipleAmbiguities(ambiguities) {
        // Приоритизируем наиболее важные неоднозначности
        const prioritized = ambiguities
            .filter(a => a.needsClarification)
            .sort((a, b) => {
                // Сортируем по важности (низкая уверенность = высокая важность)
                return a.confidence - b.confidence;
            })
            .slice(0, 2); // Не больше 2 уточнений за раз

        if (prioritized.length === 0) return null;

        if (prioritized.length === 1) {
            return this.generateClarificationQuestion(prioritized[0]);
        }

        // Для множественных неоднозначностей создаем сводный вопрос
        const clarifications = prioritized.map((amb, index) => 
            `${index + 1}) "${amb.term}" - ${amb.variants.join(' или ')}`
        ).join('\n');

        return `Для более точного ответа уточните значения следующих терминов:\n${clarifications}`;
    }
}

module.exports = { AmbiguityResolver };