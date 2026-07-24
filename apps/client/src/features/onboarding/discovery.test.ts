import { describe, expect, it } from "vitest";

import {
  discoveryStateFromSnapshot,
  selectedDiscoveryComputer,
} from "./discovery";

const studio = {
  endpoints: ["http://192.168.1.40:4100"],
  id: "studio-mac",
  name: "Studio Mac",
};

const office = {
  endpoints: ["http://192.168.1.41:4100"],
  id: "office-linux",
  name: "office-linux",
};

describe("discoveryStateFromSnapshot", () => {
  it("keeps searching while the search window is open", () => {
    expect(
      discoveryStateFromSnapshot({ hosts: [] }, { searchWindowElapsed: false })
    ).toEqual({ computers: [], status: "searching" });
  });

  it("becomes terminal empty once the search window elapsed", () => {
    expect(
      discoveryStateFromSnapshot({ hosts: [] }, { searchWindowElapsed: true })
    ).toEqual({ status: "empty" });
  });

  it("maps discovered hosts to ready computers", () => {
    expect(
      discoveryStateFromSnapshot(
        { hosts: [studio, office] },
        { searchWindowElapsed: true }
      )
    ).toEqual({ computers: [studio, office], status: "ready" });
  });

  it("keeps permission denials as permission-required", () => {
    expect(
      discoveryStateFromSnapshot(
        {
          errorMessage: "Local network permission was denied",
          hosts: [],
        },
        { searchWindowElapsed: false }
      )
    ).toEqual({
      message: "Local network permission was denied",
      status: "permission-required",
    });
  });

  it("maps other discovery failures to error", () => {
    expect(
      discoveryStateFromSnapshot(
        { errorMessage: "Nearby discovery failed", hosts: [] },
        { searchWindowElapsed: false }
      )
    ).toEqual({ message: "Nearby discovery failed", status: "error" });
  });
});

describe("selectedDiscoveryComputer", () => {
  it("selects the only computer without an explicit id", () => {
    expect(
      selectedDiscoveryComputer({ computers: [studio], status: "ready" })
    ).toEqual(studio);
  });

  it("refuses an implicit choice between several computers", () => {
    expect(
      selectedDiscoveryComputer({
        computers: [studio, office],
        status: "ready",
      })
    ).toBeUndefined();
  });

  it("selects the computer matching an explicit id", () => {
    expect(
      selectedDiscoveryComputer(
        { computers: [studio, office], status: "ready" },
        "office-linux"
      )
    ).toEqual(office);
  });

  it("returns nothing for an unknown id", () => {
    expect(
      selectedDiscoveryComputer(
        { computers: [studio, office], status: "ready" },
        "missing"
      )
    ).toBeUndefined();
  });

  it("returns nothing outside the ready state", () => {
    expect(
      selectedDiscoveryComputer({ computers: [], status: "searching" })
    ).toBeUndefined();
    expect(selectedDiscoveryComputer({ status: "empty" })).toBeUndefined();
  });
});
