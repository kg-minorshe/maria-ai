class ResponseGenerator {
    constructor() {
        this.templates = this.loadResponseTemplates();
        this.greetings = [
            "Конечно, с удовольствием расскажу!",
            "Отличный вопрос! Вот что я знаю:",
            "Позвольте пояснить:",
            "Давайте разберём этот вопрос подробно!",
            "Хороший вопрос! Попробую объяснить:",
            "Рада помочь! Вот информация по вашему вопросу:",
            "Интересная тема! Расскажу что знаю:",
            "Сейчас всё объясню!"
        ];

        this.transitions = {
            addition: [
                "Кроме того,", "Также стоит отметить,", "Дополнительно,", 
                "Помимо этого,", "Важно добавить,", "Не стоит забывать, что",
                "Интересно также, что", "Стоит упомянуть, что"
            ],
            contrast: [
                "Однако", "В то же время", "С другой стороны", "Но важно учесть,",
                "Тем не менее,", "Хотя стоит отметить,", "Впрочем,", "Несмотря на это,"
            ],
            conclusion: [
                "Таким образом,", "В итоге,", "Подводя итог,", "Резюмируя,",
                "В заключение,", "Получается, что", "Можно сделать вывод, что"
            ],
            explanation: [
                "Дело в том, что", "Это объясняется тем, что", "Причина в том, что",
                "Всё дело в том, что", "Объяснение простое:"
            ]
        };

        this.emotionalResponses = {
            positive: {
                greetings: ["Замечательно! ", "Отлично! ", "Прекрасный вопрос! "],
                transitions: ["И это действительно здорово, что", "Приятно отметить, что"]
            },
            negative: {
                greetings: ["Понимаю ваше беспокойство. ", "Разберём этот непростой вопрос. "],
                transitions: ["Важно понимать, что", "Стоит учесть, что"]
            },
            confused: {
                greetings: ["Давайте разложим всё по полочкам. ", "Объясню максимально понятно. "],
                transitions: ["Проще говоря,", "Другими словами,", "То есть"]
            }
        };

        this.responsePatterns = new ResponsePatternEngine();
    }

    generateResponse(queryAnalysis, searchResults, context = {}) {
        const startTime = Date.now();

        const response = {
            answer: "",
            sources: [],
            followUp: [],
            confidence: 0,
            responseType: null,
            clarificationQuestions: [],
            responseMetadata: {}
        };

        try {
            // 1. Обработка неоднозначности
            if (queryAnalysis.ambiguity?.clarificationNeeded?.length > 0) {
                return this.generateClarificationResponse(queryAnalysis.ambiguity, context);
            }

            // 2. Деликатное ранжирование результатов с опорой на рассуждения
            const curatedResults = this.rankResultsWithDeliberation(
                searchResults,
                queryAnalysis,
                context.reasoningResult
            );

            const resultsForAnswering = curatedResults.length > 0 ? curatedResults : searchResults;

            // 3. Определяем тип ответа
            response.responseType = this.determineResponseType(queryAnalysis, resultsForAnswering, context);

            // 4. Генерируем основной ответ
            switch (response.responseType) {
                case 'no_results':
                    response.answer = this.generateNoResultsResponse(queryAnalysis, context);
                    break;

                case 'single_entity':
                    response.answer = this.generateSingleEntityResponse(resultsForAnswering[0], queryAnalysis, context);
                    response.sources = [this.createSourceInfo(resultsForAnswering[0])];
                    break;

                case 'comparison':
                    response.answer = this.generateComparisonResponse(resultsForAnswering, queryAnalysis, context);
                    response.sources = resultsForAnswering.slice(0, 3).map(r => this.createSourceInfo(r));
                    break;

                case 'complex_multi_part':
                    response.answer = this.generateComplexResponse(queryAnalysis, resultsForAnswering, context);
                    response.sources = this.extractUniqueSources(resultsForAnswering);
                    break;

                case 'process_explanation':
                    response.answer = this.generateProcessResponse(resultsForAnswering, queryAnalysis, context);
                    response.sources = resultsForAnswering.slice(0, 2).map(r => this.createSourceInfo(r));
                    break;

                case 'definition_focused':
                    response.answer = this.generateDefinitionResponse(resultsForAnswering, queryAnalysis, context);
                    response.sources = resultsForAnswering.slice(0, 2).map(r => this.createSourceInfo(r));
                    break;

                case 'list_enumeration':
                    response.answer = this.generateListResponse(resultsForAnswering, queryAnalysis, context);
                    response.sources = this.extractUniqueSources(resultsForAnswering);
                    break;

                default:
                    response.answer = this.generateDefaultResponse(resultsForAnswering, queryAnalysis, context);
                    response.sources = resultsForAnswering.slice(0, 3).map(r => this.createSourceInfo(r));
            }

            // 4. Сводим информацию из нескольких источников и добавляем рассуждения
            const crossSourceInsight = this.synthesizeCrossSourceSummary(resultsForAnswering);
            if (crossSourceInsight) {
                response.answer = `${response.answer}\n\n${crossSourceInsight}`;
            }

            if (context.reasoningResult) {
                response.answer = this.appendReasoningContext(response.answer, context.reasoningResult);
                response.responseMetadata.reasoning = context.reasoningResult;
            }

            // 4. Добавляем эмоционально окрашенное приветствие
            if (response.answer && !response.answer.startsWith("К сожалению") && !response.answer.startsWith("Уточните")) {
                const greeting = this.getContextualGreeting(context);
                response.answer = `${greeting}\n\n${response.answer}`;
            }

            // 5. Генерируем дополнительные вопросы
            response.followUp = this.generateIntelligentFollowUp(queryAnalysis, searchResults, context, response.responseType);

            // 6. Рассчитываем уверенность ответа
            const baseConfidence = this.calculateResponseConfidence(queryAnalysis, searchResults, response, context);
            response.confidence = this.calibrateConfidence(baseConfidence, queryAnalysis, searchResults, context);

            // 7. Добавляем метаданные
            response.responseMetadata = {
                ...(response.responseMetadata || {}),
                processingTime: Date.now() - startTime,
                wordsCount: response.answer.split(' ').length,
                sourcesUsed: response.sources.length,
                responseComplexity: this.assessResponseComplexity(response.answer),
                reasoningUsed: Boolean(context.reasoningResult)
            };

        } catch (error) {
            console.error('Ошибка генерации ответа:', error);
            response.answer = "Извините, произошла ошибка при формировании ответа. Попробуйте переформулировать вопрос.";
            response.confidence = 0.1;
        }

        return response;
    }

    determineResponseType(queryAnalysis, searchResults, context) {
        if (searchResults.length === 0) {
            return 'no_results';
        }

        // Анализ интента с учетом контекста
        const intent = queryAnalysis.intent?.intent || 'general';

        switch (intent) {
            case 'definition':
                return 'definition_focused';
            
            case 'process':
                return 'process_explanation';
                
            case 'list':
                return 'list_enumeration';
                
            case 'comparison':
                return 'comparison';
        }

        // Анализ на основе результатов поиска
        if (searchResults.length === 1 || (searchResults.length > 1 && searchResults[0].score > searchResults[1].score * 2.5)) {
            return 'single_entity';
        }

        if (queryAnalysis.isComplex || queryAnalysis.subqueries.length > 1) {
            return 'complex_multi_part';
        }

        // Проверка на сравнение на основе сущностей
        if (queryAnalysis.entities.length >= 2 && searchResults.length >= 2) {
            const entitiesInResults = queryAnalysis.entities.filter(entity => 
                searchResults.some(result => 
                    result.document.title.toLowerCase().includes(entity.name.toLowerCase())
                )
            );
            
            if (entitiesInResults.length >= 2) {
                return 'comparison';
            }
        }

        return 'default';
    }

    rankResultsWithDeliberation(searchResults, queryAnalysis, reasoningResult) {
        if (!Array.isArray(searchResults) || searchResults.length === 0) {
            return [];
        }

        const normalizedTopics = (queryAnalysis.topics || []).map(t => t.toLowerCase());
        const entities = (queryAnalysis.entities || []).map(e => e.name?.toLowerCase?.() || "");

        const scored = searchResults.map((result, index) => {
            const content = `${result.document.title} ${result.document.content}`.toLowerCase();

            const topicScore = normalizedTopics.reduce((acc, topic) => {
                return acc + (content.includes(topic) ? 0.2 : 0);
            }, 0);

            const entityScore = entities.reduce((acc, entity) => {
                if (!entity) return acc;
                return acc + (content.includes(entity) ? 0.15 : 0);
            }, 0);

            const reasoningScore = reasoningResult?.conclusion
                ? (content.includes(reasoningResult.conclusion.toLowerCase()) ? 0.25 : 0)
                : 0;

            const intentWeight = queryAnalysis.intent?.intent === 'process' ? 0.05 : 0.1;
            const intentScore = queryAnalysis.intent?.intent &&
                (result.document.tags || []).some(tag =>
                    tag.toLowerCase().includes(queryAnalysis.intent.intent)
                )
                ? intentWeight
                : 0;

            const structuralBoost = (queryAnalysis.subqueries?.length || 0) > 1
                ? Math.min(result.score * 0.1, 0.1)
                : 0;

            const confidence = (result.searchMetadata?.confidence || 0) * 0.1;

            const finalScore = (result.score || 0) * 0.6 +
                topicScore +
                entityScore +
                reasoningScore +
                intentScore +
                structuralBoost +
                confidence;

            return {
                ...result,
                deliberateScore: finalScore,
                rankingIndex: index,
                rationale: {
                    topicScore,
                    entityScore,
                    reasoningScore,
                    intentScore,
                    structuralBoost,
                    confidence
                }
            };
        });

        return scored
            .filter(result => result.deliberateScore > 0.05)
            .sort((a, b) => b.deliberateScore - a.deliberateScore);
    }

    generateClarificationResponse(ambiguity, context) {
        return {
            answer: this.generateClarificationQuestion(ambiguity, context),
            sources: [],
            followUp: [],
            confidence: 0.9,
            responseType: 'clarification',
            clarificationQuestions: ambiguity.clarificationNeeded.map(a => a.term)
        };
    }

    generateClarificationQuestion(ambiguity, context) {
        const emotionalGreeting = context.emotionalContext?.currentState === 'confused' 
            ? "Давайте уточним, чтобы я смогла дать точный ответ. " 
            : "Для более точного ответа уточните, пожалуйста: ";

        if (ambiguity.clarificationNeeded.length === 1) {
            const amb = ambiguity.clarificationNeeded[0];
            return `${emotionalGreeting}Что именно вы имеете в виду под "${amb.term}"? Это может быть: ${amb.variants.join(', ')}.`;
        } else {
            const clarifications = ambiguity.clarificationNeeded
                .map((amb, index) => `${index + 1}) "${amb.term}" - ${amb.variants.join(' или ')}`)
                .join('\n');
            
            return `${emotionalGreeting}Уточните значения следующих терминов:\n${clarifications}`;
        }
    }

    generateSingleEntityResponse(searchResult, queryAnalysis, context) {
        const document = searchResult.document;
        const intent = queryAnalysis.intent?.intent || 'general';

        let response = "";

        switch (intent) {
            case 'definition':
                response = this.formatDefinition(document, context);
                break;

            case 'process':
                response = this.formatProcess(document, context);
                break;

            case 'location':
                response = this.formatLocation(document, context);
                break;

            default:
                response = this.formatGeneral(document, context);
        }

        // Добавляем контекстную информацию если есть связи
        if (queryAnalysis.relations.length > 0) {
            const relationInfo = this.generateRelationInfo(queryAnalysis.relations[0], document);
            if (relationInfo) {
                response += `\n\n${this.getRandomTransition('addition')} ${relationInfo}`;
            }
        }

        // Добавляем временной или пространственный контекст
        if (queryAnalysis.temporalContext || queryAnalysis.spatialContext) {
            const contextInfo = this.generateContextualInfo(queryAnalysis, document);
            if (contextInfo) {
                response += `\n\n${contextInfo}`;
            }
        }

        return response;
    }

    generateComparisonResponse(searchResults, queryAnalysis, context) {
        if (searchResults.length < 2) {
            return this.generateSingleEntityResponse(searchResults[0], queryAnalysis, context);
        }

        const docs = searchResults.slice(0, 3).map(r => r.document);
        
        let response = "";

        if (docs.length === 2) {
            response = `Рассмотрю различия между **${docs[0].title}** и **${docs[1].title}**:\n\n`;
            
            response += `**${docs[0].title}**\n${this.formatSummary(docs[0], context)}\n\n`;
            response += `**${docs[1].title}**\n${this.formatSummary(docs[1], context)}\n\n`;

            // Находим общие и отличительные характеристики
            const comparison = this.analyzeComparison(docs[0], docs[1]);
            if (comparison) {
                response += comparison;
            }

        } else {
            response = `Вот сравнительный обзор по вашему запросу:\n\n`;
            
            docs.forEach((doc, index) => {
                response += `**${index + 1}. ${doc.title}**\n${this.formatSummary(doc, context)}\n\n`;
            });

            // Общие выводы
            const commonThemes = this.findCommonThemes(docs);
            if (commonThemes.length > 0) {
                response += `${this.getRandomTransition('conclusion')} общие темы: ${commonThemes.join(', ')}.`;
            }
        }

        return response;
    }

    generateComplexResponse(queryAnalysis, searchResults, context) {
        let response = "";
        const processedSubqueries = new Set();

        // Обрабатываем каждый подзапрос
        queryAnalysis.subqueries.forEach((subqueryData, index) => {
            const subquery = subqueryData.query;
            
            if (processedSubqueries.has(subquery) || subquery.length < 10) return;
            processedSubqueries.add(subquery);

            // Находим релевантные результаты для подзапроса
            const relevantResults = this.findRelevantResults(subquery, searchResults, subqueryData.entities);

            if (relevantResults.length > 0) {
                if (queryAnalysis.subqueries.length > 1) {
                    const header = this.formatSubqueryHeader(subquery, index + 1);
                    response += `${header}\n`;
                }

                const subResponse = this.generateSubqueryResponse(
                    subqueryData, 
                    relevantResults, 
                    queryAnalysis, 
                    context
                );
                response += `${subResponse}\n\n`;
            }
        });

        // Если не удалось обработать подзапросы, возвращаем обычный ответ
        if (response.trim().length === 0) {
            return this.generateDefaultResponse(searchResults, queryAnalysis, context);
        }

        // Добавляем заключение если есть несколько частей
        if (queryAnalysis.subqueries.length > 2) {
            const conclusion = this.generateComplexConclusion(searchResults, queryAnalysis);
            if (conclusion) {
                response += `${this.getRandomTransition('conclusion')} ${conclusion}`;
            }
        }

        return response.trim();
    }

    generateProcessResponse(searchResults, queryAnalysis, context) {
        const mainResult = searchResults[0];
        let response = `**${mainResult.document.title}**\n\n`;

        // Пытаемся найти пошаговую структуру в содержимом
        const steps = this.extractProcessSteps(mainResult.document.content);
        
        if (steps.length > 0) {
            response += "Процесс происходит следующим образом:\n\n";
            steps.forEach((step, index) => {
                response += `**Шаг ${index + 1}:** ${step}\n\n`;
            });
        } else {
            response += mainResult.document.content;
        }

        // Добавляем дополнительную информацию из других источников
        if (searchResults.length > 1) {
            const additionalInfo = this.extractAdditionalProcessInfo(searchResults.slice(1));
            if (additionalInfo) {
                response += `\n\n${this.getRandomTransition('addition')} ${additionalInfo}`;
            }
        }

        return response;
    }

    generateDefinitionResponse(searchResults, queryAnalysis, context) {
        const mainResult = searchResults[0];
        let response = this.formatDefinition(mainResult.document, context);

        // Добавляем альтернативные определения если есть
        if (searchResults.length > 1) {
            const alternativeDefinitions = searchResults.slice(1)
                .filter(r => r.score > 0.5)
                .slice(0, 2);

            if (alternativeDefinitions.length > 0) {
                response += `\n\n${this.getRandomTransition('addition')} существуют и другие аспекты:\n\n`;
                
                alternativeDefinitions.forEach((result, index) => {
                    response += `• **${result.document.title}**: ${this.formatSummary(result.document, context)}\n`;
                });
            }
        }

        return response;
    }

    generateListResponse(searchResults, queryAnalysis, context) {
        let response = "";
        
        if (searchResults.length === 1) {
            // Извлекаем список из содержимого документа
            const listItems = this.extractListFromContent(searchResults[0].document.content);
            
            if (listItems.length > 0) {
                response = `**${searchResults[0].document.title}**\n\n`;
                listItems.forEach((item, index) => {
                    response += `${index + 1}. ${item}\n`;
                });
            } else {
                response = this.formatGeneral(searchResults[0].document, context);
            }
        } else {
            // Создаем список из нескольких источников
            response = "Вот что удалось найти:\n\n";
            
            searchResults.slice(0, 6).forEach((result, index) => {
                response += `${index + 1}. **${result.document.title}** - ${this.formatSummary(result.document, context)}\n\n`;
            });
        }

        return response;
    }

    generateDefaultResponse(searchResults, queryAnalysis, context) {
        if (!searchResults || searchResults.length === 0) {
            return this.generateNoResultsResponse(queryAnalysis, context);
        }

        // Группируем результаты по релевантности
        const highRelevance = searchResults.filter(r => r.score > 0.7).slice(0, 2);
        const mediumRelevance = searchResults.filter(r => r.score > 0.4 && r.score <= 0.7).slice(0, 3);

        let response = "";

        // Основная информация
        if (highRelevance.length > 0) {
            highRelevance.forEach((result, index) => {
                if (index > 0) response += `\n\n${this.getRandomTransition('addition')} `;
                response += `**${result.document.title}**\n${this.formatSummary(result.document, context, 'detailed')}`;
            });
        } else if (mediumRelevance.length > 0) {
            response = "По вашему запросу найдена следующая информация:\n\n";
            mediumRelevance.forEach((result, index) => {
                response += `**${index + 1}. ${result.document.title}**\n${this.formatSummary(result.document, context, 'brief')}\n\n`;
            });
        }

        // Дополнительные темы если есть место
        if (mediumRelevance.length > 0 && response.length < 1000) {
            const additionalTopics = mediumRelevance.slice(0, 2).map(r => r.document.title);
            if (additionalTopics.length > 0) {
                response += `\n${this.getRandomTransition('addition')} связанные темы: ${additionalTopics.join(', ')}.`;
            }
        }

        return response || this.generateNoResultsResponse(queryAnalysis, context);
    }

    generateNoResultsResponse(queryAnalysis, context) {
        const emotionalContext = context.emotionalContext?.currentState || 'neutral';
        
        const apologies = {
            'negative': "Понимаю ваше разочарование. К сожалению, я не смогла найти точную информацию по вашему вопросу в своей базе знаний.",
            'confused': "Извините за затруднение. По вашему запросу не нашлось подходящей информации в моей базе знаний.",
            'neutral': "К сожалению, я не нашла точной информации по вашему вопросу в своей базе знаний."
        };

        let response = apologies[emotionalContext] || apologies['neutral'];

        // Предлагаем альтернативы на основе анализа запроса
        const suggestions = this.generateAlternativeSuggestions(queryAnalysis, context);
        if (suggestions.length > 0) {
            response += `\n\n${suggestions}`;
        }

        response += "\n\nПопробуйте переформулировать вопрос или обратитесь к оператору для получения персональной помощи.";

        return response;
    }

    // Форматирование контента

    formatDefinition(document, context) {
        const userPrefs = context.userPreferences || {};
        
        if (document.content.includes('—')) {
            const parts = document.content.split('—');
            return `**${document.title}** — ${parts.slice(1).join('—').trim()}`;
        }

        if (userPrefs.detailLevel === 'brief') {
            return `**${document.title}** - ${this.formatSummary(document, context, 'brief')}`;
        }

        return `**${document.title}**\n\n${document.content}`;
    }

    formatProcess(document, context) {
        return `**Процесс: ${document.title}**\n\n${document.content}`;
    }

    formatLocation(document, context) {
        return `**Местоположение: ${document.title}**\n\n${document.content}`;
    }

    formatGeneral(document, context) {
        return `**${document.title}**\n\n${document.content}`;
    }

    formatSummary(document, context, length = 'medium') {
        let summary = document.content;
        const maxLengths = {
            'brief': 150,
            'medium': 300,
            'detailed': 600
        };

        const maxLength = maxLengths[length] || maxLengths['medium'];

        if (summary.length > maxLength) {
            const sentences = summary.split(/[.!?]+/).filter(s => s.trim().length > 0);
            summary = "";
            
            for (const sentence of sentences) {
                if ((summary + sentence).length > maxLength) break;
                summary += sentence.trim() + ". ";
            }
            
            if (summary.length < 50 && sentences.length > 0) {
                summary = sentences[0] + ".";
            }
        }

        return summary.trim();
    }

    // Вспомогательные методы для генерации

    findRelevantResults(subquery, allResults, subqueryEntities = []) {
        const subqueryLC = subquery.toLowerCase();
        const subqueryWords = subqueryLC.split(/\s+/).filter(w => w.length > 2);

        return allResults
            .map(result => ({
                ...result,
                relevanceScore: this.calculateSubqueryRelevance(result, subqueryWords, subqueryEntities)
            }))
            .filter(result => result.relevanceScore > 0.3)
            .sort((a, b) => b.relevanceScore - a.relevanceScore)
            .slice(0, 3);
    }

    calculateSubqueryRelevance(result, subqueryWords, entities) {
        const docText = `${result.document.title} ${result.document.content}`.toLowerCase();
        let relevance = 0;

        // Совпадение слов
        subqueryWords.forEach(word => {
            if (docText.includes(word)) {
                relevance += 0.2;
            }
        });

        // Совпадение сущностей
        entities.forEach(entity => {
            if (docText.includes(entity.name.toLowerCase())) {
                relevance += 0.3;
            }
        });

        // Базовый score от поиска
        relevance += result.score * 0.5;

        return Math.min(relevance, 1.0);
    }

    generateSubqueryResponse(subqueryData, relevantResults, queryAnalysis, context) {
        if (relevantResults.length === 0) return "Информация не найдена.";

        if (relevantResults.length === 1) {
            return this.formatSummary(relevantResults[0].document, context);
        }

        let response = "";
        relevantResults.forEach((result, index) => {
            if (index > 0) {
                response += `\n\n${this.getRandomTransition('addition')} `;
            }
            response += this.formatSummary(result.document, context, 'brief');
        });

        return response;
    }

    formatSubqueryHeader(subquery, index) {
        // Создаем красивый заголовок для подзапроса
        let header = subquery.replace(/\?+$/, '').replace(/^(что|как|где|когда|почему)/i, '').trim();
        
        if (header.length > 50) {
            header = header.substring(0, 47) + "...";
        }

        return `**${index}. ${header}**`;
    }

    extractProcessSteps(content) {
        const steps = [];
        
        // Ищем нумерованные списки
        const numberedMatches = content.match(/(\d+\.?\s+[^.\n]+[.\n])/g);
        if (numberedMatches && numberedMatches.length > 1) {
            return numberedMatches.map(match => match.replace(/^\d+\.?\s*/, '').trim());
        }

        // Ищем маркированные списки
        const bulletMatches = content.match(/([•\-*]\s+[^.\n]+[.\n])/g);
        if (bulletMatches && bulletMatches.length > 1) {
            return bulletMatches.map(match => match.replace(/^[•\-*]\s*/, '').trim());
        }

        // Ищем ключевые слова этапов
        const stepKeywords = ['сначала', 'затем', 'потом', 'далее', 'после', 'наконец', 'в конце'];
        const sentences = content.split(/[.!?]/);
        
        sentences.forEach(sentence => {
            if (stepKeywords.some(keyword => sentence.toLowerCase().includes(keyword))) {
                steps.push(sentence.trim());
            }
        });

        return steps.slice(0, 8); // максимум 8 шагов
    }

    extractListFromContent(content) {
        // Ищем готовые списки в контенте
        const lists = [];
        
        // Нумерованные списки
        const numberedItems = content.match(/\d+\.?\s+[^\n\d]+/g);
        if (numberedItems && numberedItems.length > 1) {
            lists.push(...numberedItems.map(item => item.replace(/^\d+\.?\s*/, '')));
        }

        // Маркированные списки
        const bulletItems = content.match(/[•\-*]\s+[^\n•\-*]+/g);
        if (bulletItems && bulletItems.length > 1) {
            lists.push(...bulletItems.map(item => item.replace(/^[•\-*]\s*/, '')));
        }

        // Списки через запятую/точку с запятой
        if (lists.length === 0) {
            const commaList = content.split(/[,;]/).filter(item => item.trim().length > 10);
            if (commaList.length > 2) {
                lists.push(...commaList.slice(0, 10));
            }
        }

        return lists.slice(0, 15); // ограничиваем 15 пунктами
    }

    analyzeComparison(doc1, doc2) {
        // Находим общие теги
        const commonTags = doc1.tags.filter(tag => doc2.tags.includes(tag));
        const uniqueTags1 = doc1.tags.filter(tag => !doc2.tags.includes(tag));
        const uniqueTags2 = doc2.tags.filter(tag => !doc1.tags.includes(tag));

        let comparison = "";

        if (commonTags.length > 0) {
            comparison += `**Общие характеристики:** ${commonTags.join(', ')}\n\n`;
        }

        if (uniqueTags1.length > 0) {
            comparison += `**Особенности ${doc1.title}:** ${uniqueTags1.join(', ')}\n`;
        }

        if (uniqueTags2.length > 0) {
            comparison += `**Особенности ${doc2.title}:** ${uniqueTags2.join(', ')}`;
        }

        return comparison;
    }

    findCommonThemes(documents) {
        if (documents.length < 2) return [];

        // Находим пересекающиеся теги
        let commonTags = documents[0].tags;
        
        for (let i = 1; i < documents.length; i++) {
            commonTags = commonTags.filter(tag => documents[i].tags.includes(tag));
        }

        return commonTags.slice(0, 5);
    }

    generateComplexConclusion(searchResults, queryAnalysis) {
        const topTopics = searchResults.slice(0, 3).map(r => r.document.title);
        
        if (topTopics.length > 2) {
            return `основные темы вашего запроса охватывают: ${topTopics.join(', ')}.`;
        }

        return null;
    }

    generateAlternativeSuggestions(queryAnalysis, context) {
        const suggestions = [];

        // Предлагаем на основе найденных сущностей
        if (queryAnalysis.entities.length > 0) {
            const entityNames = queryAnalysis.entities.slice(0, 3).map(e => e.name);
            suggestions.push(`Возможно, вас интересует информация по темам: ${entityNames.join(', ')}?`);
        }

        // Предлагаем на основе недавних тем из контекста
        if (context.recentEntities && context.recentEntities.length > 0) {
            const recentTopics = context.recentEntities.slice(0, 2).map(e => e.name);
            suggestions.push(`Или попробуйте спросить про: ${recentTopics.join(', ')}.`);
        }

        return suggestions.join(' ');
    }

    generateIntelligentFollowUp(queryAnalysis, searchResults, context, responseType) {
        const followUp = [];

        if (searchResults.length > 0) {
            // На основе типа ответа
            switch (responseType) {
                case 'definition_focused':
                    followUp.push("Хотите узнать больше деталей?");
                    followUp.push("Есть ли конкретные аспекты, которые интересуют особенно?");
                    break;

                case 'comparison':
                    followUp.push("Нужно ли сравнить с чем-то ещё?");
                    followUp.push("Какой аспект сравнения наиболее важен?");
                    break;

                case 'process_explanation':
                    followUp.push("Нужны ли подробности по какому-то этапу?");
                    followUp.push("Возникли вопросы по процессу?");
                    break;

                case 'list_enumeration':
                    followUp.push("Нужна дополнительная информация по какому-то пункту?");
                    break;
            }

            // На основе тегов документов
            const allTags = searchResults.flatMap(r => r.document.tags);
            const popularTags = [...new Set(allTags)]
                .filter(tag => allTags.filter(t => t === tag).length > 1)
                .slice(0, 2);

            if (popularTags.length > 0) {
                followUp.push(`Интересуют детали по: ${popularTags.join(', ')}?`);
            }

            // Связанные темы
            if (searchResults.length > 1) {
                const relatedTopics = searchResults.slice(1, 3).map(r => r.document.title);
                followUp.push(`Возможно, также интересно: ${relatedTopics.join(', ')}?`);
            }
        }

        // Общие вопросы если ничего не найдено
        if (followUp.length === 0) {
            followUp.push("Есть ли ещё вопросы по этой теме?");
            followUp.push("Нужны ли дополнительные разъяснения?");
        }

        return followUp.slice(0, 2); // максимум 2 дополнительных вопроса
    }

    synthesizeCrossSourceSummary(searchResults) {
        if (!Array.isArray(searchResults) || searchResults.length < 2) return null;

        const topResults = searchResults.slice(0, 3);
        const summaryPieces = topResults.map((result, index) => {
            const lead = index === 0 ? "Ключевой источник" : `Источник ${index + 1}`;
            const snippet = this.formatSummary(result.document, {}, 'brief');
            return `${lead}: ${snippet}`;
        });

        return summaryPieces.length > 0
            ? `Сводка по нескольким источникам:\n- ${summaryPieces.join('\n- ')}`
            : null;
    }

    appendReasoningContext(answer, reasoningResult) {
        if (!reasoningResult?.reasoningChain || reasoningResult.reasoningChain.length === 0) {
            return answer;
        }

        const chain = reasoningResult.reasoningChain
            .slice(0, 4)
            .map((step, idx) => `${idx + 1}. ${step.step}`)
            .join('\n');

        const conclusion = reasoningResult.conclusion || 'Сформулирован вывод по рассуждению.';
        return `${answer}\n\nЛогика рассуждения:\n${chain}\n\nВывод: ${conclusion}`;
    }

    calculateResponseConfidence(queryAnalysis, searchResults, response, context) {
        let confidence = 0.5; // базовая

        // Факторы повышения
        if (searchResults.length > 0) {
            const avgScore = searchResults.slice(0, 3).reduce((sum, r) => sum + (r.score || 0), 0) / Math.min(3, searchResults.length);
            confidence += avgScore * 0.3;
        }

        if (queryAnalysis.confidence > 0.7) {
            confidence += 0.15;
        }

        if (response.sources && response.sources.length > 0) {
            confidence += 0.1;
        }

        if (response.answer.length > 100) {
            confidence += 0.05;
        }

        // Бонус за отсутствие неоднозначностей
        if (!queryAnalysis.ambiguity?.isAmbiguous) {
            confidence += 0.1;
        }

        // Контекстуальный бонус
        if (context.currentTopic && searchResults.some(r => r.document.title === context.currentTopic)) {
            confidence += 0.1;
        }

        return Math.max(0.15, Math.min(confidence, 0.95));
    }

    calibrateConfidence(baseConfidence, queryAnalysis, searchResults, context) {
        let confidence = baseConfidence;

        if (context.reasoningResult?.confidence) {
            confidence += context.reasoningResult.confidence * 0.2;
        }

        if (searchResults.length === 0) {
            confidence -= 0.15;
        }

        if (queryAnalysis.ambiguity?.clarificationNeeded?.length) {
            confidence -= 0.1;
        }

        if (queryAnalysis.intent?.intent === 'comparison' && searchResults.length >= 2) {
            confidence += 0.05;
        }

        return Math.max(0.1, Math.min(confidence, 0.97));
    }

    // Утилиты

    getContextualGreeting(context) {
        const emotionalState = context.emotionalContext?.currentState || 'neutral';
        
        if (this.emotionalResponses[emotionalState]) {
            const greetings = this.emotionalResponses[emotionalState].greetings;
            const baseGreeting = this.greetings[Math.floor(Math.random() * this.greetings.length)];
            const emotionalPrefix = greetings[Math.floor(Math.random() * greetings.length)];
            return emotionalPrefix + baseGreeting;
        }

        return this.greetings[Math.floor(Math.random() * this.greetings.length)];
    }

    getRandomTransition(type) {
        const transitions = this.transitions[type] || this.transitions.addition;
        return transitions[Math.floor(Math.random() * transitions.length)];
    }

    createSourceInfo(searchResult) {
        return {
            id: searchResult.document.id,
            title: searchResult.document.title,
            score: Math.round((searchResult.score || 0) * 100) / 100,
            confidence: searchResult.searchMetadata?.confidence || 0.5
        };
    }

    extractUniqueSources(searchResults) {
        const seen = new Set();
        return searchResults
            .filter(result => {
                const key = result.document.id || result.document.title;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .slice(0, 5)
            .map(r => this.createSourceInfo(r));
    }

    generateRelationInfo(relation, document) {
        if (relation.type === 'explicit') {
            return `${document.title} ${relation.relation} с другими элементами системы.`;
        }
        
        if (relation.type === 'contextual') {
            return `Эта тема связана с контекстом вашего запроса.`;
        }
        
        return null;
    }

    generateContextualInfo(queryAnalysis, document) {
        let info = "";

        if (queryAnalysis.temporalContext) {
            info += `Временной контекст: ${queryAnalysis.temporalContext.indicators.join(', ')}.`;
        }

        if (queryAnalysis.spatialContext) {
            if (info) info += " ";
            info += `Пространственный контекст: ${queryAnalysis.spatialContext.indicators.join(', ')}.`;
        }

        return info || null;
    }

    extractAdditionalProcessInfo(additionalResults) {
        const infoBits = [];
        
        additionalResults.slice(0, 2).forEach(result => {
            const summary = this.formatSummary(result.document, {}, 'brief');
            if (summary.length > 20) {
                infoBits.push(summary);
            }
        });

        return infoBits.length > 0 ? infoBits.join(' ') : null;
    }

    assessResponseComplexity(responseText) {
        const words = responseText.split(/\s+/).length;
        const sentences = responseText.split(/[.!?]/).length;
        const avgWordsPerSentence = words / sentences;

        if (words < 50) return 'simple';
        if (words < 150 && avgWordsPerSentence < 15) return 'medium';
        return 'complex';
    }

    loadResponseTemplates() {
        return {
            definition: "**{title}** — {content}",
            comparison: "Сравнивая {entity1} и {entity2}: {comparison}",
            process: "Процесс {title} происходит следующим образом: {content}",
            list: "Вот {title}: {content}",
            location: "Местоположение {title}: {content}",
            time: "Временные рамки для {title}: {content}"
        };
    }
}

class ResponsePatternEngine {
    constructor() {
        this.patterns = this.loadPatterns();
    }

    loadPatterns() {
        return {
            greeting_patterns: {
                positive: ["Замечательно!", "Отлично!", "Прекрасный вопрос!"],
                neutral: ["Конечно!", "С удовольствием!", "Хороший вопрос!"],
                confused: ["Давайте разберём", "Объясню подробно", "Попробую пояснить"]
            },
            
            transition_patterns: {
                elaboration: ["Подробнее об этом", "Важно отметить", "Стоит добавить"],
                contrast: ["С другой стороны", "Однако", "В то же время"],
                summary: ["Итак", "В заключение", "Подводя итог"]
            }
        };
    }
}

module.exports = { ResponseGenerator };