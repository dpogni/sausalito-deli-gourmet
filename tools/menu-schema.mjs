// Regenerates the schema.org Menu JSON-LD in index.html from the visible menu.
// Run after editing menu items or prices:  node tools/menu-schema.mjs
import fs from "node:fs";

const FILE = new URL("../index.html", import.meta.url);
const SITE = "https://www.sausalitogourmet.com/";
const START = '<script type="application/ld+json" id="menu-schema">';
const END = "</script>";

const html = fs.readFileSync(FILE, "utf8");

const text = (s) =>
  s.replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

// "6.95<small>/piece</small>" -> { price: "6.95", unit: "piece" }
const offer = (price, unit) => {
  const o = { "@type": "Offer", price: Number(price).toFixed(2), priceCurrency: "USD" };
  if (unit) o.description = `per ${unit}`;
  return o;
};

const sectionRe = /<section id="([^"]+)" class="menu-section">\s*<h2>([\s\S]*?)<\/h2>([\s\S]*?)<\/section>/g;
const itemRe = /<li><div class="row"><h3>([\s\S]*?)<\/h3>([\s\S]*?)<\/div>([\s\S]*?)<\/li>(?=\s*(?:<li><div class="row">|<\/ul>))/g;

const sections = [];
let itemCount = 0;
for (const [, id, name, body] of html.matchAll(sectionRe)) {
  const sub = body.match(/^\s*<p class="sub">([\s\S]*?)<\/p>/);
  const items = [];
  for (const [, itemName, priceHtml, rest] of body.matchAll(itemRe)) {
    const item = { "@type": "MenuItem", name: text(itemName) };
    const desc = rest.match(/<p class="desc">([\s\S]*?)<\/p>/);
    if (desc) item.description = text(desc[1]);

    const single = priceHtml.match(/<span class="price">([\d.]+)(?:<small>\/([^<]+)<\/small>)?<\/span>/);
    const multi = [...rest.matchAll(/<li><b>([\d.]+)<\/b>\s*([^<]+)/g)];
    if (single) item.offers = offer(single[1], single[2] && text(single[2]));
    else if (multi.length) item.offers = multi.map(([, p, u]) => offer(p, text(u)));

    items.push(item);
  }
  if (!items.length) continue;
  itemCount += items.length;
  const section = { "@type": "MenuSection", "@id": `${SITE}#${id}`, name: text(name) };
  if (sub) section.description = text(sub[1]);
  section.hasMenuItem = items;
  sections.push(section);
}

// Every priced row on the page must have been picked up.
const rows = (html.match(/<li><div class="row">/g) || []).length;
if (rows !== itemCount) {
  console.error(`Parsed ${itemCount} menu items but index.html has ${rows} rows; check the menu markup.`);
  process.exit(1);
}

const menu = {
  "@context": "https://schema.org",
  "@type": "Menu",
  "@id": `${SITE}#menu`,
  name: "Sausalito Gourmet Delicatessen Menu",
  url: `${SITE}#menu`,
  inLanguage: "en",
  hasMenuSection: sections,
};

const block = `${START}\n${JSON.stringify(menu)}\n  ${END}`;
const at = html.indexOf(START);
if (at === -1) {
  console.error(`Could not find ${START} in index.html.`);
  process.exit(1);
}
const out = html.slice(0, at) + block + html.slice(html.indexOf(END, at) + END.length);
fs.writeFileSync(FILE, out);
console.log(`Wrote menu schema: ${sections.length} sections, ${itemCount} items.`);
