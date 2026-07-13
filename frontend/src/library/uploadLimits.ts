// Mirrors TABIT_MAX_RECORDING_SECONDS (app/config.py). The server enforces the limit for
// real — this copy only lets us refuse an over-long file before spending the upload.
export const MAX_RECORDING_SECONDS = 600;

export function tooLongMessage(seconds: number): string {
  const minutes = MAX_RECORDING_SECONDS / 60;
  return `Recording is ${(seconds / 60).toFixed(1)} minutes long; the maximum is ${minutes} minutes.`;
}
