import OpenAI from "openai";

export class OpenRouterClient {
    private client: OpenAI;
    private model: string;

    constructor(
        apiKey: string,
        model = "qwen/qwen3-235b-a22b",
    ) {
        this.client = new OpenAI({
            baseURL: "https://openrouter.ai/api/v1",
            apiKey,
        });
        this.model = model;
    }

    async generate(prompt: string, timeoutMs = 30000): Promise<string> {
        const res = await this.client.chat.completions.create({
            model: this.model,
            messages: [{ role: "user", content: prompt }],
        }, { timeout: timeoutMs });
        return res.choices[0]?.message.content ?? "";
    }
}
