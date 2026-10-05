# DrawUp V14 Search Update

- Replaces dead-end search result states with a Research Result fallback.
- Search never claims information is not public merely because DrawUp could not verify it.
- Project result section is labeled Sources, without trusted-source badges.
- If DrawUp has no attached sources, the page provides project/news/image research routes instead of a blank result.
- Search loading language is user-facing and removes debug/system copy.
- Primary brand language updated to “Draw it up. See it through.”
- Portal search prompt updated to “What are you drawing up?”

Note: rich automatic external-source discovery still depends on the deployed `drawup-search` Supabase Edge Function. This frontend update guarantees a useful fallback even when that function returns no result.
