# QMS Email API

Vercel serverless function that sends QMS notification emails over Gmail SMTP.
It is the mail backend for the **QMS (Queue Management System)** at USLS CMC.

The CodeIgniter app posts JSON to this endpoint; this function renders the email
and relays it through Gmail.

```
QMS (CodeIgniter)                      Vercel                    Gmail SMTP
────────────────                      ──────                    ──────────
notifyNewRequest()        ─┐
notifyAssignedTask()      ─┼─ POST JSON ─► /api/notify ─► sendMail() ─► 📧
notifyRequester()         ─┘
```

## Endpoint

```
POST https://<your-vercel-domain>/api/notify
Content-Type: application/json
```

### Events

All notifications are delivered to the single QMS mailbox
(`qms@usls.edu.ph`) — this function never sends to clients, staff, or admins
directly. The Gmail account that sends the mail is the same mailbox that
receives it.

| `event`                   | Email sent                     |
| ------------------------- | ------------------------------ |
| `assignment`              | "Task Assignment Notice"       |
| `complete` / `completed`  | "Request Completed"            |
| `decline` / `declined`    | "Request Declined"             |
| _anything else / omitted_ | "New QMS Request"              |

### Example payload

```json
{
  "event": "assignment",
  "code": "QMS-2026-0001",
  "name": "Juan Dela Cruz",
  "email": "juan@usls.edu.ph",
  "classification": "Faculty",
  "contact": "0917...",
  "title": "Poster for Founders Week",
  "patype": 1,
  "platform": ["Facebook", "Instagram"],
  "date": "2026-10-30",
  "message": "Please make a poster...",
  "assignee_name": "Staff Name",
  "assignee_email": "staff@usls.edu.ph"
}
```

For a status update, send `event` of `complete`/`decline` with the requester
fields instead:

```json
{
  "event": "complete",
  "requester_name": "Juan Dela Cruz",
  "requester_email": "juan@usls.edu.ph",
  "title": "Poster for Founders Week",
  "patype": 1,
  "platform": ["Facebook"],
  "date": "2026-10-30",
  "message": "Remarks from the assigned staff"
}
```

Optional `"recipients": ["a@x.com"]` is ignored — every notification goes to the
single QMS mailbox. `email` is used only as the reply-to address.

## Environment variables

Set these in the Vercel project dashboard (Project → Settings → Environment Variables).

| Variable    | Required | Default          | Notes                                              |
| ----------- | -------- | ---------------- | -------------------------------------------------- |
| `SMTP_USER` | yes      | –                | Gmail sender account, e.g. `qms@usls.edu.ph`       |
| `SMTP_PASS` | yes      | –                | Gmail **app password** (normal password is rejected) |
| `SMTP_HOST` | no       | `smtp.gmail.com` | SMTP host                                          |
| `SMTP_PORT` | no       | `465`            | SMTP port (SSL)                                    |
| `NOTIFY_TO` | no       | `SMTP_USER`      | Fallback recipient                                 |

## Deploy

```bash
npm i -g vercel
vercel link       # link to the uslscmc Vercel project
vercel --prod     # deploy
```

`vercel.json` registers `api/notify.js` with a 10s max duration.

## Connect it to the QMS app

In the QMS CodeIgniter app's `.env`, point `qms.notifyUrl` at the deployed endpoint:

```
qms.notifyUrl = https://<your-vercel-domain>/api/notify
```
