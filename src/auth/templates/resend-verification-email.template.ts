export function getResendVerificationEmailTemplate(fullname: string, verifyUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fa;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; border: 0; border-spacing: 0; background: #f4f7fa;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; border-collapse: collapse; border: 0; border-spacing: 0; background: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
          <tr>
            <td align="center" style="padding: 40px 30px 20px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px 12px 0 0;">
              <div style="width: 70px; height: 70px; background: rgba(255,255,255,0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto;">
                <span style="color: #ffffff; font-size: 28px; font-weight: bold;">QN</span>
              </div>
              <h1 style="margin: 20px 0 0 0; color: #ffffff; font-size: 24px; font-weight: 600;">Verify Your Email</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px;">
              <h2 style="margin: 0 0 15px 0; color: #333333; font-size: 20px; font-weight: 600;">Email Verification Request</h2>
              <p style="margin: 0 0 20px 0; color: #555555; font-size: 16px; line-height: 1.6;">
                Hi <strong>${fullname}</strong>,
              </p>
              <p style="margin: 0 0 25px 0; color: #555555; font-size: 16px; line-height: 1.6;">
                You requested a new verification link. Please click the button below to verify your email address.
              </p>
              <table role="presentation" style="border-collapse: collapse; border: 0; border-spacing: 0; margin: 0 auto;">
                <tr>
                  <td align="center" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px;">
                    <a href="${verifyUrl}" style="display: inline-block; padding: 14px 40px; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; border-radius: 8px;">
                      Verify Email Address
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 25px 0 0 0; color: #888888; font-size: 14px; line-height: 1.5;">
                Or copy and paste this link into your browser:<br>
                <span style="color: #667eea; word-break: break-all;">${verifyUrl}</span>
              </p>
              <p style="margin: 20px 0 0 0; color: #888888; font-size: 13px; line-height: 1.5;">
                This link will expire in 24 hours.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 30px; background: #f8f9fa; border-radius: 0 0 12px 12px; text-align: center;">
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
