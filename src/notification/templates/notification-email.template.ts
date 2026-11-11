function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * getNotificationEmailTemplate — branded email for admin notifications.
 */
export function getNotificationEmailTemplate(
  fullname: string,
  title: string,
  body: string,
): string {
  const safeName = escapeHtml(fullname);
  const safeTitle = escapeHtml(title);
  const safeBody = escapeHtml(body).replace(/\n/g, '<br>');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fa;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; border: 0; border-spacing: 0; background: #f4f7fa;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; border-collapse: collapse; border: 0; border-spacing: 0; background: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
          <tr>
            <td align="center" style="padding: 32px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px 12px 0 0;">
              <div style="width: 60px; height: 60px; background: rgba(255,255,255,0.2); border-radius: 50%; display: inline-block; line-height: 60px;">
                <span style="color: #ffffff; font-size: 24px; font-weight: bold;">QN</span>
              </div>
              <h1 style="margin: 16px 0 0 0; color: #ffffff; font-size: 22px; font-weight: 600;">Quoc Nhu NFC</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 18px 0; color: #555555; font-size: 16px; line-height: 1.6;">
                Hi <strong>${safeName}</strong>,
              </p>
              <h2 style="margin: 0 0 16px 0; color: #333333; font-size: 20px; font-weight: 600;">${safeTitle}</h2>
              <div style="margin: 0 0 24px 0; color: #555555; font-size: 16px; line-height: 1.7;">${safeBody}</div>
              <p style="margin: 0; color: #888888; font-size: 13px; line-height: 1.5;">
                You are receiving this email because an administrator sent you a message from Quoc Nhu NFC.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 18px 30px; background: #f8f9fa; border-radius: 0 0 12px 12px; text-align: center;">
              <p style="margin: 0; color: #888888; font-size: 12px;">
                &copy; 2026 Quoc Nhu NFC. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
