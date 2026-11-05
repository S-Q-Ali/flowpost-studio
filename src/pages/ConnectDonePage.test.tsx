import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ConnectDonePage from "./ConnectDonePage";

const NONCE = "a".repeat(64);

/// Renders the page the way the browser lands on it, and keeps the hand-off
/// seam so a test can read the link the page would give the OS.
function visit(search: string) {
  const openApp = vi.fn();
  render(
    <MemoryRouter initialEntries={[`/connect-done${search}`]}>
      <ConnectDonePage openApp={openApp} />
    </MemoryRouter>,
  );
  return openApp;
}

describe("ConnectDonePage", () => {
  it("hands a finished connect to the app and offers the same link to click", () => {
    const openApp = visit(`?platform=google_drive&nonce=${NONCE}&result=connected`);
    const link = `flowpost://connect-callback?platform=google_drive&nonce=${NONCE}&result=connected`;

    expect(openApp).toHaveBeenCalledTimes(1);
    expect(openApp).toHaveBeenCalledWith(link);
    expect(screen.getByRole("link", { name: /open flowpost/i })).toHaveAttribute("href", link);
  });

  it("names the network it connected", () => {
    visit(`?platform=youtube&nonce=${NONCE}&result=connected`);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/youtube/i);
  });

  it("says a cancelled connect plainly, and still hands the answer over", () => {
    const openApp = visit(`?platform=tiktok&nonce=${NONCE}&result=denied`);

    expect(openApp).toHaveBeenCalledWith(
      `flowpost://connect-callback?platform=tiktok&nonce=${NONCE}&result=denied`,
    );
    expect(screen.getByText(/cancelled/i)).toBeInTheDocument();
  });

  it("says a connect that did not finish, and still hands the answer over", () => {
    const openApp = visit(`?platform=instagram&nonce=${NONCE}&result=failed`);

    expect(openApp).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/did not finish/i)).toBeInTheDocument();
  });

  it.each([
    ["a platform the app never connects", "?platform=twitter&nonce=" + NONCE + "&result=connected"],
    ["a nonce that is not 32 bytes of hex", "?platform=youtube&nonce=short&result=connected"],
    ["a result outside the contract", "?platform=youtube&nonce=" + NONCE + "&result=%3Cscript%3E"],
    ["nothing at all", "?"],
  ])("refuses %s without handing anything to the OS", (_label, search) => {
    const openApp = visit(search);

    expect(openApp).not.toHaveBeenCalled();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/not valid/i);
  });

  it("never puts a crafted value into the page", () => {
    visit(`?platform=%3Cimg%20src%3Dx%3E&nonce=${NONCE}&result=connected`);

    expect(document.body.textContent).not.toContain("<img");
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/not valid/i);
  });
});
