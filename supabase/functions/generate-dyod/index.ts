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

    const allowedByName = new Map(allowed.map((x) => [x.name.trim().toLowerCase(), x]));
    const baseInstructions = [
      "Create one original, balanced, practical cocktail for a home bar.",
      "Use only ingredients from the supplied available inventory.",
      "Every ingredient object's name field MUST be copied character-for-character from one supplied inventory name.",
      "Do not use an ingredient just because it is a common cocktail ingredient. If it is not in the inventory list, it is forbidden.",
      "Use a sensible subset, normally one base spirit plus compatible modifiers and small amounts of bitters, syrups, juices, teas or garnishes.",
      "Respect the guest's requested flavour and strength. Give precise quantities in ml for one serving, a concise method, suitable glassware and a short appealing story.",
      "The garnish must also be an ingredient in the supplied inventory. Do not mention unavailable ingredients in either method or garnish.",
      "Return natural, polished English and Simplified Chinese with matching meaning. Keep quantities identical in both languages."
    ];

    let recipe: any = null;
    let lastInvalid: string[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      const prompt = {
        guest_preferences: answers,
        complete_available_bar_inventory: allowed,
        previous_invalid_ingredients: lastInvalid,
        instructions: [
          ...baseInstructions,
          ...(attempt > 0 ? ["IMPORTANT: Your previous response used unavailable ingredients. Avoid these names entirely: " + lastInvalid.join(", ") + ". Select replacements only from the exact inventory list."] : [])
        ]
      };

      const response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
        {
          method: "POST",
          headers: {
            "x-goog-api-key": apiKey,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{
                text: "You are Ace Bar's professional bilingual mixologist. Return only valid JSON with keys name_en, name_zh, description_en, description_zh, story_en, story_zh, flavour_en, flavour_zh, aroma_en, aroma_zh, ingredients (array of objects with name, name_en, name_zh, and amount), method_en, method_zh, glassware_en, glassware_zh, garnish_en, garnish_zh, occasion_en, occasion_zh. The name field for every ingredient must be an exact copy of an available inventory name. Never invent, infer, substitute, or assume an ingredient is available. name_en and name_zh are display translations only. Never include unavailable ingredients in the method or garnish."
              }]
            },
            contents: [{
              role: "user",
              parts: [{ text: JSON.stringify(prompt) }]
            }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.45
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

      try {
        recipe = JSON.parse(content);
      } catch {
        console.error("Gemini returned invalid JSON");
        return json({ error: "AI returned an invalid recipe. Please try again." }, 502);
      }

      if (!Array.isArray(recipe?.ingredients) || recipe.ingredients.length === 0) {
        lastInvalid = ["(missing ingredient list)"];
        continue;
      }

      lastInvalid = recipe.ingredients
        .filter((x: { name?: string }) => !allowedByName.has(String(x?.name || "").trim().toLowerCase()))
        .map((x: { name?: string }) => String(x?.name || "(unnamed)").trim());

      if (lastInvalid.length === 0) {
        // Replace AI casing/spacing with the exact stock label from the live inventory.
        recipe.ingredients = recipe.ingredients.map((x: { name: string }) => ({
          ...x,
          name: allowedByName.get(x.name.trim().toLowerCase())!.name
        }));
        break;
      }
      recipe = null;
      console.warn("DYOD used unavailable ingredients; retrying:", lastInvalid);
    }

    if (!recipe) {
      return json({
        error: "I couldn't create a recipe using only the current available stock. Please update the inventory or try again."
      }, 422);
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
