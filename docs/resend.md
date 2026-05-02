# Resend Email Integration

This document describes how to use Resend API to retrieve inbound emails, particularly for automated processing of brokerage statements (IBKR, Futu).

## Prerequisites

- Resend API key stored in environment variable: `RESEND_API_KEY`
- Inbound email routing configured at Resend dashboard
- Email addresses configured:
  - `ibkr@orkeustoig.resend.app` - For IBKR statements
  - `mario@orkeustoig.resend.app` - For Futu statements
  - `admin@orkeustoig.resend.app` - For general receipts

## API Endpoints

Base URL: `https://api.resend.com`

### List Received Emails

Retrieves all emails received in the inbox.

```bash
curl -X GET 'https://api.resend.com/emails/receiving' \
  -H "Authorization: Bearer $RESEND_API_KEY"
```

**Response fields:**
- `id` - Unique email ID
- `to` - Recipient email address
- `from` - Sender email address
- `subject` - Email subject
- `created_at` - Timestamp when email was received
- `attachments` - Array of attachment objects with:
  - `id` - Attachment ID
  - `filename` - Original filename
  - `content_type` - MIME type
  - `size` - File size in bytes

**Example response:**
```json
{
  "object": "list",
  "has_more": false,
  "data": [
    {
      "id": "12138525-4def-43d5-9ea4-afb0983fdd45",
      "to": ["ibkr@orkeustoig.resend.app"],
      "from": "cnfankai@gmail.com",
      "created_at": "2026-05-02 23:13:06.182985+00",
      "subject": "Fwd: Monthly Activity Statement for April 2026",
      "attachments": [
        {
          "filename": "ActivityStatement.202604.pdf",
          "content_type": "application/pdf",
          "id": "975fd36d-42b1-4342-8465-1c720f3cd692",
          "size": 57626
        }
      ]
    }
  ]
}
```

### Get Attachment Metadata

Retrieves attachment metadata including a temporary download URL.

```bash
curl -X GET "https://api.resend.com/emails/receiving/{email_id}/attachments/{attachment_id}" \
  -H "Authorization: Bearer $RESEND_API_KEY"
```

**Response includes:**
- `download_url` - Temporary signed URL valid for ~24 hours
- `expires_at` - Download URL expiration timestamp
- All attachment metadata

**Example:**
```bash
curl -X GET "https://api.resend.com/emails/receiving/12138525-4def-43d5-9ea4-afb0983fdd45/attachments/975fd36d-42b1-4342-8465-1c720f3cd692" \
  -H "Authorization: Bearer $RESEND_API_KEY"
```

### Download Attachment

Use the `download_url` from the metadata response to download the actual file:

```bash
curl -L "{download_url}" -o output_file.pdf
```

## Complete Workflow Example

### 1. List all emails and parse with jq

```bash
curl -X GET 'https://api.resend.com/emails/receiving' \
  -H "Authorization: Bearer $RESEND_API_KEY" | jq
```

### 2. Filter specific emails (e.g., IBKR statements)

```bash
curl -X GET 'https://api.resend.com/emails/receiving' \
  -H "Authorization: Bearer $RESEND_API_KEY" | \
  jq '.data[] | select(.to[] | contains("ibkr@"))'
```

### 3. Download attachment in one command

Combine metadata fetch and download:

```bash
EMAIL_ID="12138525-4def-43d5-9ea4-afb0983fdd45"
ATTACHMENT_ID="975fd36d-42b1-4342-8465-1c720f3cd692"

curl -X GET "https://api.resend.com/emails/receiving/${EMAIL_ID}/attachments/${ATTACHMENT_ID}" \
  -H "Authorization: Bearer $RESEND_API_KEY" | \
  jq -r .download_url | \
  xargs curl -L -o ibkr_statement.pdf
```

### 4. Extract text from PDF

```bash
pdftotext ibkr_statement.pdf -
```

Or read in code:
```bash
# Requires poppler-utils: brew install poppler
pdftotext statement.pdf statement.txt
cat statement.txt
```

## Real-World Examples

### Example 1: Download IBKR April 2026 Statement

```bash
# Step 1: Get email list and identify the statement
curl -X GET 'https://api.resend.com/emails/receiving' \
  -H "Authorization: Bearer $RESEND_API_KEY" | \
  jq '.data[] | select(.subject | contains("Monthly Activity Statement for April 2026"))'

# Output:
# {
#   "id": "12138525-4def-43d5-9ea4-afb0983fdd45",
#   "to": ["ibkr@orkeustoig.resend.app"],
#   "attachments": [
#     {
#       "id": "975fd36d-42b1-4342-8465-1c720f3cd692",
#       "filename": "ActivityStatement.202604.pdf",
#       "size": 57626
#     }
#   ]
# }

# Step 2: Download the attachment
curl -X GET "https://api.resend.com/emails/receiving/12138525-4def-43d5-9ea4-afb0983fdd45/attachments/975fd36d-42b1-4342-8465-1c720f3cd692" \
  -H "Authorization: Bearer $RESEND_API_KEY" | \
  jq -r .download_url | \
  xargs curl -L -o ~/Downloads/ibkr_statement_202604.pdf

# Step 3: Verify download
file ~/Downloads/ibkr_statement_202604.pdf
# Output: PDF document, version 1.4, 16 pages

# Step 4: Extract text
pdftotext ~/Downloads/ibkr_statement_202604.pdf -
```

### Example 2: Download Futu Statement

```bash
# List Futu emails
curl -X GET 'https://api.resend.com/emails/receiving' \
  -H "Authorization: Bearer $RESEND_API_KEY" | \
  jq '.data[] | select(.to[] | contains("mario@"))'

# Download Futu monthly statement
EMAIL_ID="0f9ebdfd-7152-4bfd-bbb7-157b0cd54a20"
ATTACHMENT_ID="85a2804b-7a47-48fc-8a0b-8f5d45d0ad75"

curl -X GET "https://api.resend.com/emails/receiving/${EMAIL_ID}/attachments/${ATTACHMENT_ID}" \
  -H "Authorization: Bearer $RESEND_API_KEY" | \
  jq -r .download_url | \
  xargs curl -L -o ~/Downloads/futu_statement_202604.pdf

pdftotext ~/Downloads/futu_statement_202604.pdf -
```

## Automated Processing Pipeline

For future automation, the workflow would be:

1. **Poll for new emails** (daily cron job):
   - Fetch emails received since last check
   - Filter by sender/subject patterns
   - Store email metadata in database

2. **Download attachments**:
   - For each new statement email
   - Download PDF to temporary location
   - Extract text/data from PDF

3. **Parse and import data**:
   - For IBKR: Parse trades, dividends, cash transactions
   - For Futu: Parse trades and cash flows
   - Use existing import endpoints to write to database

4. **Clean up**:
   - Delete temporary files
   - Mark email as processed in database

## API Rate Limits

- Resend has rate limits on API calls
- Download URLs expire after ~24 hours
- Store processed email IDs to avoid re-processing

## Security Notes

- `RESEND_API_KEY` must be kept secure
- Download URLs are temporary and signed
- Do not commit API keys to version control
- Use environment variables or secrets management

## Testing

Test the integration manually:

```bash
# List all emails
curl -X GET 'https://api.resend.com/emails/receiving' \
  -H "Authorization: Bearer $RESEND_API_KEY" | jq '.data | length'

# Count by recipient
curl -X GET 'https://api.resend.com/emails/receiving' \
  -H "Authorization: Bearer $RESEND_API_KEY" | \
  jq '.data | group_by(.to[0]) | map({to: .[0].to[0], count: length})'
```

## References

- [Resend API Documentation](https://resend.com/docs/api-reference/emails/list-received-emails)
- [Resend Inbound Email Guide](https://resend.com/docs/dashboard/emails/inbound-emails)
