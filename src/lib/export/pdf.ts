import "server-only";
import { chromium, type Browser } from "playwright";

/* ==========================================================================
   PDF, via Chromium.
   --------------------------------------------------------------------------
   The same engine that renders the print route in a browser produces the file,
   so what an author previews at /print is byte-for-byte what a reader receives.
   Generating from the live route rather than from a parallel template is the
   whole reason the two cannot drift.

   Chromium is handed the requesting user's session cookies, so the pipeline
   has exactly the access the person clicking export already had — it is not a
   privileged path around authorisation.
   ========================================================================== */

/** Set by the sandbox image; a deployment supplies its own Chromium. */
const EXECUTABLE = process.env.CHROMIUM_EXECUTABLE_PATH;

export type PdfOptions = {
  /** Absolute URL of the print route, same origin as the request. */
  url: string;
  cookies: { name: string; value: string }[];
  /** Origin the cookies belong to. */
  origin: string;
  footerLeft: string;
};

export async function renderPdf(options: PdfOptions): Promise<Buffer> {
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({
      ...(EXECUTABLE ? { executablePath: EXECUTABLE } : {}),
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });

    const { hostname, protocol } = new URL(options.origin);
    const context = await browser.newContext();
    if (options.cookies.length > 0) {
      await context.addCookies(
        options.cookies.map((cookie) => ({
          name: cookie.name,
          value: cookie.value,
          domain: hostname,
          path: "/",
          httpOnly: false,
          secure: protocol === "https:",
          sameSite: "Lax" as const,
        })),
      );
    }

    const page = await context.newPage();
    const response = await page.goto(options.url, { waitUntil: "networkidle", timeout: 60_000 });
    if (!response || !response.ok()) {
      throw new Error(`The print route returned ${response?.status() ?? "no response"}.`);
    }
    // Fonts are self-hosted, so this settles quickly — but a PDF rendered
    // before they load falls back to a system serif and looks like a draft.
    await page.evaluate(() => document.fonts.ready);

    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate: footer(options.footerLeft),
      margin: { top: "22mm", bottom: "20mm", left: "20mm", right: "20mm" },
    });

    return Buffer.from(pdf);
  } finally {
    await browser?.close();
  }
}

/** Chromium renders header and footer templates in an isolated document, so
 *  the styling has to be inline and the page counters are its own classes. */
function footer(left: string): string {
  const escaped = left.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `
    <div style="width:100%;font-family:Georgia,serif;font-size:7.5pt;color:#4a5266;
                padding:0 20mm;display:flex;justify-content:space-between;">
      <span>${escaped}</span>
      <span class="pageNumber"></span>
    </div>`;
}
