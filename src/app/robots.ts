import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Search engines and AI assistants are welcome to read the public website.
// The API is private to the app and of no use to crawlers.
const AI_CRAWLERS = [
  "GPTBot", "OAI-SearchBot", "ChatGPT-User", // OpenAI
  "ClaudeBot", "Claude-SearchBot", "Claude-User", "anthropic-ai", // Anthropic
  "PerplexityBot", "Perplexity-User", // Perplexity
  "Google-Extended", // Google Gemini
  "Applebot-Extended", // Apple Intelligence
  "CCBot", // Common Crawl
  "Meta-ExternalAgent", "Bytespider", "cohere-ai", "DuckAssistBot", "YouBot", "MistralAI-User",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/api/"] },
      { userAgent: AI_CRAWLERS, allow: "/", disallow: ["/api/"] },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
