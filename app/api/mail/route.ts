import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const { subject, text, recipients } = await request.json() as { subject?: string; text?: string; recipients?: string[] };
    if (!subject?.trim() || !text?.trim()) {
      return NextResponse.json({ error: '메일 제목과 내용을 입력해 주세요.' }, { status: 400 });
    }
    const user = process.env.GMAIL_USER;
    const password = process.env.GMAIL_APP_PASSWORD;
    const to = recipients?.filter(Boolean).join(', ') || process.env.GMAIL_TO;
    if (!user || !password || !to) {
      return NextResponse.json({ error: 'GMAIL_USER, GMAIL_APP_PASSWORD, GMAIL_TO 설정을 확인해 주세요.' }, { status: 500 });
    }
    // .invalid addresses are deliberately non-deliverable demo recipients.
    // Do not wait for an SMTP timeout; advance the local workflow instead.
    if (to.split(',').every((recipient) => recipient.trim().toLowerCase().endsWith('.invalid'))) {
      return NextResponse.json({ ok: true, simulated: true });
    }
    const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass: password } });
    await transporter.sendMail({ from: user, to, subject: subject.trim(), text: text.trim() });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '메일 발송에 실패했습니다.';
    return NextResponse.json({ error: `메일 발송에 실패했습니다: ${message}` }, { status: 500 });
  }
}
