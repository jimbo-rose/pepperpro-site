/*
 * vialmath.js — the reconstitution arithmetic from PepperPro's VialMath
 * package, ported line for line to JavaScript.
 *
 * Why this exists: in October 2026 App Review began treating "dose in,
 * volume and syringe marks out" as a drug dosage calculator under guideline
 * 1.4.2, and the category removed it from the App Store. The web is outside
 * that rule. So the arithmetic lives here, on the site, and the app records
 * what the user typed.
 *
 * It is checked against the Swift package, not against hand-typed
 * expectations: `test.js` runs every row of `vectors.json`, which the Swift
 * code generated, through these functions and compares. If the two ever
 * disagree the Swift package is right and this file is wrong.
 *
 * Nothing here suggests a dose. The dose is an input. Mass is never a bare
 * number — every quantity carries its unit — because mcg/mg confusion is the
 * single most common user error in this domain. Syringe *scale* (what one
 * mark means) and *capacity* (how much the barrel holds) are separate values
 * and neither is ever inferred from the other, because "draw 10 units" is
 * 0.10 mL on U-100 and 0.25 mL on U-40 and nothing on screen looks
 * different.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.VialMath = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // MARK: Mass

  const MassUnit = {
    microgram: { micrograms: 1, symbol: "mcg", spoken: "micrograms" },
    milligram: { micrograms: 1000, symbol: "mg", spoken: "milligrams" },
    gram: { micrograms: 1000000, symbol: "g", spoken: "grams" },
  };

  function mass(value, unitName) {
    return { micrograms: value * MassUnit[unitName].micrograms };
  }
  function massConverted(m, unitName) {
    return m.micrograms / MassUnit[unitName].micrograms;
  }
  function naturalUnit(m) {
    if (m.micrograms >= 1000000) return "gram";
    if (m.micrograms >= 1000) return "milligram";
    return "microgram";
  }

  // MARK: Volume, concentration

  function volume(millilitres) {
    return { millilitres: millilitres };
  }
  function concentration(microgramsPerMillilitre) {
    return { microgramsPerMillilitre: microgramsPerMillilitre };
  }
  function concentrationVolumeContaining(c, m) {
    if (!(c.microgramsPerMillilitre > 0)) return null;
    return volume(m.micrograms / c.microgramsPerMillilitre);
  }
  function concentrationValue(c, unitName) {
    return c.microgramsPerMillilitre / MassUnit[unitName].micrograms;
  }

  // MARK: Scale — the 2.5x hazard

  const SyringeScale = {
    u100: { unitsPerMillilitre: 100, label: "U-100", accessibilityLabel: "U-100 scale, one unit is 0.01 millilitres" },
    u40: { unitsPerMillilitre: 40, label: "U-40", accessibilityLabel: "U-40 scale, one unit is 0.025 millilitres" },
  };
  function millilitresPerUnit(scaleName) {
    return 1 / SyringeScale[scaleName].unitsPerMillilitre;
  }
  function scaleVolumeForUnits(scaleName, units) {
    return volume(units * millilitresPerUnit(scaleName));
  }
  function scaleUnitsForVolume(scaleName, v) {
    return v.millilitres * SyringeScale[scaleName].unitsPerMillilitre;
  }

  // MARK: Capacity — not scale

  function capacity(millilitres, name) {
    return { millilitres: millilitres, name: name };
  }
  const SyringeCapacity = {
    insulin30: capacity(0.3, "0.3 mL"),
    insulin50: capacity(0.5, "0.5 mL"),
    insulin100: capacity(1.0, "1 mL"),
    luer3: capacity(3.0, "3 mL"),
    luer5: capacity(5.0, "5 mL"),
  };
  SyringeCapacity.common = [
    SyringeCapacity.insulin30, SyringeCapacity.insulin50, SyringeCapacity.insulin100,
    SyringeCapacity.luer3, SyringeCapacity.luer5,
  ];
  function fullScaleUnits(cap, scaleName) {
    return cap.millilitres * SyringeScale[scaleName].unitsPerMillilitre;
  }
  // Only insulin syringes (≤ 1 mL) are printed in units. A 3 or 5 mL luer
  // barrel is ruled in millilitres, every 0.1 mL, and carries no unit marks.
  function isMarkedInUnits(cap) {
    return cap.millilitres <= 1.0;
  }
  function tenthMillilitreMarks(cap) {
    return Math.round(cap.millilitres * 10);
  }

  // MARK: Readability

  const comfortableMinimumUnits = 10;
  const hardToReadUnits = 5;

  function readability(units, cap, scaleName) {
    const fullScale = fullScaleUnits(cap, scaleName);
    if (units > fullScale) return { kind: "overflows", value: fullScale };
    if (units < hardToReadUnits) return { kind: "veryHardToRead", value: units };
    if (units < comfortableMinimumUnits) return { kind: "tight", value: units };
    if (units > fullScale * 0.9) return { kind: "nearCapacity", value: units };
    return { kind: "comfortable", value: units };
  }
  function warrantsSuggestion(r) {
    return r.kind === "overflows" || r.kind === "veryHardToRead" || r.kind === "tight";
  }
  function isBlocking(r) {
    return r.kind === "overflows";
  }

  function betterCapacity(units, scaleName, current) {
    const candidates = SyringeCapacity.common
      .filter((c) => c.millilitres !== current.millilitres)
      .sort((a, b) => a.millilitres - b.millilitres);
    for (const c of candidates) {
      if (readability(units, c, scaleName).kind === "comfortable") return c;
    }
    for (const c of candidates) {
      const k = readability(units, c, scaleName).kind;
      if (k === "nearCapacity" || k === "tight") return c;
    }
    return null;
  }

  // MARK: Formatting — must match Swift's fmt() exactly

  // Swift's String(format: "%.Nf") and JS's toFixed both round on the
  // double's exact value, and they differ only on an *exact* tie — a value
  // like 0.625 or 0.03125 whose binary expansion really does end in a 5 at
  // the next decimal place. There printf rounds to even and toFixed rounds
  // up. 0.00625 is not such a tie: its double is a hair above 1/160, and
  // both round it up to 0.0063, which the first draft of this function got
  // wrong by testing the scaled product instead of the value.
  //
  // A value is an exact tie at `places` decimals iff it is an odd multiple
  // of 2^-(places+1). Multiplying by a power of two is exact, so the test
  // below is exact.
  function fixed(value, places) {
    const t = value * Math.pow(2, places + 1);
    if (Number.isInteger(t) && Math.abs(t) % 2 === 1) {
      const scale = Math.pow(10, places);
      const floor = Math.floor(value * scale);
      const even = floor % 2 === 0 ? floor : floor + 1;
      return (even / scale).toFixed(places);
    }
    return value.toFixed(places);
  }
  function fmt(value, places) {
    if (places === undefined) places = 3;
    if (value === Math.round(value) && Math.abs(value) < 1e9) return String(Math.trunc(value));
    let s = fixed(value, places);
    while (s.indexOf(".") !== -1 && s.endsWith("0")) s = s.slice(0, -1);
    if (s.endsWith(".")) s = s.slice(0, -1);
    return s;
  }

  // MARK: Errors

  const errorMessages = {
    vialMassNotPositive: "Enter the amount of compound in the vial.",
    diluentNotPositive: "Enter how much liquid you are mixing in.",
    doseNotPositive: "Enter the amount you plan to draw per dose.",
    doseExceedsVial: "One dose is larger than the whole vial. Check the amounts.",
  };
  function fail(code) {
    const e = new Error(errorMessages[code]);
    e.code = code;
    return e;
  }

  // MARK: Forward solve

  // input: { vialMass, diluent, dose, scale: "u100"|"u40", capacity, displayUnit }
  function solve(input) {
    const scaleName = input.scale || "u100";
    const cap = input.capacity || SyringeCapacity.insulin100;
    const unit = input.displayUnit || "milligram";
    if (!(input.vialMass.micrograms > 0)) throw fail("vialMassNotPositive");
    if (!(input.diluent.millilitres > 0)) throw fail("diluentNotPositive");
    if (!(input.dose.micrograms > 0)) throw fail("doseNotPositive");
    if (!(input.dose.micrograms <= input.vialMass.micrograms)) throw fail("doseExceedsVial");

    const conc = concentration(input.vialMass.micrograms / input.diluent.millilitres);
    const doseVolume = concentrationVolumeContaining(conc, input.dose) || volume(0);
    const doseUnits = scaleUnitsForVolume(scaleName, doseVolume);
    const dosesPerVial = Math.floor(input.vialMass.micrograms / input.dose.micrograms);
    const read = readability(doseUnits, cap, scaleName);
    const sym = MassUnit[unit].symbol;
    const vialIn = massConverted(input.vialMass, unit);
    const doseIn = massConverted(input.dose, unit);
    const concIn = concentrationValue(conc, unit);

    const steps = [
      { id: "concentration", label: "Concentration",
        expression: fmt(vialIn) + " " + sym + " ÷ " + fmt(input.diluent.millilitres) + " mL = " + fmt(concIn) + " " + sym + "/mL" },
      { id: "doseVolume", label: "Volume per dose",
        expression: fmt(doseIn) + " " + sym + " ÷ " + fmt(concIn) + " " + sym + "/mL = " + fmt(doseVolume.millilitres, 4) + " mL" },
      { id: "doseUnits", label: "Marks to draw",
        expression: fmt(doseVolume.millilitres, 4) + " mL × " + fmt(SyringeScale[scaleName].unitsPerMillilitre) + " marks/mL = " + fmt(doseUnits, 2) + " units on " + SyringeScale[scaleName].label },
      { id: "dosesPerVial", label: "Doses in the vial",
        expression: fmt(vialIn) + " " + sym + " ÷ " + fmt(doseIn) + " " + sym + " = " + dosesPerVial + " (liquid volume does not change this)" },
    ];

    return { concentration: conc, doseVolume: doseVolume, doseUnits: doseUnits, dosesPerVial: dosesPerVial, readability: read, steps: steps };
  }

  // MARK: Inverse solve — how much liquid puts one dose on a chosen mark

  function diluentToPlace(dose, targetUnits, vialMass, scaleName) {
    if (!(vialMass.micrograms > 0)) throw fail("vialMassNotPositive");
    if (!(dose.micrograms > 0)) throw fail("doseNotPositive");
    if (!(targetUnits > 0)) throw fail("doseNotPositive");
    const dosesPerVial = vialMass.micrograms / dose.micrograms;
    const volumePerDose = targetUnits * millilitresPerUnit(scaleName);
    return volume(dosesPerVial * volumePerDose);
  }

  function readabilityOptions(input, result, vialCapacity) {
    if (!warrantsSuggestion(result.readability)) return [];
    const scaleName = input.scale || "u100";
    const cap = input.capacity || SyringeCapacity.insulin100;
    const options = [];
    let target = null;
    try { target = diluentToPlace(input.dose, comfortableMinimumUnits, input.vialMass, scaleName); } catch (e) { target = null; }
    if (target && target.millilitres <= vialCapacity.millilitres && target.millilitres > input.diluent.millilitres) {
      options.push({ kind: "moreDiluent", volume: target, resultingUnits: comfortableMinimumUnits });
    }
    const better = betterCapacity(result.doseUnits, scaleName, cap);
    if (better) options.push({ kind: "differentBarrel", capacity: better });
    return options;
  }

  // MARK: The inverted question — dose in, water out

  const comfortableTargetUnits = 30;

  function dilutionPlan(vialMass, dose, scaleName, barrel, vialCapacity) {
    if (!(vialMass.micrograms > 0) || !(dose.micrograms > 0) || !(vialCapacity.millilitres > 0) || !(dose.micrograms <= vialMass.micrograms)) return null;
    const dosesPerVial = vialMass.micrograms / dose.micrograms;
    const barrelUnits = fullScaleUnits(barrel, scaleName);
    const unitsIfFull = vialCapacity.millilitres * SyringeScale[scaleName].unitsPerMillilitre / dosesPerVial;
    const unitsIfBarrelFull = barrelUnits * 0.9;
    const target = Math.min(unitsIfFull, unitsIfBarrelFull, comfortableTargetUnits);

    let limit;
    if (unitsIfFull < hardToReadUnits) limit = "doseTooSmallForVial";
    else if (target === comfortableTargetUnits) limit = "comfortable";
    else if (unitsIfFull <= unitsIfBarrelFull) limit = "vialCapacity";
    else limit = "barrelLength";

    const raw = dosesPerVial * target * millilitresPerUnit(scaleName);
    const rounded = Math.floor(raw * 10) / 10;
    const vol = volume(Math.max(rounded, 0.1));
    const actualUnits = (vol.millilitres / dosesPerVial) * SyringeScale[scaleName].unitsPerMillilitre;

    return {
      diluent: vol,
      units: actualUnits,
      doses: Math.floor(dosesPerVial),
      limit: limit,
      barrelUse: barrelUnits > 0 ? Math.min(actualUnits / barrelUnits, 1) : 0,
      isReadable: actualUnits >= hardToReadUnits,
      isComfortable: actualUnits >= comfortableMinimumUnits,
    };
  }

  function easiestBarrel(units, scaleName, current) {
    const fits = SyringeCapacity.common
      .filter((c) => units <= fullScaleUnits(c, scaleName) * 0.9)
      .sort((a, b) => a.millilitres - b.millilitres);
    if (fits.length === 0) return null;
    const best = fits[0];
    return best.millilitres < current.millilitres ? best : null;
  }

  return {
    MassUnit, mass, massConverted, naturalUnit,
    volume, concentration, concentrationVolumeContaining, concentrationValue,
    SyringeScale, millilitresPerUnit, scaleVolumeForUnits, scaleUnitsForVolume,
    SyringeCapacity, capacity, fullScaleUnits, isMarkedInUnits, tenthMillilitreMarks,
    comfortableMinimumUnits, hardToReadUnits, comfortableTargetUnits,
    readability, warrantsSuggestion, isBlocking, betterCapacity,
    fmt, errorMessages,
    solve, diluentToPlace, readabilityOptions, dilutionPlan, easiestBarrel,
  };
});
