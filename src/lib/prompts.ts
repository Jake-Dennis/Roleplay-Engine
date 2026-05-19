/**
 * Centralized LLM Prompt Templates
 *
 * All prompt templates used across idle-enrichment, job-processor, and idle-processing.
 * Single source of truth — edit here to update all consumers.
 */

export const PROMPTS = {
  // -----------------------------------------------------------------------
  // Wiki: Page Summarization
  // -----------------------------------------------------------------------

  /** Summarize a wiki page in 2-3 sentences (compression/archival) */
  wikiSummarizePage: (content: string) =>
    `Summarize this wiki page in 2-3 sentences:\n${content}`,

  /** Summarize a wiki page in one sentence (archival) */
  wikiSummarizePageOneSentence: (content: string) =>
    `Summarize this wiki page in one sentence: "${content}"`,

  // -----------------------------------------------------------------------
  // Wiki: Entity Expansion
  // -----------------------------------------------------------------------

  /** Expand on a wiki entity with personality/habits/motivations details */
  wikiEnrichEntity: (title: string, content: string) =>
    `Expand on this wiki entity "${title}". Current content:\n${content}\n\nAdd 2-3 new details about their personality, habits, motivations, or connections to other entities. Do not contradict existing facts. Return only the new content as markdown.`,

  /** Expand on a wiki entity with personality/habits/hidden motivations (idle-enrichment variant) */
  wikiEnrichEntityAlt: (title: string, content: string) =>
    `Expand on this wiki entity "${title}". Current content:\n${content}\n\nAdd 2-3 new details about their personality, habits, or hidden motivations. Do not contradict existing facts. Return only the new content as markdown.`,

  // -----------------------------------------------------------------------
  // Wiki: Location Expansion
  // -----------------------------------------------------------------------

  /** Expand on a location with atmospheric/historical/sensory details */
  wikiExpandLocation: (title: string, content: string) =>
    `Expand on this location "${title}". Current description:\n${content}\n\nAdd 2-3 new atmospheric details, historical notes, or sensory descriptions. Do not contradict existing facts.`,

  // -----------------------------------------------------------------------
  // Wiki: Page Deepening
  // -----------------------------------------------------------------------

  /** Deepen a wiki page with new details and connections */
  wikiDeepenPage: (title: string, pageType: string, content: string) =>
    `Deepen this wiki page "${title}" (${pageType}). Current content:\n${content}\n\nAdd new details, connections to other wiki entities, or implications. Do not contradict existing facts. Return only the new content as markdown.`,

  // -----------------------------------------------------------------------
  // Wiki: Relationship Summarization
  // -----------------------------------------------------------------------

  /** Summarize a relationship between two entities */
  wikiSummarizeRelationship: (
    sourceEntity: string,
    targetEntity: string,
    emotionSummary: string,
    history: string
  ) =>
    `Summarize the relationship between ${sourceEntity} and ${targetEntity}.
Current emotional state: ${emotionSummary || "neutral"}
Recent history: ${history}

Write a 2-3 sentence narrative summary of their current relationship dynamic.`,

  // -----------------------------------------------------------------------
  // Wiki: Rumor Generation
  // -----------------------------------------------------------------------

  /** Generate rumors based on an event */
  wikiGenerateRumors: (
    eventTitle: string,
    eventType: string,
    outcome: string
  ) =>
    `Based on this event: "${eventTitle}" (${eventType}, outcome: ${outcome || "unknown"}), generate 1-2 rumors that might spread among NPCs. Rumors should be plausible but potentially inaccurate. Return as bullet points.`,

  // -----------------------------------------------------------------------
  // Memory: Summarization (by age tier)
  // -----------------------------------------------------------------------

  /** Summarize narrative memory in 5-10 words (90+ days old) */
  memorySummarizeArchived: (content: string) =>
    `Summarize in 5-10 words: "${content}"`,

  /** Summarize narrative memory in 1 sentence (30+ days old) */
  memorySummarizeOneSentence: (content: string) =>
    `Summarize in 1 sentence: "${content}"`,

  /** Summarize narrative memory in 2-3 sentences (7+ days old) */
  memorySummarizeShort: (content: string) =>
    `Summarize in 2-3 sentences: "${content}"`,

  /** Summarize narrative memory for archival processing */
  memoryArchiveSummary: (content: string) =>
    `Summarize this narrative memory in one sentence: "${content}"`,

  // -----------------------------------------------------------------------
  // Narrative: Thread Analysis
  // -----------------------------------------------------------------------

  /** Analyze narrative and identify key story threads */
  analyzeThreads: (messageText: string) =>
    `Analyze this narrative and identify the key story threads/themes. Return JSON:
{
  "threads": [
    {
      "name": "thread name",
      "status": "active|resolved|dormant",
      "summary": "brief description",
      "keyEntities": ["list of characters/locations involved"]
    }
  ]
}

Narrative:
${messageText}`,

  // -----------------------------------------------------------------------
  // Narrative: Event Extraction
  // -----------------------------------------------------------------------

  /** Extract narrative events from session messages */
  extractEvents: (messageText: string) =>
    `Analyze these recent messages and extract any significant narrative events. Return JSON:
{
  "events": [
    {
      "title": "brief event title",
      "eventType": "conflict|discovery|relationship|journey|decision|other",
      "outcome": "what happened as a result",
      "importance": "low|medium|high|critical"
    }
  ]
}

Messages:
${messageText}`,
} as const;
