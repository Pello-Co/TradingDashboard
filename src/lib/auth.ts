import { betterAuth } from "better-auth";
import { Pool } from "pg";
import { PostgresDialect } from "kysely";
import { Resend } from "resend";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

const resend = new Resend(process.env.RESEND_API_KEY);

export const auth = betterAuth({
  database: new PostgresDialect({ pool }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await resend.emails.send({
        from: "noreply@bullist.co",
        to: user.email,
        subject: "Reset your TradingDashboard password",
        html: `<p>Click <a href="${url}">here</a> to reset your password.</p><p>If you didn't request this, you can ignore this email.</p>`,
      });
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await resend.emails.send({
        from: "noreply@bullist.co",
        to: user.email,
        subject: "Verify your TradingDashboard account",
        html: `<p>Click <a href="${url}">here</a> to verify your email address.</p>`,
      });
    },
  },
});
