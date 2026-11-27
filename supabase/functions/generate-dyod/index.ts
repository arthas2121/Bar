import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors() });
  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json({ error: "OPENAI_API_KEY is not configured" }, 503);
    const { answers, ingredients } = await req.json();
    if (!Array.isArray(ingredients) || ingredients.length === 0) {
      return json({ error: "No available ingredients" }, 400);
    }
    const allowed = ingredients.map((x: {name:string;category:string;notes?:string}) => ({
      name: x.name, category: x.category, notes: x.notes || ""
    }));
    const prompt = {
      answers,
      allowed_ingredients: allowed,
      rules: [
        "Create one original, practical cocktail using ONLY the supplied allowed ingredients.",
        "Do not invent garnishes, juices, syrups, spirits, bitters, water, ice or other ingredients not listed.",
        "Give measured quantities in ml, a concise method, glassware and a short story.",
        "Balance the requested flavour and strength. Keep the serving to one standard cocktail.",
        "If the inventory cannot support a coherent cocktail, explain that in the story and return a recipe with the closest feasible combination."
      ]
    };
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You are a careful professional cocktail creator. Return JSON with keys name, story, ingredients (array of {name, amount}), method, glassware. Never use ingredients outside the provided inventory." },
          { role: "user", content: JSON.stringify(prompt) }
        ],
        temperature: 0.8
      })
    });
    if (!response.ok) return json({ error: "AI provider request failed" }, 502);
    const result = await response.json();
    const recipe = JSON.parse(result.choices?.[0]?.message?.content || "{}");
    const allowedNames = new Set(allowed.map((x: {name:string}) => x.name.toLowerCase()));
    if (!Array.isArray(recipe.ingredients) || recipe.ingredients.some((x: {name:string}) => !allowedNames.has(String(x.name).toLowerCase()))) {
      return json({ error: "Generated recipe included an unavailable ingredient" }, 422);
    }
    return json({ recipe });
  } catch (_error) {
    return json({ error: "Unable to generate a drink right now" }, 500);
  }
});

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(), "Content-Type": "application/json" }
  });
}
