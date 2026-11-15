// npm run llm:smoke
// Sends "say ok" to the LLM (Groq or Gemini, see llm.ts) with the key and model from .env.local,
// and prints "ok" if it answers.
import { complete, loadLocalEnv } from './llm'

loadLocalEnv()

try {
  const result = await complete({
    system: 'Reply with exactly the word ok and nothing else.',
    user: 'say ok',
    // The SDK retries busy (503) and rate-limited (429) answers itself; give it time.
    timeoutMs: 180_000,
  })
  const reply = result.text.trim()
  console.log(`Model: ${result.model}`)
  console.log(`Reply: ${reply}`)
  if (/^ok\b/i.test(reply)) {
    console.log('ok')
  } else {
    console.log('The LLM answered, but not with "ok".')
    process.exitCode = 1
  }
} catch (error) {
  console.log(`LLM call failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}
