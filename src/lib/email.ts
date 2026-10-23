// Envío de correos vía la API HTTP de Resend con fetch nativo — sin SDK,
// es un solo endpoint (POST /emails).
//
// APP_URL viene de env y NO del header Host del request: armar el link de
// recuperación con el Host permitiría que un atacante mande un reset con
// Host falso y el link apunte a su dominio (robo del token).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  return trimmed.length <= 254 && EMAIL_RE.test(trimmed) ? trimmed : null;
}

export function appUrl() {
  const url = process.env.APP_URL;
  if (!url) throw new Error("Falta APP_URL en las variables de entorno.");
  return url.replace(/\/$/, "");
}

export async function sendEmail({ to, subject, html, text }: { to: string; subject: string; html: string; text: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) throw new Error("Faltan RESEND_API_KEY / EMAIL_FROM en las variables de entorno.");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html, text }),
  });
  if (!res.ok) throw new Error(`Resend respondió ${res.status}: ${await res.text()}`);
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function passwordResetEmail(name: string, link: string) {
  const safeName = escapeHtml(name);
  return {
    subject: "Recuperá tu contraseña de Momentos",
    text: `Hola ${name},\n\nPara crear una contraseña nueva en Momentos entrá a este link (vence en 1 hora):\n\n${link}\n\nSi no lo pediste vos, ignorá este correo — tu contraseña no cambia.\n\nYeizer & Diana`,
    html: `<!doctype html>
<html lang="es">
  <body style="margin:0;background:#f6f1ea;font-family:Georgia,'Times New Roman',serif;color:#3d2b1f">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#ffffff;border:1px solid #e8dccb;border-radius:20px;padding:32px 28px">
          <tr><td align="center" style="font-size:30px;color:#8c6b3d;padding-bottom:4px">Y &amp; D</td></tr>
          <tr><td align="center" style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#9a8a78;padding-bottom:24px">Momentos</td></tr>
          <tr><td style="font-size:16px;line-height:1.5;padding-bottom:16px">Hola ${safeName},</td></tr>
          <tr><td style="font-size:15px;line-height:1.5;padding-bottom:24px">Pediste crear una contraseña nueva para entrar a Momentos. Tocá el botón — el link vence en <b>1 hora</b>.</td></tr>
          <tr><td align="center" style="padding-bottom:24px">
            <a href="${link}" style="display:inline-block;background:#8c6b3d;color:#fffaf2;text-decoration:none;font-family:Arial,sans-serif;font-weight:bold;font-size:15px;padding:12px 26px;border-radius:12px">Crear contraseña nueva</a>
          </td></tr>
          <tr><td style="font-size:12.5px;line-height:1.5;color:#9a8a78">Si no lo pediste vos, ignorá este correo — tu contraseña no cambia.</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`,
  };
}
