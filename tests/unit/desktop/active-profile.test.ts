import { describe, expect, it } from "vitest";

import {
  ActiveProfileService,
  initializeActiveProfile,
} from "../../../desktop/main/activeProfile";

describe("initializeActiveProfile", () => {
  it("activates the only local profile", () => {
    const service = new ActiveProfileService();

    expect(initializeActiveProfile(service, [{ id: "profile-1" }])).toBe(
      "profile-1",
    );
    expect(service.hasActiveProfile()).toBe(true);
  });

  it("fails closed when no profile or multiple profiles need selection", () => {
    const service = new ActiveProfileService();
    service.setActiveProfile("stale-profile");

    expect(initializeActiveProfile(service, [])).toBeUndefined();
    expect(service.hasActiveProfile()).toBe(false);

    expect(
      initializeActiveProfile(service, [
        { id: "profile-1" },
        { id: "profile-2" },
      ]),
    ).toBeUndefined();
    expect(service.hasActiveProfile()).toBe(false);
  });
});
