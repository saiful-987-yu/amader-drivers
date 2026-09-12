/**
* ============================================================
* AMADER DRIVERS — GOOGLE APPS SCRIPT BACKEND
* ============================================================
*
* This script is the ONLY thing that ever talks to your Google
* Sheet directly. The public website never receives a service
* account key, an API secret, or the spreadsheet's edit access —
* it only calls the small set of operations defined below, and
* only the fields marked "public" ever leave this script.
*
* SETUP
* -----
* 1. Create a Google Sheet with these tabs (exact names):
* Drivers | Pending Drivers | Users | Markets | Vehicle Categories
* See README.md for the exact column headers each tab needs.
* 2. Open Extensions → Apps Script on that spreadsheet.
* 3. Replace the default Code.gs with this file's contents.
* 4. Deploy → New deployment → type "Web app".
* Execute as: Me
* Who has access: Anyone
* 5. Copy the deployment URL into config/config.js as API_BASE_URL.
*
* There is intentionally NO admin dashboard and NO admin login
* here, per the project spec — the sheet owner reviews the
* "Pending Drivers" tab manually and copies approved rows into
* "Drivers" themselves.
* ============================================================
*/

// ----------------------------------------------------------
// CONFIG
// ----------------------------------------------------------
const SHEET_DRIVERS = "Drivers";
const SHEET_DOCTORS = "Doctors";
const SHEET_PENDING = "Pending Drivers";
const SHEET_USERS = "Users";
const SHEET_MARKETS = "Markets";
const SHEET_VEHICLES = "Vehicle Categories";
const SHEET_SESSIONS = "Sessions"; // created automatically if missing

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

// ----------------------------------------------------------
// ENTRY POINTS
// ----------------------------------------------------------
function doGet(e) {
return respond({ ok: false, errorCode: "USE_POST" });
}

function doPost(e) {
const op = e.parameter.op;
let payload = {};
try {
payload = JSON.parse(e.postData.contents || "{}");
} catch (err) {
return respond({ ok: false, errorCode: "BAD_REQUEST" });
}

try {
switch (op) {
case "getMarkets": return respond({ ok: true, result: getMarkets() });
case "getVehicleCategories": return respond({ ok: true, result: getVehicleCategories() });
case "getDrivers": return respond({ ok: true, result: getDrivers(payload) });
case "getDoctors": return respond({ ok: true, result: getDoctors() });
case "registerDriver": return respond({ ok: true, result: registerDriver(payload) });
case "login": return respond({ ok: true, result: login(payload) });
case "getProfile": return respond({ ok: true, result: getProfile(payload) });
case "updateAvailability": return respond({ ok: true, result: updateAvailability(payload) });
default: return respond({ ok: false, errorCode: "UNKNOWN_OPERATION" });
}
} catch (err) {
const code = err && err.code ? err.code : "SERVER_ERROR";
return respond({ ok: false, errorCode: code });
}
}

function respond(obj) {
return ContentService.createTextOutput(JSON.stringify(obj))
.setMimeType(ContentService.MimeType.JSON);
}

// ----------------------------------------------------------
// SHEET HELPERS
// ----------------------------------------------------------
function sheet(name) {
const ss = SpreadsheetApp.getActiveSpreadsheet();
const s = ss.getSheetByName(name);
if (!s) throw appError("MISSING_SHEET_" + name.toUpperCase().replace(/ /g, "_"));
return s;
}

/** Read a sheet into an array of plain objects keyed by header row. */
function readRows(sheetName) {
const s = sheet(sheetName);
const values = s.getDataRange().getValues();
if (values.length < 2) return [];
const headers = values[0].map((h) => String(h).trim());
return values.slice(1)
.filter((row) => row.some((cell) => cell !== "" && cell !== null))
.map((row) => {
const obj = {};
headers.forEach((h, i) => { obj[h] = row[i]; });
return obj;
});
}

function appendRow(sheetName, headerToValueMap) {
const s = sheet(sheetName);
const headers = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0].map((h) => String(h).trim());
const row = headers.map((h) => (headerToValueMap[h] !== undefined ? headerToValueMap[h] : ""));
s.appendRow(row);
}

function appError(code) {
const err = new Error(code);
err.code = code;
return err;
}

function clean(v) { return (v == null ? "" : String(v)).trim(); }
function slugOf(v) { return clean(v).toLowerCase(); }

// ----------------------------------------------------------
// PUBLIC READS
// ----------------------------------------------------------
function getMarkets() {
return readRows(SHEET_MARKETS)
.filter((r) => slugOf(r["Status"]) === "active")
.sort((a, b) => Number(a["Sort Order"] || 0) - Number(b["Sort Order"] || 0))
.map((r) => ({
id: clean(r["Market ID"]),
slug: slugify(r["Market Name English"]),
nameEn: clean(r["Market Name English"]),
nameBn: clean(r["Market Name Bengali"]),
status: "active",
sortOrder: Number(r["Sort Order"] || 0)
}));
}

function getVehicleCategories() {
return readRows(SHEET_VEHICLES)
.filter((r) => slugOf(r["Status"]) === "active")
.sort((a, b) => Number(a["Sort Order"] || 0) - Number(b["Sort Order"] || 0))
.map((r) => ({
id: clean(r["Category ID"]),
slug: slugify(r["English Name"]),
nameEn: clean(r["English Name"]),
nameBn: clean(r["Bengali Name"]),
icon: slugify(r["English Name"]),
// Separate from a driver's own "Vehicle Image URL" — this is the
// category artwork shown next to the existing small icon.
imageUrl: clean(r["Vehicle Categories Image URL"]),
status: "active",
sortOrder: Number(r["Sort Order"] || 0)
}));
}

function slugify(text) {
return clean(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/**
* A driver may serve multiple bazars or drive multiple vehicle types,
* stored in the Sheet as a comma-separated list (e.g. "Nobi Bazar, Bangla
* Bazar"). This slugifies EACH part separately and rejoins them with
* ", " — a single plain value (no comma) still slugifies exactly as
* before, so existing single-value rows need no changes.
*/
function slugifyMulti(text) {
return clean(text).split(",").map(function (part) { return slugify(part.trim()); })
.filter(Boolean).join(", ");
}

/** True if `needle` (a single slug) appears among the comma-separated values in the raw Sheet cell `rawHaystack`. */
function multiIncludes(rawHaystack, needle) {
return clean(rawHaystack).split(",").map(function (s) { return slugify(s.trim()); }).indexOf(needle) !== -1;
}

function getDrivers(payload) {
const marketSlug = slugOf(payload.marketSlug);
const vehicleSlug = slugOf(payload.vehicleSlug);
const query = clean(payload.query).toLowerCase();
const queryDigits = query.replace(/\D/g, "");

return readRows(SHEET_DRIVERS)
.filter((r) => slugOf(r["Status"]) === "active") // never expose Pending/rejected records
.filter((r) => !marketSlug || multiIncludes(r["Bazar"], marketSlug))
.filter((r) => !vehicleSlug || multiIncludes(r["Vehicle Type"], vehicleSlug))
.filter((r) => {
if (!query) return true;
const name = clean(r["Name"]).toLowerCase();
const phoneDigits = clean(r["Phone"]).replace(/\D/g, "");
return name.includes(query) || (queryDigits && phoneDigits.includes(queryDigits));
})
.map(publicDriverFields);
}

/** Only fields safe for the public directory — never Username/Password/private notes. */
function publicDriverFields(r) {
return {
driverId: clean(r["Driver ID"]),
name: clean(r["Name"]),
nameBn: clean(r["Bengali Name"]),
phone: clean(r["Phone"]),
altPhone: clean(r["Alternative Phone"]),
vehicleType: slugifyMulti(r["Vehicle Type"]),
vehicleNumber: clean(r["Vehicle Number"]),
marketSlug: slugifyMulti(r["Bazar"]),
serviceArea: clean(r["Service Area"]),
experience: clean(r["Driving Experience"]),
rating: clean(r["Star Rating"]),
whatsapp: clean(r["WhatsApp"]),
imageUrl: clean(r["Driver Image URL"]),
vehicleImageUrl: clean(r["Vehicle Image URL"]),
availability: slugOf(r["Availability"]) === "active" ? "active" : "inactive",
emergency: slugOf(r["Emergency Contact"]) === "true"
};
}

/**
* Doctors live in their own "Doctors" sheet tab, built with the SAME
* column headers as the Drivers tab (per the project spec) — only the
* MEANING of three columns changes for that tab: "Driver ID" is read as
* the Doctor ID, "Vehicle Type" as Degree/Qualification, and "Vehicle
* Number" as the Registration Number. No bazar/vehicle filtering
* applies to doctors, so there is no market/vehicle-type parameter here.
*/
function getDoctors() {
return readRows(SHEET_DOCTORS)
.filter((r) => slugOf(r["Status"]) === "active")
.map(publicDoctorFields)
.sort((a, b) => {
const aActive = a.availability === "active" ? 0 : 1;
const bActive = b.availability === "active" ? 0 : 1;
if (aActive !== bActive) return aActive - bActive;
return (a.name || "").localeCompare(b.name || "");
});
}

function publicDoctorFields(r) {
return {
doctorId: clean(r["Driver ID"]),
name: clean(r["Name"]),
nameBn: clean(r["Bengali Name"]),
phone: clean(r["Phone"]),
altPhone: clean(r["Alternative Phone"]),
degree: clean(r["Vehicle Type"]),
regNumber: clean(r["Vehicle Number"]),
serviceArea: clean(r["Service Area"]),
experience: clean(r["Driving Experience"]),
rating: clean(r["Star Rating"]),
whatsapp: clean(r["WhatsApp"]),
imageUrl: clean(r["Driver Image URL"]),
sampleImageUrl: clean(r["Vehicle Image URL"]),
availability: slugOf(r["Availability"]) === "active" ? "active" : "inactive"
};
}

// ----------------------------------------------------------
// REGISTRATION -> PENDING DRIVERS (never published automatically)
// ----------------------------------------------------------
function registerDriver(payload) {
const phoneDigits = clean(payload.phone).replace(/\D/g, "");
const username = clean(payload.username);
if (!phoneDigits || !username || !payload.password) throw appError("VALIDATION_FAILED");

const existingPhones = readRows(SHEET_DRIVERS).map((r) => clean(r["Phone"]).replace(/\D/g, ""))
.concat(readRows(SHEET_PENDING).map((r) => clean(r["Phone"]).replace(/\D/g, "")))
.concat(readRows(SHEET_USERS).map((r) => clean(r["Phone"]).replace(/\D/g, "")));
if (existingPhones.includes(phoneDigits)) throw appError("DUPLICATE_PHONE");

const existingUsernames = readRows(SHEET_USERS).map((r) => clean(r["Username"]).toLowerCase())
.concat(readRows(SHEET_PENDING).map((r) => clean(r["Username"]).toLowerCase()));
if (existingUsernames.includes(username.toLowerCase())) throw appError("DUPLICATE_USERNAME");

const applicationId = "APP-" + Date.now().toString(36).toUpperCase();

appendRow(SHEET_PENDING, {
"Application ID": applicationId,
"Name": clean(payload.fullName),
"Father/Husband Name": clean(payload.guardianName),
"Phone": clean(payload.phone),
"Alternative Phone": clean(payload.altPhone),
"Village": clean(payload.village),
"Post Office": clean(payload.postOffice),
"Union": clean(payload.union),
"Upazila": clean(payload.upazila),
"District": clean(payload.district),
"Full Address": clean(payload.fullAddress),
"Vehicle Type": clean(payload.vehicleType),
"Vehicle Number": clean(payload.vehicleNumber),
"Bazar": clean(payload.marketSlug),
"Service Area": clean(payload.serviceArea),
"Driving Experience": clean(payload.experience),
"Driver Image URL": clean(payload.imageUrl),
"Vehicle Image URL": clean(payload.vehicleImageUrl),
"Username": username,
"Password": hashPassword(payload.password), // hashed even in the pending sheet
"Application Status": "pending",
"Submitted Date": new Date().toISOString()
});

return { applicationId };
}

// ----------------------------------------------------------
// AUTH
// ----------------------------------------------------------
function hashPassword(plain) {
const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, plain, Utilities.Charset.UTF_8);
return digest.map((b) => (b < 0 ? b + 256 : b).toString(16).padStart(2, "0")).join("");
}

function login(payload) {
const identifier = slugOf(payload.identifier).replace(/\s+/g, "");
const identifierDigits = identifier.replace(/\D/g, "");
const users = readRows(SHEET_USERS);

const match = users.find((u) => {
const uname = clean(u["Username"]).toLowerCase();
const phoneDigits = clean(u["Phone"]).replace(/\D/g, "");
return uname === identifier || (identifierDigits && phoneDigits === identifierDigits);
});

if (!match || hashPassword(payload.password || "") !== clean(match["Password"])) {
// Distinguish "still pending" from "wrong credentials" without
// exposing which part (username vs password) was incorrect.
const pendingMatch = readRows(SHEET_PENDING).find((p) => {
const uname = clean(p["Username"]).toLowerCase();
const phoneDigits = clean(p["Phone"]).replace(/\D/g, "");
return uname === identifier || (identifierDigits && phoneDigits === identifierDigits);
});
if (pendingMatch) throw appError("PENDING_APPROVAL");
throw appError("INVALID_CREDENTIALS");
}

const driverId = clean(match["Driver ID"]);
const token = createSession(driverId);
const driverRow = readRows(SHEET_DRIVERS).find((r) => clean(r["Driver ID"]) === driverId);
if (!driverRow) throw appError("INVALID_CREDENTIALS");

return { token, driver: driverProfileFields(driverRow, match) };
}

function driverProfileFields(row, userRow) {
return Object.assign(publicDriverFields(row), {
accountStatus: slugOf(row["Status"]) || "active",
username: userRow ? clean(userRow["Username"]) : ""
});
}

function createSession(driverId) {
ensureSessionsSheet();
const token = Utilities.getUuid();
appendRow(SHEET_SESSIONS, {
"Token": token,
"Driver ID": driverId,
"Expires At": new Date(Date.now() + SESSION_TTL_MS).toISOString()
});
return token;
}

function ensureSessionsSheet() {
const ss = SpreadsheetApp.getActiveSpreadsheet();
if (!ss.getSheetByName(SHEET_SESSIONS)) {
const s = ss.insertSheet(SHEET_SESSIONS);
s.appendRow(["Token", "Driver ID", "Expires At"]);
}
}

function resolveSession(token) {
if (!token) throw appError("SESSION_EXPIRED");
ensureSessionsSheet();
const rows = readRows(SHEET_SESSIONS);
const match = rows.find((r) => clean(r["Token"]) === token);
if (!match) throw appError("SESSION_EXPIRED");
if (new Date(match["Expires At"]).getTime() < Date.now()) throw appError("SESSION_EXPIRED");
return clean(match["Driver ID"]);
}

function getProfile(payload) {
const driverId = resolveSession(payload.token);
const driverRow = readRows(SHEET_DRIVERS).find((r) => clean(r["Driver ID"]) === driverId);
if (!driverRow) throw appError("SESSION_EXPIRED");
const userRow = readRows(SHEET_USERS).find((u) => clean(u["Driver ID"]) === driverId);
return driverProfileFields(driverRow, userRow);
}

// ----------------------------------------------------------
// AVAILABILITY UPDATE (the only field a driver can change themself)
// ----------------------------------------------------------
function updateAvailability(payload) {
const driverId = resolveSession(payload.token);
const value = payload.availability === "active" ? "Active" : "Inactive";

const s = sheet(SHEET_DRIVERS);
const values = s.getDataRange().getValues();
const headers = values[0].map((h) => String(h).trim());
const idCol = headers.indexOf("Driver ID");
const availCol = headers.indexOf("Availability");
const updatedCol = headers.indexOf("Updated Date");
if (idCol === -1 || availCol === -1) throw appError("SHEET_MISCONFIGURED");

for (let i = 1; i < values.length; i++) {
if (clean(values[i][idCol]) === driverId) {
// A driver may only ever update their OWN row — the row to
// change is located by the Driver ID tied to their session
// token, never by a value the client sends directly.
s.getRange(i + 1, availCol + 1).setValue(value);
if (updatedCol !== -1) s.getRange(i + 1, updatedCol + 1).setValue(new Date().toISOString());
const driverRow = readRows(SHEET_DRIVERS).find((r) => clean(r["Driver ID"]) === driverId);
const userRow = readRows(SHEET_USERS).find((u) => clean(u["Driver ID"]) === driverId);
return driverProfileFields(driverRow, userRow);
}
}
throw appError("SESSION_EXPIRED");
}
