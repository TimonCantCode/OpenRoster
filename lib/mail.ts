import nodemailer from "nodemailer";
import { env } from "@/lib/env";

function createTransport() {
  if (!env.SMTP_HOST) return null;

  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth:
      env.SMTP_USER && env.SMTP_PASSWORD
        ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
        : undefined,
  });
}

export async function sendInviteEmail(params: {
  email: string;
  organizationName: string;
  inviteUrl: string;
}) {
  if (!env.SMTP_HOST) {
    if (env.NODE_ENV === "production") {
      throw new Error("SMTP ist nicht konfiguriert.");
    }
    console.info(`OpenRoster invite for ${params.email}: ${params.inviteUrl}`);
    return;
  }

  const transport = createTransport();
  if (!transport) return;

  try {
    await transport.sendMail({
      from: env.SMTP_FROM,
      to: params.email,
      subject: "You have been invited to OpenRoster",
      text: [
        "Hello,",
        "",
        `You have been invited to join ${params.organizationName} on OpenRoster.`,
        "",
        `Create your account: ${params.inviteUrl}`,
        "",
        `This link is valid for ${env.INVITE_TOKEN_TTL_DAYS} days.`,
        "",
        "Regards,",
        "The OpenRoster team",
      ].join("\n"),
    });
  } catch (error) {
    console.error("Invite email delivery failed", error);
    throw error;
  }
}

export async function sendShiftChangeEmail(params: {
  email: string;
  organizationName: string;
  subject: string;
  lines: string[];
}) {
  const text = [
    "Hello,",
    "",
    ...params.lines,
    "",
    `Organization: ${params.organizationName}`,
    "",
    "Regards,",
    "The OpenRoster team",
  ].join("\n");

  if (!env.SMTP_HOST) {
    if (env.NODE_ENV === "production") {
      throw new Error("SMTP ist nicht konfiguriert.");
    }
    console.info(`OpenRoster shift email for ${params.email}: ${params.subject}`);
    return;
  }

  const transport = createTransport();
  if (!transport) return;

  try {
    await transport.sendMail({
      from: env.SMTP_FROM,
      to: params.email,
      subject: params.subject,
      text,
    });
  } catch (error) {
    console.error("Shift notification delivery failed", error);
  }
}
