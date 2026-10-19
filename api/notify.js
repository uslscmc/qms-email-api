// Vercel serverless function - receives QMS webhooks from the CI4 app and emails
// a notification using Gmail SMTP.
//
// Environment variables to set on Vercel:
//   SMTP_HOST   (default smtp.gmail.com)
//   SMTP_PORT   (default 465; 465 = implicit TLS, 587 = STARTTLS - auto-detected)
//   SMTP_USER   (e.g. qms@usls.edu.ph)
//   SMTP_PASS   (Gmail app password - REQUIRED)
//   NOTIFY_TO   (default recipient; defaults to SMTP_USER)
//   QMS_CONSOLE_URL (admin console link used in emails)

const nodemailer = require("nodemailer");

const CONSOLE_URL =
  process.env.QMS_CONSOLE_URL || "https://usls.edu.ph/qms/index.php/console";

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
      <table role="presentation" width="100%" style="width:100%;border-collapse:collapse">
        <tr>
          <td width="50%" style="width:50%;vertical-align:top;padding-right:14px">${left}</td>
          <td width="50%" style="width:50%;vertical-align:top;padding-left:14px">${right}</td>
        </tr>
      </table>`;
};

const titleBlock = (b) => `
      <div style="border-top:1px solid #e2e8f0;padding-top:16px;margin-top:4px">
        <div style="font-size:11px;font-weight:bold;letter-spacing:.4px;text-transform:uppercase;color:#64748b;margin-bottom:4px">Title</div>
        <h3 style="margin:0;color:#0f172a;font-size:16px;line-height:1.45">${escapeHtml(b.title) || "Untitled"}</h3>
      </div>`;

const messageBlock = (label, html) => `
      <div style="border-top:1px solid #e2e8f0;padding-top:16px;margin-top:16px">
        <div style="font-size:11px;font-weight:bold;letter-spacing:.4px;text-transform:uppercase;color:#64748b;margin-bottom:6px">${label}</div>
        <div style="font-size:13px;color:#0f172a;line-height:1.55">${html || "N/A"}</div>
      </div>`;

const consoleButton = () => `
      <div style="text-align:center;margin:26px 0 6px">
        <a href="${CONSOLE_URL}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-size:13px;font-weight:bold;padding:11px 24px;border-radius:6px">Open QMS Admin Console</a>
      </div>`;

const footer = () => `
      <div style="border-top:1px solid #e2e8f0;background:#f8fafc;padding:14px 28px;margin-top:20px">
        <p style="margin:0 0 4px;font-size:11px;color:#94a3b8;line-height:1.5">&copy; QMS V3 - 2026 &nbsp;&nbsp; University of St. La Salle, La Salle Avenue, Bacolod City 6100, Negros Occidental, Philippines | +63 34 434 6100</p>
        <p style="margin:0;font-size:11px;color:#94a3b8">Center for Marketing and Communications &bull; Privacy Policy</p>
      </div>`;

const textFooter = () =>
  [
    "",
    `Admin Console: ${CONSOLE_URL}`,
    "",
    "\u00A9 QMS V3 - 2026   University of St. La Salle, La Salle Avenue, Bacolod City 6100, Negros Occidental, Philippines | +63 34 434 6100",
    "Center for Marketing and Communications \u2022 Privacy Policy",
  ].join("\n");

// Shared outer shell so all four emails look consistent.
const layout = ({ accent, heading, subheading, greeting, intro, body }) => `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
      <div style="background:${accent};padding:20px 28px">
        <h2 style="margin:0;color:#ffffff;font-size:20px;text-transform:uppercase">${heading}</h2>
        ${subheading ? `<p style="margin:4px 0 0;color:#e2e8f0;font-size:13px">${subheading}</p>` : ""}
      </div>
      <div style="padding:22px 28px 2px">
        <p style="margin:0 0 4px;font-size:15px;color:#0f172a">Hi <strong>${escapeHtml(greeting) || "there"}</strong>,</p>
        <p style="margin:0 0 20px;font-size:13px;color:#334155;line-height:1.55">${intro}</p>
        ${body}
        ${consoleButton()}
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
    textFooter(),
  ].join("\n");

  const html = layout({
    accent: "linear-gradient(90deg,#1d4ed8,#0891b2)",
    heading: "New QMS Request",
    subheading: "A client just submitted an application",
    greeting: b.name,
    intro:
      "A new request has been submitted to the QMS. Please review it in the admin console.",
    body:
      detailsTable(b, "name", "email") +
      titleBlock(b) +
      messageBlock("Message", b.message),
  });

  return sendMail(req, res, {
    subject: `[QMS] New Request - ${b.title || ""} (${b.code || ""})`,
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
    textFooter(),
  ].join("\n");

  const html = layout({
    accent: "linear-gradient(90deg,#1d4ed8,#0891b2)",
    heading: "Task Assignment Notice",
    subheading: "A new QMS request has been assigned to you",
    greeting: b.assignee_name,
    intro:
      "A new QMS request has been assigned to you. Please log in to the QMS console to view the full details and start working on your task.",
    body: detailsTable(b, "name", "email") + titleBlock(b),
  });

  return sendMail(req, res, {
    to: b.assignee_email,
    subject: `[QMS] Task Assigned - ${b.title || ""} (${b.code || ""})`,
    text: emailText,
    html,
  });
};

const renderRequesterUpdate = (req, res, outcome) => {
  const b = req.body || {};
  const isCompleted = outcome === "completed";

  const heading = isCompleted ? "Request Completed" : "Request Declined";
  const accent = isCompleted ? "#15803d" : "#b91c1c";
  const label = isCompleted ? "Remarks" : "Reason";

  const summary = isCompleted
    ? "Good news \u2014 your request has been completed by our team. You may now coordinate with the CMC for the finished output."
    : "We regret to inform you that your request has been declined. Please see the remarks below for the details.";

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

  const html = layout({
    accent,
    heading,
    subheading: "An update on your QMS request",
    greeting: b.requester_name,
    intro: summary,
    body:
      detailsTable(b, "requester_name", "requester_email") +
      titleBlock(b) +
      messageBlock(label, b.message),
  });

  return sendMail(req, res, {
    subject: `[QMS] Request ${isCompleted ? "Completed" : "Declined"} - ${b.title || ""}`,
    text: emailText,
    html,
  });
};

/* ------------------------------------------------------------------ */
/* transport                                                          */
/* ------------------------------------------------------------------ */

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
    // The Task Assigned email is sent to the assignee; every other email goes
    // to the single QMS mailbox.
    const recipients =
      opts.to ||
      process.env.NOTIFY_TO ||
      process.env.SMTP_USER ||
      "qms@usls.edu.ph";

    await transporter.sendMail({
      from: `"QMS Notifications" <${process.env.SMTP_USER}>`,
      to: recipients,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });
    return res
      .status(200)
      .json({ status: "success", message: "Notification sent" });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
};
