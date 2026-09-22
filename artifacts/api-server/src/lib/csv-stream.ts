import type { Response } from "express";

type DrainableResponse = Pick<Response, "destroyed" | "write" | "end" | "destroy" | "headersSent" | "status" | "json"> & {
  once(event: "drain" | "close" | "error", listener: (...args: any[]) => void): unknown;
  removeListener(event: "drain" | "close" | "error", listener: (...args: any[]) => void): unknown;
};

const CLIENT_DISCONNECTED_MESSAGE = "CSV export client disconnected";

export function waitForCsvDrain(response: DrainableResponse) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      response.removeListener("drain", onDrain);
      response.removeListener("close", onClose);
      response.removeListener("error", onError);
    };
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const onClose = () => {
      cleanup();
      reject(new Error(CLIENT_DISCONNECTED_MESSAGE));
    };
    const onError = (error: unknown) => {
      cleanup();
      reject(error);
    };
    response.once("drain", onDrain);
    response.once("close", onClose);
    response.once("error", onError);
    if (response.destroyed) onClose();
  });
}

async function writeCsvChunk(response: DrainableResponse, chunk: string) {
  if (response.destroyed) throw new Error(CLIENT_DISCONNECTED_MESSAGE);
  if (!response.write(chunk)) await waitForCsvDrain(response);
}

export async function streamCsvResponse(
  response: DrainableResponse,
  stream: (write: (chunk: string) => Promise<void>) => Promise<void>,
  isAuthorizationError: (error: unknown) => boolean,
) {
  try {
    await stream((chunk) => writeCsvChunk(response, chunk));
    response.end();
  } catch (error) {
    if (!isAuthorizationError(error)) throw error;
    if (!response.headersSent) {
      response.status(403).json({
        error: "Authorization denied",
        reasonCode: "NO_APPLICABLE_GRANT",
      });
    } else {
      response.destroy(error instanceof Error ? error : undefined);
    }
  }
}