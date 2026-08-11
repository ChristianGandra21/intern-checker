import net from "node:net";
import tls from "node:tls";

type Socket = net.Socket | tls.TLSSocket;

function reply(socket: Socket) {
  return new Promise<string>((resolve, reject) => {
    let buffer = "";
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      if (lines.length && /^\d{3} /.test(lines.at(-1)!)) { cleanup(); resolve(buffer); }
    };
    const onError = (error: Error) => { cleanup(); reject(error); };
    const cleanup = () => { socket.off("data", onData); socket.off("error", onError); };
    socket.on("data", onData); socket.on("error", onError);
  });
}

async function command(socket: Socket, value: string, expected: number[]) {
  socket.write(`${value}\r\n`);
  const response = await reply(socket);
  const status = Number(response.slice(0, 3));
  if (!expected.includes(status)) throw new Error(`SMTP recusou ${value.split(" ")[0]} (${status}).`);
}

export function smtpConfigured() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

export async function sendSmtpEmail(to: string, subject: string, html: string) {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER || "";
  const password = process.env.SMTP_PASSWORD || "";
  if (!user || !password || !to) throw new Error("SMTP não configurado.");
  const plain = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  let socket: Socket = net.createConnection({ host, port });
  await new Promise<void>((resolve, reject) => { socket.once("connect", resolve); socket.once("error", reject); });
  let response = await reply(socket);
  if (!response.startsWith("220")) throw new Error("Servidor SMTP indisponível.");
  await command(socket, `EHLO ${host}`, [250]);
  await command(socket, "STARTTLS", [220]);
  socket = tls.connect({ socket: socket as net.Socket, servername: host });
  await new Promise<void>((resolve, reject) => { socket.once("secureConnect", resolve); socket.once("error", reject); });
  await command(socket, `EHLO ${host}`, [250]);
  await command(socket, "AUTH LOGIN", [334]);
  await command(socket, Buffer.from(user).toString("base64"), [334]);
  await command(socket, Buffer.from(password).toString("base64"), [235]);
  await command(socket, `MAIL FROM:<${user}>`, [250]);
  await command(socket, `RCPT TO:<${to}>`, [250, 251]);
  await command(socket, "DATA", [354]);
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`;
  const boundary = `intern-checker-${Date.now()}`;
  const message = [
    `From: ${user}`, `To: ${to}`, `Subject: ${encodedSubject}`, "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`, "",
    `--${boundary}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: 8bit", "", plain,
    `--${boundary}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: 8bit", "", html,
    `--${boundary}--`, "",
  ].join("\r\n").replace(/^\./gm, "..");
  socket.write(`${message}\r\n.\r\n`);
  response = await reply(socket);
  if (!response.startsWith("250")) throw new Error("SMTP recusou a mensagem.");
  await command(socket, "QUIT", [221]);
  socket.end();
}
