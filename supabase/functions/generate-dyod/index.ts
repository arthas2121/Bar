import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

type Ingredient = { name: string; category: string; notes?: string | null };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors() });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!apiKey) return json({ error: "GEMINI_API_KEY is not configured" }, 503);
    if (!supabaseUrl || !supabaseKey) return json({ error: "Supabase environment is not configured" }, 503);

    const body = await req.json().catch(() => ({}));
    const answers = body?.answers ?? {};

    // Read the live inventory on every request, including newly added stock.
    const inventoryUrl = new URL("/rest/v1/bar_ingredients", supabaseUrl);
    inventoryUrl.searchParams.set("select", "name,category,notes");
    inventoryUrl.searchParams.set("is_available", "eq.true");
    inventoryUrl.searchParams.set("order", "category.asc,name.asc");
    inventoryUrl.searchParams.set("limit", "1000");

    const inventoryResponse = await fetch(inventoryUrl, {
      headers: { apikey: supabaseKey, Authorization: "Bearer " + supabaseKey }
    });
    if (!inventoryResponse.ok) {
      console.error("Inventory request failed:", inventoryResponse.status, await inventoryResponse.text());
      return json({ error: "Could not read the latest bar inventory" }, 502);
    }

    const ingredients = await inventoryResponse.json() as Ingredient[];
    if (!Array.isArray(ingredients) || ingredients.length === 0) {
      return json({ error: "No available ingredients. Add stock and mark it available first." }, 400);
    }

    const allowed = ingredients.map((x) => ({
      name: x.name, category: x.category, notes: x.notes || ""
    }));

    const prompt = {
      guest_preferences: answers,
      complete_available_bar_inventory: allowed,
      instructions: [
        "Create one original, balanced, practical cocktail for a professional bar.",
        "Consider the full inventory as your available palette. Choose compatible ingredients; do not arbitrarily ignore an ingredient if it materially improves the drink.",
        "Use a sensible subset, not every bottle in one glass. Normally choose one main base spirit with compatible modifiers, vermouth, bitters, syrups, juices, teas and garnishes as appropriate.",
        "Use ONLY exact ingredient names from the supplied inventory. Never invent ingredients or additions that are not listed.",
        "Respect the guest's requested flavour and strength. Give precise quantities in ml for one serving, a concise method, suitable glassware and a short appealing story.",
        "If the inventory cannot make a balanced cocktail, explain the limitation honestly and propose the closest feasible option using only listed ingredients."
      ]
    };

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent",
      {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text: "You are Ace Bar's professional mixologist. Return only valid JSON with keys name, story, ingredients (array of objects with exact name and amount), method, and glassware. Ingredient names must exactly match entries in the supplied inventory. Use a thoughtful subset of the full inventory, never ingredients outside it. Write the guest-facing recipe and story in the same language as the guest's interface/preferences where practical."
            }]
          },
          contents: [{
            role: "user",
            parts: [{ text: JSON.stringify(prompt) }]
          }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.85
          }
        })
      }
    );

    if (!response.ok) {
      const detail = await response.text();
      console.error("Gemini request failed:", response.status, detail);
      return json({ error: "AI provider request failed", status: response.status }, 502);
    }

    const result = await response.json();
    const content = result.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text || "")
      .join("");
    if (!content) return json({ error: "AI returned an empty recipe" }, 502);

    const recipe = JSON.parse(content);
    const allowedNames = new Set(allowed.map((x) => x.name.trim().toLowerCase()));
    if (!Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0 ||
        recipe.ingredients.some((x: { name?: string }) => !allowedNames.has(String(x?.name || "").trim().toLowerCase()))) {
      console.error("Generated recipe failed inventory validation");
      return json({ error: "Generated recipe included an unavailable ingredient. Please try again." }, 422);
    }

    return json({ recipe, inventory_count: allowed.length });
  } catch (error) {
    console.error("DYOD generation error:", error);
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
