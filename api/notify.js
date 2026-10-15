// Vercel serverless function - receives new QMS request webhooks from the CI4 app
// and emails a notification using Gmail SMTP.
//
// Environment variables to set on Vercel:
//   SMTP_HOST   (default smtp.gmail.com)
//   SMTP_PORT   (default 465)
//   SMTP_USER   (e.g. qms@usls.edu.ph)
//   SMTP_PASS   (Gmail app password - REQUIRED, normal password will be rejected by Gmail)
//   NOTIFY_TO   (who receives the notification email; defaults to SMTP_USER)

const nodemailer = require("nodemailer");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ status: "error", message: "Method not allowed" });
  }

  const b = req.body || {};

  if (b.event === "assignment") {
    return renderAssignment(req, res);
  }

  return renderNewRequest(req, res);
};

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

const badge = (label) =>
  `<span style="display:inline-block;background:#e0f2fe;color:#0369a1;border:1px solid #bae6fd;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:600;margin:2px 4px 2px 0">${label}</span>`;

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
    `Classification  : ${b.classification || "N/A"}`,
    `Contact         : ${b.contact || "N/A"}`,
    `Desk            : ${typeLabel(b)}`,
    `Platform        : ${(b.platform || []).join(", ") || "N/A"}`,
    `Date Needed     : ${formatDate(b.date)}`,
    ``,
    `Title:`,
    `${b.title || "N/A"}`,
    ``,
    `Instructions:`,
    `${stripHtml(b.message) || "N/A"}`,
  ].join("\n");

  const rows = [
    ["Requester", b.name || "N/A"],
    ["Email", b.email || "N/A"],
    ["Classification", b.classification || "N/A"],
    ["Contact", b.contact || "N/A"],
    ["Desk", typeLabel(b)],
    [
      "Platform",
      (b.platform || []).map(badge).join("") || "N/A",
    ],
    ["Date Needed", formatDate(b.date)],
  ]
    .map(
      ([k, v]) =>
        `<tr><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#64748b;width:38%;vertical-align:top"><strong>${k}</strong></td>` +
        `<td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#0f172a">${String(v)}</td></tr>`,
    )
    .join("");

  const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
            <div style="background:linear-gradient(90deg,#1d4ed8,#0891b2);padding:20px 28px">
                <h2 style="margin:0;color:#fff;font-size:20px;text-transform:uppercase">Task Assignment Notice</h2>
                <p style="margin:4px 0 0;color:#bfdbfe;font-size:13px">A new QMS request has been assigned to you</p>
            </div>
            <div style="padding:20px 28px">
                <p style="margin:0 0 4px;font-size:15px;color:#0f172a">Hi <strong>${b.assignee_name || "there"}</strong>,</p>
                <p style="margin:0 0 18px;font-size:13px;color:#334155;line-height:1.5">A new QMS request has been assigned to you. Please log in to the QMS console to view the full details and start working on your task.</p>
                <table style="border-collapse:collapse;width:100%;font-size:13px">${rows}</table>
                <hr style="border:none;border-top:1px solid #e2e8f0;margin:18px 0">
                <p style="margin:0 0 6px;font-size:12px;font-weight:bold;color:#334155;text-transform:uppercase">Title</p>
                <h3 style="margin:0 0 16px;color:#0f172a;font-size:16px">${b.title || "Untitled"}</h3>
                <p style="margin:0 0 6px;font-size:12px;font-weight:bold;color:#334155;text-transform:uppercase">Instructions</p>
                <div style="margin:0;font-size:13px;color:#0f172a;line-height:1.5">${b.message || "N/A"}</div>
                <p style="margin:20px 0 0;font-size:11px;color:#94a3b8">Sent by Queue Management System \u2014 usls.edu.ph/qms</p>
            </div>
        </div>`;

  return sendMail(req, res, {
    subject: `[QMS] Task Assigned - ${b.title || ""} (${b.code || ""})`,
    text: emailText,
    html,
  });
};

const renderNewRequest = (req, res) => {
  const b = req.body || {};

  const emailText = [
    `A new request has been submitted to the QMS.`,
    ``,
    `Name            : ${b.name || "N/A"}`,
    `Email           : ${b.email || "N/A"}`,
    `Classification  : ${b.classification || "N/A"}`,
    `Contact         : ${b.contact || "N/A"}`,
    `Title           : ${b.title || "N/A"}`,
    `Desk            : ${typeLabel(b)}`,
    `Platform        : ${(b.platform || []).join(", ") || "N/A"}`,
    `Date Needed     : ${b.date || "N/A"}`,
    ``,
    `Message:`,
    `${stripHtml(b.message) || "N/A"}`,
  ].join("\n");

  const rows = [
    ["Name", b.name || "N/A"],
    ["Email", b.email || "N/A"],
    ["Classification", b.classification || "N/A"],
    ["Contact", b.contact || "N/A"],
    ["Desk", typeLabel(b)],
    ["Platform", (b.platform || []).join(", ") || "N/A"],
    ["Date Needed", b.date || "N/A"],
  ]
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#64748b;width:40%"><strong>${k}</strong></td>` +
        `<td style="padding:8px 12px;border-bottom:1px solid #eee;color:#0f172a">${String(v)}</td></tr>`,
    )
    .join("");

  const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
            <div style="background:linear-gradient(90deg,#1d4ed8,#0891b2);padding:20px 28px">
                <h2 style="margin:0;color:#fff;font-size:20px">New QMS Request</h2>
                <p style="margin:4px 0 0;color:#bfdbfe;font-size:13px">A client just submitted an application</p>
            </div>
            <div style="padding:20px 28px">
                <h3 style="margin:0 0 14px;color:#0f172a;font-size:16px">${b.title || "Untitled"}</h3>
                <table style="border-collapse:collapse;width:100%;font-size:13px">${rows}</table>
                <hr style="border:none;border-top:1px solid #e2e8f0;margin:18px 0">
                <p style="margin:0 0 6px;font-size:12px;font-weight:bold;color:#334155;text-transform:uppercase">Message</p>
                <p style="margin:0;font-size:13px;color:#0f172a;white-space:pre-wrap">${stripHtml(b.message) || "N/A"}</p>
                <p style="margin:20px 0 0;font-size:11px;color:#94a3b8">Sent by Queue Management System \u2014 usls.edu.ph/qms</p>
            </div>
        </div>`;

  return sendMail(req, res, {
    subject: `[QMS] New Request - ${b.title || ""} (${b.code || ""})`,
    text: emailText,
    html,
  });
};

const sendMail = async (req, res, opts) => {
  const b = req.body || {};

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 465),
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  try {
    const recipients = Array.isArray(b.recipients) && b.recipients.length > 0
      ? b.recipients.join(", ")
      : (opts.to || process.env.NOTIFY_TO || process.env.SMTP_USER);

    await transporter.sendMail({
      from: `"QMS Notifications" <${process.env.SMTP_USER}>`,
      to: recipients,
      replyTo: b.email || process.env.SMTP_USER,
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
