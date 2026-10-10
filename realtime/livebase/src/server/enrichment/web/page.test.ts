import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { extractPage, imagesOfPerson, namesPerson, pageText, type PageFacts } from "~/server/enrichment/web/page";

const PAGE_URL = "https://acme.example/team";

// A team page in the shapes real sites use: a card with a heading, a figure
// with a caption, a lazy-loaded image, a group photo, JSON-LD and og:image.
const TEAM_PAGE = `<!doctype html>
<html>
<head>
  <title>Team | Acme</title>
  <meta name="description" content="The people behind Acme.">
  <meta property="og:site_name" content="Acme">
  <meta property="og:image" content="/og/team.png">
  <meta property="og:image:alt" content="The Acme team at the 2026 offsite">
  <meta property="og:image:width" content="1200">
  <link rel="icon" href="/favicon.ico">
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
  <script type="application/ld+json">
    {"@context": "https://schema.org", "@graph": [
      {"@type": "Organization", "name": "Acme", "url": "/", "logo": "/logo.png", "image": ["/brand.png", "/brand-2.png"],
       "sameAs": ["https://x.com/acme"]},
      {"@type": "Person", "name": "José Núñez", "jobTitle": "CTO", "image": {"@type": "ImageObject", "url": "/people/jose.jpg"}}
    ]}
  </script>
</head>
<body>
  <nav><a href="/about">About us</a> <a href="https://github.com/acme">GitHub</a></nav>
  <h1>Our team</h1>
  <img src="/sprites/icons.png" alt="">
  <img src="https://acme.example/pixel.gif" width="1" height="1">
  <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="Placeholder">
  <img src="/badge.png" width="16" height="16" alt="Jane Doe">
  <div class="grid">
    <div class="card">
      <div class="photo"><img src="/people/jane.jpg" alt="Jane Doe" width="400" height="400"></div>
      <h3>Jane Doe</h3>
      <p>Chief Executive Officer</p>
    </div>
    <div class="card">
      <img src="/people/placeholder.svg" data-src="/people/john.jpg" alt="">
      <h3>John Roe</h3>
      <p>Head of Sales and Marketing</p>
    </div>
    <div class="card">
      <img srcset="/people/ana-128.jpg 128w, /people/ana-320.jpg 320w, /people/ana-960.jpg 960w" alt="Portrait">
      <strong>Ana Lopez</strong> <span>VP Engineering</span>
    </div>
    <figure>
      <img src="/people/li.jpg" alt="">
      <figcaption>Li Wei, Designer</figcaption>
    </figure>
  </div>
  <section>
    <img src="/people/founders.jpg" alt="Jane Doe and John Roe at the office">
    <img src="/people/everyone.jpg" alt="The founders, from left to right: Jane Doe, John Roe">
  </section>
  <div class="row"><img src="/people/a.jpg" alt=""><img src="/people/b.jpg" alt=""><p>Jane Doe and friends</p></div>
  <img src="https://media.licdn.com/dms/image/jane.jpg" alt="Jane Doe">
  <img src="https://www.facebook.com/tr?id=1&ev=PageView" alt="">
  <p>We build anvils.</p>
</body>
</html>`;

function facts(): PageFacts {
  return extractPage(TEAM_PAGE, PAGE_URL);
}

function image(page: PageFacts, path: string) {
  return page.images.find((candidate) => candidate.url === `https://acme.example${path}`);
}

describe("extractPage", () => {
  it("keeps the page's metadata, icons, links, JSON-LD and text", () => {
    const page = facts();
    assert.equal(page.url, PAGE_URL);
    assert.equal(page.title, "Team | Acme");
    assert.equal(page.description, "The people behind Acme.");
    assert.equal(page.siteName, "Acme");
    assert.equal(page.ogImage, "https://acme.example/og/team.png");
    assert.deepEqual(
      page.icons.map((icon) => icon.url),
      ["https://acme.example/favicon.ico", "https://acme.example/apple-touch-icon.png"],
    );
    assert.deepEqual(page.socialLinks, ["https://github.com/acme"]);
    assert.deepEqual(page.keyLinks, [{ text: "About us", url: "https://acme.example/about" }]);
    assert.match(page.text, /We build anvils\./);
    assert.doesNotMatch(page.text, /schema\.org/);
  });

  it("reads JSON-LD image for Person and Organization", () => {
    const [organization, person] = facts().jsonLd;
    assert.equal(organization?.type, "Organization");
    assert.equal(organization?.logo, "https://acme.example/logo.png");
    assert.equal(organization?.image, "https://acme.example/brand.png");
    assert.deepEqual(organization?.sameAs, ["https://x.com/acme"]);
    assert.equal(person?.type, "Person");
    assert.equal(person?.name, "José Núñez");
    assert.equal(person?.jobTitle, "CTO");
    assert.equal(person?.image, "https://acme.example/people/jose.jpg");
  });

  it("lists JSON-LD and og:image candidates first", () => {
    const sources = facts().images.map((candidate) => candidate.source);
    assert.deepEqual(sources.slice(0, 3), ["jsonld", "jsonld", "og"]);
    assert.ok(sources.slice(3).every((source) => source === "img"));
  });

  it("takes og:image's own alt and declared size, not the page title", () => {
    const og = image(facts(), "/og/team.png");
    assert.deepEqual(og, {
      url: "https://acme.example/og/team.png",
      alt: "The Acme team at the 2026 offsite",
      nearbyText: null,
      width: 1200,
      height: null,
      source: "og",
    });
  });

  it("labels a JSON-LD image with its entity", () => {
    assert.equal(image(facts(), "/people/jose.jpg")?.nearbyText, "Person: José Núñez");
  });

  it("reads alt text, declared size, and the card's heading and text", () => {
    assert.deepEqual(image(facts(), "/people/jane.jpg"), {
      url: "https://acme.example/people/jane.jpg",
      alt: "Jane Doe",
      nearbyText: "Jane Doe · Chief Executive Officer",
      width: 400,
      height: 400,
      source: "img",
    });
  });

  it("reads figcaptions", () => {
    const li = image(facts(), "/people/li.jpg");
    assert.equal(li?.alt, null);
    assert.equal(li?.nearbyText, "Li Wei, Designer");
  });

  it("follows lazy-load attributes and srcset", () => {
    const page = facts();
    assert.equal(image(page, "/people/john.jpg")?.nearbyText, "John Roe · Head of Sales and Marketing");
    assert.equal(image(page, "/people/placeholder.svg"), undefined);
    // The smallest candidate at least 256 px wide.
    assert.equal(image(page, "/people/ana-320.jpg")?.nearbyText, "Ana Lopez · VP Engineering");
  });

  it("skips data: URIs, sprites, tracking pixels, tiny images and LinkedIn's CDN", () => {
    const urls = facts().images.map((candidate) => candidate.url);
    assert.ok(urls.every((url) => /^https:\/\//.test(url)));
    for (const skipped of ["sprites/icons.png", "pixel.gif", "badge.png", "licdn.com", "facebook.com/tr"]) {
      assert.ok(!urls.some((url) => url.includes(skipped)), skipped);
    }
  });

  it("gives no nearby text when the enclosing element holds other images", () => {
    const page = facts();
    assert.equal(image(page, "/people/a.jpg")?.nearbyText, null);
    assert.equal(image(page, "/people/founders.jpg")?.nearbyText, null);
  });

  it("dedupes images, including an optimizer's widths of one source", () => {
    const html = `<html><head><meta property="og:image" content="https://acme.example/jane.jpg"></head><body>
      <div><img src="/jane.jpg" alt="Jane Doe"><h3>Jane Doe</h3></div>
      <img src="/_next/image?url=%2Fteam.webp&w=640" alt="Team">
      <img src="/_next/image?url=%2Fteam.webp&w=1920" alt="Team">
    </body></html>`;
    const page = extractPage(html, "https://acme.example/");
    assert.equal(page.images.length, 2);
    // The og:image entry gains the <img>'s alt and card text.
    assert.deepEqual(page.images[0], {
      url: "https://acme.example/jane.jpg",
      alt: "Jane Doe",
      nearbyText: "Jane Doe",
      width: null,
      height: null,
      source: "og",
    });
    assert.equal(page.images[1]?.url, "https://acme.example/_next/image?url=%2Fteam.webp&w=640");
  });

  it("separates block-level elements in the text, and joins inline ones", () => {
    const html = `<html><body>
      <section><h2>About</h2><p>Team</p></section><div>Meet the team</div><div>From left to right</div>
      <ul><li>Docs</li><li>Blog</li></ul>Line one<br>line two
      <table><tr><th>Jane Doe</th><td>CEO</td></tr><tr><td>John Roe</td><td>CTO</td></tr></table>
      <p>Built by <strong>Acme</strong><span>Corp</span>, <a href="/x">read more</a>.</p>
    </body></html>`;
    assert.equal(
      extractPage(html, "https://acme.example/").text,
      [
        "About",
        "Team",
        "Meet the team",
        "From left to right",
        "Docs",
        "Blog",
        "Line one",
        "line two",
        "Jane Doe CEO",
        "John Roe CTO",
        "Built by AcmeCorp, read more.",
      ].join("\n"),
    );
  });

  it("separates blocks in nearby text and link text", () => {
    const html = `<html><body>
      <div class="card"><img src="/p/jane.jpg"><div><div>Jane Doe</div><div>Chief Executive Officer</div></div></div>
      <a href="/about"><div>About</div><div>Our story</div></a>
    </body></html>`;
    const page = extractPage(html, "https://acme.example/");
    assert.equal(image(page, "/p/jane.jpg")?.nearbyText, "Jane Doe Chief Executive Officer");
    assert.deepEqual(imagesOfPerson(page, "Jane Doe").map((candidate) => candidate.url), ["https://acme.example/p/jane.jpg"]);
    assert.deepEqual(page.keyLinks, [{ text: "About Our story", url: "https://acme.example/about" }]);
  });

  it("keeps at most 30 images and truncates nearby text to 120 characters", () => {
    const cards = Array.from(
      { length: 40 },
      (_, i) => `<div><img src="/p/${i}.jpg" alt="Person ${i}"><p>${"Long biography text. ".repeat(20)}</p></div>`,
    ).join("");
    const page = extractPage(`<html><body>${cards}</body></html>`, "https://acme.example/");
    assert.equal(page.images.length, 30);
    assert.ok(page.images.every((candidate) => (candidate.nearbyText?.length ?? 0) <= 120));
    assert.ok(page.images[0]?.nearbyText?.endsWith("…"));
  });
});

describe("pageText", () => {
  it("returns title, description and visible text without scripts", () => {
    const text = pageText(TEAM_PAGE);
    assert.match(text, /^Team \| Acme\nThe people behind Acme\.\n/);
    assert.match(text, /We build anvils\./);
    assert.doesNotMatch(text, /@graph/);
  });

  it("separates block-level elements", () => {
    assert.match(pageText(TEAM_PAGE), /\nJane Doe\nChief Executive Officer\n/);
  });
});

describe("namesPerson", () => {
  it("matches every name token, ignoring case and accents", () => {
    assert.equal(namesPerson("Photo of Jane Doe", "Jane Doe"), true);
    assert.equal(namesPerson("JANE DOE, CEO", "jane doe"), true);
    assert.equal(namesPerson("Jose Nunez", "José Núñez"), true);
    assert.equal(namesPerson("José Núñez", "Jose Nunez"), true);
    assert.equal(namesPerson("Łukasz Ørsted", "Lukasz Orsted"), true);
    assert.equal(namesPerson("Doe, Jane", "Jane Doe"), true);
    assert.equal(namesPerson("Jean-Luc Picard", "Jean Luc Picard"), true);
  });

  it("rejects partial names", () => {
    assert.equal(namesPerson("Jane", "Jane Doe"), false);
    assert.equal(namesPerson("Jane Smith", "Jane Doe"), false);
    assert.equal(namesPerson("Mary Watson", "Mary Jane Watson"), false);
    // Whole words only: "Al" isn't in "Alex".
    assert.equal(namesPerson("Alex Bo", "Al Bo"), false);
  });

  it("matches a shorter name inside a longer one", () => {
    assert.equal(namesPerson("Mary Jane Watson, CFO", "Mary Watson"), true);
  });

  it("ignores single letters and honorifics in the person's name", () => {
    assert.equal(namesPerson("John Smith", "John Q. Smith"), true);
    assert.equal(namesPerson("Jane Doe", "Dr. Jane Doe Jr."), true);
  });

  it("is false for empty text or an empty name", () => {
    assert.equal(namesPerson(null, "Jane Doe"), false);
    assert.equal(namesPerson(undefined, "Jane Doe"), false);
    assert.equal(namesPerson("", "Jane Doe"), false);
    assert.equal(namesPerson("Jane Doe", ""), false);
    assert.equal(namesPerson("Jane Doe", "J."), false);
  });
});

describe("imagesOfPerson", () => {
  it("finds a headshot by alt text, and skips group photos", () => {
    assert.deepEqual(
      imagesOfPerson(facts(), "Jane Doe").map((candidate) => candidate.url),
      ["https://acme.example/people/jane.jpg"],
    );
  });

  it("finds a photo by its card's heading", () => {
    assert.deepEqual(
      imagesOfPerson(facts(), "John Roe").map((candidate) => candidate.url),
      ["https://acme.example/people/john.jpg"],
    );
    assert.deepEqual(
      imagesOfPerson(facts(), "Ana López").map((candidate) => candidate.url),
      ["https://acme.example/people/ana-320.jpg"],
    );
  });

  it("finds a photo by its figcaption", () => {
    assert.deepEqual(
      imagesOfPerson(facts(), "Li Wei").map((candidate) => candidate.url),
      ["https://acme.example/people/li.jpg"],
    );
  });

  it("finds a JSON-LD Person's image", () => {
    assert.deepEqual(
      imagesOfPerson(facts(), "Jose Nunez").map((candidate) => candidate.url),
      ["https://acme.example/people/jose.jpg"],
    );
  });

  it("returns nothing for someone not on the page", () => {
    assert.deepEqual(imagesOfPerson(facts(), "Elena Petrova"), []);
    assert.deepEqual(imagesOfPerson(facts(), "Jane Roe"), []);
  });

  it("matches a one-word name as given", () => {
    assert.deepEqual(
      imagesOfPerson(facts(), "Jane").map((candidate) => candidate.url),
      ["https://acme.example/people/jane.jpg"],
    );
  });

  it("ranks JSON-LD over alt text over nearby text", () => {
    const html = `<html><head><script type="application/ld+json">
      {"@type": "Person", "name": "Jane Doe", "image": "/ld.jpg"}</script></head><body>
      <div><img src="/near.jpg"><h3>Jane Doe</h3></div>
      <div><img src="/alt.jpg" alt="Jane Doe"></div>
    </body></html>`;
    const page = extractPage(html, "https://acme.example/");
    assert.deepEqual(
      imagesOfPerson(page, "Jane Doe").map((candidate) => candidate.url),
      ["https://acme.example/ld.jpg", "https://acme.example/alt.jpg", "https://acme.example/near.jpg"],
    );
  });

  it("doesn't take an Organization named after the person as their photo", () => {
    const html = `<html><head><script type="application/ld+json">
      {"@type": "Organization", "name": "Jane Doe Consulting", "image": "/brand.png"}</script></head><body></body></html>`;
    assert.deepEqual(imagesOfPerson(extractPage(html, "https://acme.example/"), "Jane Doe"), []);
  });
});
