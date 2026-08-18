// ============================================================
// Envoi d'e-mails (réinitialisation de mot de passe).
//
// Volontairement derrière une interface minimale : tant qu'aucun SMTP
// n'est configuré, le code est écrit dans les logs du serveur plutôt que
// de faire échouer la fonctionnalité. On peut donc développer et tester
// sans compte e-mail, puis brancher n'importe quel fournisseur (Brevo,
// Resend, Gmail…) en renseignant les variables SMTP_*.
// ============================================================
import nodemailer from "nodemailer";

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM } = process.env;

export function mailerConfigure(): boolean {
  return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASSWORD);
}

let transport: nodemailer.Transporter | null = null;
function getTransport(): nodemailer.Transporter {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT ?? 587),
      // 465 = TLS implicite ; 587 = STARTTLS (le plus courant).
      secure: Number(SMTP_PORT ?? 587) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
    });
  }
  return transport;
}

export async function envoyerCodeReinitialisation(email: string, nom: string, code: string): Promise<void> {
  const sujet = "RX35 — code de réinitialisation";
  const texte = `Bonjour ${nom},

Votre code de réinitialisation RX35 est : ${code}

Saisissez-le dans l'application pour choisir un nouveau mot de passe.
Ce code est valable 15 minutes.

Si vous n'êtes pas à l'origine de cette demande, ignorez ce message :
votre mot de passe actuel reste valable.

— RX Stack`;

  if (!mailerConfigure()) {
    // Mode développement : sans SMTP, on trace le code côté serveur.
    // Jamais renvoyé dans la réponse HTTP, sinon n'importe qui pourrait
    // réinitialiser le mot de passe d'autrui.
    console.warn(
      `[mailer] SMTP non configuré — code de réinitialisation pour ${email} : ${code} (valable 15 min)`
    );
    return;
  }

  await getTransport().sendMail({
    from: SMTP_FROM ?? SMTP_USER,
    to: email,
    subject: sujet,
    text: texte,
  });
}
