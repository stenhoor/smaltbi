# ADR 0007: Phones see every page as a responsive web page

Date: 2026-11-12. Status: accepted (owner's decision, 2026-11-12).

## Context

The roadmap's last 0.2 item is a mobile layout per page. Pages are responsive by default, and since ADR 0006 a page
can instead have a fixed size (16:9, 4:3, Letter, A4 or custom). That left open what a phone should show for a
fixed-size page, scaled down to fit or reflowed.

## Decision

On a phone the normal view is a **responsive web page**, for every page, fixed-size ones included:

- **One column:** the page's visuals stack in a single column, in reading order (top to bottom, then left to right),
  each at its desktop height in rows. There is no sheet and no scaling on a phone.
- **Optional phone settings:** a page can change its phone order (`page.phoneOrder`), and a visual can be hidden on
  phones or given its own height (`visual.phone`). Without these settings the reading order applies, so nothing has
  to be set up for a report to work on a phone.
- **The breakpoint:** a report narrower than 720px is a phone. It is one constant (`PHONE_WIDTH`), and the stylesheet's
  container query uses the same value.

## Consequences

- The designer has a *Phone view* that shows the page at phone width, and an *On phones* section in the Format tab:
  show on phones, height in rows, and the visual's place in the column.
- Fixed sizes (ADR 0006) apply from 720px up. A slide or printed page keeps its layout on wider screens and in print.
