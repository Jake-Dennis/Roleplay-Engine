import { BenchmarkConfig, NeedleTestResult, MultiTurnTestResult, SummarizationFidelityResult, MemoryRetentionResult } from "./types";
import { OllamaModelMeta } from "../ollama-meta";
import { generateText, generateTextStream } from "../ollama";
import { logger } from "../logger";

const NEEDLE_FACTS = [
  "The secret password is 'blue-moon-42'.",
  "Agent Phoenix's real name is Marcus Chen.",
  "The artifact is hidden beneath the third oak tree.",
  "Project AURORA was discontinued in 2047.",
  "The encryption key rotates every 8 hours.",
];

const MULTI_TURN_ENTITIES = [
  { name: "Captain Reeves", role: "Starship Commander", trait: "never misses a shot" },
  { name: "Dr. Elara Voss", role: "Xenobiologist", trait: "speaks 12 alien languages" },
  { name: "Unit 734", role: "Maintenance Android", trait: "dreams of electric sheep" },
  { name: "Governor Kaine", role: "Colony Administrator", trait: "collects antique coins" },
  { name: "The Whisper", role: "Information Broker", trait: "knows every secret" },
];

const SUMMARIZATION_FACTS = [
  "The Treaty of Mars was signed in 2156, ending the Belt War.",
  "Quantum entanglement communications require paired crystals.",
  "Hydroponic Bay 7 produces 80% of the station's oxygen.",
  "The alien artifact emits a 1420 MHz signal when activated.",
  "Commander Vasquez authorized the emergency fission protocol.",
];

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function buildHaystack(contextSize: number, needle: string, depthPercent: number): string {
  const filler = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. ";
  const fillerTokens = estimateTokens(filler);
  const needleTokens = estimateTokens(needle);
  const targetTokens = contextSize;
  
  const beforeTokens = Math.floor((targetTokens - needleTokens) * depthPercent);
  const afterTokens = targetTokens - needleTokens - beforeTokens;
  
  const beforeFiller = Math.ceil(beforeTokens / fillerTokens);
  const afterFiller = Math.ceil(afterTokens / fillerTokens);
  
  return filler.repeat(beforeFiller) + "\n\n" + needle + "\n\n" + filler.repeat(afterFiller);
}

export async function runNeedleTest(
  contextSize: number,
  config: BenchmarkConfig,
  model: string,
  ollamaHost?: string
): Promise<NeedleTestResult> {
  const startTime = Date.now();
  const needle = NEEDLE_FACTS[Math.floor(Math.random() * NEEDLE_FACTS.length)];
  const haystack = buildHaystack(contextSize, needle, config.needleDepthPercent);
  
  const prompt = `Find the specific fact hidden in the text below. Respond with ONLY the fact, nothing else.\n\n${haystack}`;
  
  try {
    const response = await generateText(prompt, {
      model,
      num_ctx: contextSize,
      ollamaHost,
      ...(config.thinkingMode !== undefined ? { think: config.thinkingMode } : {}),
    });
    
    const similarity = calculateSimilarity(response.trim(), needle);
    const retrieved = similarity > 0.7;
    
    return {
      contextSize,
      needleDepthPercent: config.needleDepthPercent,
      retrieved,
      similarityScore: similarity,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    logger.error("[memory-test] Needle test failed", { contextSize, error: String(error) });
    return {
      contextSize,
      needleDepthPercent: config.needleDepthPercent,
      retrieved: false,
      similarityScore: 0,
      durationMs: Date.now() - startTime,
    };
  }
}

function calculateSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  
  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  
  const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
  const union = new Set([...wordsA, ...wordsB]);
  
  return intersection.size / union.size;
}

export async function runMultiTurnTest(
  contextSize: number,
  config: BenchmarkConfig,
  model: string,
  ollamaHost?: string
): Promise<MultiTurnTestResult> {
  const startTime = Date.now();
  const entities = MULTI_TURN_ENTITIES.slice(0, Math.min(3, config.retentionTestTurns));
  
  const entityDescriptions = entities.map(e => 
    `${e.name} is a ${e.role} who ${e.trait}.`
  ).join(" ");
  
  const systemPrompt = `You are roleplaying in a sci-fi setting. Remember these facts: ${entityDescriptions}`;
  
  const conversation: Array<{role: string, content: string}> = [
    { role: "system", content: systemPrompt },
  ];
  
  const turnPrompts = [
    "Describe the current situation on the bridge.",
    "What should we do about the anomaly?",
    "Report on the away team's status.",
    "Any updates on the artifact?",
    "Prepare for the negotiation.",
  ];
  
  try {
    for (let i = 0; i < Math.min(config.retentionTestTurns, turnPrompts.length); i++) {
      conversation.push({ role: "user", content: turnPrompts[i] });
      
      const prompt = formatConversation(conversation);
      const response = await generateText(prompt, {
        model,
        num_ctx: contextSize,
        ollamaHost,
        ...(config.thinkingMode !== undefined ? { think: config.thinkingMode } : {}),
      });
      
      conversation.push({ role: "assistant", content: response });
    }
    
    const queryPrompt = formatConversation(conversation) + "\n\nUser: Remind me — who is Captain Reeves and what is their defining trait?";
    const finalResponse = await generateText(queryPrompt, {
      model,
      num_ctx: contextSize,
      ollamaHost,
      ...(config.thinkingMode !== undefined ? { think: config.thinkingMode } : {}),
    });
    
    const entityScores = entities.map(e => {
      const nameMatch = finalResponse.toLowerCase().includes(e.name.toLowerCase());
      const traitMatch = finalResponse.toLowerCase().includes(e.trait.toLowerCase().split(" ")[0]);
      return (nameMatch ? 0.5 : 0) + (traitMatch ? 0.5 : 0);
    });
    
    const entityConsistencyScore = entityScores.length > 0
      ? entityScores.reduce((a, b) => a + b, 0) / entityScores.length
      : 0;
    
    const factualDriftScore = 1 - entityConsistencyScore;
    
    return {
      contextSize,
      turns: config.retentionTestTurns,
      entityConsistencyScore,
      factualDriftScore,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    logger.error("[memory-test] Multi-turn test failed", { contextSize, error: String(error) });
    return {
      contextSize,
      turns: config.retentionTestTurns,
      entityConsistencyScore: 0,
      factualDriftScore: 1,
      durationMs: Date.now() - startTime,
    };
  }
}

function formatConversation(msgs: Array<{role: string, content: string}>): string {
  return msgs.map(m => `${m.role}: ${m.content}`).join("\n\n");
}

export async function runSummarizationTest(
  contextSize: number,
  config: BenchmarkConfig,
  model: string,
  ollamaHost?: string
): Promise<SummarizationFidelityResult> {
  const startTime = Date.now();
  const facts = SUMMARIZATION_FACTS.slice(0, 3);
  const sourceText = facts.join(" ") + " " + "Lorem ipsum ".repeat(Math.ceil(contextSize / 12));
  
  const prompt = `Summarize the following text in approximately ${Math.floor(contextSize * 0.1)} tokens. Preserve all specific facts, names, dates, and numbers:\n\n${sourceText}`;
  
  try {
    const summary = await generateText(prompt, {
      model,
      num_ctx: contextSize,
      ollamaHost,
      ...(config.thinkingMode !== undefined ? { think: config.thinkingMode } : {}),
    });
    
    const originalTokens = estimateTokens(sourceText);
    const summaryTokens = estimateTokens(summary);
    const compressionRatio = summaryTokens / originalTokens;
    
    const factPreservation = facts.map(fact => {
      const keyTerms = fact.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      return keyTerms.some(term => summary.toLowerCase().includes(term)) ? 1 : 0;
    });
    
    const fidelityScore = factPreservation.length > 0
      ? factPreservation.reduce((a: number, b: number) => a + b, 0) / factPreservation.length
      : 0;
    
    return {
      originalTokens,
      summaryTokens,
      compressionRatio,
      fidelityScore,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    logger.error("[memory-test] Summarization test failed", { contextSize, error: String(error) });
    return {
      originalTokens: contextSize,
      summaryTokens: 0,
      compressionRatio: 0,
      fidelityScore: 0,
      durationMs: Date.now() - startTime,
    };
  }
}

export type MemoryTestProgressCallback = (
  info: { test: string; current: number; total: number; success: boolean }
) => void;

export async function runMemoryRetentionTests(
  config: BenchmarkConfig,
  modelMeta: OllamaModelMeta,
  contextTestResult: { maxContextFound: number; testedSizes: { size: number; success: boolean }[] },
  onProgress?: MemoryTestProgressCallback
): Promise<MemoryRetentionResult> {
  const maxWorkingContext = contextTestResult.maxContextFound || config.testContextSizes[0];
  const sizesToTest = config.testContextSizes.filter(s => s <= maxWorkingContext).slice(0, 3);
  
  const needleTests: NeedleTestResult[] = [];
  const multiTurnTests: MultiTurnTestResult[] = [];
  const summarizationTests: SummarizationFidelityResult[] = [];
  
  let completed = 0;
  const totalTests = sizesToTest.length * 3;
  
  for (const contextSize of sizesToTest) {
    const model = config.model || modelMeta.name;
    
    if (onProgress) onProgress({ test: "needle", current: ++completed, total: totalTests, success: false });
    needleTests.push(await runNeedleTest(contextSize, config, model, config.ollamaHost));
    
    if (onProgress) onProgress({ test: "multi-turn", current: ++completed, total: totalTests, success: false });
    multiTurnTests.push(await runMultiTurnTest(contextSize, config, model, config.ollamaHost));
    
    if (onProgress) onProgress({ test: "summarization", current: ++completed, total: totalTests, success: false });
    summarizationTests.push(await runSummarizationTest(contextSize, config, model, config.ollamaHost));
  }
  
  const needleScore = needleTests.length > 0
    ? needleTests.reduce((sum, t) => sum + t.similarityScore, 0) / needleTests.length
    : 0;
  const multiTurnScore = multiTurnTests.length > 0
    ? multiTurnTests.reduce((sum, t) => sum + t.entityConsistencyScore, 0) / multiTurnTests.length
    : 0;
  const summarizationScore = summarizationTests.length > 0
    ? summarizationTests.reduce((sum, t) => sum + t.fidelityScore, 0) / summarizationTests.length
    : 0;
  
  const overallScore = (needleScore + multiTurnScore + summarizationScore) / 3;
  
  return {
    needleTests,
    multiTurnTests,
    summarizationTests,
    overallScore,
  };
}

export type { NeedleTestResult, MultiTurnTestResult, SummarizationFidelityResult, MemoryRetentionResult } from "./types";