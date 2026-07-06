import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AuthGate } from "./AuthGate";
import { AuthProvider } from "./AuthProvider";
import { AuthShell } from "./AuthShell";
import { frontendAuthProductionError } from "./authRuntimePolicy";
import { createFrontendAuthClient } from "./frontendAuthClient";

describe("AuthShell", () => {
  afterEach(() => {
    window.history.pushState({}, "", "/");
  });

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

  it("continues a password reset redirect and establishes a session", async () => {
    window.history.pushState(
      {},
      "",
      "/?auth=reset-password&code=recovery-code&email=ResetUser@example.com",
    );
    renderAuthShell();

    const dialog = await screen.findByRole("dialog", {
      name: /authentication/i,
    });
    expect(
      within(dialog).getByRole("heading", { name: /set new password/i }),
    ).toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/^email$/i)).not.toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText(/^password$/i), {
      target: { value: "updated-passphrase" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: /update password/i }),
    );

    const account = await screen.findByLabelText(/signed-in account/i);
    expect(within(account).getByText("resetuser")).toBeInTheDocument();
  });

  it("keeps workshop children hidden until auth creates a session", async () => {
    render(
      <AuthProvider
        client={createFrontendAuthClient({
          now: () => "2026-07-06T08:00:00.000Z",
        })}
        initialSession={null}
      >
        <AuthGate>
          <section aria-label="Organization workshop room">Workshop</section>
        </AuthGate>
      </AuthProvider>,
    );

    expect(
      screen.getByLabelText(/authentication required/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/organization workshop room/i),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    const dialog = screen.getByRole("dialog", { name: /authentication/i });
    fireEvent.click(within(dialog).getByRole("button", { name: /register/i }));
    fireEvent.change(within(dialog).getByLabelText(/display name/i), {
      target: { value: "Workshop Owner" },
    });
    fireEvent.change(within(dialog).getByLabelText(/^email$/i), {
      target: { value: "owner@example.com" },
    });
    fireEvent.change(within(dialog).getByLabelText(/^password$/i), {
      target: { value: "workshop-passphrase" },
    });
    const registerButtons = within(dialog).getAllByRole("button", {
      name: /^register$/i,
    });
    fireEvent.click(registerButtons[registerButtons.length - 1]);

    expect(
      await screen.findByLabelText(/organization workshop room/i),
    ).toBeInTheDocument();
  });

  it("blocks frontend-only sessions from entering the workshop in production", () => {
    render(
      <AuthProvider
        initialSession={{
          user: {
            id: "auth-user:owner@example.com",
            email: "owner@example.com",
            displayName: "Workshop Owner",
          },
          establishedAt: "2026-07-06T08:00:00.000Z",
          assurance: "frontend-only",
        }}
      >
        <AuthGate env={{ PROD: true, MODE: "production" }}>
          <section aria-label="Organization workshop room">Workshop</section>
        </AuthGate>
      </AuthProvider>,
    );

    expect(
      screen.queryByLabelText(/organization workshop room/i),
    ).not.toBeInTheDocument();
    expect(screen.getByText(frontendAuthProductionError)).toBeInTheDocument();
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
