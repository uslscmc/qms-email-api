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

| `event`                   | Email sent                | Recipient                                                                          |
| ------------------------- | ------------------------- | ---------------------------------------------------------------------------------- |
| `assignment`              | "Task Assignment Notice"  | the assignee (`assignee_email`)                                                    |
| `complete` / `completed`  | "Request Completed"       | the requester (`requester_email`), CC the assignee, BCC the QMS mailbox           |
| `decline` / `declined`    | "Request Declined"        | the requester (`requester_email`), CC the assignee, BCC the QMS mailbox           |
| `forgot_password`         | "Password Recovery"       | the client (`email`)                                                               |
| _anything else / omitted_ | "New QMS Request"         | `qms@usls.edu.ph`                                                                  |

Every email shares one layout:

- the **QMS logo** in the header (`QMS_LOGO_URL`)
- a **two-column** details block — left: Requester, Email, Office, Contact;
  right: Desk, Platform, Date Needed
- the **Date Needed** value shown as a burgundy badge (`#800020`)
- a footer linking to **Center for Marketing and Communications** and
  **Privacy Policy**

The **QMS admin console** button is shown only on the two admin-facing emails
(New Request and Task Assigned). Completed, Declined and Password Recovery are
client-facing and have no console button.

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
  "assignee_name": "Staff Name",
  "assignee_email": "staff@usls.edu.ph",
  "classification": "Faculty",
  "contact": "0917...",
  "title": "Poster for Founders Week",
  "patype": 1,
  "platform": ["Facebook"],
  "date": "2026-10-30",
  "message": "Remarks from the assigned staff"
}
```

The requester is the **To** recipient, the assignee is **CC**'d, and the QMS
mailbox is **BCC**'d so CMC keeps a copy. An address that already appears in
`to` is dropped from `cc`/`bcc`, so nobody receives the same message twice.

`"recipients": [...]` is ignored. The `assignment` event sends to
`assignee_email`, `forgot_password` sends to `email`, and the status-update
events send to `requester_email`; every other event goes to the single QMS
mailbox. There is no Reply-To header.

Password recovery payload (client receives their stored password):

```json
{
  "event": "forgot_password",
  "name": "Juan Dela Cruz",
  "email": "juan@usls.edu.ph",
  "password": "the-stored-password"
}
```

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
| `QMS_LOGIN_URL`   | no       | `https://usls.edu.ph/qms/client_auth` | Client sign-in link used in the recovery email |
| `QMS_LOGO_URL`    | no       | `https://usls.edu.ph/qms/assets/img/qms-white.png` | Logo shown in the email header |

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
