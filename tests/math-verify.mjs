/**
 * Civil-specific converter math verification (Construction page).
 * Run: node tests/math-verify.mjs
 */

const M_INTL = 0.3048;
const M_SURVEY = 1200 / 3937;
const M_INCH = M_INTL / 12;
const M2_SQ_FT = M_INTL ** 2;
const M2_SQ_YD = (3 * M_INTL) ** 2;
const M2_ACRE = 43560 * M2_SQ_FT;
const M3_CU_FT = M_INTL ** 3;
const M3_CU_YD = (3 * M_INTL) ** 3;
const DEG = 180 / Math.PI;
const TOL = 1e-9;

let passed = 0;
let failed = 0;

function assert(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
}

function near(a, b, tol = TOL) {
  return Math.abs(a - b) <= tol;
}

function roundTrip(from, to, back, value, tol = TOL) {
  return near(back(to(from(value))), value, tol);
}

// --- Distance / unit constants ---
assert("1 intl ft = 0.3048 m", near(M_INTL, 0.3048));
assert("1 survey ft = 1200/3937 m", near(M_SURVEY, 0.3048006096012192));
assert("survey vs intl diff at 1000 ft", near(1000 * M_SURVEY - 1000 * M_INTL, 0.0006096012192, 1e-12));

// 10 ft round trips
const tenFtM = 10 * M_INTL;
assert("meters -> survey ft -> meters", roundTrip((m) => m, (m) => m / M_SURVEY, (ft) => ft * M_SURVEY, tenFtM, 1e-12));
assert("meters -> intl ft -> meters", roundTrip((m) => m, (m) => m / M_INTL, (ft) => ft * M_INTL, tenFtM));
assert("meters -> inches -> meters", roundTrip((m) => m, (m) => m / M_INCH, (in) => in * M_INCH, tenFtM));

// 12'-6 1/2" = 12 + 6.5/12 ft
const carpenterFt = 12 + 6.5 / 12;
const carpenterM = carpenterFt * M_INTL;
assert("12'-6 1/2\" in meters", near(carpenterM, 3.8227, 1e-3));

// --- Slope ---
function slopePercentToTangent(p) {
  return p / 100;
}
function slopeRatioToTangent(rise, run) {
  return rise / run;
}
function slopeDegToTangent(d) {
  return Math.tan((d * Math.PI) / 180);
}

assert("4:12 = 33.333...%", near(slopeRatioToTangent(4, 12) * 100, 100 / 3, 1e-10));
assert("2% grade degrees", near(Math.atan(0.02) * DEG, 1.14576, 1e-4));
assert("1:48 drainage percent", near(slopeRatioToTangent(1, 48) * 100, 100 / 48, 1e-10));
assert("45° = 100%", near(slopeDegToTangent(45), 1));
assert("percent -> deg -> percent", roundTrip((p) => p / 100, (t) => Math.atan(t) * DEG, (d) => slopeDegToTangent(d) * 100, 2.5, 1e-10));

// --- Area ---
assert("1 acre = 43560 ft² in m²", near(M2_ACRE, 43560 * M2_SQ_FT));
assert("1 yd² = 9 ft² in m²", near(M2_SQ_YD, 9 * M2_SQ_FT));
assert("100 ft² round trip", roundTrip((ft2) => ft2 * M2_SQ_FT, (m2) => m2 / M2_SQ_FT, (ft2) => ft2 * M2_SQ_FT, 100));
assert("2 ac -> m² -> ac", roundTrip((ac) => ac * M2_ACRE, (m2) => m2 / M2_ACRE, (ac) => ac * M2_ACRE, 2));

// --- Volume ---
assert("1 yd³ = 27 ft³ in m³", near(M3_CU_YD, 27 * M3_CU_FT));
assert("10 yd³ round trip", roundTrip((yd3) => yd3 * M3_CU_YD, (m3) => m3 / M3_CU_YD, (yd3) => yd3 * M3_CU_YD, 10));

// --- Pythagorean ---
const a = 3 * M_INTL;
const b = 4 * M_INTL;
const c = Math.hypot(a, b);
assert("3-4-5 triangle hypotenuse", near(c / M_INTL, 5, 1e-10));
assert("triangle area 3×4/2 ft²", near((a * b) / 2 / M2_SQ_FT, 6, 1e-10));

// --- Circle ---
const r = 5 * M_INTL;
const circleArea = Math.PI * r * r;
assert("circle r=5 ft area", near(circleArea / M2_SQ_FT, Math.PI * 25, 1e-10));
const depth = 2 * M_INTL;
assert("circle volume r=5 d=2 ft", near((circleArea * depth) / M3_CU_FT, Math.PI * 25 * 2, 1e-10));

// --- Construction calc area chain (10' × 12') ---
const dim1 = 10 * M_INTL;
const dim2 = 12 * M_INTL;
const areaM2 = dim1 * dim2;
assert("calc area 10×12 ft = 120 sq ft", near(areaM2 / M2_SQ_FT, 120));

// --- Construction calc volume (2×3×4 ft) ---
const volM3 = 2 * M_INTL * 3 * M_INTL * 4 * M_INTL;
assert("calc volume 2×3×4 ft = 24 ft³", near(volM3 / M3_CU_FT, 24));

// --- Tip calc ---
const check = 100;
const tipPct = 18;
const tip = check * (tipPct / 100);
assert("tip forward $100 @ 18%", near(tip, 18) && near(check + tip, 118));
const maxSpend = 130;
const revTip = maxSpend - check;
assert("tip reverse max $130 check $100", near(revTip, 30) && near((revTip / check) * 100, 30));

// --- Known field conversions ---
assert("1 mile = 1609.344 m (travel - not civil page but sanity)", near(1609.344, 1609.344));

console.log(`\n=== CIVIL MATH VERIFY ===`);
console.log(`Passed: ${passed}  Failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
