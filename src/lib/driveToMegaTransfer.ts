import { Storage as MegaStorage, File as MegaFile } from "megajs";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export interface TransferTicket {
  driveToken: string;
  megaSession: {
    key: string;
    sid: string;
    user: string;
  };
  megaFolderPath?: string;
}

export interface DriveFileInfo {
  id: string;
  name: string;
  size: number;
  mimeType: string;
}

export interface TransferProgress {
  fileName: string;
  bytesUploaded: number;
  totalBytes: number;
  percent: number;
}

export type TransferListener = (event: { type: "progress"; progress: TransferProgress } | { type: "done"; fileName: string } | { type: "error"; fileName: string; message: string }) => void;

async function callTransferTicket(sessionToken: string, driveAccountId: string, megaAccountId: string, megaFolderPath?: string): Promise<TransferTicket> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/transfer-ticket`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sessionToken, driveAccountId, megaAccountId, megaFolderPath }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `Ticket request failed (${res.status})`);
  }
  return res.json();
}

async function getDriveFileInfo(driveToken: string, fileId: string): Promise<DriveFileInfo> {
  const metadataRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,size,mimeType`, {
    headers: { Authorization: `Bearer ${driveToken}` },
  });
  if (!metadataRes.ok) {
    throw new Error(`Drive metadata failed: ${metadataRes.status}`);
  }
  const meta = await metadataRes.json();
  return {
    id: meta.id,
    name: meta.name,
    size: parseInt(meta.size || "0", 10),
    mimeType: meta.mimeType,
  };
}

async function fetchDriveStream(driveToken: string, fileId: string): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${driveToken}` },
  });
  if (!res.ok) {
    throw new Error(`Drive download failed: ${res.status}`);
  }
  if (!res.body) {
    throw new Error("Drive response has no body");
  }
  return res.body;
}

async function resolveMegaFolder(storage: InstanceType<typeof MegaStorage>, folderPath?: string): Promise<MegaFile> {
  let target: MegaFile = storage.root;
  if (!folderPath) return target;
  const parts = folderPath.split("/").filter(Boolean);
  for (const part of parts) {
    let folder: MegaFile | null = null;
    for (const child of target.children ?? []) {
      if (child.directory && child.name === part) {
        folder = child;
        break;
      }
    }
    if (!folder) {
      folder = await (target as unknown as { mkdir: (name: string) => Promise<MegaFile> }).mkdir(part);
    }
    target = folder;
  }
  return target;
}

function uploadToMega(
  target: MegaFile,
  fileName: string,
  fileSize: number,
  stream: ReadableStream<Uint8Array>,
  onProgress: (bytesUploaded: number) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const mutableTarget = target as unknown as {
      upload: (opts: { name: string; size: number }, cb: (err: string) => void) => NodeJS.WritableStream & {
        on: (event: string, listener: (data: { bytesUploaded: number }) => void) => void;
      };
    };
    const uploadStream = mutableTarget.upload({ name: fileName, size: fileSize }, (err: string) => {
      if (err) reject(new Error(err));
      else resolve();
    });

    uploadStream.on("progress", ({ bytesUploaded }: { bytesUploaded: number }) => {
      onProgress(bytesUploaded);
    });

    const writable = new WritableStream({
      write(chunk: Uint8Array) {
        return new Promise<void>((res, rej) => {
          const ok = uploadStream.write(chunk, (err?: Error) => {
            if (err) rej(err);
            else if (!ok) uploadStream.once("drain", res);
            else res();
          });
          if (!ok) uploadStream.once("drain", res);
        });
      },
      close() {
        return new Promise<void>((res) => uploadStream.end(res));
      },
    });

    stream.pipeTo(writable).catch(reject);
  });
}

export async function transferDriveToMega(
  sessionToken: string,
  driveAccountId: string,
  megaAccountId: string,
  file: DriveFileInfo,
  megaFolderPath: string | undefined,
  listener: TransferListener,
): Promise<void> {
  // 1. Get ticket
  const ticket = await callTransferTicket(sessionToken, driveAccountId, megaAccountId, megaFolderPath);

  // 2. Fetch file info and stream from Drive
  const driveInfo = await getDriveFileInfo(ticket.driveToken, file.id);
  const stream = await fetchDriveStream(ticket.driveToken, file.id);

  // 3. Log into Mega via session data (no plaintext password)
  const storage = MegaStorage.fromJSON({
    key: ticket.megaSession.key,
    sid: ticket.megaSession.sid,
    user: ticket.megaSession.user,
    options: { autoload: false, autologin: false },
  });
  await (storage as any).reload(true);

  // 4. Resolve target folder
  const target = await resolveMegaFolder(storage, ticket.megaFolderPath);

  // 5. Upload
  try {
    await uploadToMega(
      target,
      driveInfo.name,
      driveInfo.size,
      stream,
      (bytesUploaded: number) => {
        listener({
          type: "progress",
          progress: {
            fileName: driveInfo.name,
            bytesUploaded,
            totalBytes: driveInfo.size,
            percent: Math.min(Math.round((bytesUploaded / driveInfo.size) * 100), 99),
          },
        });
      },
    );

    listener({ type: "done", fileName: driveInfo.name });
  } finally {
    (storage as any).close().catch(() => {});
  }
}
