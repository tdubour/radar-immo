import { generateText } from "ai";

const MODEL = "openai/gpt-5.6-luna";
const FALLBACK_MODEL = "openai/gpt-5.4-mini";
const safeText = (value, max = 2000) => String(value || "").trim().slice(0, max);

function normalizeListing(value) {
  if (!value || typeof value !== "object") return null;
  const allowed = ["title", "city", "postalCode", "sourceId", "askingPrice", "surfaceM2", "pricePerM2", "averagePriceM2", "marketSource", "marketDiscountPct", "estimatedMonthlyRent", "longTermCashflowMonthly", "shortTermCashflowMonthly", "estimatedResaleProfit", "score", "qualified", "sourceUrl"];
  return Object.fromEntries(allowed.map((key) => [key, typeof value[key] === "string" ? safeText(value[key], 500) : value[key]]));
}

export default async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ error: "Méthode non autorisée." });
  const message = safeText(request.body?.message, 1500);
  const history = Array.isArray(request.body?.history) ? request.body.history.slice(-8).map((item) => ({ role: item?.role === "assistant" ? "assistant" : "user", content: safeText(item?.content) })) : [];
  const listings = Array.isArray(request.body?.listings) ? request.body.listings.slice(0, 50).map(normalizeListing).filter(Boolean) : [];
  if (!message) return response.status(400).json({ error: "Écris une question avant d’envoyer." });
  if (JSON.stringify(listings).length > 180_000) return response.status(413).json({ error: "Trop d’annonces à analyser en une fois." });
  try {
    const requestOptions = {
      maxOutputTokens: 800,
      system: "Tu es l’analyste immobilier de RadarImmo. Réponds en français, clairement et de façon opérationnelle, uniquement à partir des annonces et estimations fournies. Distingue les faits, les estimations et les informations à vérifier. N’invente aucune donnée. Les calculs financiers sont indicatifs et ne remplacent pas une validation professionnelle. Quand tu recommandes une annonce, cite son titre et explique les critères chiffrés.",
      prompt: `${history.map((item) => `${item.role === "user" ? "Utilisateur" : "Assistant"}: ${item.content}`).join("\n")}\n\nQuestion: ${message}\n\nAnnonces RadarImmo (${listings.length}):\n${JSON.stringify(listings)}`,
      providerOptions: { gateway: { tags: ["feature:radar-chat"], user: "radar-owner" } }
    };
    let usedModel = MODEL;
    let result;
    try {
      result = await generateText({ ...requestOptions, model: MODEL });
    } catch (primaryError) {
      console.warn("radar_chat_primary_model_unavailable", primaryError?.statusCode || primaryError?.name);
      usedModel = FALLBACK_MODEL;
      result = await generateText({ ...requestOptions, model: FALLBACK_MODEL });
    }
    return response.status(200).json({ answer: result.text, model: usedModel.replace("openai/", ""), listingCount: listings.length });
  } catch (error) {
    console.error("radar_chat_failed", error);
    return response.status(502).json({ error: "Le modèle d’analyse est momentanément indisponible." });
  }
}
