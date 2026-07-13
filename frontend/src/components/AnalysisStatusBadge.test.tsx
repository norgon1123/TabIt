import { render, screen } from "@testing-library/react";
import AnalysisStatusBadge from "./AnalysisStatusBadge";

const base = { bpm: null, detected_key_tonic: null, detected_key_mode: null, engine_version: null, error: null, beat_times: [] };

test("shows a spinner while running", () => {
  render(<AnalysisStatusBadge analysis={{ ...base, status: "running" }} />);
  expect(screen.getByRole("status")).toBeInTheDocument();
});

test("no spinner when done", () => {
  render(<AnalysisStatusBadge analysis={{ ...base, status: "done" }} />);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

test("shows the length as MM:SS between the status and the BPM", () => {
  const { container } = render(
    <AnalysisStatusBadge
      analysis={{ ...base, status: "done", bpm: 96, detected_key_tonic: "G", detected_key_mode: "major" }}
      durationSeconds={195}
    />,
  );
  expect(container.textContent).toBe("done · 03:15 · 96 BPM · G major");
});

test("shows the length before analysis finishes", () => {
  const { container } = render(
    <AnalysisStatusBadge analysis={{ ...base, status: "running" }} durationSeconds={62} />,
  );
  expect(container.textContent).toContain("01:02");
});

test("omits the length when the duration is unknown", () => {
  const { container } = render(<AnalysisStatusBadge analysis={{ ...base, status: "done" }} durationSeconds={null} />);
  expect(container.textContent).toBe("done");
});
