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

| `event`                   | Email sent                | Recipient                          |
| ------------------------- | ------------------------- | ---------------------------------- |
| `assignment`              | "Task Assignment Notice"  | the assignee (`assignee_email`)    |
| `complete` / `completed`  | "Request Completed"       | `qms@usls.edu.ph`                  |
| `decline` / `declined`    | "Request Declined"        | `qms@usls.edu.ph`                  |
| _anything else / omitted_ | "New QMS Request"         | `qms@usls.edu.ph`                  |

All four emails share one layout:

- a **two-column** details block — left: Requester, Email, Office, Contact;
  right: Desk, Platform, Date Needed
- the **Date Needed** value shown as a burgundy badge (`#800020`)
- a button linking to the **QMS admin console**
- the USLS CMC footer

`classification` is displayed as **Office** (it holds the office/department/college).

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
  "classification": "Faculty",
  "contact": "0917...",
  "title": "Poster for Founders Week",
  "patype": 1,
  "platform": ["Facebook"],
  "date": "2026-10-30",
  "message": "Remarks from the assigned staff"
}
```

`"recipients": [...]` is ignored. Only the `assignment` event uses an explicit
recipient (`assignee_email`); everything else goes to the single QMS mailbox.
There is no Reply-To header.

## Environment variables

Set these in the Vercel project dashboard (Project → Settings → Environment Variables).

| Variable          | Required | Default          | Notes                                                |
| ----------------- | -------- | ---------------- | ---------------------------------------------------- |
| `SMTP_USER`       | yes      | –                | Gmail sender account, e.g. `qms@usls.edu.ph`         |
| `SMTP_PASS`       | yes      | –                | Gmail **app password** (normal password is rejected) |
| `SMTP_HOST`       | no       | `smtp.gmail.com` | SMTP host                                            |
| `SMTP_PORT`       | no       | `465`            | 465 = implicit TLS, 587 = STARTTLS (auto-detected)   |
| `NOTIFY_TO`       | no       | `SMTP_USER`      | Fallback recipient                                   |
| `QMS_CONSOLE_URL` | no       | `https://usls.edu.ph/qms/index.php/console` | Admin console link used in emails |

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
