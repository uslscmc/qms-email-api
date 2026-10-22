// Vercel serverless function - receives QMS webhooks from the CI4 app and emails
// a notification using Gmail SMTP.
//
// Environment variables to set on Vercel:
//   SMTP_HOST   (default smtp.gmail.com)
//   SMTP_PORT   (default 465; 465 = implicit TLS, 587 = STARTTLS - auto-detected)
//   SMTP_USER   (e.g. qms@usls.edu.ph)
//   SMTP_PASS   (Gmail app password - REQUIRED)
//   NOTIFY_TO   (default recipient; defaults to SMTP_USER)
//   QMS_CONSOLE_URL (admin console link used in admin emails)
//   QMS_LOGIN_URL   (client sign-in link used in the recovery email)
//   QMS_LOGO_URL    (logo shown in the email header)

const nodemailer = require("nodemailer");

const CONSOLE_URL =
  process.env.QMS_CONSOLE_URL || "https://usls.edu.ph/qms/index.php/console";
const LOGIN_URL =
  process.env.QMS_LOGIN_URL || "https://usls.edu.ph/qms/client_auth";
const LOGO_URL =
  process.env.QMS_LOGO_URL || "https://usls.edu.ph/qms/assets/img/qms-white.png";

const CMC_URL = "https://www.usls.edu.ph/cmc";
const PRIVACY_URL = "https://www.usls.edu.ph/privacy-policy";

// Burgundy used for the "Date Needed" badge.
const BURGUNDY = "#800020";

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ status: "error", message: "Method not allowed" });
  }

  const b = req.body || {};
  const event = String(b.event || "").toLowerCase();

  if (event === "assignment") {
    return renderAssignment(req, res);
  }

  // The CI4 app sends event "complete" or "decline" (see Dashboard::notifyRequester)
  if (event === "complete" || event === "completed") {
    return renderRequesterUpdate(req, res, "completed");
  }

  if (event === "decline" || event === "declined") {
    return renderRequesterUpdate(req, res, "declined");
  }

  // Password recovery request from the client sign-in page
  // (see Authentication::recovery)
  if (
    event === "forgot_password" ||
    event === "forgot-password" ||
    event === "recovery" ||
    event === "password_recovery"
  ) {
    return renderForgotPassword(req, res);
  }

  return renderNewRequest(req, res);
};

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

const typeLabel = (b) =>
  b.patype == 1
    ? "Project Request Desk"
    : b.patype == 2
      ? "Project Approval Desk"
      : "Online Content Desk";

const stripHtml = (html) =>
  String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const escapeHtml = (value) =>
  String(value === undefined || value === null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const formatDate = (d) => {
  if (!d) return "N/A";
  const [y, m, day] = String(d).split("-").map(Number);
  if (!y || !m || !day) return String(d);
  return `${MONTHS[m - 1]} ${day}, ${y}`;
};

// Small rounded tag used for platform values.
const badge = (label) =>
  `<span style="display:inline-block;background:#e0f2fe;color:#0369a1;border:1px solid #bae6fd;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:600;margin:2px 4px 2px 0">${label}</span>`;

// Burgundy badge used for the "Date Needed" value.
const dateBadge = (d) =>
  `<span style="display:inline-block;background:${BURGUNDY};color:#ffffff;border-radius:999px;padding:3px 12px;font-size:12px;font-weight:700">${formatDate(d)}</span>`;

// One "LABEL / value" block inside a column.
const field = (label, value) => `
        <div style="margin:0 0 14px">
          <div style="font-size:11px;font-weight:bold;letter-spacing:.4px;text-transform:uppercase;color:#64748b">${label}</div>
          <div style="font-size:13px;color:#0f172a;line-height:1.45">${value || "N/A"}</div>
        </div>`;

// Two-column details block:
//   left  -> Requester, Email, Office, Contact
//   right -> Desk, Platform, Date Needed (burgundy badge)
const detailsTable = (b, nameKey, emailKey) => {
  const left = [
    field("Requester", escapeHtml(b[nameKey]) || "N/A"),
    field("Email", escapeHtml(b[emailKey]) || "N/A"),
    field("Office", escapeHtml(b.classification) || "N/A"),
    field("Contact", escapeHtml(b.contact) || "N/A"),
  ].join("");

  const right = [
    field("Desk", escapeHtml(typeLabel(b))),
    field(
      "Platform",
      (b.platform || []).map((p) => badge(escapeHtml(p))).join("") || "N/A",
    ),
    field("Date Needed", dateBadge(b.date)),
  ].join("");

  return `
      <table role="presentation" width="100%" style="width:100%;border-collapse:separate">
        <tr>
          <td width="50%" style="width:50%;vertical-align:top;padding-right:8px">
            <div style="background:#f8fafc;border:1px solid #eef2f7;border-radius:8px;padding:16px 16px 4px">${left}</div>
          </td>
          <td width="50%" style="width:50%;vertical-align:top;padding-left:8px">
            <div style="background:#f8fafc;border:1px solid #eef2f7;border-radius:8px;padding:16px 16px 4px">${right}</div>
          </td>
        </tr>
      </table>`;
};

const titleBlock = (b) => `
      <div style="border-top:1px solid #e2e8f0;padding-top:16px;margin-top:16px">
        <div style="font-size:11px;font-weight:bold;letter-spacing:.4px;text-transform:uppercase;color:#64748b;margin-bottom:4px">Title</div>
        <h3 style="margin:0;color:#0f172a;font-size:16px;line-height:1.45">${escapeHtml(b.title) || "Untitled"}</h3>
      </div>`;

const messageBlock = (label, html) => `
      <div style="border-top:1px solid #e2e8f0;padding-top:16px;margin-top:16px">
        <div style="font-size:11px;font-weight:bold;letter-spacing:.4px;text-transform:uppercase;color:#64748b;margin-bottom:6px">${label}</div>
        <div style="font-size:13px;color:#0f172a;line-height:1.55">${html || "N/A"}</div>
      </div>`;

// Admin-only call to action. Shown only on the admin-facing emails
// (New Request and Task Assigned), never on client-facing ones.
const consoleButton = () => `
      <div style="text-align:center;margin:26px 0 6px">
        <a href="${CONSOLE_URL}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-size:13px;font-weight:bold;padding:11px 24px;border-radius:6px">Open QMS Admin Console</a>
      </div>`;

const loginButton = () => `
      <div style="text-align:center;margin:22px 0 6px">
        <a href="${LOGIN_URL}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-size:13px;font-weight:bold;padding:11px 24px;border-radius:6px">Sign In to QMS</a>
      </div>`;

const footer = () => `
      <div style="border-top:1px solid #e2e8f0;background:#f8fafc;padding:14px 28px;margin-top:20px;text-align:center">
        <p style="margin:0 0 2px;font-size:11px;color:#94a3b8;line-height:1.5">&copy; QMS V3 - 2026</p>
        <p style="margin:0;font-size:11px;color:#94a3b8">
          <a href="${CMC_URL}" style="color:#1d4ed8;text-decoration:none">Center for Marketing and Communications</a>
          <span style="color:#cbd5e1"> &bull; </span>
          <a href="${PRIVACY_URL}" style="color:#1d4ed8;text-decoration:none">Privacy Policy</a>
        </p>
      </div>`;

const textFooter = () =>
  [
    "",
    "Center for Marketing and Communications: " + CMC_URL,
    "Privacy Policy: " + PRIVACY_URL,
    "",
    "\u00A9 QMS V3 - 2026",
  ].join("\n");

// Shared outer shell so all emails look consistent. The QMS logo sits on top of
// the coloured header. `admin` controls the console button.
const layout = ({ accent, heading, subheading, greeting, intro, body, admin = false }) => `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
      <div style="background:${accent};padding:22px 28px;text-align:center">
        <img src="${LOGO_URL}" alt="QMS" width="200" style="display:block;margin:0 auto 14px;width:200px;max-width:200px;height:auto;border:0" />
        <h2 style="margin:0;color:#ffffff;font-size:20px;text-transform:uppercase">${heading}</h2>
        ${subheading ? `<p style="margin:4px 0 0;color:rgba(255,255,255,.85);font-size:13px">${subheading}</p>` : ""}
      </div>
      <div style="padding:22px 28px 2px">
        <p style="margin:0 0 4px;font-size:15px;color:#0f172a">Hi <strong>${escapeHtml(greeting) || "there"}</strong>,</p>
        <p style="margin:0 0 20px;font-size:13px;color:#334155;line-height:1.55">${intro}</p>
        ${body}
        ${admin ? consoleButton() : ""}
      </div>
      ${footer()}
    </div>`;

/* ------------------------------------------------------------------ */
/* templates                                                          */
/* ------------------------------------------------------------------ */

const renderNewRequest = (req, res) => {
  const b = req.body || {};

  const emailText = [
    `A new request has been submitted to the QMS.`,
    ``,
    `Requester       : ${b.name || "N/A"}`,
    `Email           : ${b.email || "N/A"}`,
    `Office          : ${b.classification || "N/A"}`,
    `Contact         : ${b.contact || "N/A"}`,
    `Desk            : ${typeLabel(b)}`,
    `Platform        : ${(b.platform || []).join(", ") || "N/A"}`,
    `Date Needed     : ${formatDate(b.date)}`,
    ``,
    `Title:`,
    `${b.title || "N/A"}`,
    ``,
    `Message:`,
    `${stripHtml(b.message) || "N/A"}`,
    ``,
    `Admin Console: ${CONSOLE_URL}`,
    textFooter(),
  ].join("\n");

  const html = layout({
    accent: "linear-gradient(90deg,#1d4ed8,#0891b2)",
    heading: "New QMS Request",
    subheading: "A client just submitted an application",
    greeting: b.name,
    intro:
      "A new request has been submitted to the QMS. Please review it in the admin console.",
    admin: true,
    body:
      detailsTable(b, "name", "email") +
      titleBlock(b) +
      messageBlock("Message", b.message),
  });

  return sendMail(req, res, {
    subject: `[QMS] New Request - ${b.title || ""}`,
    text: emailText,
    html,
  });
};

const renderAssignment = (req, res) => {
  const b = req.body || {};

  const emailText = [
    `TASK ASSIGNMENT NOTICE`,
    ``,
    `Hi ${b.assignee_name || "there"},`,
    ``,
    `A new QMS request has been assigned to you. Please log in to the QMS console to view the full details and start working on your task.`,
    ``,
    `Requester       : ${b.name || "N/A"}`,
    `Email           : ${b.email || "N/A"}`,
    `Office          : ${b.classification || "N/A"}`,
    `Contact         : ${b.contact || "N/A"}`,
    `Desk            : ${typeLabel(b)}`,
    `Platform        : ${(b.platform || []).join(", ") || "N/A"}`,
    `Date Needed     : ${formatDate(b.date)}`,
    ``,
    `Title:`,
    `${b.title || "N/A"}`,
    ``,
    `Admin Console: ${CONSOLE_URL}`,
    textFooter(),
  ].join("\n");

  const html = layout({
    accent: "linear-gradient(90deg,#1d4ed8,#0891b2)",
    heading: "Task Assignment Notice",
    subheading: "A new QMS request has been assigned to you",
    greeting: b.assignee_name,
    intro:
      "A new QMS request has been assigned to you. Please log in to the QMS console to view the full details and start working on your task.",
    admin: true,
    body: detailsTable(b, "name", "email") + titleBlock(b),
  });

  return sendMail(req, res, {
    to: b.assignee_email,
    subject: `[QMS] Task Assigned - ${b.title || ""}`,
    text: emailText,
    html,
  });
};

const renderRequesterUpdate = (req, res, outcome) => {
  const b = req.body || {};
  const isCompleted = outcome === "completed";

  const heading = isCompleted ? "Request Completed" : "Request Declined";
  const accent = isCompleted ? "#15803d" : "linear-gradient(90deg,#5c0016,#800020)";
  const label = isCompleted ? "Remarks" : "Reason";

  const summary = isCompleted
    ? "Good news! Your request has been completed. For any clarifications & inquiries, please contact us at Local 146."
    : "We regret to inform you that your request has been declined. Please refer to the remarks below for details. For any inquiries or clarifications, please contact the CMC at Local 146.\nThank you.";

  const emailText = [
    isCompleted ? "REQUEST COMPLETED" : "REQUEST DECLINED",
    ``,
    `Hi ${b.requester_name || "there"},`,
    ``,
    summary,
    ``,
    `Requester       : ${b.requester_name || "N/A"}`,
    `Email           : ${b.requester_email || "N/A"}`,
    `Office          : ${b.classification || "N/A"}`,
    `Contact         : ${b.contact || "N/A"}`,
    `Desk            : ${typeLabel(b)}`,
    `Platform        : ${(b.platform || []).join(", ") || "N/A"}`,
    `Date Needed     : ${formatDate(b.date)}`,
    ``,
    `Title:`,
    `${b.title || "N/A"}`,
    ``,
    `${label}:`,
    `${stripHtml(b.message) || "N/A"}`,
    textFooter(),
  ].join("\n");

  // Client-facing: no admin console button.
  const html = layout({
    accent,
    heading,
    subheading: "An update on your QMS request",
    greeting: b.requester_name,
    intro: escapeHtml(summary).replace(/\n/g, "<br>"),
    body:
      detailsTable(b, "requester_name", "requester_email") +
      titleBlock(b) +
      messageBlock(label, b.message),
  });

  return sendMail(req, res, {
    // The client who submitted the request is the primary recipient. The
    // staff member assigned to the task is BCC'd (not CC'd) so the client
    // cannot see who handled their request, and CMC keeps a blind copy of
    // every status update on the QMS mailbox.
    to: b.requester_email,
    bcc: [b.assignee_email, process.env.NOTIFY_TO || process.env.SMTP_USER],
    subject: `[QMS] Request ${isCompleted ? "Completed" : "Declined"} - ${b.title || ""}`,
    text: emailText,
    html,
  });
};

const renderForgotPassword = (req, res) => {
  const b = req.body || {};

  const summary =
    "You requested your QMS sign-in details. Please use the password provided below to access your account.\nThank you.";

  const emailText = [
    "PASSWORD RECOVERY",
    "",
    `Hi ${b.name || "there"},`,
    "",
    summary,
    "",
    `Email    : ${b.email || "N/A"}`,
    `Password : ${b.password || "N/A"}`,
    "",
    `Sign in: ${LOGIN_URL}`,
    "",
    "For your security, please change your password after signing in.",
    textFooter(),
  ].join("\n");

  // Client-facing: no admin console button.
  const html = layout({
    accent: "linear-gradient(90deg,#1d4ed8,#0891b2)",
    heading: "Password Recovery",
    subheading: "Your QMS sign-in details",
    greeting: b.name,
    intro: escapeHtml(summary).replace(/\n/g, "<br>"),
    body: `
      <div style="border-top:1px solid #e2e8f0;padding-top:16px">
        ${field("Email", escapeHtml(b.email) || "N/A")}
        <div style="border:1px dashed #cbd5e1;background:#f8fafc;border-radius:8px;padding:12px 16px">
          <div style="font-size:11px;font-weight:bold;letter-spacing:.4px;text-transform:uppercase;color:#64748b">Password</div>
          <div style="font-size:16px;font-family:'Courier New',Courier,monospace;color:#0f172a;font-weight:bold;word-break:break-all">${escapeHtml(b.password) || "N/A"}</div>
        </div>
      </div>
      ${loginButton()}
      <p style="margin:14px 0 0;font-size:12px;color:#64748b">For your security, please change your password after signing in.</p>`,
  });

  return sendMail(req, res, {
    to: b.email,
    subject: "[QMS] Password Recovery",
    text: emailText,
    html,
  });
};

/* ------------------------------------------------------------------ */
/* transport                                                          */
/* ------------------------------------------------------------------ */

// Normalise a recipient value into a flat list of trimmed addresses.
// Accepts a string ("a@x, b@x"), an array, or a single address. Empty and
// null/undefined entries are dropped, so a missing field never turns into a
// literal "undefined" address in the header.
const normalizeList = (value) =>
  []
    .concat(value || [])
    .filter((v) => v !== null && v !== undefined)
    .flatMap((v) => String(v).split(","))
    .map((v) => v.trim())
    .filter((v) => v !== "" && v !== "undefined" && v !== "null");

const sendMail = async (req, res, opts) => {
  // Port 465 uses implicit TLS (secure: true). Ports 587/25 use STARTTLS
  // (secure: false) and are upgraded automatically by nodemailer. Deriving
  // `secure` from the port avoids the "wrong version number" TLS error that
  // happens when SMTP_PORT is 587 but secure is forced to true.
  const port = Number(process.env.SMTP_PORT || 465);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  try {
    // The Task Assigned email goes to the assignee and the Password Recovery
    // email goes to the client; every other email goes to the single QMS
    // mailbox.
    const recipients =
      opts.to ||
      process.env.NOTIFY_TO ||
      process.env.SMTP_USER ||
      "qms@usls.edu.ph";

    // An address already in the To list is dropped, otherwise nodemailer would
    // deliver the same message twice to that person.
    const toList = normalizeList(recipients).map((a) => a.toLowerCase());
    const ccList = normalizeList(opts.cc)
      .map((a) => a.toLowerCase())
      .filter((a) => !toList.includes(a));
    const bccList = normalizeList(opts.bcc)
      .map((a) => a.toLowerCase())
      .filter((a) => !toList.includes(a) && !ccList.includes(a));

    const mail = {
      from: `"QMS Notifications" <${process.env.SMTP_USER}>`,
      to: recipients,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    };

    if (ccList.length) {
      mail.cc = ccList.join(", ");
    }
    if (bccList.length) {
      mail.bcc = bccList.join(", ");
    }

    await transporter.sendMail(mail);
    return res
      .status(200)
      .json({ status: "success", message: "Notification sent" });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
};
