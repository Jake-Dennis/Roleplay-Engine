/**
 * Centralized LLM Prompt Templates
 *
 * All prompt templates used across idle-enrichment, job-processor, and idle-processing.
 * Single source of truth — edit here to update all consumers.
 *
 * Security: User-provided content (wiki pages, messages, etc.) is wrapped in
 * <user_content> XML tags. The system prompt instructs the LLM to treat content
 * within these tags as data only and ignore any instructions found inside.
 */

export const PROMPTS = {
  // -----------------------------------------------------------------------
  // Wiki: Page Summarization
  // -----------------------------------------------------------------------

  /** Summarize a wiki page in 2-3 sentences (compression/archival) */
  wikiSummarizePage: (content: string) =>
    `Summarize this wiki page in 2-3 sentences:\n<user_content>\n${content}\n</user_content>`,

  /** Summarize a wiki page in one sentence (archival) */
  wikiSummarizePageOneSentence: (content: string) =>
    `Summarize this wiki page in one sentence:\n<user_content>\n${content}\n</user_content>`,

  // -----------------------------------------------------------------------
  // Wiki: Entity Expansion
  // -----------------------------------------------------------------------

  /** Expand on a wiki entity with personality/habits/motivations details */
  wikiEnrichEntity: (title: string, content: string) =>
    `Expand on this wiki entity "${title}". Current content:\n<user_content>\n${content}\n</user_content>\n\nAdd 2-3 new details about their personality, habits, motivations, or connections to other entities. Do not contradict existing facts. Return only the new content as markdown.`,

  /** Expand on a wiki entity with personality/habits/hidden motivations (idle-enrichment variant) */
  wikiEnrichEntityAlt: (title: string, content: string) =>
    `Expand on this wiki entity "${title}". Current content:\n<user_content>\n${content}\n</user_content>\n\nAdd 2-3 new details about their personality, habits, or hidden motivations. Do not contradict existing facts. Return only the new content as markdown.`,

  // -----------------------------------------------------------------------
  // Wiki: Location Expansion
  // -----------------------------------------------------------------------

  /** Expand on a location with atmospheric/historical/sensory details */
  wikiExpandLocation: (title: string, content: string) =>
    `Expand on this location "${title}". Current description:\n<user_content>\n${content}\n</user_content>\n\nAdd 2-3 new atmospheric details, historical notes, or sensory descriptions. Do not contradict existing facts.`,

  // -----------------------------------------------------------------------
  // Wiki: Page Deepening
  // -----------------------------------------------------------------------

  /** Deepen a wiki page with new details and connections */
  wikiDeepenPage: (title: string, pageType: string, content: string) =>
    `Deepen that wiki page "${title}" (${pageType}). Current content:\n<user_content>\n${content}\n</user_content>\n\nAdd new details, connections to other wiki entities, or implications. Do not contradict existing facts. Return only the new content as markdown.`,

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
Recent history:
<user_content>
${history}
</user_content>

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
    `Summarize in 5-10 words:\n<user_content>\n${content}\n</user_content>`,

  /** Summarize narrative memory in 1 sentence (30+ days old) */
  memorySummarizeOneSentence: (content: string) =>
    `Summarize in 1 sentence:\n<user_content>\n${content}\n</user_content>`,

  /** Summarize narrative memory in 2-3 sentences (7+ days old) */
  memorySummarizeShort: (content: string) =>
    `Summarize in 2-3 sentences:\n<user_content>\n${content}\n</user_content>`,

  /** Summarize narrative memory for archival processing */
  memoryArchiveSummary: (content: string) =>
    `Summarize this narrative memory in one sentence:\n<user_content>\n${content}\n</user_content>`,

  // -----------------------------------------------------------------------
  // Narrative: Thread Analysis
  // -----------------------------------------------------------------------

  /** Analyze narrative and identify key story threads */
  analyzeThreads: (messageText: string) =>
    `Analyze this narrative and identify the key story threads/themes. Do NOT reason step by step. Output ONLY valid JSON with no other text. Return JSON:
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
<user_content>
${messageText}
</user_content>`,

  // -----------------------------------------------------------------------
  // Narrative: Event Extraction
  // -----------------------------------------------------------------------

  /** Extract narrative events from session messages */
  extractEvents: (messageText: string) =>
    `Analyze these recent messages and extract any significant narrative events. Do NOT reason step by step. Output ONLY valid JSON with no other text. Return JSON:
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
<user_content>
${messageText}
</user_content>`,

  // -----------------------------------------------------------------------
  // Lore: Comprehensive Extraction
  // -----------------------------------------------------------------------

  /** Extract entities, events, and relationships from message batches for wiki page creation */
  extractLoreComprehensive: (messageText: string) =>
    `Analyze these roleplay messages and extract all significant lore: characters, locations, organizations, objects, concepts, events, and relationships. Do NOT reason step by step. Do NOT include any analysis text. Output ONLY valid JSON with no other text.

Return JSON in this exact format:
{
  "entities": [
    {
      "name": "entity name",
      "entityType": "character|location|organization|object|concept",
      "description": "detailed description of the entity",
      "traits": ["trait1", "trait2"],
      "relationships": ["related to X because..."]
    }
  ],
  "events": [
    {
      "title": "event title",
      "description": "what happened",
      "participants": ["character1", "character2"],
      "outcome": "result of the event",
      "importance": "low|medium|high|critical"
    }
  ],
  "relationships": [
    {
      "source": "entity name",
      "target": "entity name",
      "nature": "friendly|hostile|romantic|professional|familial|rivalry|other",
      "description": "description of the relationship"
    }
  ]
}

Rules:
- Extract ONLY entities that are clearly named and described in the text
- Do not invent entities not present in the messages
- Use wikilink format [[Name]] when referencing other entities in descriptions
- Keep descriptions concise but informative
- Return empty arrays if nothing is found for a category

Messages:
<user_content>
${messageText}
</user_content>`,

  // -----------------------------------------------------------------------
  // Narrative: Branching Choices
  // -----------------------------------------------------------------------

  // -----------------------------------------------------------------------
  // Wiki: AI Text Operations (selection toolbar)
  // -----------------------------------------------------------------------

  /** Rewrite selected text to be clearer, more vivid, or better-paced */
  wikiRewriteText: (text: string, context?: string) =>
    `Rewrite the following text to be clearer and more engaging. Improve flow and pacing while keeping the same information and length.\n\nText:\n<user_content>\n${text}\n</user_content>\n${context ? `\nContext: ${context}\n` : ""}\n\nReturn only the rewritten text, no explanations.`,

  /** Expand selected text with more detail */
  wikiExpandText: (text: string, context?: string) =>
    `Expand the following text by adding 2-3 sentences of relevant detail. Keep the same tone and style. Do not repeat the original.\n\nText:\n<user_content>\n${text}\n</user_content>\n${context ? `\nContext: ${context}\n` : ""}\n\nReturn only the expanded text, no explanations.`,

  /** Summarize selected text in 1-2 sentences */
  wikiSummarizeText: (text: string) =>
    `Summarize the following text in 1-2 concise sentences. Capture only the key information.\n\nText:\n<user_content>\n${text}\n</user_content>\n\nReturn only the summary, no explanations.`,

  /** Improve selected text: fix grammar, clarity, and style */
  wikiImproveText: (text: string) =>
    `Improve the following text by fixing grammar, clarity, and style. Preserve all information and voice.\n\nText:\n<user_content>\n${text}\n</user_content>\n\nReturn only the improved text, no explanations.`,

  /** Generate a full wiki page from a user description prompt */
  wikiGenerateFromPrompt: (prompt: string) =>
    `Create a wiki page based on this description:\n<user_content>\n${prompt}\n</user_content>\n\nGenerate wiki content in markdown format. Include a title (as a single # heading), followed by well-structured sections. Output ONLY valid JSON with no other text:\n{\n  "title": "Page Title",\n  "type": "entity|concept",\n  "subtype": "",\n  "content": "# Title\\n\\nFull markdown content...",\n  "tags": ["tag1", "tag2"]\n}`,

  /** Generate branching narrative direction choices from the current exchange */
  generateChoices: (userMessage: string, aiResponse: string) =>
    `Based on this roleplay exchange, suggest 4 different narrative choices for what the player could do next.

User's action:
<user_content>
${userMessage}
</user_content>

Narrator's response:
<user_content>
${aiResponse}
</user_content>

Generate 4 distinct narrative possibilities for what happens next. Each should be a brief narrative hook (1-2 sentences) describing a possible next scene, event, or discovery. Each must take a different direction — vary the focus, tone, or event.

Output ONLY valid JSON with no other text:
{"options": ["option 1", "option 2", "option 3", "option 4"]}`,

  // -----------------------------------------------------------------------
  // Auto-Extract
  // -----------------------------------------------------------------------

  /** Extract relationships from a single AI response for wiki auto-creation */
  extractRelationshipsFromResponse: (aiResponse: string, existingTitles: string) =>
    `Analyze this AI narrative response and extract relationships between named entities that are central to the story world. Do NOT reason step by step. Output ONLY valid JSON with no other text.

Return JSON array:
[
  {
    "source": "entity name",
    "target": "entity name",
    "nature": "friendly|hostile|romantic|professional|familial|rivalry|other",
    "description": "description of the relationship dynamic"
  }
]

Existing wiki pages: ${existingTitles || "none"}

Rules:
- Extract ONLY relationships between clearly named entities
- Both source and target must be named entities present in the scene
- Nature describes the current dynamic between them
- Skip passing mentions. Max 5 relationships total.
- Return empty array [] if nothing to extract

AI Response to analyze:
<user_content>
${aiResponse}
</user_content>`,

  /** Extract named entities from a single generation response for wiki auto-creation */
  extractEntitiesFromResponse: (aiResponse: string, universeContext: string, existingTitles: string) =>
    `Analyze this AI narrative response and extract named entities important to the story world. Do NOT reason step by step. Output ONLY valid JSON with no other text.

Return JSON array:
[
  {
    "name": "entity name",
    "type": "character|location|faction",
    "description": "detailed description",
    "importance": "high|medium|low"
  }
]

Universe Context:
<user_content>
${universeContext}
</user_content>

Existing wiki pages (skip these): ${existingTitles || "none"}

Rules:
- Extract ONLY named entities central to the scene
- Types: characters → "character", locations → "location", organizations → "faction"
- Skip passing mentions. Max 5 entities total.
- Return empty array [] if nothing to extract
- Descriptions should be 1-3 sentences

AI Response to analyze:
<user_content>
${aiResponse}
</user_content>`,
} as const;
