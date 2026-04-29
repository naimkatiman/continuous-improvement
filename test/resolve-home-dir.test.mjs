import assert from "node:assert/strict";
import { homedir } from "node:os";
import { after, before, describe, it } from "node:test";
import { resolveHomeDir } from "../lib/resolve-home-dir.mjs";
// Each test sets HOME / USERPROFILE on the live env, asserts, and the
// outer before/after captures + restores the original values exactly.
// We don't spawn subprocesses: this is a unit test of a pure function
// that reads process.env synchronously.
describe("resolveHomeDir", () => {
    let savedHome;
    let savedUserProfile;
    let homeWasSet = false;
    let userProfileWasSet = false;
    before(() => {
        homeWasSet = "HOME" in process.env;
        userProfileWasSet = "USERPROFILE" in process.env;
        savedHome = process.env.HOME;
        savedUserProfile = process.env.USERPROFILE;
    });
    after(() => {
        if (homeWasSet) {
            process.env.HOME = savedHome;
        }
        else {
            delete process.env.HOME;
        }
        if (userProfileWasSet) {
            process.env.USERPROFILE = savedUserProfile;
        }
        else {
            delete process.env.USERPROFILE;
        }
    });
    it("returns HOME when HOME is set and USERPROFILE is undefined", () => {
        process.env.HOME = "/foo";
        delete process.env.USERPROFILE;
        assert.equal(resolveHomeDir(), "/foo");
    });
    it("returns USERPROFILE when HOME is undefined and USERPROFILE is set", () => {
        delete process.env.HOME;
        process.env.USERPROFILE = "C:\\Users\\X";
        assert.equal(resolveHomeDir(), "C:\\Users\\X");
    });
    it("returns empty string when BOTH HOME and USERPROFILE are explicitly empty (opt-out)", () => {
        process.env.HOME = "";
        process.env.USERPROFILE = "";
        assert.equal(resolveHomeDir(), "");
    });
    it("falls back to USERPROFILE when only HOME is empty (single empty does NOT opt out)", () => {
        process.env.HOME = "";
        process.env.USERPROFILE = "/bar";
        assert.equal(resolveHomeDir(), "/bar");
    });
    it("falls back to os.homedir() when both HOME and USERPROFILE are undefined", () => {
        delete process.env.HOME;
        delete process.env.USERPROFILE;
        const expected = homedir() || "";
        assert.equal(resolveHomeDir(), expected);
    });
});
