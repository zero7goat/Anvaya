import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePincodeReply, parseReverseGeocode } from "./addressLookup.ts";

test("location lookup: PIN code, city and state from an Indian address", () => {
  // Shape of a real Nominatim reply for central Ballari
  const reply = {
    display_name: "Satyanarayana Pete, Ballari, Bellary taluk, Ballari, Karnataka, 583101, India",
    address: { suburb: "Satyanarayana Pete", city: "Ballari", state_district: "Ballari", state: "Karnataka", postcode: "583101", country_code: "in" },
  };
  assert.deepEqual(parseReverseGeocode(reply), { pincode: "583101", city: "Ballari", state: "Karnataka" });
});

test("location lookup: towns and villages stand in for a city; a bad PIN code is left out", () => {
  assert.deepEqual(parseReverseGeocode({ address: { village: "Hampi", state: "Karnataka", postcode: "5831", country_code: "in" } }), {
    pincode: undefined,
    city: "Hampi",
    state: "Karnataka",
  });
});

test("location lookup: outside India or an empty reply gives nothing", () => {
  assert.equal(parseReverseGeocode({ address: { city: "Dubai", country_code: "ae", postcode: "00000" } }), null);
  assert.equal(parseReverseGeocode({ error: "Unable to geocode" }), null);
  assert.equal(parseReverseGeocode(null), null);
});

test("PIN code lookup: district and state from India Post", () => {
  const reply = [{ Status: "Success", PostOffice: [{ Name: "Bellary", District: "Bellary", State: "Karnataka", Pincode: "583101" }] }];
  assert.deepEqual(parsePincodeReply(reply), { city: "Bellary", state: "Karnataka" });
});

test("PIN code lookup: an unknown PIN code gives nothing", () => {
  assert.equal(parsePincodeReply([{ Status: "Error", PostOffice: null }]), null);
  assert.equal(parsePincodeReply([]), null);
  assert.equal(parsePincodeReply("not json"), null);
});
