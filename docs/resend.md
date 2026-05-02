# Resend Email Integration

This document describes how to use Resend API to retrieve inbound emails for automated processing of brokerage statements.

## Prerequisites

- Resend API key stored in environment variable: `RESEND_API_KEY`
- Inbound email routing configured at Resend dashboard

## API Usage

### List Received Emails

```bash
curl -X GET 'https://api.resend.com/emails/receiving' \
  -H "Authorization: Bearer $RESEND_API_KEY"
```

### Get Attachment Download URL

```bash
curl -X GET "https://api.resend.com/emails/receiving/{email_id}/attachments/{attachment_id}" \
  -H "Authorization: Bearer $RESEND_API_KEY" | jq -r .download_url
```

### Download Attachment

```bash
EMAIL_ID="xxx"
ATTACHMENT_ID="yyy"

curl -X GET "https://api.resend.com/emails/receiving/${EMAIL_ID}/attachments/${ATTACHMENT_ID}" \
  -H "Authorization: Bearer $RESEND_API_KEY" | \
  jq -r .download_url | \
  xargs curl -L -o statement.pdf
```

### Extract Text from PDF

```bash
# Requires: brew install poppler
pdftotext statement.pdf -
```

## Workflow

1. List emails and filter by subject/sender
2. Extract email ID and attachment ID from response
3. Download attachment via temporary signed URL
4. Extract and parse PDF content
5. Import data via existing API endpoints

## Security Notes

- API key must be kept secure
- Download URLs expire after ~24 hours
- Never commit credentials to version control

## References

- [Resend API Documentation](https://resend.com/docs/api-reference/emails/list-received-emails)
