const nodemailer = require("nodemailer");

/**
 * Sends an email using Nodemailer
 * @param {string} to - Recipient email address
 * @param {string} subject - Subject of the email
 * @param {string} text - Plain text body
 * @param {string} html - (Optional) HTML body
 * @returns {Promise<object>} - Nodemailer info object
 */
async function sendEmail(to, subject, text, html = null) {
  try {
    console.log("email...:", process.env.EMAIL_USER);

    // Configure transporter (example using Gmail)
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    // Email options
    const mailOptions = {
      from: `"Craft Marketplace" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
      html, // if provided
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent: %s", info.messageId);

    return info;
  } catch (error) {
    console.error("Error sending email:", error.message);
    throw error;
  }
}

module.exports = sendEmail;
