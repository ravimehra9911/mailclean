// JSON-LD structured data for search engines (and AI assistants): the website, the app as a
// SoftwareApplication, the developer, and the FAQ. Only facts that are true — no ratings or reviews.

import { DESCRIPTION, DEVELOPER, DOWNLOAD_FILES, downloadUrl, REPO_URL, SITE_NAME, SITE_URL } from "@/lib/site";

export function StructuredData({ faq, version }: { faq: { q: string; a: string }[]; version: string }) {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: `${SITE_URL}/`,
        name: SITE_NAME,
        description: DESCRIPTION,
        inLanguage: "en",
        publisher: { "@id": `${SITE_URL}/#developer` },
      },
      {
        "@type": "Person",
        "@id": `${SITE_URL}/#developer`,
        name: DEVELOPER.name,
        url: DEVELOPER.url,
        sameAs: [DEVELOPER.url],
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE_URL}/#app`,
        name: SITE_NAME,
        description: DESCRIPTION,
        url: `${SITE_URL}/`,
        applicationCategory: "UtilitiesApplication",
        applicationSubCategory: "Email cleanup",
        operatingSystem: "macOS, Windows, Linux",
        ...(version ? { softwareVersion: version } : {}),
        license: `${REPO_URL}/blob/main/LICENSE`,
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        downloadUrl: Object.values(DOWNLOAD_FILES).map(downloadUrl),
        installUrl: `${SITE_URL}/#download`,
        screenshot: [
          `${SITE_URL}/screenshots/overview-dark.png`,
          `${SITE_URL}/screenshots/senders-light.png`,
          `${SITE_URL}/screenshots/gmail-promotions-dark.png`,
          `${SITE_URL}/screenshots/bulk-unsubscribe-light.png`,
          `${SITE_URL}/screenshots/add-account-light.png`,
        ],
        featureList: [
          "See which senders fill your inbox by email count, storage and unread rate",
          "Bulk move thousands of emails to Trash or Archive",
          "One-click and bulk unsubscribe (RFC 8058 List-Unsubscribe)",
          "Filter by year or custom date range",
          "Filter by Gmail tab: Primary, Promotions, Social, Updates, Forums, Purchases",
          "Keeps starred and important emails when cleaning, and optionally the newest emails per sender",
          "Automatic clean-up rules applied after every sync",
          "Cleaning suggestions: never-opened senders, old mail, Promotions",
          "Gmail, Yahoo Mail, iCloud Mail, AOL, Zoho and any IMAP mailbox",
          "Runs locally: email is never uploaded to a server",
        ],
        author: { "@id": `${SITE_URL}/#developer` },
        codeRepository: REPO_URL,
      },
      {
        "@type": "FAQPage",
        "@id": `${SITE_URL}/#faq`,
        mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      },
    ],
  };
  return (
    <script type="application/ld+json"
      // JSON.stringify output with "<" escaped so content can't close the script tag.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />
  );
}
