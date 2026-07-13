import { screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test/utils";
import UploadDropzone from "./UploadDropzone";

const song = () => new File(["audio"], "song.mp3", { type: "audio/mpeg" });

function dropFile(file: File) {
  const zone = screen.getByRole("region", { name: /upload a recording/i });
  fireEvent.drop(zone, { dataTransfer: { files: [file] } });
}

test("uploads a file dropped on the zone", () => {
  const onUpload = vi.fn();
  renderWithProviders(<UploadDropzone onUpload={onUpload} busy={false} />);

  dropFile(song());

  expect(onUpload).toHaveBeenCalledWith(expect.objectContaining({ name: "song.mp3" }));
});

test("uploads a file chosen through the picker", async () => {
  const onUpload = vi.fn();
  const { container } = renderWithProviders(<UploadDropzone onUpload={onUpload} busy={false} />);

  await userEvent.upload(container.querySelector("input[type=file]")!, song());

  expect(onUpload).toHaveBeenCalledWith(expect.objectContaining({ name: "song.mp3" }));
});

test("refuses a file that isn't audio", () => {
  const onUpload = vi.fn();
  renderWithProviders(<UploadDropzone onUpload={onUpload} busy={false} />);

  dropFile(new File(["nope"], "notes.pdf", { type: "application/pdf" }));

  expect(onUpload).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent(/isn’t an audio file/i);
});

test("ignores a drop while an upload is already in flight", () => {
  const onUpload = vi.fn();
  renderWithProviders(<UploadDropzone onUpload={onUpload} busy />);

  dropFile(song());

  expect(onUpload).not.toHaveBeenCalled();
});
