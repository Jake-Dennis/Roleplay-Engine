# Product Guidelines

## Prose Style

### Adaptive Tone
AI-generated narrative content should shift between literary and functional prose based on scene intensity:
- **High-intensity scenes** (combat, confrontation, discovery): Concise, punchy sentences. Active voice. Short paragraphs. Focus on action and immediate sensory details.
- **Low-intensity scenes** (downtime, conversation, exploration): Richer descriptions. Varied sentence length. Emotional depth. Atmospheric details.
- **Transitions**: Brief and functional. Avoid purple prose between scenes.
- **Never**: Overwrought descriptions for mundane actions, or terse output during emotionally significant moments.

## UX Philosophy

### Discoverable Over Hidden
- All features must be visible and accessible through the UI
- No functionality buried in configuration files or hidden behind keyboard shortcuts without visible indicators
- Tooltips and inline help text for complex features
- Settings panels should be clearly labeled and organized by function, not by technical category
- New users should be able to discover all core features within their first session

## Accessibility

### Dyslexia-Friendly Design
- Support dyslexia-friendly fonts (opendyslexic already included in project)
- High contrast mode toggle available in settings
- Clear typography hierarchy with adequate letter spacing
- Avoid justified text alignment (use left-aligned)
- Sufficient line height (1.5x minimum) for readability
- Icon + text labels (never icon-only for actionable items)

## AI Content Tone

### Hybrid Narrative/System
AI output should blend narrative prose with system-style information:
- **Narrative prose**: Character dialogue, scene descriptions, emotional beats
- **System elements**: Structured callouts for relationship changes, event triggers, lore discoveries
- **Format example**:
  ```
  Haleth narrows his eyes, studying the horizon. "Orcs. Three, maybe four."
  
  [Relationship: Haleth's trust in you +0.05]
  [Event discovered: Orc patrol spotted]
  [Lore unlocked: Eastern patrol routes]
  ```
- System elements should be visually distinct in the UI (subtle borders, muted colors)
- Never break narrative immersion with system elements mid-paragraph

## Visual Design Consistency
- Dark modern theme (black/greys) with subtle blue accents (#4a9eff)
- Consistent spacing scale (4px base unit)
- Component states clearly indicated (hover, active, disabled)
- Loading states visible but non-intrusive
- Error messages actionable and specific

## Content Safety
- User-generated lore is always under user control
- AI-generated content marked as `generated_unverified` until reviewed
- Contradiction warnings are informative, not blocking
- No content filtering imposed by the system; user is the authority
