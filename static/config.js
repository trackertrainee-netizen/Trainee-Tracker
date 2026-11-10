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

// Roles and account scope come from Supabase profiles and are enforced by database RLS.

const ROLE_LABELS = {
  developer: "Developer",
  business: "Business",
  business_view: "Business viewer",
  trainee: "Trainee"
};

// 1 = allowed, 0 = hidden in the interface. Database access is enforced by RLS.
const ROLE_PERMS = {
  developer:     { add:1, del:1, ename:1, upload:1, map:1, hier:1, verify:1, score:1, csv:1, salary:1, watch:1, work:0 },
  business:      { add:1, del:1, ename:1, upload:0, map:0, hier:1, verify:1, score:1, csv:1, salary:1, watch:1, work:0 },
  business_view: { add:0, del:0, ename:0, upload:0, map:0, hier:0, verify:0, score:0, csv:1, salary:0, watch:1, work:0 },
  trainee:       { add:0, del:0, ename:0, upload:0, map:0, hier:0, verify:0, score:0, csv:0, salary:0, watch:1, work:1 }
};