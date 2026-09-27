import test from "node:test";
import assert from "node:assert/strict";
import { renderChatMarkdown } from "../src/chat-markdown.js";

test("renders headings, emphasis, lists and safe links", () => {
  const html = renderChatMarkdown("## Analyse\n\n**Prix** : 339 000 €\n- Surface : 230 m²\n[Voir](https://example.com/annonce)");
  assert.match(html, /<h4>Analyse<\/h4>/);
  assert.match(html, /<strong>Prix<\/strong>/);
  assert.match(html, /<ul><li>Surface : 230 m²<\/li><\/ul>/);
  assert.match(html, /target="_blank"/);
});

test("escapes arbitrary HTML from model output", () => {
  const html = renderChatMarkdown('<img src=x onerror="alert(1)">');
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
});
