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

// Roles and account scope come from Supabase profiles and are enforced by database RLS.

const ROLE_LABELS = {
  developer: "Developer",
  business: "Business",
  business_hr: "HR",
  business_view: "Business viewer",
  trainee: "Trainee"
};

const PERM_LABELS = {
  add: "Add trainee",
  del: "Remove trainee",
  ename: "Edit trainee name",
  upload: "Upload video",
  map: "Map videos",
  hier: "Manage hierarchy images",
  score: "Manage module scores",
  csv: "Export CSV",
  salary: "View salary and wage",
  watch: "Watch videos",
  replay: "Review video replays",
  work: "Complete trainee tasks"
};

// 1 = allowed, 0 = hidden in the interface. Database access is enforced by RLS.
const ROLE_PERMS = {
  developer:     { add:1, del:1, ename:1, upload:1, map:1, hier:1, score:1, csv:1, salary:1, watch:1, replay:1, work:0 },
  business:      { add:1, del:1, ename:1, upload:0, map:0, hier:1, score:1, csv:1, salary:1, watch:1, replay:0, work:0 },
  business_hr:   { add:1, del:1, ename:1, upload:0, map:0, hier:1, score:1, csv:1, salary:1, watch:1, replay:1, work:0 },
  business_view: { add:0, del:0, ename:0, upload:0, map:0, hier:0, score:0, csv:1, salary:0, watch:1, replay:0, work:0 },
  trainee:       { add:0, del:0, ename:0, upload:0, map:0, hier:0, score:0, csv:0, salary:0, watch:1, replay:0, work:1 }
};