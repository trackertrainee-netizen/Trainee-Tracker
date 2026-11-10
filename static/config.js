// Edit these lists to change the dropdown options.
// Keep each name inside quotes and separated by commas.

const DEPTS = [
  "Marketing",
  "Operation",
  "HR",
  "Administration",
  "R&D",
  "Finance"
];

const BRANCHES = [
  "MANJERI",
  "KASARGOD",
  "KANNUR",
  "KUTTIYADI",
  "KOZHIKODE",
  "TIRUR",
  "PALAKKAD",
  "THRISSUR",
  "ERNAKULAM",
  "ALAPPUZHA",
  "KOTTAYAM",
  "KOLLAM",
  "TRIVANDRUM",
  "MARTHANDAM",
  "NAGPUR",
  "HYDERABAD",
  "BANGALORE"
];

// Business slicer options (also used when adding a trainee and when mapping videos).
const BUSINESSES = [
  "Magnus",
  "Alims",
  "M&D",
  "Merchx"
];

// Sub slicer (view) options on the trainee list.
const SUBVIEWS = [
  "Overview",
  "Hierarchy"
];

// ---------------------------------------------------------------
// LOGIN & ROLES  (front-end only)
// ---------------------------------------------------------------
// role      : developer | superadmin | admin | department | trainee
//   developer   - everything, all businesses (incl. video upload and video mapping tools)
//   superadmin  - all businesses, full management (add / remove trainees, verify, score, hierarchy images, export)
//   admin       - full view of the business(es) in "business" (string, or list like ["Magnus","Alims"])
//   department  - only the trainees of "dept" inside "business" (leave business out = that department in every business)
//   trainee     - only their own record; "trainee" must match the trainee's name (or use traineeId)
// "business" must match a name in BUSINESSES exactly. "dept" must match a name in DEPTS.
// NOTE: this is a front-end login. Anyone who can open the site files can read these passwords,
//       so use it to organise who sees what, not to protect secret data. Change the demo passwords.

const ROLE_LABELS = {
  developer: "Developer",
  superadmin: "Super Admin",
  admin: "Admin",
  department: "Department",
  trainee: "Trainee"
};

// 1 = allowed, 0 = hidden / blocked. Change a value to change what that role can do.
// Names shown in the Users & permissions screen (developer login). "manage" = open that screen; developer only.
const PERM_LABELS = {
  add: "Add trainee",
  del: "Remove trainee",
  ename: "Edit trainee name",
  upload: "Upload video",
  map: "Map videos to tasks",
  hier: "Hierarchy images (upload / remove)",
  verify: "Verify steps",
  score: "Add / edit module scores",
  csv: "Export CSV",
  salary: "See salary and wage",
  watch: "Watch video"
};

const ROLE_PERMS = {
  //              add trainee, remove, edit name, upload video, map videos, hierarchy image, verify, score, export CSV, see salary, watch video
  developer:  { add:1, del:1, ename:1, upload:1, map:1, hier:1, verify:1, score:1, csv:1, salary:1, watch:1, manage:1 },
  superadmin: { add:1, del:1, ename:1, upload:0, map:0, hier:1, verify:1, score:1, csv:1, salary:1, watch:1, manage:0 },
  admin:      { add:1, del:1, ename:1, upload:0, map:0, hier:1, verify:1, score:1, csv:1, salary:1, watch:1, manage:0 },
  department: { add:0, del:0, ename:0, upload:0, map:0, hier:0, verify:1, score:1, csv:1, salary:0, watch:1, manage:0 },
  trainee:    { add:0, del:0, ename:0, upload:0, map:0, hier:0, verify:0, score:0, csv:0, salary:1, watch:1, manage:0 }
};

const USERS = [
  { username: "developer",        password: "dev@123",     name: "Developer",             role: "developer" },
  { username: "superadmin",       password: "super@123",   name: "Super Admin",           role: "superadmin" },
  { username: "magnus.admin",     password: "admin@123",   name: "Magnus Admin",          role: "admin",      business: "Magnus" },
  { username: "alims.admin",      password: "admin@123",   name: "Alims Admin",           role: "admin",      business: "Alims" },
  { username: "magnus.marketing", password: "dept@123",    name: "Magnus Marketing Head", role: "department", business: "Magnus", dept: "Marketing" },
  { username: "arun",             password: "trainee@123", name: "Arun",                  role: "trainee",    trainee: "Arun" }
];