// Node AI Maria/ReasoningEngine.js
class ReasoningEngine {
    constructor() {
        this.deductiveReasoner = new DeductiveReasoner();
        this.inductiveReasoner = new InductiveReasoner();
        this.abductiveReasoner = new AbductiveReasoner();
        this.analogicalReasoner = new AnalogicalReasoner();
        this.causalReasoner = new CausalReasoner();
    }

    reason(query, context, knowledgeBase) {
        const reasoningChain = [];
        
        // 1. Определяем тип рассуждения
        const reasoningType = this.determineReasoningType(query);
        
        // 2. Применяем соответствующий метод
        let conclusion;
        
        switch (reasoningType) {
            case 'deductive':
                conclusion = this.deductiveReasoner.reason(query, knowledgeBase);
                reasoningChain.push(...conclusion.steps);
                break;
                
            case 'inductive':
                conclusion = this.inductiveReasoner.reason(query, context, knowledgeBase);
                reasoningChain.push(...conclusion.steps);
                break;
                
            case 'abductive':
                conclusion = this.abductiveReasoner.reason(query, context, knowledgeBase);
                reasoningChain.push(...conclusion.steps);
                break;
                
            case 'analogical':
                conclusion = this.analogicalReasoner.reason(query, knowledgeBase);
                reasoningChain.push(...conclusion.steps);
                break;
                
            case 'causal':
                conclusion = this.causalReasoner.reason(query, knowledgeBase);
                reasoningChain.push(...conclusion.steps);
                break;
                
            default:
                // Комбинированное рассуждение
                conclusion = this.hybridReasoning(query, context, knowledgeBase);
                reasoningChain.push(...conclusion.steps);
        }
        
        return {
            conclusion: conclusion.result,
            confidence: conclusion.confidence,
            reasoningChain: reasoningChain,
            reasoningType: reasoningType,
            alternatives: conclusion.alternatives || []
        };
    }

    determineReasoningType(query) {
        const queryLC = query.toLowerCase();
        
        if (queryLC.includes('если') && queryLC.includes('то')) return 'deductive';
        if (queryLC.includes('почему') || queryLC.includes('причина')) return 'causal';
        if (queryLC.includes('похож') || queryLC.includes('как') && queryLC.includes('так и')) return 'analogical';
        if (queryLC.includes('вероятно') || queryLC.includes('возможно')) return 'abductive';
        if (queryLC.includes('всегда') || queryLC.includes('обычно')) return 'inductive';
        
        return 'hybrid';
    }

    hybridReasoning(query, context, knowledgeBase) {
        // Комбинируем несколько методов рассуждения
        const results = [];
        
        // Пробуем дедукцию
        try {
            const deductive = this.deductiveReasoner.reason(query, knowledgeBase);
            if (deductive.confidence > 0.6) {
                results.push({ ...deductive, method: 'deductive' });
            }
        } catch (e) {}
        
        // Пробуем индукцию
        try {
            const inductive = this.inductiveReasoner.reason(query, context, knowledgeBase);
            if (inductive.confidence > 0.5) {
                results.push({ ...inductive, method: 'inductive' });
            }
        } catch (e) {}
        
        // Пробуем аналогию
        try {
            const analogical = this.analogicalReasoner.reason(query, knowledgeBase);
            if (analogical.confidence > 0.5) {
                results.push({ ...analogical, method: 'analogical' });
            }
        } catch (e) {}
        
        if (results.length === 0) {
            return {
                result: "Не удалось построить цепочку рассуждений",
                confidence: 0.2,
                steps: []
            };
        }
        
        // Выбираем лучший результат
        const best = results.sort((a, b) => b.confidence - a.confidence)[0];
        
        return {
            result: best.result,
            confidence: best.confidence,
            steps: [
                { step: `Применён метод: ${best.method}`, confidence: 1.0 },
                ...best.steps
            ],
            alternatives: results.slice(1).map(r => ({
                method: r.method,
                result: r.result,
                confidence: r.confidence
            }))
        };
    }
}

class DeductiveReasoner {
    reason(query, knowledgeBase) {
        const steps = [];
        
        // Извлекаем предпосылки из запроса
        const premises = this.extractPremises(query);
        
        steps.push({
            step: `Предпосылки: ${premises.join(', ')}`,
            confidence: 0.9
        });
        
        // Ищем применимые правила в базе знаний
        const applicableRules = this.findApplicableRules(premises, knowledgeBase);
        
        if (applicableRules.length === 0) {
            return {
                result: "Недостаточно информации для дедуктивного вывода",
                confidence: 0.3,
                steps: steps
            };
        }
        
        // Применяем правила
        let conclusion = null;
        applicableRules.forEach(rule => {
            steps.push({
                step: `Применяем правило: ${rule.description}`,
                confidence: rule.confidence
            });
            
            conclusion = rule.conclusion;
        });
        
        steps.push({
            step: `Вывод: ${conclusion}`,
            confidence: 0.85
        });
        
        return {
            result: conclusion,
            confidence: 0.85,
            steps: steps
        };
    }

    extractPremises(query) {
        // Простое извлечение предпосылок
        const premises = [];
        
        // Ищем "если ... то ..."
        const ifThenMatch = query.match(/если\s+(.+?)\s+то/i);
        if (ifThenMatch) {
            premises.push(ifThenMatch[1].trim());
        }
        
        // Ищем утверждения
        const statements = query.split(/[,;]/).map(s => s.trim());
        premises.push(...statements.filter(s => s.length > 5));
        
        return premises;
    }

    findApplicableRules(premises, knowledgeBase) {
        const rules = [];
        
        // Простые логические правила
        premises.forEach(premise => {
            const premiseLC = premise.toLowerCase();
            
            // Правило: если A, то B
            if (premiseLC.includes('млекопитающее')) {
                rules.push({
                    description: "Все млекопитающие теплокровные",
                    conclusion: "Это теплокровное существо",
                    confidence: 0.95
                });
            }
            
            if (premiseLC.includes('человек')) {
                rules.push({
                    description: "Все люди смертны",
                    conclusion: "Это смертное существо",
                    confidence: 1.0
                });
            }
            
            // Можно добавить больше правил из базы знаний
        });
        
        return rules;
    }
}

class InductiveReasoner {
    reason(query, context, knowledgeBase) {
        const steps = [];
        
        // Собираем наблюдения
        const observations = this.gatherObservations(query, context, knowledgeBase);
        
        steps.push({
            step: `Собрано наблюдений: ${observations.length}`,
            confidence: 0.8
        });
        
        if (observations.length < 2) {
            return {
                result: "Недостаточно данных для индуктивного вывода",
                confidence: 0.2,
                steps: steps
            };
        }
        
        // Ищем паттерны
        const pattern = this.findPattern(observations);
        
        if (pattern) {
            steps.push({
                step: `Обнаружен паттерн: ${pattern.description}`,
                confidence: pattern.confidence
            });
            
            // Обобщаем
            const generalization = this.generalize(pattern, observations);
            
            steps.push({
                step: `Обобщение: ${generalization}`,
                confidence: pattern.confidence * 0.9
            });
            
            return {
                result: generalization,
                confidence: pattern.confidence * 0.85,
                steps: steps
            };
        }
        
        return {
            result: "Не удалось найти устойчивый паттерн",
            confidence: 0.3,
            steps: steps
        };
    }

    gatherObservations(query, context, knowledgeBase) {
        const observations = [];
        
        // Из контекста
        if (context.previousInteractions) {
            observations.push(...context.previousInteractions.map(i => ({
                data: i.message,
                outcome: i.response
            })));
        }
        
        // Из базы знаний
        const queryWords = query.toLowerCase().split(/\s+/);
        knowledgeBase.forEach(item => {
            const itemWords = item.content.toLowerCase().split(/\s+/);
            const overlap = queryWords.filter(w => itemWords.includes(w)).length;
            
            if (overlap > 2) {
                observations.push({
                    data: item.title,
                    content: item.content
                });
            }
        });
        
        return observations;
    }

    findPattern(observations) {
        // Простой поиск паттернов
        if (observations.length < 3) return null;
        
        // Ищем общие элементы
        const commonElements = this.findCommonElements(observations);
        
        if (commonElements.length > 0) {
            return {
                description: `Общие элементы: ${commonElements.join(', ')}`,
                confidence: Math.min(0.7 + commonElements.length * 0.1, 0.95),
                elements: commonElements
            };
        }
        
        return null;
    }

    findCommonElements(observations) {
        const elements = new Map();
        
        observations.forEach(obs => {
            const words = (obs.data + ' ' + (obs.content || '')).toLowerCase().split(/\s+/);
            words.forEach(word => {
                if (word.length > 4) {
                    elements.set(word, (elements.get(word) || 0) + 1);
                }
            });
        });
        
        // Возвращаем элементы, встречающиеся в большинстве наблюдений
        const threshold = observations.length * 0.6;
        return Array.from(elements.entries())
            .filter(([_, count]) => count >= threshold)
            .map(([word, _]) => word)
            .slice(0, 5);
    }

    generalize(pattern, observations) {
        return `На основе ${observations.length} наблюдений можно предположить, что ${pattern.elements.join(' и ')} являются ключевыми характеристиками`;
    }
}

class AbductiveReasoner {
    reason(query, context, knowledgeBase) {
        const steps = [];
        
        // Определяем наблюдение
        const observation = this.extractObservation(query);
        
        steps.push({
            step: `Наблюдение: ${observation}`,
            confidence: 0.9
        });
        
        // Генерируем гипотезы
        const hypotheses = this.generateHypotheses(observation, knowledgeBase);
        
        steps.push({
            step: `Сгенерировано гипотез: ${hypotheses.length}`,
            confidence: 0.8
        });
        
        if (hypotheses.length === 0) {
            return {
                result: "Не удалось сформулировать правдоподобные гипотезы",
                confidence: 0.2,
                steps: steps
            };
        }
        
        // Оцениваем гипотезы
        const rankedHypotheses = this.rankHypotheses(hypotheses, context);
        
        const bestHypothesis = rankedHypotheses[0];
        
        steps.push({
            step: `Наиболее вероятная гипотеза: ${bestHypothesis.explanation}`,
            confidence: bestHypothesis.plausibility
        });
        
        return {
            result: bestHypothesis.explanation,
            confidence: bestHypothesis.plausibility,
            steps: steps,
            alternatives: rankedHypotheses.slice(1, 3).map(h => ({
                explanation: h.explanation,
                plausibility: h.plausibility
            }))
        };
    }

    extractObservation(query) {
        // Извлекаем наблюдаемый факт
        return query.replace(/почему|зачем|как так|отчего/gi, '').trim();
    }

    generateHypotheses(observation, knowledgeBase) {
        const hypotheses = [];
        
        // Ищем возможные объяснения в базе знаний
        const observationWords = observation.toLowerCase().split(/\s+/);
        
        knowledgeBase.forEach(item => {
            const itemWords = item.content.toLowerCase().split(/\s+/);
            const relevance = observationWords.filter(w => itemWords.includes(w)).length;
            
            if (relevance > 1) {
                hypotheses.push({
                    explanation: `Возможно, это связано с ${item.title}`,
                    evidence: item.content,
                    relevance: relevance
                });
            }
        });
        
        // Добавляем общие гипотезы
        hypotheses.push({
            explanation: "Это может быть следствием естественных процессов",
            evidence: "Общее знание",
            relevance: 1
        });
        
        return hypotheses;
    }

    rankHypotheses(hypotheses, context) {
        return hypotheses.map(h => ({
            ...h,
            plausibility: this.calculatePlausibility(h, context)
        })).sort((a, b) => b.plausibility - a.plausibility);
    }

    calculatePlausibility(hypothesis, context) {
        let plausibility = 0.5;
        
        // Увеличиваем за релевантность
        plausibility += hypothesis.relevance * 0.1;
        
        // Увеличиваем если есть доказательства
        if (hypothesis.evidence && hypothesis.evidence.length > 50) {
            plausibility += 0.2;
        }
        
        return Math.min(plausibility, 0.9);
    }
}

class AnalogicalReasoner {
    reason(query, knowledgeBase) {
        const steps = [];
        
        // Извлекаем исходную и целевую области
        const { source, target } = this.extractDomains(query);
        
        steps.push({
            step: `Исходная область: ${source}, Целевая область: ${target}`,
            confidence: 0.85
        });
        
        // Находим структурные соответствия
        const mappings = this.findStructuralMappings(source, target, knowledgeBase);
        
        if (mappings.length === 0) {
            return {
                result: "Не удалось найти значимые аналогии",
                confidence: 0.3,
                steps: steps
            };
        }
        
        steps.push({
            step: `Найдено соответствий: ${mappings.length}`,
            confidence: 0.8
        });
        
        // Переносим знания
        const inference = this.transferKnowledge(mappings, target);
        
        steps.push({
            step: `Вывод по аналогии: ${inference}`,
            confidence: 0.7
        });
        
        return {
            result: inference,
            confidence: 0.7,
            steps: steps
        };
    }

    extractDomains(query) {
        // Простое извлечение доменов из запроса
        const parts = query.split(/как|подобно|похож|аналогичн/i);
        
        return {
            source: parts[0]?.trim() || "неизвестно",
            target: parts[1]?.trim() || "неизвестно"
        };
    }

    findStructuralMappings(source, target, knowledgeBase) {
        // Находим общие структурные элементы
        const mappings = [];
        
        const sourceWords = source.toLowerCase().split(/\s+/);
        const targetWords = target.toLowerCase().split(/\s+/);
        
        sourceWords.forEach(sw => {
            targetWords.forEach(tw => {
                if (this.areSimilar(sw, tw)) {
                    mappings.push({
                        from: sw,
                        to: tw,
                        similarity: 0.8
                    });
                }
            });
        });
        
        return mappings;
    }

    areSimilar(word1, word2) {
        // Простая проверка схожести
        if (word1 === word2) return true;
        if (word1.includes(word2) || word2.includes(word1)) return true;
        
        // Можно добавить более сложную логику
        return false;
    }

    transferKnowledge(mappings, target) {
        if (mappings.length === 0) {
            return "Аналогия не применима";
        }
        
        const mapping = mappings[0];
        return `По аналогии с ${mapping.from}, можно предположить, что ${target} обладает схожими свойствами`;
    }
}

class CausalReasoner {
    reason(query, knowledgeBase) {
        const steps = [];
        
        // Извлекаем причину и следствие
        const { cause, effect } = this.extractCauseEffect(query);
        
        steps.push({
            step: `Анализ причинно-следственной связи: ${cause} → ${effect}`,
            confidence: 0.85
        });
        
        // Проверяем связь в базе знаний
        const causalLink = this.findCausalLink(cause, effect, knowledgeBase);
        
        if (causalLink) {
            steps.push({
                step: `Найдена причинно-следственная связь: ${causalLink.description}`,
                confidence: causalLink.confidence
            });
            
            return {
                result: causalLink.explanation,
                confidence: causalLink.confidence,
                steps: steps
            };
        }
        
        // Инферируем возможную связь
        const inferred = this.inferCausalLink(cause, effect, knowledgeBase);
        
        steps.push({
            step: `Предполагаемая связь: ${inferred.explanation}`,
            confidence: inferred.confidence
        });
        
        return {
            result: inferred.explanation,
            confidence: inferred.confidence,
            steps: steps
        };
    }

    extractCauseEffect(query) {
        // Извлекаем причину и следствие
        const causePatterns = [
            /(?:из-за|из за|по причине|вследствие)\s+(.+?)\s+(?:происходит|случается|возникает)/i,
            /(.+?)\s+(?:приводит к|вызывает|является причиной)\s+(.+)/i
        ];
        
        for (const pattern of causePatterns) {
            const match = query.match(pattern);
            if (match) {
                return {
                    cause: match[1].trim(),
                    effect: match[2]?.trim() || "неизвестно"
                };
            }
        }
        
        return {
            cause: "неизвестно",
            effect: "неизвестно"
        };
    }

    findCausalLink(cause, effect, knowledgeBase) {
        // Ищем явные причинно-следственные связи
        const causeLC = cause.toLowerCase();
        const effectLC = effect.toLowerCase();
        
        for (const item of knowledgeBase) {
            const content = item.content.toLowerCase();
            
            if (content.includes(causeLC) && content.includes(effectLC)) {
                return {
                    description: item.title,
                    explanation: item.content,
                    confidence: 0.8
                };
            }
        }
        
        return null;
    }

    inferCausalLink(cause, effect, knowledgeBase) {
        // Инферируем возможную причинно-следственную связь
        return {
            explanation: `${cause} может быть одной из причин ${effect}, но требуется дополнительная проверка`,
            confidence: 0.5
        };
    }
}

module.exports = { ReasoningEngine, DeductiveReasoner, InductiveReasoner };