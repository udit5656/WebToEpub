# Review memory

The FreeWebNovel parser review and its prioritized findings are in
[doc/FreeWebNovelParserReview.md](doc/FreeWebNovelParserReview.md).

## FreeWebNovel parser update

Updated: 2026-09-21

The existing `FreeWebNovelParser` remains registered for `freewebnovel.com`.
The update fixes the correctness issues identified in the review:

- Paginated TOC fetches now propagate failed or malformed responses instead of
  returning a silently incomplete chapter list.
- Chapter URLs are deduplicated across TOC pages.
- Watermark removal no longer deletes every `p sub` element, preserving
  legitimate subscripts such as `H<sub>2</sub>O`.
- Embedded watermarks are removed by matching normalized text while retaining
  the original surrounding Unicode characters, including markers split over
  inline elements.

Regression coverage in `unitTest/UtestFreeWebNovelParser.js` covers pagination,
deduplication, failed and invalid TOC responses, legitimate subscripts,
compatibility characters, and split watermarks. Parser and test syntax checks
pass with `node --check`.
