import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

type Ingredient = { name: string; category: string; notes?: string | null };
type Recipe = Record<string, any> & { ingredients: Array<{ name: string; amount: string }> };
type Review = { pass: boolean; score: number; issues: string[]; revision_instructions: string };

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent";

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

    // Read live stock for every guest; unavailable ingredients are never offered to the model.
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

    const stock = await inventoryResponse.json() as Ingredient[];
    if (!Array.isArray(stock) || stock.length === 0) {
      return json({ error: "No available ingredients. Add stock and mark it available first." }, 400);
    }
    const inventory = stock.map((x) => ({ name: x.name, category: x.category, notes: x.notes || "" }));
    const byName = new Map(inventory.map((x) => [x.name.trim().toLowerCase(), x]));

    const recipeSchema = "Return only JSON with keys name_en, name_zh, description_en, description_zh, story_en, story_zh, flavour_en, flavour_zh, aroma_en, aroma_zh, ingredients (array of {name,name_en,name_zh,amount}), method_en, method_zh, glassware_en, glassware_zh, garnish_en, garnish_zh, occasion_en, occasion_zh. Keep English and Simplified Chinese aligned; quantities must match exactly.";

    const designBrief = {
      guest_preferences: answers,
      available_inventory: inventory,
      rules: [
        "You are Ace Bar's creative professional mixologist. Guest answers define the desired experience; professional balance is the non-negotiable priority.",
        "First interpret the guest's answers into a concise internal flavor brief: desired mood, preferred intensity, sweetness, acidity, bitterness, aroma and texture. Treat explicit taste preferences as stronger evidence than personality labels.",
        "Design the drink around a coherent flavor architecture: base spirit, supporting flavors, acid, sweetener, bitterness, aroma, body and finish. Not every drink needs every component.",
        "Balance is ingredient-dependent, not a fixed sour-to-sweet formula. Consider the known characteristics and notes of each exact product. Do not claim measured acidity, sugar content or ABV when that data is not supplied.",
        "Read every selected ingredient's notes as meaningful product information (brand, style, infusion, flavor, sweetness, bitterness, etc.). Do not treat products with different notes as interchangeable.",
        "Use a thoughtful subset of available stock; do not force every inventory item into the recipe. Prefer a distinctive but harmonious combination over novelty for its own sake.",
        "Every ingredient name must be copied exactly from available_inventory. Use only listed items, including for garnish. No invented citrus, syrups, ice, water, salt or other assumed ingredients unless listed.",
        "Give precise, practical ml quantities for one serving, an executable method, suitable glassware, and a concise story. Avoid vague quantities.",
        "If the guest requests an extreme flavor, respect the direction as far as possible while preserving drinkability and balance.",
        recipeSchema
      ]
    };

    let recipe: Recipe | null = null;
    let lastInvalid: string[] = [];
    let finalReview: Review | null = null;

    // Two design/review rounds at most: create, independently review, then refine once if needed.
    for (let round = 0; round < 2; round++) {
      const designInput = round === 0
        ? designBrief
        : {
            guest_preferences: answers,
            available_inventory: inventory,
            previous_recipe: recipe,
            reviewer_feedback: finalReview,
            instructions: [
              "Revise the previous recipe using the independent review feedback.",
              "Fix every issue while preserving the guest's intended experience where possible.",
              "Professional balance takes priority over novelty. Use only exact names from available_inventory.",
              recipeSchema
            ]
          };

      const generated = await callGemini(apiKey, "You are Ace Bar's professional creative mixologist. Design balanced, original, practical cocktails. Treat the inventory and guest answers as the only source of truth.", designInput, 0.45);
      if (!generated.ok) return json({ error: generated.error }, generated.status);
      recipe = generated.value as Recipe;

      if (!Array.isArray(recipe?.ingredients) || recipe.ingredients.length === 0) {
        lastInvalid = ["missing ingredient list"];
        recipe = null;
        continue;
      }

      lastInvalid = recipe.ingredients
        .filter((x) => !byName.has(String(x?.name || "").trim().toLowerCase()))
        .map((x) => String(x?.name || "(unnamed)").trim());
      const missingAmounts = recipe.ingredients.some((x) => !String(x?.amount || "").trim());
      if (lastInvalid.length || missingAmounts) {
        if (missingAmounts) lastInvalid.push("missing ingredient amount");
        console.warn("DYOD recipe failed inventory/quantity validation:", lastInvalid);
        recipe = null;
        continue;
      }

      // Normalize ingredient names to the exact live stock labels before review.
      recipe.ingredients = recipe.ingredients.map((x) => ({
        ...x,
        name: byName.get(x.name.trim().toLowerCase())!.name
      }));

      const reviewInput = {
        guest_preferences: answers,
        available_inventory: inventory,
        proposed_recipe: recipe,
        review_criteria: [
          "Act as an independent senior bartender. Do not praise the recipe automatically.",
          "Professional Balance First: evaluate whether the acid, sweetness, bitterness, alcohol strength, body, aroma and finish form a coherent, drinkable whole.",
          "Check whether the selected products make sense together using their exact inventory notes. A novel combination is not automatically a good combination.",
          "Check quantities and whether the method can realistically produce the described drink. Consider dilution only if the method/ingredients support it; do not invent missing ingredients.",
          "Check guest fit, but never sacrifice drinkability merely to match an extreme preference.",
          "Reject any unavailable or unlisted ingredient in the ingredient list, garnish or method; ingredient list names must match available_inventory exactly.",
          "Return JSON only: {pass:boolean, score:number, issues:string[], revision_instructions:string}. Pass only if the drink is genuinely coherent, balanced and practical. Score is an internal heuristic out of 100, not a laboratory measurement. Require score >= 85 and no critical flaw."
        ]
      };
      const reviewed = await callGemini(apiKey, "You are an independent, rigorous cocktail quality reviewer for Ace Bar. You did not create this recipe. Be candid and conservative.", reviewInput, 0.15);
      if (!reviewed.ok) return json({ error: reviewed.error }, reviewed.status);
      finalReview = reviewed.value as Review;

      if (finalReview?.pass === true && Number(finalReview.score) >= 85 && Array.isArray(finalReview.issues)) {
        return json({ recipe, inventory_count: inventory.length });
      }
      console.warn("DYOD recipe did not pass independent review; refining:", finalReview);
    }

    return json({
      error: "I couldn't create a recipe that passed Ace Bar's balance and quality review using the current available stock. Please try again or adjust the guest preferences."
    }, 422);
  } catch (error) {
    console.error("DYOD generation error:", error);
    return json({ error: "Unable to generate a drink right now" }, 500);
  }
});

async function callGemini(apiKey: string, systemInstruction: string, input: unknown, temperature: number) {
  const response = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: "user", parts: [{ text: JSON.stringify(input) }] }],
      generationConfig: { responseMimeType: "application/json", temperature }
    })
  });
  if (!response.ok) {
    const detail = await response.text();
    console.error("Gemini request failed:", response.status, detail);
    return { ok: false as const, error: "AI provider request failed", status: 502 };
  }
  const result = await response.json();
  const content = result.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("");
  if (!content) return { ok: false as const, error: "AI returned an empty response", status: 502 };
  try {
    return { ok: true as const, value: JSON.parse(content) };
  } catch {
    console.error("Gemini returned invalid JSON");
    return { ok: false as const, error: "AI returned an invalid response. Please try again.", status: 502 };
  }
}

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
