import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NotFound from "@/pages/NotFound";
import { StatusBadge } from "@/components/StatusBadge";
import { PlatformIcon } from "@/components/PlatformIcon";
import { cn } from "@/lib/utils";

describe("cn utility", () => {
  it("merges class names", () => {
    expect(cn("px-4", "py-2")).toBe("px-4 py-2");
  });

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible");
  });
});

describe("StatusBadge", () => {
  it('renders "Published" for published status', () => {
    render(<StatusBadge status="published" />);
    expect(screen.getByText("Published")).toBeDefined();
  });

  it('renders "Scheduled" for scheduled status', () => {
    render(<StatusBadge status="scheduled" />);
    expect(screen.getByText("Scheduled")).toBeDefined();
  });
});

describe("PlatformIcon", () => {
  it("renders YouTube icon", () => {
    render(<PlatformIcon platform="youtube" />);
    const svg = document.querySelector("svg");
    expect(svg).toBeDefined();
  });

  it("renders Facebook icon", () => {
    render(<PlatformIcon platform="facebook" />);
    const svg = document.querySelector("svg");
    expect(svg).toBeDefined();
  });
});

describe("NotFound page", () => {
  it("renders 404 heading", () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>,
    );
    expect(screen.getByText("404")).toBeDefined();
    expect(screen.getByText("Oops! Page not found")).toBeDefined();
  });
});
