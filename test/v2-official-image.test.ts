import { describe, expect, it } from "vitest";
import { officialImage } from "../src/v2/providers/official-image.js";

const bankingUrl = "https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.pr260807~58eb5109ce.en.html";
const bankingImage = "pr260807/ecb.pr260807.en_img0.png?a64c0aa2880652cf4481b4f129a362f6";
const frame = (body: string) => `<main><div class="section">${body}</div></main>`;
const figure = (src = bankingImage, credit = "Source: ECB", title = "Total assets of credit institutions headquartered in the EU") =>
  `<div class="figure"><h4>Chart 1</h4><p class="title">${title}</p><figure><p class="info">(EUR billions)</p><img alt="" src="${src}" id="img0"><figcaption><p>${credit}<br>Note: Data relate to the EU27.</p></figcaption></figure></div>`;

describe("official article images", () => {
  it("extracts the real ECB banking-release figure with its title and source credit, without methodology notes", () => {
    const image = officialImage("ecb", frame(figure()), bankingUrl);
    expect(image?.url).toBe(`https://www.ecb.europa.eu/press/pr/date/2026/html/${bankingImage}`);
    expect(image?.attribution).toContain("Total assets of credit institutions headquartered in the EU");
    expect(image?.attribution).toContain("Source: ECB");
    expect(image?.attribution).not.toContain("Data relate to the EU27");
  });

  it("handles the real nested table shape of the ECB wage tracker and retains underlying-source credit", () => {
    const url = "https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.pr260729~4ad7508d8a.en.html";
    const body = `<div class="figure"><h4>Chart 1</h4><p class="title">ECB wage tracker: forward-looking signals for negotiated wages and revisions to the previous data release</p><figure><div class="table"><div class="wrapper"><table><tbody><tr><td><img src="pr260729/ecb.pr260729.en_img0.png?e6f83ebff8ca33be6db7c4cdfa92a017" alt=""></td><td><img src="pr260729/ecb.pr260729.en_img1.png?5387f57406ce32217f9562622d095a99" alt=""></td></tr></tbody></table></div></div><figcaption><p>Sources: ECB calculations based on data provided by the Deutsche Bundesbank and Eurostat.</p><p>Notes: Dashed lines denote forward-looking information.</p></figcaption></figure></div>`;
    const image = officialImage("ecb", frame(body), url);
    expect(image?.url).toBe("https://www.ecb.europa.eu/press/pr/date/2026/html/pr260729/ecb.pr260729.en_img0.png?e6f83ebff8ca33be6db7c4cdfa92a017");
    expect(image?.attribution).toContain("Deutsche Bundesbank and Eurostat");
    expect(image?.attribution).not.toContain("Dashed lines denote forward-looking information");
  });

  it("ignores generic social metadata, logos and images outside the article section", () => {
    const html = `<meta property="og:image" content="https://www.ecb.europa.eu/press/shared/img/socialmedia/social-default.jpg"><main>${figure()}<div class="section"><img src="/shared/img/logo/logo_only.svg"></div></main>`;
    expect(officialImage("ecb", html, bankingUrl)).toBeNull();
    expect(officialImage("ecb", frame(figure("/press/shared/img/socialmedia/social-default.jpg")), bankingUrl)).toBeNull();
  });

  it.each([
    "https://example.com/ecb.pr260807.en_img0.png",
    "https://127.0.0.1/press/pr/date/2026/html/pr260807/ecb.pr260807.en_img0.png",
    "https://www.ecb.europa.eu.evil.example/press/pr/date/2026/html/pr260807/ecb.pr260807.en_img0.png",
    "https://user:password@www.ecb.europa.eu/press/pr/date/2026/html/pr260807/ecb.pr260807.en_img0.png",
    "http://www.ecb.europa.eu/press/pr/date/2026/html/pr260807/ecb.pr260807.en_img0.png",
    "pr260729/ecb.pr260729.en_img0.png",
    "pr260807/ecb.pr260729.en_img0.png",
    "pr260807/ecb.pr260807.en_img0.png?redirect=https://example.com",
    "pr260807/ecb.pr260807.en_img0.svg",
    "data:image/png;base64,AAAA",
    "pr260807/ecb.pr260807.en_img0.png#fragment",
    "pr260807/ecb.pr260807.en_img0.png\n",
  ])("rejects an unsafe, unrelated or unverified image URL: %s", (src) => {
    expect(officialImage("ecb", frame(figure(src)), bankingUrl)).toBeNull();
  });

  it.each(["Source: Reuters", "Source: ECB and AFP", "Source: ECB / external photographer", "Source: ECB. Photo by Reuters", "Source: ECB. © Third Party", "", "Source: independent photographer"])("does not grant image rights from ambiguous or third-party credit: %s", (credit) => {
    expect(officialImage("ecb", frame(figure(bankingImage, credit)), bankingUrl)).toBeNull();
  });

  it.each([
    "Source: ECB. © ECB © Third Party",
    "Source: ECB<br>© ECB<br>© Third Party",
    "Source: ECB. © ECB / Third Party",
    "Source: ECB<br>© European Central Bank and Third Party",
    "Source: ECB<br>Copyright ECB<br>Copyright Third Party",
    "Source: ECB<br>© ECB<br>Notes: illustration © Third Party",
  ])("rejects mixed or external copyright even when an ECB credit is also present: %s", (credit) => {
    expect(officialImage("ecb", frame(figure(bankingImage, credit)), bankingUrl)).toBeNull();
  });

  it("retains every ECB source/copyright paragraph while excluding separate or inline notes", () => {
    const credit = "Source: ECB calculations based on Bundesbank data.<br>© European Central Bank, 2026<br>Notes: Methodology detail.<br>Source: ECB statistical warehouse.";
    const image = officialImage("ecb", frame(figure(bankingImage, credit)), bankingUrl);
    expect(image?.attribution).toContain("ECB calculations based on Bundesbank data");
    expect(image?.attribution).toContain("© European Central Bank, 2026");
    expect(image?.attribution).toContain("Source: ECB statistical warehouse");
    expect(image?.attribution).not.toContain("Methodology detail");
    expect(image?.attribution).not.toContain("Data relate to the EU27");
  });

  it("skips an unentitled figure and selects a later eligible source figure", () => {
    const html = frame(figure(bankingImage, "Source: Reuters") + figure());
    expect(officialImage("ecb", html, bankingUrl)?.url).toContain("ecb.pr260807.en_img0.png");
  });

  it("does not treat data-src, comment/script content, missing captions or malformed fragments as a real figure", () => {
    expect(officialImage("ecb", frame(figure().replace('src="', 'data-src="')), bankingUrl)).toBeNull();
    expect(officialImage("ecb", frame(`<!--${figure()}--><script>${figure()}</script>`), bankingUrl)).toBeNull();
    expect(officialImage("ecb", frame(figure().replace(/<figcaption>[\s\S]*?<\/figcaption>/, "")), bankingUrl)).toBeNull();
    expect(officialImage("ecb", frame(figure()).replace("</main>", ""), bankingUrl)).toBeNull();
    expect(officialImage("ecb", "<main><div class='section'><div class='figure'>", bankingUrl)).toBeNull();
    expect(officialImage("ecb", "x".repeat(2_000_001), bankingUrl)).toBeNull();
  });

  it("requires the matching canonical release URL and leaves unverified Fed images absent", () => {
    for (const url of [bankingUrl.replace("2026", "2025"), bankingUrl + "?other=1", bankingUrl.replace("www.ecb.europa.eu", "example.com"), "invalid"]) {
      expect(officialImage("ecb", frame(figure()), url)).toBeNull();
    }
    expect(officialImage("fed", `<div id="article"><img src="/images/social-media/social-default-image-opengraph.jpg"></div>`, "https://www.federalreserve.gov/newsevents/pressreleases/enforcement20260904a.htm")).toBeNull();
  });
});
