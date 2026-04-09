import 'dotenv/config'
import { OpenRouterClient } from './src/openrouter/client.js'
import { enrichmentPrompt } from './src/openrouter/prompts.js'

const key = process.env.OPENROUTER_API_KEY
console.log('OPENROUTER_API_KEY set:', !!key, key ? `(${key.slice(0, 8)}...)` : '')

const openrouter = new OpenRouterClient(key!)
const prompt = enrichmentPrompt('Build and maintain backend APIs. Strong TypeScript and PostgreSQL skills required. 3+ years experience.')

console.log('Calling the model...')
try {
  const raw = await openrouter.generate(prompt)
  console.log('Raw response:', raw)
  const parsed = JSON.parse(raw.replace(/```json\s?|\s?```/g, '').trim())
  console.log('Parsed:', parsed)
} catch (err) {
  console.error('ERROR:', err)
}
