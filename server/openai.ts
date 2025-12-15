import OpenAI from "openai";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface ParsedOrderItem {
  rawText: string;
  productRef: string;
  size?: string;
  quantity: number;
  confidence: number;
}

export interface ParseOrderResult {
  success: boolean;
  items: ParsedOrderItem[];
  rawText?: string;
  error?: string;
}

export async function parseOrderFromImage(base64Image: string): Promise<ParseOrderResult> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: `You are an order parsing assistant. Extract order items from handwritten or printed order images.
For each item, identify:
- productRef: The product name, SKU code, or identifier (e.g., "L.S Belt", "I-73", "Knee Cap")
- size: Size if mentioned (e.g., "M", "L", "XL", "Reg", "Sm", "Uni")
- quantity: Number of units (note: "1case" or "1cse" typically means 1 unit, parse the number)

Return JSON format: { "items": [{ "rawText": "original line text", "productRef": "product name/code", "size": "size or null", "quantity": number, "confidence": 0.0-1.0 }] }`
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Parse this order image and extract all order items. Return as JSON."
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 4096,
    });

    const content = response.choices[0].message.content;
    if (!content) {
      return { success: false, items: [], error: "No response from AI" };
    }

    const parsed = JSON.parse(content);
    return {
      success: true,
      items: parsed.items || [],
    };
  } catch (error: any) {
    console.error("Error parsing order from image:", error);
    return { success: false, items: [], error: error.message };
  }
}

export async function parseOrderFromText(text: string): Promise<ParseOrderResult> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: `You are an order parsing assistant. Parse order text that may be in various formats.
Common patterns include:
- "Product Name - Size Quantity" (e.g., "L.S Belt - M 2case, L 2case")
- "SKU-Code Size|Qty" (e.g., "I-73-Reg|2", "D-02- L|1 S|1")
- Simple lists with product names and quantities

For each item, identify:
- productRef: The product name or SKU code
- size: Size if mentioned (M, L, XL, S, Reg, Sm, Uni, etc.)
- quantity: Number of units

Return JSON format: { "items": [{ "rawText": "original line or segment", "productRef": "product name/code", "size": "size or null", "quantity": number, "confidence": 0.0-1.0 }] }`
        },
        {
          role: "user",
          content: `Parse this order text and extract all order items. Return as JSON.\n\n${text}`
        },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 4096,
    });

    const content = response.choices[0].message.content;
    if (!content) {
      return { success: false, items: [], rawText: text, error: "No response from AI" };
    }

    const parsed = JSON.parse(content);
    return {
      success: true,
      items: parsed.items || [],
      rawText: text,
    };
  } catch (error: any) {
    console.error("Error parsing order from text:", error);
    return { success: false, items: [], rawText: text, error: error.message };
  }
}
