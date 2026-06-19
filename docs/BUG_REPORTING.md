# Bug Reporting in Peh

Peh uses a privacy-respecting bug report flow. When you click
**Report issue**, Peh opens a prefilled email in your mail app.

## Configuration

Set the public bug report address with:

```text
NEXT_PUBLIC_BUG_REPORT_EMAIL=bugs@example.com
```

If the address is not configured, the UI shows that bug reporting is
unavailable instead of sending anywhere.

## What Is Included

The prefilled email can include:

- Product: Peh Public
- version/build when available, otherwise `unknown`
- page or module
- local/cloud mode
- model/provider when available
- browser user agent
- current URL/path
- Tabularium receipt id when reporting from a receipt
- safe receipt fields such as module, action, status, summary, and safe metadata
- blank sections for what happened, what was expected, and steps to reproduce

Users choose what to send and can attach screenshots manually.

## What Is Not Included Automatically

Peh does not attach or upload:

- telemetry
- logs
- browser storage
- raw prompts
- raw document text
- secrets
- image data
- screenshots
- model transcripts

Receipt-based reports include only the receipt id and safe receipt fields. This
helps debug issues without exposing the original content that led to the receipt.

## No Backend Service

Bug reports are email-only in this public pass. There is no backend bug report
service, no account requirement, and no automatic log collection.
