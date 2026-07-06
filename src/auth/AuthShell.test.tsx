import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuthProvider } from "./AuthProvider";
import { AuthShell } from "./AuthShell";
import { createFrontendAuthClient } from "./frontendAuthClient";

describe("AuthShell", () => {
  it("registers a frontend-only session and signs out", async () => {
    renderAuthShell();

    fireEvent.click(await screen.findByRole("button", { name: /^sign in$/i }));

    const dialog = screen.getByRole("dialog", { name: /authentication/i });
    fireEvent.click(within(dialog).getByRole("button", { name: /register/i }));
    fireEvent.change(within(dialog).getByLabelText(/display name/i), {
      target: { value: "Citizen Two" },
    });
    fireEvent.change(within(dialog).getByLabelText(/^email$/i), {
      target: { value: "citizen-02@example.com" },
    });
    fireEvent.change(within(dialog).getByLabelText(/^password$/i), {
      target: { value: "workshop-passphrase" },
    });
    const registerButtons = within(dialog).getAllByRole("button", {
      name: /^register$/i,
    });
    fireEvent.click(registerButtons[registerButtons.length - 1]);

    const account = await screen.findByLabelText(/signed-in account/i);
    expect(within(account).getByText("Citizen Two")).toBeInTheDocument();

    fireEvent.click(within(account).getByRole("button", { name: /sign out/i }));

    expect(
      await screen.findByRole("button", { name: /^sign in$/i }),
    ).toBeInTheDocument();
  });

  it("keeps forgot password in the auth dialog and reports adapter acceptance", async () => {
    renderAuthShell();

    fireEvent.click(await screen.findByRole("button", { name: /^sign in$/i }));

    const dialog = screen.getByRole("dialog", { name: /authentication/i });
    fireEvent.click(within(dialog).getByRole("button", { name: /^reset$/i }));
    fireEvent.change(within(dialog).getByLabelText(/^email$/i), {
      target: { value: "reset@example.com" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: /forgot password/i }),
    );

    expect(
      await within(dialog).findByText(/password reset request accepted/i),
    ).toBeInTheDocument();
  });
});

function renderAuthShell() {
  return render(
    <AuthProvider
      client={createFrontendAuthClient({
        now: () => "2026-07-06T08:00:00.000Z",
      })}
    >
      <AuthShell />
    </AuthProvider>,
  );
}
