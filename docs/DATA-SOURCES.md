# Extra data sources — what we checked

We looked at **Bloomberg** for premium news, and **Polymarket**, **Kalshi** and
**ForecastEx** for event probabilities. Polymarket is technically accessible but
needs written data-use permission for our integration; ForecastEx is worth trying.

## Bloomberg — no

Bloomberg has the best data. **The blocker is their contract, not the price.**

Their licence, which we read directly, forbids storing their data in a database,
sending it to anyone else, using it in an automated system, or connecting from a
machine not logged into a Terminal. Our service does all four. A seat costs
**$31,980/year**, and buying one wouldn't help — the restrictions come with it.

They sell feeds needing no Terminal, but those are for desks to trade on, not to
show readers. The one product that *allows* republishing is a separate media
business selling by topic ("Technology", "Energy"), not by company — so even with
money, it can't answer "news about this company."

This won't change: their licence bars anything that could cost them a Terminal
subscription.

## Polymarket — accessible; permission for internal use still needs confirmation

**We can retrieve public data, but have not verified written permission for our
intended use.** On 8 September 2026, direct requests to the Polymarket hosts we
tested failed with connection resets. A remote page reader nevertheless returned
a public Gamma API market record and the CLOB server clock, without a VPN or
account. This establishes another way to retrieve data, but not a reliable
production connection. Public market-data access does not require signup;
signup and trading have separate location requirements.
[API documentation](https://docs.polymarket.com/market-data/discover-markets).

**How we would connect:** Polymarket provides official APIs that return structured
data, so we do not need to extract it from website pages.

| Interface | Data available |
| --- | --- |
| Gamma API | Events and markets, descriptions, possible outcomes, dates, status and volumes |
| CLOB API | Contract prices, buy and sell orders, and price history |
| WebSocket | Updates over a persistent connection when near-real-time data is needed |

[Market discovery](https://docs.polymarket.com/market-data/discover-markets),
[prices and history](https://docs.polymarket.com/market-data/prices-order-books),
[streaming updates](https://docs.polymarket.com/market-data/realtime-data).
After permission is confirmed, a server job could select relevant markets,
request updates every few minutes within the API limits, store the permitted
history and display it on an employee dashboard. For example, it could track
the market's assessment of a Fed rate cut alongside related news. A stable,
permitted network connection still needs to be established.

**We also retrieved the actual terms automatically.** The terms page embeds a
Google Doc, whose full text we downloaded. The checked version is effective
11 August 2026.
[Official terms](https://docs.google.com/document/d/1N4aYlRcqaWCeKMID7vUSWJ1UPMvw_v6SP4cOFN8ZxR4/preview).

**Internal use does not automatically remove the permission requirement.**
Section 4.2 separately restricts access and use by covered organizations, and
redistribution to specified recipients. Keeping the data inside the company
addresses external distribution, but not the first restriction. Covered users
include professional entities engaged in capital-markets activities, with fintech
companies among the examples, and market-data distributors. Classification
depends on the legal entity's actual activities; our investment-research project
is likely covered. The restriction includes API and blockchain data, including
derived, aggregated and anonymized forms. We found no explicit exception for
internal analytics, evaluation or prototypes. Section 4.2 also expressly prohibits
scraping, so switching from the API to a scraper does not resolve the issue.
[Official terms, section 4.2](https://docs.google.com/document/d/1N4aYlRcqaWCeKMID7vUSWJ1UPMvw_v6SP4cOFN8ZxR4/preview).

**The intended scope is now employee-only analytics, with no public publication.**
The permission request should cover:

| Intended use | Rights to confirm |
| --- | --- |
| Show event probabilities alongside news on an employee dashboard | Internal access, analysis and display |
| Save prices and build historical charts | Storage and historical-data use |
| Calculate a sentiment score from market prices | Derived-data use |

Public display or redistribution through a customer API would need separate
confirmation if the scope expands later.

ICE announced exclusive distribution of Polymarket data for **institutional
capital markets**. Polymarket directs relevant companies to consult its licensing
team and ICE. **An agreement grants usage rights; it is not necessarily the
purchase of an API key.** Many public data requests already work without one.
The approved delivery method could be the existing API or an institutional feed;
ICE offers current and historical Polymarket data. The available delivery option,
price and any trial access remain unconfirmed. We should request permission for
internal analytics only, with no trading or external sharing, specifying the
data fields, history retention and employee users. No licensing request has been
sent as part of this review. The contact is **data-licensing@polymarket.com**.
[ICE announcement](https://ir.theice.com/press/news-details/2026/ICE-Launches-Polymarket-Signals-and-Sentiment-Tool-Turning-Crowd-Sourced-Dynamic-Views-into-Market-Opportunities/default.aspx),
[Polymarket licensing information](https://institutional.polymarket.com/).

**What we can prepare before contacting them:** an integration based on the
documentation and synthetic test data. A successful public API response does not
establish permission for recurring collection into our working system. We should
confirm written permission before starting that collection; the reviewed sources
do not establish a universal fee or a requirement for every approved integration
to use ICE's feed.

**A VPN does not resolve data rights or trading eligibility.** Section 4.1
prohibits using VPNs or similar tools to circumvent restrictions. Section 1
separately allows informational viewing by users in restricted jurisdictions;
that does not authorize trading or our commercial integration.
[Official terms](https://docs.google.com/document/d/1N4aYlRcqaWCeKMID7vUSWJ1UPMvw_v6SP4cOFN8ZxR4/preview).

## Kalshi — no

A properly regulated US exchange, so it looked promising. But its developer
agreement, which we read directly, limits the API to *"facilitating a member's own
trading"* and forbids *"collecting, caching, aggregating, or storing data."*

Plainly: **their API is for you to trade with, not to build a product on.**
Showing their prices to users is exactly what it prohibits. Also network-blocked.

## ForecastEx — worth trying

**This one works.** ForecastEx is a US exchange regulated by the CFTC, and that
regulation **requires it to publish its daily prices.** It does, as plain CSV
files on its website.

We downloaded them: no key, no account, current data. Each file gives, per market
per day, open, high, low, close, settlement price and open interest — a full
history of how the odds moved. It covers inflation (CPI), Fed rate decisions,
payroll employment, jobless claims, GDP, retail sales, housing starts and
elections.

**Why this is legally different:** with the others you'd be taking data from a
private system against its rules. Here it's published because a regulator requires
it. We looked for a terms-of-use page and found none — though no terms isn't the
same as written permission.

**Check first:** most actual trading there is in *weather* markets. The economic
markets are real, but we haven't measured whether enough money trades in them for
the numbers to mean much.

## Suggestion

Keep the news stack as it is — nothing here changes it. **Try ForecastEx.** It
downloads today with no negotiation, and suits a small feature showing what the
market expects for the next inflation report or Fed decision: something news can't
tell you, because news reports what already happened.

Send one email asking if we may display their prices with credit — cheap, and it
turns "found no rules against it" into a written answer. Don't build on Kalshi
without a signed agreement. For Polymarket, we can prepare an integration using
synthetic data, but should confirm written permission before collecting real data
for the internal system.
