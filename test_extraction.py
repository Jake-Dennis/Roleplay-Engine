import urllib.request, json, os, re, glob

# Simulate buildUniverseContext - read actual Middle-Earth wiki
wiki_root = 'data/8aec6985-e41f-494c-ba65-99648ee80d4b/wiki/0e6a2ef5-a750-4f2b-bf07-640c79e1d3dc'

# Read universe overview
overview_parts = []
about_path = os.path.join(wiki_root, 'concepts', 'about.md')
if os.path.exists(about_path):
    with open(about_path, encoding='utf-8') as f:
        content = f.read()
    overview_parts.append("[Middle-Earth -- Universe Overview]")
    # Extract body (after frontmatter)
    body = content.split('---')[-1].strip()
    if body:
        overview_parts.append(body[:800])

# Read existing entities (up to 8, 150 chars each)
entities_path = os.path.join(wiki_root, 'entities')
if os.path.exists(entities_path):
    for fname in sorted(os.listdir(entities_path))[:8]:
        if fname.endswith('.md'):
            with open(os.path.join(entities_path, fname), encoding='utf-8') as f:
                content = f.read()
            title_match = re.search(r'title:\s*(.+)', content)
            title = title_match.group(1).strip() if title_match else fname.replace('.md', '').replace('_', ' ').title()
            body = content.split('---')[-1].strip()[:150]
            if body:
                overview_parts.append(f"- {title}: {body}")

universe_context = '\n'.join(overview_parts)

existing_titles = 'Bree, Barliman Butterbur, Caradon, Rivendell, The Fellowship, The Prancing Pony'

# Sample AI narrative response
ai_response = """The door of the Prancing Pony groaned open as you stepped inside, shaking the autumn rain from your cloak. The common room was warm and smoky, lit by a great hearth where a whole pig turned on a spit. Barliman Butterbur looked up from behind the bar, his round face breaking into a grin beneath his thatch of gray hair.

"Well-met, traveler!" he called out, wiping his hands on his stained apron. "Get yourself by the fire — you look half-drowned."

A tall, cloaked figure sat alone in the corner nursing a tankard. His eyes glinted in the firelight — watchful, knowing. Through the rain-streaked windows, the lights of Bree-town flickered. Somewhere beyond, the road led east to the Chetwood, and further still to the Lone-lands."""

prompt = f"""Analyze this AI narrative response and extract named entities important to the story world. Do NOT reason step by step. Output ONLY valid JSON with no other text.

Return JSON array:
[
  {{
    "name": "entity name",
    "type": "character|location|faction",
    "description": "detailed description",
    "importance": "high|medium|low"
  }}
]

Universe Context (this is the existing world knowledge -- use it to inform descriptions):
<user_content>
{universe_context}
</user_content>

Existing wiki pages (skip these): {existing_titles}

Rules:
- Extract named entities central to the scene
- Types: characters -> "character", locations -> "location", organizations -> "faction"
- Include named characters even if briefly mentioned (innkeepers, strangers, guards, merchants, etc.)
- Always include the setting/location where the scene takes place, even if it's a known location
- Max 10 entities total.
- Return empty array [] if nothing to extract
- Descriptions should be 2-3 sentences covering: appearance, role in the scene, personality/mannerisms (for characters), or atmosphere and notable features (for locations)

AI Response to analyze:
<user_content>
{ai_response}
</user_content>"""

print(f"=== Universe Context ({len(universe_context)} chars) ===")
print(universe_context[:300] + "..." if len(universe_context) > 300 else universe_context)
print()

# Call Ollama
body = json.dumps({
    'model': 'qwen3.5:9b',
    'prompt': prompt,
    'stream': False,
    'options': {'num_ctx': 8192, 'num_predict': 2048, 'temperature': 0.3}
}).encode('utf-8')
req = urllib.request.Request('http://192.168.6.1:11434/api/generate', body, {'Content-Type': 'application/json'})
resp = urllib.request.urlopen(req, timeout=120)
data = json.loads(resp.read())

response_text = data['response']
print("=== LLM Response ===")
print(response_text[:1000])
print()

# Try to parse JSON from response
json_match = re.search(r'\[[\s\S]*\]', response_text)
if json_match:
    try:
        entities = json.loads(json_match[0])
        print(f"=== Parsed {len(entities)} entities ===")
        for e in entities:
            print(f"  [{e['importance']}] {e['type']}: {e['name']}")
            desc = e['description'][:200]
            print(f"    {desc}...")
    except Exception as ex:
        print(f"Failed to parse JSON: {ex}")
        print(f"Raw match: {json_match[0][:500]}")
else:
    print("No JSON array found in response")
    print(f"Full response: {response_text}")
