import { chromium } from "playwright";
import assert from "node:assert/strict";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  serviceWorkers: "allow",
});
const page = await context.newPage();

await page.goto("http://127.0.0.1:4173", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Or prepare Page 43" }).click();
await page.getByRole("textbox", { name: "Manuscript editor" }).waitFor();
const editor = page.getByRole("textbox", { name: "Manuscript editor" });
await editor.fill(
  "The first line stays here.\n\nA second paragraph finds its place.",
);
await page.getByText("Saved locally", { exact: true }).waitFor();
await page.reload({ waitUntil: "networkidle" });
await page.getByRole("textbox", { name: "Manuscript editor" }).waitFor();
assert.match(
  await page.getByRole("textbox", { name: "Manuscript editor" }).innerText(),
  /first line stays here/,
);

await page.getByRole("button", { name: /Start session/ }).click();
await page.getByRole("button", { name: /500 words/ }).click();
await page.getByRole("textbox", { name: "Manuscript editor" }).press("End");
await page
  .getByRole("textbox", { name: "Manuscript editor" })
  .pressSequentially(" More words arrive with intention.");
await page.getByText("Saved locally", { exact: true }).waitFor();
await page.getByRole("button", { name: /End/ }).click();
await page.getByText("Belle session.").waitFor();
assert.match(await page.locator(".session-summary").innerText(), /words/);
await page.getByRole("button", { name: "Continue writing" }).click();

await page.keyboard.press("Meta+Shift+N");
await page
  .getByPlaceholder("Catch it before it disappears.")
  .fill("The red umbrella returns in the final scene.");
await page.keyboard.press("Meta+Enter");
await page.keyboard.press("Meta+K");
await page.getByPlaceholder("Type a command…").fill("search manuscript");
await page
  .getByRole("button", { name: /Search manuscript/ })
  .evaluate((button) => button.click());
await page.getByPlaceholder("A name, a phrase, a detail…").fill("umbrella");
await page
  .locator(".search-results button")
  .filter({ hasText: "The red umbrella returns" })
  .first()
  .waitFor();
await page.keyboard.press("Escape");

await page.keyboard.press("Meta+K");
await page.getByPlaceholder("Type a command…").fill("snapshot");
await page
  .getByRole("button", { name: /Create snapshot/ })
  .evaluate((button) => button.click());
await page.keyboard.press("Meta+K");
await page.getByPlaceholder("Type a command…").fill("history");
await page
  .getByRole("button", { name: /Scene history/ })
  .evaluate((button) => button.click());
assert.ok((await page.locator(".history aside button").count()) >= 2);
await page.keyboard.press("Escape");

await page.keyboard.press("Meta+K");
await page.getByPlaceholder("Type a command…").fill("export");
await page
  .getByRole("button", { name: /Export project/ })
  .evaluate((button) => button.click());
const markdownDownload = page.waitForEvent("download");
await page.getByRole("button", { name: /Markdown/ }).click();
assert.equal((await markdownDownload).suggestedFilename(), "page-43.md");
const docxDownload = page.waitForEvent("download");
await page.getByRole("button", { name: /DOCX/ }).click();
assert.equal((await docxDownload).suggestedFilename(), "page-43.docx");
await page.keyboard.press("Escape");

await page.reload({ waitUntil: "networkidle" });
await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
await context.setOffline(true);
await page.reload({ waitUntil: "domcontentloaded" });
await page.getByRole("textbox", { name: "Manuscript editor" }).waitFor();
assert.match(
  await page.getByRole("textbox", { name: "Manuscript editor" }).innerText(),
  /More words arrive/,
);
await page.getByText(/Offline/).waitFor();

await page.screenshot({ path: "/tmp/shodo-v1.png", fullPage: true });
console.log(
  "Critical journey passed: create, write, autosave, reload, session, quick note, search, snapshot, Markdown/DOCX exports, PWA offline reload.",
);
await browser.close();
