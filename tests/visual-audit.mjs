import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
});
const page = await context.newPage();

await page.goto("http://127.0.0.1:4173", { waitUntil: "networkidle" });
await page.screenshot({ path: "/tmp/shodo-home.png", fullPage: true });
await page.getByRole("button", { name: "Or prepare Page 43" }).click();
const editor = page.getByRole("textbox", { name: "Manuscript editor" });
await editor.fill(
  "La pluie avait commencé avant l’aube. Personne, dans la maison, ne semblait l’avoir entendue.\n\nPaul posa le livre à la page quarante-trois et attendit.",
);
await page.getByText("Saved locally", { exact: true }).waitFor();
await page.screenshot({ path: "/tmp/shodo-editor.png", fullPage: true });
await page.getByRole("button", { name: /Notes/ }).first().click();
await page.getByRole("button", { name: /New/ }).click();
await page.locator(".note-title").fill("Le livre rouge");
await page
  .locator(".note-body")
  .fill(
    "Léa sait pourquoi la page 43 a été arrachée. Paul ne doit pas encore le comprendre.",
  );
await page.screenshot({ path: "/tmp/shodo-notes.png", fullPage: true });
await page
  .getByRole("button", { name: /Project/ })
  .first()
  .click();
await page.screenshot({ path: "/tmp/shodo-progress.png", fullPage: true });
await page
  .getByRole("button", { name: /Manuscript/ })
  .first()
  .click();
await page.keyboard.press("Meta+Shift+F");
await page.waitForTimeout(350);
await page.mouse.move(1200, 700);
await page.screenshot({ path: "/tmp/shodo-focus.png", fullPage: true });

await browser.close();
console.log("Visual audit screens captured.");
