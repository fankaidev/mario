import { describe, expect, it } from "vitest";
import { calculateXIRR } from "../src/lib/finance";

describe("calculateXIRR", () => {
  it("returns null for empty cash flows", () => {
    expect(calculateXIRR([])).toBeNull();
  });

  it("returns null for single cash flow", () => {
    expect(calculateXIRR([{ date: "2024-01-01", amount: -10000 }])).toBeNull();
  });

  it("returns null when all cash flows are same sign", () => {
    expect(
      calculateXIRR([
        { date: "2024-01-01", amount: -10000 },
        { date: "2024-06-01", amount: -5000 },
      ]),
    ).toBeNull();
  });

  it("returns null when all cash flows positive", () => {
    expect(
      calculateXIRR([
        { date: "2024-01-01", amount: 10000 },
        { date: "2024-06-01", amount: 5000 },
      ]),
    ).toBeNull();
  });

  it("calculates ~10% IRR for single deposit and value after exactly 1 year", () => {
    const r = calculateXIRR([
      { date: "2024-01-01", amount: -10000 },
      { date: "2025-01-01", amount: 11000 },
    ]);
    expect(r).not.toBeNull();
    expect(r!).toBeCloseTo(0.1, 3);
  });

  it("calculates ~10% annualized IRR for single deposit after 2 years with 21% total gain", () => {
    const r = calculateXIRR([
      { date: "2024-01-01", amount: -10000 },
      { date: "2026-01-01", amount: 12100 },
    ]);
    expect(r).not.toBeNull();
    expect(r!).toBeCloseTo(0.1, 3);
  });

  it("calculates IRR for two deposits six months apart", () => {
    const r = calculateXIRR([
      { date: "2024-01-01", amount: -5000 },
      { date: "2024-07-01", amount: -5000 },
      { date: "2025-01-01", amount: 10744 },
    ]);
    expect(r).not.toBeNull();
    expect(r!).toBeCloseTo(0.1, 2);
  });

  it("calculates IRR with a mid-period withdrawal", () => {
    const r = calculateXIRR([
      { date: "2024-01-01", amount: -10000 },
      { date: "2024-04-10", amount: 3000 },
      { date: "2025-01-01", amount: 7785 },
    ]);
    expect(r).not.toBeNull();
    expect(r!).toBeCloseTo(0.1, 2);
  });

  it("returns ~0% for zero total return", () => {
    const r = calculateXIRR([
      { date: "2024-01-01", amount: -10000 },
      { date: "2025-01-01", amount: 10000 },
    ]);
    expect(r).not.toBeNull();
    expect(r!).toBeCloseTo(0, 4);
  });

  it("returns negative IRR for loss scenario", () => {
    const r = calculateXIRR([
      { date: "2024-01-01", amount: -10000 },
      { date: "2025-01-01", amount: 9000 },
    ]);
    expect(r).not.toBeNull();
    expect(r!).toBeCloseTo(-0.1, 2);
  });

  it("handles multiple cash flows on same day", () => {
    const r = calculateXIRR([
      { date: "2024-01-01", amount: -5000 },
      { date: "2024-01-01", amount: -3000 },
      { date: "2025-01-01", amount: 8800 },
    ]);
    expect(r).not.toBeNull();
    expect(r!).toBeCloseTo(0.1, 2);
  });
});
