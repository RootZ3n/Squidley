# Archivum and More Input in Peh

Archivum is Peh's local knowledge shelf. In public v0.1, it stores notes,
snippets, and pasted documents in this browser only.

More Input is the friendly "bring something in" flow inside Archivum. For now,
it is manual paste only.

## What You Can Do

- Paste text into More Input.
- Add an optional title.
- Choose a simple type: note, log, article, code, or other.
- Add simple local tags.
- Optionally review the text in Velum first.
- Save the text to local Archivum.
- Search and filter saved entries.
- View, edit, export, or delete individual entries.
- Export or import an explicit local Archivum bundle.
- Save analysis text from Oculus.
- Save single-file suggestion text from Fabrica.

## Guided Tour

Archivum includes a beginner-friendly in-page tour. Use **Restart tour** on
`/archivum` to walk through:

- what Archivum is
- the More Input title, type, and paste fields
- Velum review before saving
- explicit Save to Archivum behavior
- local-only storage
- saved entry badges
- entry details, edit, export, and delete controls

The tour is instructional only. It does not save, upload, or send text.

## Local Storage

Archivum uses versioned browser `localStorage`:

```text
peh.archivum.entries.v1
```

Each entry stores:

- title
- type
- source, such as manual paste, Oculus analysis, or Fabrica suggestion
- tags
- text
- created and updated timestamps
- `source: manual-paste`
- `localOnly: true`
- `cloudUsed: false`
- Velum reviewed/unreviewed metadata

If local storage is corrupt or unsupported, Peh starts with an empty
Archivum instead of crashing.

## Search and Filters

Archivum search is client-side only. It checks saved entry titles, types, and
tags, and text content already stored in this browser.

Filters are also local:

- type: all, note, log, article, code snippet, or other
- Velum status: all, reviewed, or unreviewed
- tag: any tag currently used by saved entries

No model, server, vector database, embeddings, or retrieval system is used.

## Tags

Tags are simple labels you can add when creating or editing an entry. Separate
tags with commas:

```text
troubleshooting, notes, project
```

Peh trims tags, removes duplicates on the same entry, and keeps a small
limit on tag count and tag length. Tags stay local and help you find entries
later. Changing only tags does not reset Velum review status.

## Velum Review

Velum review is optional but recommended. More Input can send a draft to Velum
through browser `sessionStorage`; the text is not placed in the URL.

Velum can return a redacted preview to More Input. Returning from Velum does not
save automatically. You must explicitly click **Save to Archivum**.

If you save without Velum review, Archivum marks the entry as unreviewed and
shows a gentle note.

## Oculus Analysis Entries

Oculus can save image analysis text as an Archivum entry. The entry source is
shown as **Oculus analysis**. Only the analysis text is stored; the original
image, image base64, object URLs, and image bytes are not stored in Archivum.

Oculus analysis entries are not automatically Velum-reviewed.

## Fabrica Suggestion Entries

Fabrica can save generated suggestion text as an Archivum note. The entry source
is shown as **Fabrica suggestion**. Only the suggestion text is stored; Peh
does not write a file to disk or treat the entry as executable.

Fabrica suggestion entries are not automatically Velum-reviewed.

## Editing Entries

You can edit an entry's title, type, and text from its details view. Editing is
client-side and requires **Save Changes**. Typing in edit mode does not
auto-save.

If edited text changes, Archivum resets the Velum reviewed status because the
review applied to the older text. Peh shows:

```text
Because this text changed, Velum review status was reset.
```

You can send edited text to Velum again with **Review edited text in Velum**.
When Velum returns a redacted preview, the edit draft is filled locally and
still waits for **Save Changes**.

## Export All and Import Bundle

**Export All** creates a client-side JSON bundle with:

```text
Peh Public Archivum Bundle
schemaVersion
exportedAt
entryCount
localOnly: true
cloudUsed: false
```

The bundle includes entries, tags, and Velum metadata. Nothing is uploaded.

**Import Bundle** accepts only a matching Peh Public Archivum Bundle JSON
file. Peh validates the file locally and shows a preview before import:

- entry count
- exportedAt
- sample titles

You must explicitly confirm the import. Imported content is treated as plain
text and is never executed. Peh does not call Velum automatically during
import, and shows:

```text
Imported entries were not automatically reviewed by Velum.
```

If an imported entry id already exists, Peh generates a new local id for
the imported copy instead of overwriting the existing entry.

## Export and Delete

Export creates a local `.txt` file with:

```text
Peh Public Archivum Export
exportedAt
localOnly: true
cloudUsed: false
```

Delete removes one entry from this browser after confirmation:

```text
This only deletes the entry saved in this browser.
```

## What This Does Not Do Yet

- No cloud sync.
- No accounts.
- No backend database.
- No vector database.
- No embeddings.
- No RAG.
- No retrieval.
- No file watching.
- No automatic saves.
- No model calls from Archivum or More Input.
