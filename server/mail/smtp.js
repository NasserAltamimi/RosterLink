import nodemailer from 'nodemailer';

export const sender = 'rosterlink0@gmail.com';

// This module is imported by the server only. Never enable SMTP debug/logger:
// protocol transcripts may contain credentials or the reset link.
export function createResetMailer(config, createTransport = nodemailer.createTransport) {
  if (!config) return null;
  const auth = config.clientId && config.clientSecret && config.refreshToken
    ? { type: 'OAuth2', user: sender, clientId: config.clientId, clientSecret: config.clientSecret, refreshToken: config.refreshToken }
    : { user: sender, pass: config.appPassword };
  const transport = createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true, auth,
    logger: false, debug: false, connectionTimeout: 10000,
    greetingTimeout: 10000, socketTimeout: 15000,
    disableFileAccess: true, disableUrlAccess: true,
  });
  return async ({ email, link, language }) => {
    const arabic = language === 'ar';
    await transport.sendMail({
      from: `RosterLink <${sender}>`, to: email,
      subject: arabic ? 'إعادة تعيين كلمة مرور RosterLink' : 'Reset your RosterLink password',
      text: arabic
        ? `طلبت إعادة تعيين كلمة مرور حسابك في RosterLink.\n\nاختر كلمة مرور جديدة عبر هذا الرابط:\n${link}\n\nتنتهي صلاحية الرابط بعد ٣٠ دقيقة ويمكن استخدامه مرة واحدة. بعد إعادة التعيين، سجّل الدخول مجددًا. إذا لم تطلب إعادة التعيين، تجاهل هذه الرسالة.`
        : `You requested a password reset for RosterLink.\n\nChoose a new password: ${link}\n\nThis link expires in 30 minutes and can be used once. After resetting, log in again. If you did not request this, ignore this email.`,
    });
  };
}
