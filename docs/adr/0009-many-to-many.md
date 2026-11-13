# ADR 0009: Many-to-many

Date: 2026-11-13. Status: accepted (owner, 2026-11-13): decisions 1(a), 2(a) and 3(a), the recommendations.

## Context

The model is a star (or snowflake): relationships run many → one, from a fact table to its dimensions. A query's
measures pick its root (the fact table), the dimensions and filters it needs are joined outward from there, and a
table reachable by two active paths is an error, not a guess (ADR 0004, decision 9). Totals are separate queries
with fewer dimensions, never sums of the cells (ARCHITECTURE, "Measures and totals"). Inside those rules every number
is right.

"Many-to-many" is what people say when they meet one of three shapes the star can't hold. Each needs its own answer:

| Shape | Example | Today |
|---|---|---|
| **A. Through a link table** | Products have several tags (`product_tags`: product_id, tag_id). Revenue by tag. | Error: no path from sales to tags. |
| **B. Two facts, shared dimensions** | Revenue (sales) against Target (budget) by month and category. | Error: no path from sales to budget. |
| **C. A relationship to a non-unique column** | `budget.category → products.category`: the budget is by category, not by product. | **Wrong numbers, silently.** The join fans out and every budget row counts once per product. |

C is a bug in what ships now: nothing checks that a relationship's target column is unique. On the sample, a
relationship `stores.country → customers.country` makes "stores by customer region" come out as 312, 532 and 538:
there are 17 stores. The model's own check reports nothing.

### What "elegant" means here

- **Every number is computed at its own table's grain.** No fan-out reaches an aggregate, so any SQL measure stays
  right. smaltbi measures are arbitrary SQL aggregates; a fix that only works for SUM and COUNT would not do.
- **No new kind of relationship, and no switches.** The model stays tables and many → one relationships. The compiler
  works out from the query what a "many-to-many" needs.
- **Refuse instead of guessing**, as decision 9 does: when a question has two answers, say so.
- **Little or no work for the user.** The common shapes work as soon as their relationships exist.

### What others do, and why not that

- **Power BI:** a many-to-many cardinality and a "both directions" cross-filter switch per relationship. The switch is
  global, so one setting changes every visual. Paths become ambiguous, and its docs warn against the switch. It is a
  setting users have to understand in order to get right numbers.
- **Looker:** symmetric aggregates. It joins freely, then de-duplicates with `SUM(DISTINCT key-hash + value)` tricks.
  This needs primary keys, and works for sum, count and average, not for arbitrary SQL. It is also hard to explain
  when it goes wrong.
- **Tableau:** relationships, each table queried at its own level of detail and the results combined. This is the
  closest to the principles above, and to how smaltbi totals already work. The proposal follows it.

## Proposal

### A. Through a link table

A link table is a table with two or more many → one relationships out, no measures, and no number columns besides
its keys: `product_tags` → `products`, `product_tags` → `tags`. A query may pass through one from either side, where
no plain relationship reaches the table it needs (so links never change a query that works without them). It still
never reaches an aggregate as a fan-out:

- **Grouping by a field beyond the link** (Revenue by tag): join through the link's distinct pairs. Duplicate pairs
  in the file can't double count, and each sale counts once in each of its tags.
  ```sql
  SELECT tags.name, SUM(…) FROM sales
  LEFT JOIN products ON …
  LEFT JOIN (SELECT DISTINCT product_id, tag_id FROM product_tags) AS product_tags ON product_tags.product_id = products.id
  LEFT JOIN tags ON tags.id = product_tags.tag_id
  GROUP BY tags.name
  ```
  - Every group is exact. The groups overlap, as they do in the data.
  - Sales of untagged products are the "(Blank)" group.
- **Filtering by a field beyond the link** (a Tag slicer, a click on a tag): a semi-join, not a join. Rows are never
  multiplied, whatever the visual groups by.
  ```sql
  WHERE products.id IN (SELECT product_id FROM product_tags JOIN tags ON … WHERE tags.name IN ('Organic'))
  ```
  A selection that mixes a field beyond the link with one before it (a tag and a region together) is a correlated
  `EXISTS (…)`.
- **Totals stay exact for free.** Table and matrix totals are already their own queries without the tag. "Organic
  60, Gift 50, total 90" is what the data says.
- **Part-to-whole visuals** (pie, donut, treemap, 100% stacked, waterfall) add their parts in the browser, which
  overstates the whole when categories overlap. When a visual's category comes through a link table, it gets a note:
  "Some rows count under more than one of the tags (linked many-to-many): the parts add up to more than the total".
  A donut leaves out its centre total, which would be the sum of the overlapping slices. Showing the true total there
  needs smaltkit's donut to accept one (a follow-up).
- **Relevant values** (decision 10) work unchanged: a tag slicer under a selection lists the tags of the selected
  rows.
- **Ambiguity** counts paths through links like any other path: two links between the same tables are an error until
  one is inactive.
- **Model view:** a link table is drawn as a link, a small card between the two tables with a ⇄ mark. A pure link
  table is easy to tell from a fact.

**Owner decision 1: how a table becomes a link. Decided: (a), inferred.**

- **(a) Inferred (recommended; chosen):** any table with two or more relationships out and no measures can link. There is
  nothing to set. A fact table has measures, so it never links two dimensions behind the user's back. The model view
  shows which tables link, so it isn't hidden. *As built (step 3):* a link also has no number columns besides its
  keys. Without that rule, a fact table with no measures written yet (a model being built) became a link, and paths
  through it made plain models look ambiguous. A factless fact, such as attendance (student, course, date), is still
  a link.
- **(b) Marked:** a "Link table" switch on the table, which the model view suggests for a table of keys only. This is
  one click, and the intent is explicit. A link table with a measure added later (Tag count) keeps linking.

### B. Two facts, shared dimensions (drill-across)

A visual with measures from more than one fact computes each fact's measures on its own, then lines the results up
on the dimensions:

```sql
WITH f0 AS (SELECT <dims> AS d0…, SUM(sales…) AS m0 FROM sales … GROUP BY …),
     f1 AS (SELECT <dims> AS d0…, SUM(budget…) AS m1 FROM budget … GROUP BY …),
     k  AS (SELECT d0… FROM f0 UNION SELECT d0… FROM f1)
SELECT k.d0…, f0.m0, f1.m1 FROM k LEFT JOIN f0 ON … LEFT JOIN f1 ON …
```

- The dimensions must be **shared**: reachable from every fact in the query, through relationships or links.
- Filters apply to each fact they can reach. A filter that can't reach one fact is listed as "not applied to Target",
  as filters that can't reach the query are today.
- Totals, sorting, Top N, cross-filtering and Repeat for each work through the same query shape.
- A measure that combines facts (`[Revenue] / [Target]`) is computed after the line-up, from the two aggregates. This
  is the main reason to do B: "% of target" is the most common question that runs into many-to-many.
- Nothing changes in the model. B needs no setting at all.

**Owner decision 2: a dimension that only some facts share. Decided: (a), refuse with a message.** (Revenue and
Target by product, with the budget by category only.)

- **(a) Refuse with a message (recommended; chosen):** "Target has no relationship to products.name: use a field both
  share (for example products.category)". This is the same refusal as decision 9, and never a misleading number.
- **(b) Show that measure blank:** the Target cells are empty and there's a note. The visual still draws, but a blank
  column looks like missing data.

### C. Different grain, and the bug

- **First, close the bug.** When the data loads, check each relationship's target column for duplicates: one
  `COUNT(*)` against `COUNT(DISTINCT col)` per relationship, cached with the row counts.
  - The model view marks such a relationship: "products.category is not unique: this relationship would count
    budget rows more than once".
  - Queries that use it are refused with that message.
  - This ships on its own, before the rest.
- **Then, the fix the message offers.** The relationship needs a table where category is unique.

**Owner decision 3: how that table comes about. Decided: (a), "Make a category table".**

- **(a) "Make a category table" (recommended; chosen):** a button in the warning adds a data step,
  `CREATE TABLE category AS SELECT DISTINCT category FROM products`. It also adds the relationships
  `products.category → category.category` and `budget.category → category.category`. This is the same pattern as
  Add date table: one click, a real table, visible in the model and the data steps. After that it's shape B, and
  Revenue against Target by category works.
- **(b) A virtual dimension:** a relationship to a non-unique column is read as "these share the column's values",
  and the compiler makes the distinct table on the fly. There is nothing to click, but the model holds a table no one
  can see, and the warning has to explain a concept instead of offering a fix.

## Not doing (for now)

- **Weighted links:** splitting a joint account's balance 50/50 between its owners. This would be a `weight` column on
  the link, multiplying additive measures. It is easy to add later, and wrong for ratios and distinct counts, so it
  shouldn't be the default.
- **Filter-direction switches per relationship:** the compiler decides per query, which is the point of the proposal.
- **A fact table as a link** ("customers who bought in category X" with a measure on customers): links are inferred
  (decision 1a), and a table with measures doesn't link, so this stays an error, as today.

## Plan

One task per PR, each with tests on the real engine that check results against direct SQL.

| Step | What | User work |
|---|---|---|
| 1 | Non-unique relationship targets: the check on load, the model view mark, and refused queries (the bug in C) | None |
| 2 | Drill-across (B): the query shape, filters per fact, combined measures, decision 2 | None |
| 3 | Link tables (A): grouping and filtering through links, the overlap note, the model view look, decision 1, and tags in the sample | None (1a) or one click (1b) |
| 4 | "Make a table from a column" (C, decision 3a), and a budget in the sample showing Revenue against Target | One click |

To be checked during step 3: time-intelligence measures by a field beyond a link (the date table's query nests the
ordinary one, so it should follow), and a role on a link table.
