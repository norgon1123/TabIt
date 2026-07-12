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
