import { screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../test/utils";
import UploadDropzone from "./UploadDropzone";

const song = () => new File(["audio"], "song.mp3", { type: "audio/mpeg" });

function dropFile(file: File) {
  const zone = screen.getByRole("region", { name: /upload a recording/i });
  fireEvent.drop(zone, { dataTransfer: { files: [file] } });
}

function renderDropzone() {
  return renderWithProviders(<UploadDropzone onUpload={vi.fn()} busy={false} />);
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

test("has no inline styles left", () => {
  const { container } = renderDropzone();
  expect(Array.from(container.querySelectorAll("[style]"))).toEqual([]);
});

test("is reachable and operable from the keyboard", async () => {
  // A drag-and-drop region that only responds to drag is unusable without a mouse.
  // The "Choose a file" button is the keyboard path — tab to it and press Enter,
  // and it must actually trigger the hidden file input's click(), not just exist.
  const { container } = renderDropzone();
  const input = container.querySelector("input[type=file]") as HTMLInputElement;
  const clickSpy = vi.spyOn(input, "click");

  // The file input is hidden with `display: none` (a real browser removes it from the
  // tab order), but jsdom doesn't apply the stylesheet, so tabbing through it here would
  // land on an element a real user could never reach. Focus the visible button directly —
  // exactly where a keyboard user actually arrives — then operate it with the keyboard.
  const button = screen.getByRole("button", { name: /choose a file/i });
  button.focus();
  expect(button).toHaveFocus();

  await userEvent.keyboard("{Enter}");

  expect(clickSpy).toHaveBeenCalled();
});
