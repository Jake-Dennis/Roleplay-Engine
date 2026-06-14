export interface Persona {
  id: string;
  entity_id: string | null;
  name: string;
  description: string | null;
  personality: string | null;
  scenario: string | null;
  first_mes: string | null;
  mes_example: string | null;
  creator_notes: string | null;
  system_prompt: string | null;
  post_history_instructions: string | null;
  tags: string | null;
  writing_style: string | null;
  avatar_url: string | null;
  llm_model: string | null;
  tts_voice: string | null;
  is_active: number;
  created_at: string;
}

export type TabKey = "description" | "personality" | "scenario" | "dialogue" | "advanced";
