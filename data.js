// S.3 Maths Answer Finder — data.js
// ALL content copied exactly from PDFs

const SECTIONS = {

  "4.1": {
    label: "4.1",
    questions: {
      1: { steps: ["x = 105° | (opp. ∠s of //gram)", "y + 105° = 180° | (int. ∠s, AB // DC)", "y = 75°", "z = y | (opp. ∠s of //gram)", "= 75°"], answer: "x = 105°, y = 75°, z = 75°" },
      2: { steps: ["x + 126° = 180° | (int. ∠s, AD // BC)", "x = 54°", "2y + 110° = 126° | (opp. ∠s of //gram)", "y = 8°"], answer: "x = 54°, y = 8°" },
      3: { steps: ["x + 124° = 180° | (int. ∠s, AB // DC)", "x = 56°", "3y + 5° = x | (opp. ∠s of //gram)", "3y + 5° = 56°", "y = 17°"], answer: "x = 56°, y = 17°" },
      4: { steps: ["5x + 45° = 6x + 29° | (opp. ∠s of //gram)", "x = 16°"], answer: "x = 16°" },
      5: { steps: ["12x = 8x + 20 | (opp. sides of //gram)", "4x = 20", "x = 5"], answer: "x = 5" },
      6: { steps: ["3x = 45 | (diags. of //gram)", "x = 15"], answer: "x = 15" },
      7: { steps: ["In △ABE,", "∠ABE + ∠BAE = ∠AEC | (ext. ∠ of △)", "∠ABE + 27° = 90°", "∠ABE = 63°", "x = ∠ABE | (opp. ∠s of //gram)", "= 63°"], answer: "x = 63°" },
      8: { steps: ["∠BAD = 105° | (opp. ∠s of //gram)", "In △ABD,", "∠ADB + ∠ABD + ∠BAD = 180° | (∠ sum of △)", "x + 40° + 105° = 180°", "x = 35°"], answer: "x = 35°" },
      9: { steps: ["∠DCE = 70° | (base ∠s, isos. △)", "x = ∠DCE | (opp. ∠s of //gram)", "= 70°", "y + ∠DCE = 180° | (int. ∠s, AB // DC)", "y + 70° = 180°", "y = 110°"], answer: "x = 70°, y = 110°" },
      10: { steps: ["In △AED,", "∠ADE + ∠AED + ∠DAE = 180° | (∠ sum of △)", "∠ADE + 80° + 25° = 180°", "∠ADE = 75°", "∠ABC = ∠ADE | (opp. ∠s of //gram)", "= 75°"], answer: "∠ABC = 75°" },
      11: { steps: ["In △BCD,", "∠BCD + ∠BDC + ∠DBC = 180° | (∠ sum of △)", "∠BCD + 43° + 90° = 180°", "∠BCD = 47°", "∠BAD = ∠BCD | (opp. ∠s of //gram)", "= 47°"], answer: "∠BAD = 47°" },
      12: { steps: ["∠ABC = 97° | (opp. ∠s of //gram)", "In △ABC,", "∠ACB + ∠ABC + ∠BAC = 180° | (∠ sum of △)", "∠ACB + 97° + 54° = 180°", "∠ACB = 29°"], answer: "∠ACB = 29°" },
      13: { steps: ["∠CED + ∠CEA = 180° | (adj. ∠s on st. line)", "∠CED + 106° = 180°", "∠CED = 74°", "∠CDE = ∠CED | (base ∠s, isos. △)", "= 74°", "∠ABC = ∠CDE | (opp. ∠s of //gram)", "= 74°"], answer: "∠ABC = 74°" },
      14: { steps: ["∠DEA + ∠DEB = 180° | (adj. ∠s on st. line)", "∠DEA + 146° = 180°", "∠DEA = 34°", "∠EDA = ∠DEA | (base ∠s, isos. △)", "= 34°", "In △AED,", "∠EAD + ∠EDA + ∠DEA = 180° | (∠ sum of △)", "∠EAD + 34° + 34° = 180°", "∠EAD = 112°", "∠BCD = ∠EAD | (opp. ∠s of //gram)", "= 112°"], answer: "∠BCD = 112°" },
      15: { steps: ["∠ADE = 102° | (opp. ∠s of //gram)", "In △ADE,", "∠AEC = ∠DAE + ∠ADE | (ext. ∠ of △)", "= 30° + 102°", "= 132°"], answer: "∠AEC = 132°" },
      16: { steps: ["∠ECD = 104° | (opp. ∠s of //gram)", "In △CDE,", "∠EDC + ∠ECD = ∠BED | (ext. ∠ of △)", "∠EDC + 104° = 136°", "∠EDC = 32°"], answer: "∠EDC = 32°" },
      17: { steps: ["∠BCD = 108° | (opp. ∠s of //gram)", "∠BCE = ∠BCD − ∠ECD", "= 108° − 65°", "= 43°", "In △BCE,", "∠DEC = ∠BCE + ∠CBE | (ext. ∠ of △)", "= 43° + 32°", "= 75°"], answer: "∠DEC = 75°" },
      18: { steps: ["∠ADC = 75° | (opp. ∠s of //gram)", "∵ ∠ADE + ∠DAC = (65° + 75°) + 40°", "= 180°", "∴ AC // DE | (int. ∠s supp.)", "AD // CE | (given)", "∵ AC // DE and AD // CE", "∴ ACED is a parallelogram. | (by definition)"], answer: "ACED is a parallelogram." },
      19: { steps: ["∠BAD + ∠ADC + ∠DCB + ∠CBA = 360° | (∠ sum of polygon)", "∠BAD + 104° + 76° + 104° = 360°", "∠BAD = 76°", "∵ ∠BAD = ∠BCD = 76° and ∠ADC = ∠CBA = 104°", "∴ ABCD is a parallelogram. | (opp. ∠s equal)"], answer: "ABCD is a parallelogram." },
      20: { steps: ["∠ADF = 70° | (opp. ∠s of //gram)", "In △ADF,", "∠AFD + ∠ADF + ∠DAF = 180° | (∠ sum of △)", "∠AFD + 70° + 30° = 180°", "∠AFD = 80°", "∵ ∠AFD = ∠ECF = 80°", "∴ AF // EC | (corr. ∠s equal)", "AE // FC | (given)", "∴ AECF is a parallelogram. | (by definition)"], answer: "AECF is a parallelogram." },
      21: { steps: ["AD = CD | (definition of square)", "= 6", "AE = AD − DE", "= 6 − 3", "= 3", "∵ AE // FC and | (given)", "AE = FC = 3", "∴ AFCE is a parallelogram. | (2 sides // and equal)"], answer: "AFCE is a parallelogram." },
      22: { steps: ["AD = BF | (opp. sides of //gram)", "DE + 5 = 9", "DE = 4", "FC = DE | (opp. sides of //gram)", "= 4", "BC = BF + FC", "= 9 + 4", "= 13"], answer: "BC = 13" },
      23: { steps: ["AE = BC | (opp. sides of //gram)", "= 3", "FD = BC | (opp. sides of //gram)", "= 3", "AD = AE + EF + FD", "= 3 + 3 + 3", "= 9"], answer: "AD = 9" },
      24: { steps: ["∵ ∠BEA = ∠DAE | (alt. ∠s, AD // BE)", "= ∠BAE | (given)", "∴ BE = AB | (sides opp. equal ∠s)", "= 17", "BC = AD | (opp. sides of //gram)", "= 13", "CE = BE − BC", "= 17 − 13", "= 4"], answer: "CE = 4" },
      25: { steps: ["CD = AB | (opp. sides of //gram)", "= 9", "BD = 2BF | (diags. of //gram)", "= 2 × 8", "= 16", "In △BDE,", "BE² + DE² = BD² | (Pyth. theorem)", "BE² + 8² = 16²", "BE = √(16² − 8²)", "= √192", "In △CDE,", "CE² + DE² = CD² | (Pyth. theorem)", "CE² + 8² = 9²", "CE = √(9² − 8²)", "= √17", "BC = BE − CE", "= √192 − √17", "= 9.73, cor. to 3 sig. fig."], answer: "BC = 9.73" },
      26: { steps: ["∠BGD = ∠BCD | (opp. ∠s of //gram)", "= 123°", "∠FGD + ∠EDG = 180° | (int. ∠s, FG // ED)", "∠FGD + 72° = 180°", "∠FGD = 108°", "∠BGF + ∠BGD + ∠FGD = 360° | (∠s at a pt.)", "∠BGF + 123° + 108° = 360°", "∠BGF = 129°", "∠BAF = ∠BGF | (opp. ∠s of //gram)", "= 129°"], answer: "∠BAF = 129°" },
      27: { steps: ["Reflex ∠BCD + ∠CBE + ∠BED + ∠CDE = 360° | (∠ sum of polygon)", "Reflex ∠BCD + 25° + 70° + 20° = 360°", "Reflex ∠BCD = 245°", "∠BCD + Reflex ∠BCD = 360° | (∠s at a pt.)", "∠BCD + 245° = 360°", "∠BCD = 115°", "∠BAD = ∠BCD | (opp. ∠s of //gram)", "= 115°"], answer: "∠BAD = 115°" },
      28: { parts: [
        { label: "(a)", steps: ["∠DEC = ∠DCE | (base ∠s, isos. △)", "In △DEC,", "∠EDC + ∠DEC + ∠DCE = 180° | (∠ sum of △)", "50° + 2∠DCE = 180°", "∠DCE = 65°", "∠ABC + ∠DCE = 180° | (int. ∠s, AB // DC)", "∠ABC + 65° = 180°", "∠ABC = 115°"], answer: "∠ABC = 115°" },
        { label: "(b)", steps: ["∠DAB = ∠DCE | (opp. ∠s of //gram)", "= 65°", "∠DAC = ∠DAB − ∠BAC", "= 65° − 36°", "= 29°"], answer: "∠DAC = 29°" }
      ]},
      29: { parts: [
        { label: "(a)", steps: ["∠ABE = 60° | (property of equil. △)", "∠DCE + ∠ABE = 180° | (int. ∠s, AB // DC)", "∠DCE + 60° = 180°", "∠DCE = 120°", "∵ DC = AB | (opp. sides of //gram)", "= BE | (definition of equil. △)", "= EC | (given)", "∴ ∠DEC = ∠EDC | (base ∠s, isos. △)", "In △DEC,", "∠DCE + ∠DEC + ∠EDC = 180° | (∠ sum of △)", "120° + 2∠EDC = 180°", "∠EDC = 30°"], answer: "∠EDC = 30°" },
        { label: "(b)", steps: ["∠DEC = ∠EDC | (base ∠s, isos. △)", "= 30°", "∠BEA = 60° | (property of equil. △)", "∠BEA + ∠AED + ∠DEC = 180° | (adj. ∠s on st. line)", "60° + ∠AED + 30° = 180°", "∠AED = 90°"], answer: "∠AED = 90°" }
      ]},
      30: { steps: ["∠ABD = ∠AED | (opp. ∠s of //gram)", "= 70°", "∵ ∠BAD + ∠ABC = 75° + (70° + 35°)", "= 180°", "∴ AD // BC | (int. ∠s supp.)"], answer: "AD // BC" },
      31: { steps: ["∠AED + ∠AEC = 180° | (adj. ∠s on st. line)", "∠AED + 112° = 180°", "∠AED = 68°", "∠ADE + ∠BCE = 180° | (int. ∠s, AD // BC)", "∠ADE + 112° = 180°", "∠ADE = 68°", "∵ ∠AED = ∠ADE = 68°", "∴ △AED is an isosceles triangle. | (sides opp. equal ∠s)"], answer: "△AED is an isosceles triangle." },
      32: { steps: ["∠FAE = ∠GCB | (opp. ∠s of //gram)", "∠AFE = ∠FBG | (corr. ∠s, FE // BG)", "= ∠CGB | (alt. ∠s, AB // DC)", "In △AFE,", "∠AEF + ∠FAE + ∠AFE = 180° | (∠ sum of △)", "∠AEF = 180° − ∠FAE − ∠AFE", "= 180° − ∠GCB − ∠CGB", "= ∠CBG | (∠ sum of △)", "∴ △AFE ~ △CGB | (AAA)"], answer: "△AFE ~ △CGB" },
      33: { parts: [
        { label: "(a)", steps: ["∵ AD = BC | (opp. sides of //gram)", "∴ AD : BE = BC : BE", "= (2 + 1) : 2", "= 3 : 2", "∠DAF = ∠BEF | (alt. ∠s, AD // BE)", "∠ADF = ∠EBF | (alt. ∠s, AD // BE)", "∠AFD = ∠EFB | (vert. opp. ∠s)", "∴ △DAF ~ △BEF | (AAA)", "∴ AF : FE = AD : EB | (corr. sides, ~ △s)", "= 3 : 2"], answer: "AF : FE = 3 : 2" },
        { label: "(b)", steps: ["Area of △ABF / Area of △EBF = AF / EF", "30 cm² / Area of △EBF = 3 / 2", "Area of △EBF = 20 cm²", "Area of △ABF / Area of △ADF = BF / DF", "= EF / AF | (corr. sides, ~ △s)", "30 cm² / Area of △ADF = 2 / 3", "Area of △ADF = 45 cm²", "Let x cm² be the area of quadrilateral DFEC.", "∵ Area of △ABD = area of △CBD", "∴ 30 + 45 = 20 + x", "x = 55", "∴ The area of quadrilateral DFEC is 55 cm²."], answer: "55 cm²" }
      ]},
      34: { parts: [
        { label: "(a)", steps: ["∵ CD = AB | (opp. sides of //gram)", "∴ AE : CD = AE : AB", "= 4 : (4 + 1)", "= 4 : 5", "∠FAE = ∠FCD | (alt. ∠s, AE // DC)", "∠FEA = ∠FDC | (alt. ∠s, AE // DC)", "∠AFE = ∠CFD | (vert. opp. ∠s)", "∴ △AFE ~ △CFD | (AAA)", "∴ AF : CF = AE : CD | (corr. sides, ~ △s)", "= 4 : 5"], answer: "AF : CF = 4 : 5" },
        { label: "(b)", steps: ["Area of △AEF / Area of △ADF = EF / DF", "= AF / CF | (corr. sides, ~ △s)", "16 cm² / Area of △ADF = 4 / 5", "Area of △ADF = 20 cm²", "Area of △ADF / Area of △CDF = AF / CF", "20 cm² / Area of △CDF = 4 / 5", "Area of △CDF = 25 cm²", "Area of parallelogram ABCD", "= 2 × area of △ADC", "= 2 × (20 + 25) cm²", "= 90 cm²"], answer: "90 cm²" }
      ]},
      35: { steps: ["BF = DE | (corr. sides, ≅ △s)", "BC = AD | (property of rectangle)", "CF = BC − BF", "= AD − DE", "= AE", "AF = CE | (corr. sides, ≅ △s)", "∵ CF = AE and AF = CE", "∴ AFCE is a parallelogram. | (opp. sides equal)"], answer: "AFCE is a parallelogram." },
      36: { steps: ["∵ △ADF ~ △EBF | (given)", "∴ AD / EB = AF / EF | (corr. sides, ~ △s)", "= 2 / 1", "AD = 2EB", "BC = 2EB | (given)", "= AD", "∵ ∠ADF = ∠EBF | (corr. ∠s, ~ △s)", "∴ BE // AD | (alt. ∠s equal)", "∵ BC = AD and BC // AD", "∴ ABCD is a parallelogram. | (2 sides // and equal)"], answer: "ABCD is a parallelogram." },
      37: { steps: ["∵ Area of △ABE = area of △BCE | (given)", "∴ AE = CE", "∵ Area of △ABE = area of △DAE | (given)", "∴ BE = DE", "∵ AE = CE and BE = DE", "∴ ABCD is a parallelogram. | (diags. bisect each other)"], answer: "ABCD is a parallelogram." },
      38: { steps: ["AD // BC | (given)", "∠BAF = ∠DCE | (given)", "∠EAF = ∠FCE | (opp. ∠s of //gram)", "∵ ∠BAD + ∠CDA", "= (∠BAF + ∠EAF) + ∠CDA", "= (∠DCE + ∠FCE) + ∠CDA", "= ∠DCB + ∠CDA", "= 180° | (int. ∠s, AD // BC)", "∴ AB // DC | (int. ∠s supp.)", "∵ AD // BC and AB // DC", "∴ ABCD is a parallelogram. | (by definition)"], answer: "ABCD is a parallelogram." },
      39: { steps: ["∠EBF = (1/2)∠ABC | (given)", "∠EDF = (1/2)∠ADC | (given)", "∵ ∠ABC = ∠ADC | (opp. ∠s of //gram)", "∴ ∠EBF = ∠EDF", "ED // BF | (given)", "∵ ∠EBF + ∠DFB", "= ∠EDF + ∠DFB", "= 180° | (int. ∠s, ED // BF)", "∴ EB // DF | (int. ∠s supp.)", "∵ ED // BF and EB // DF", "∴ EBFD is a parallelogram. | (by definition)"], answer: "EBFD is a parallelogram." },
      40: { parts: [
        { label: "(a)", steps: ["∵ AD // BC and BC // EF | (given)", "∴ AD // EF", "∵ AD = BC and BC = EF | (opp. sides of //gram)", "∴ AD = EF", "∵ AD // EF and AD = EF", "∴ AEFD is a parallelogram. | (2 sides // and equal)"], answer: "AEFD is a parallelogram." },
        { label: "(b)", steps: ["AB = DC | (opp. sides of //gram)", "BE = CF | (opp. sides of //gram)", "AE = DF | (opp. sides of //gram)", "∴ △ABE ≅ △DCF | (SSS)"], answer: "△ABE ≅ △DCF" }
      ]},
      41: { steps: ["Method 1", "∵ △ABE ≅ △CDE | (given)", "∴ AE = CE | (corr. sides, ≅ △s)", "BE = DE | (corr. sides, ≅ △s)", "∴ ABCD is a parallelogram. | (diags. bisect each other)", "Method 2", "∵ △ABE ≅ △CDE | (given)", "∴ AB = DC | (corr. sides, ≅ △s)", "∵ ∠ABE = ∠CDE | (corr. ∠s, ≅ △s)", "∴ AB // DC | (alt. ∠s equal)", "∵ AB = DC and AB // DC", "∴ ABCD is a parallelogram. | (2 sides // and equal)"], answer: "ABCD is a parallelogram." },
      42: { steps: ["∠ADE = ∠CBF | (given)", "∠AED = 180° − ∠DEF | (adj. ∠s on st. line)", "= 180° − ∠BFE | (alt. ∠s, DE // FB)", "= ∠CFB | (adj. ∠s on st. line)", "ED = FB | (opp. sides of //gram)", "∴ △ADE ≅ △CBF | (ASA)", "AD = BC | (corr. sides, ≅ △s)", "∵ ∠DAE = ∠BCF | (corr. ∠s, ≅ △s)", "∴ AD // BC | (alt. ∠s equal)", "∵ AD = BC and AD // BC", "∴ ABCD is a parallelogram. | (2 sides // and equal)"], answer: "ABCD is a parallelogram." },
      43: { steps: ["I, II and III are true.", "∴ The answer is D."], answer: "D" },
      44: { steps: ["For I:", "CD = EF | (opp. sides of //gram)", "∴ I is true.", "For II:", "∠D = ∠F | (opp. ∠s of //gram)", "∴ II is true.", "For III:", "CE may not equal to DF.", "∴ III may not be true.", "∴ The answer is A."], answer: "A" },
      45: { steps: ["∠BCD = 114° | (opp. ∠s of //gram)", "∠BCD + ∠DCE = 180° | (adj. ∠s on st. line)", "114° + ∠DCE = 180°", "∠DCE = 66°", "∠DEC = ∠DCE | (base ∠s, isos. △)", "= 66°", "In △DCE,", "∠CDE + ∠DCE + ∠DEC = 180° | (∠ sum of △)", "x + 66° + 66° = 180°", "x = 48°", "∴ The answer is A."], answer: "A" },
      46: { steps: ["BE = DE | (diags. of //gram)", "= 12", "In △BCE,", "BE² + CE² = BC² | (Pyth. theorem)", "12² + CE² = 15²", "CE = √(15² − 12²)", "= 9", "AC = 2CE | (diags. of //gram)", "= 2 × 9", "= 18", "∴ The answer is D."], answer: "D" },
      47: { steps: ["∵ ∠BEA = ∠DAE | (alt. ∠s, AD // BC)", "= ∠BAE | (given)", "∴ BE = AB | (sides opp. equal ∠s)", "= CD | (opp. sides of //gram)", "= 7", "BC = AD | (opp. sides of //gram)", "= 9", "CE = BC − BE", "= 9 − 7", "= 2", "∴ The answer is B."], answer: "B" },
      48: { steps: ["∵ AD = BC | (opp. sides of //gram)", "∴ AD : BE = BC : BE", "= (2 + 3) : 2", "= 5 : 2", "Area of △AED / Area of △ABE = AD / BE", "Area of △AED / 6 cm² = 5 / 2", "Area of △AED = 15 cm²", "∴ The answer is C."], answer: "C" },
      49: { steps: ["∵ AB = CD | (opp. sides of //gram)", "∴ AB : CE = CD : CE = 2 : 1", "∠ABF = ∠CEF | (alt. ∠s, AB // EC)", "∠BAF = ∠ECF | (alt. ∠s, AB // EC)", "∠AFB = ∠CFE | (vert. opp. ∠s)", "∴ △ABF ~ △CEF | (AAA)", "Area of △CBF / Area of △CEF = BF / EF", "= AB / CE | (corr. sides, ~ △s)", "Area of △CBF / 4 cm² = 2 / 1", "Area of △CBF = 8 cm²", "Area of △ABF / Area of △CBF = AF / CF", "= AB / CE | (corr. sides, ~ △s)", "Area of △ABF / 8 cm² = 2 / 1", "Area of △ABF = 16 cm²", "Let x cm² be the area of the quadrilateral AFED.", "∵ Area of △ABC = area of △ADC", "∴ 8 + 16 = x + 4", "x = 20", "∴ The area of quadrilateral AFED is 20 cm².", "∴ The answer is C."], answer: "C" },
      50: { steps: ["For I:", "ABCD is a parallelogram. | (by definition)", "For II:", "ABCD is a parallelogram. | (2 sides // and equal)", "For III:", "ABCD may not be a parallelogram.", "∴ The answer is A."], answer: "A" },
      51: { steps: ["For I:", "AP // QC | (given)", "AP = (1/2)AB | (given)", "QC = (1/2)DC | (given)", "∵ AB = DC | (opp. sides of //gram)", "∴ AP = QC", "∵ AP // QC and AP = QC", "∴ APCQ is a parallelogram. | (2 sides // and equal)", "For II:", "∵ DQ is not parallel to PR.", "∴ DPRQ is not a parallelogram.", "For III:", "PB = AP | (given)", "= QC | (proved)", "= DQ | (given)", "PB // DQ | (given)", "∴ PBQD is a parallelogram. | (2 sides // and equal)", "∵ APCQ and PBQD are parallelograms.", "∴ SQ // PR and SP // QR", "∴ PRQS is a parallelogram. | (by definition)", "∴ The answer is B."], answer: "B" }
    }
  },

  "4.2": {
    label: "4.2",
    questions: {
      1: { steps: ["x = 90° | (property of rhombus)", "y = 58° | (property of rhombus)"], answer: "x = 90°, y = 58°" },
      2: { steps: ["2x = 6 | (property of rhombus)", "x = 3", "y = 10 | (definition of rhombus)"], answer: "x = 3, y = 10" },
      3: { steps: ["3z = z + 20 | (property of rhombus)", "z = 10", "y = 3z | (definition of rhombus)", "= 30", "4x + 2 = y | (property of rhombus)", "4x + 2 = 30", "x = 7"], answer: "z = 10, y = 30, x = 7" },
      4: { steps: ["x = 62° | (property of rhombus)", "y = 62° | (alt. ∠s, AD // BC)", "∠DAB + ∠ADC = 180° | (int. ∠s, AB // DC)", "z + 62° + 62° = 180°", "z = 56°"], answer: "x = 62°, y = 62°, z = 56°" },
      5: { steps: ["Let M be the point of intersection of AC and BD.", "MB = 16 / 2 | (property of rhombus)", "= 8", "MC = 30 / 2 | (property of rhombus)", "= 15", "In △BCM,", "MB² + MC² = BC² | (Pyth. theorem)", "8² + 15² = x²", "x = √(8² + 15²)", "= 17"], answer: "x = 17" },
      6: { steps: ["∠ADB = ∠ABD | (base ∠s, isos. △)", "In △BAD,", "∠DAB + ∠ABD + ∠ADB = 180° | (∠ sum of △)", "60° + 2∠ABD = 180°", "∠ABD = 60°", "x = ∠ABD | (property of rhombus)", "= 60°", "∠DCB = 60° | (property of rhombus)", "∵ ∠DBC = ∠DCB", "∴ y = BD | (sides opp. equal ∠s)", "= 5"], answer: "x = 60°, y = 5" },
      7: { steps: ["x = 6 | (property of rectangle)", "2y = 6 | (property of rectangle)", "y = 3"], answer: "x = 6, y = 3" },
      8: { steps: ["x = 62° | (alt. ∠s, AD // BC)", "∠ABC = 90° | (definition of rectangle)", "y + 62° = 90°", "y = 28°"], answer: "x = 62°, y = 28°" },
      9: { steps: ["2x = 4 | (property of rectangle)", "x = 2", "5y = 3y + 10 | (property of rectangle)", "y = 5"], answer: "x = 2, y = 5" },
      10: { steps: ["CD = AB | (property of rectangle)", "= 5", "∠BCD = 90° | (definition of rectangle)", "In △BCD,", "BC² + CD² = BD² | (Pyth. theorem)", "12² + 5² = x²", "x = √(12² + 5²)", "= 13"], answer: "x = 13" },
      11: { steps: ["∵ CE = DE | (property of rectangle)", "∴ ∠ECD = ∠EDC | (base ∠s, isos. △)", "In △CDE,", "∠CED + ∠ECD + ∠EDC = 180° | (∠ sum of △)", "48° + 2∠EDC = 180°", "∠EDC = 66°", "x = ∠EDC | (alt. ∠s, AB // DC)", "= 66°", "∠ADC = 90° | (definition of rectangle)", "y + 66° = 90°", "y = 24°"], answer: "y = 24°" },
      12: { steps: ["x = 3 | (property of rectangle)", "∵ CE = DE | (property of rectangle)", "∴ ∠ECD = ∠EDC | (base ∠s, isos. △)", "In △CDE,", "∠CED + ∠ECD + ∠EDC = 180° | (∠ sum of △)", "60° + 2∠EDC = 180°", "∠EDC = 60°", "∵ ∠CED = ∠EDC", "∴ y = CE | (sides opp. equal ∠s)", "= BE | (property of rectangle)", "= 3"], answer: "y = 3" },
      13: { steps: ["x = 45° | (property of square)", "y = 90° | (property of square)"], answer: "y = 90°" },
      14: { steps: ["x = 15 | (definition of square)", "5y = 15 | (definition of square)", "y = 3", "6z + 3 = 15 | (property of square)", "z = 2"], answer: "z = 2" },
      15: { steps: ["x = 72 | (property of square)", "6y = 72 | (property of square)", "y = 12"], answer: "y = 12" },
      16: { steps: ["3x = 90° | (property of square)", "x = 30°", "∠BEC = 90° | (property of square)", "BE = CE = y | (property of square)", "In △BEC,", "BE² + CE² = BC² | (Pyth. theorem)", "y² + y² = (√2)²", "2y² = 2", "y = 1"], answer: "y = 1" },
      17: { steps: ["∠ACE = 45° | (property of square)", "In △ACE,", "∠CAE + ∠ACE + ∠AEC = 180° | (∠ sum of △)", "x + 45° + 115° = 180°", "x = 20°"], answer: "x = 20°" },
      18: { steps: ["In △BCE,", "tan ∠EBC = EC / BC", "tan ∠EBC = √3 / 3", "∠EBC = 30°", "∠BCF = 45° | (property of square)", "In △BCF,", "∠BFC + ∠BCF + ∠FBC = 180° | (∠ sum of △)", "∠BFC + 45° + 30° = 180°", "∠BFC = 105°", "x = ∠BFC | (vert. opp. ∠s)", "= 105°"], answer: "x = 105°" },
      19: { steps: ["DE = (1/2)BD | (property of rhombus)", "= (1/2) × 12 cm", "= 6 cm", "∠AED = 90° | (property of rhombus)", "In △AED,", "AE² + DE² = AD² | (Pyth. theorem)", "AE = √(AD² − DE²)", "= √(12² − 6²) cm", "= √108 cm", "AC = 2AE | (property of rhombus)", "= 2√108 cm", "= 20.8 cm, cor. to 3 sig. fig."], answer: "AC = 20.8 cm" },
      20: { steps: ["2x + 3 = 15 | (opp. sides of //gram)", "x = 6", "AD = 21 − 6", "= 15", "= AB", "∴ BC = AD | (opp. sides of //gram)", "= AB", "= CD", "∴ ABCD is a rhombus.", "∴ The claim is agreed."], answer: "The claim is agreed." },
      21: { steps: ["3x + 1 = 5x − 7 | (property of rectangle)", "x = 4", "AD = 3 × 4 + 1", "= 13", "CD = 4 + 8", "= 12", "∵ AD ≠ CD", "∴ ABCD is not a square.", "∴ The claim is disagreed."], answer: "The claim is disagreed." },
      22: { parts: [
        { label: "(a)", steps: ["∠BAD = 90° | (definition of rectangle)", "∠BAF = ∠BAD + ∠FAG", "= 90° + 22°", "= 112°", "∠BEF = ∠BAF | (property of rhombus)", "= 112°"], answer: "∠BEF = 112°" },
        { label: "(b)", steps: ["∠ABE + ∠BEF = 180° | (int. ∠s, AB // FE)", "∠ABE + 112° = 180°", "∠ABE = 68°", "∠ABG = (1/2)∠ABE | (property of rhombus)", "= (1/2) × 68°", "= 34°", "In △ABG,", "∠AGB + ∠ABG + ∠BAG = 180° | (∠ sum of △)", "∠AGB + 34° + 90° = 180°", "∠AGB = 56°"], answer: "∠AGB = 56°" }
      ]},
      23: { steps: ["∠ABE + ∠ABG = 180° | (adj. ∠s on st. line)", "∠ABE + 132° = 180°", "∠ABE = 48°", "∠FBE = (1/2)∠ABE | (property of rhombus)", "= (1/2) × 48°", "= 24°", "∠FEB + ∠FEC = 180° | (adj. ∠s on st. line)", "∠FEB + 105° = 180°", "∠FEB = 75°", "In △BFE,", "∠DFE = ∠FEB + ∠FBE | (ext. ∠ of △)", "= 75° + 24°", "= 99°"], answer: "∠DFE = 99°" },
      24: { steps: ["∵ DA = DC | (definition of rhombus)", "∴ ∠DAC = ∠DCA | (base ∠s, isos. △)", "In △DAC,", "∠ADC + ∠DAC + ∠DCA = 180° | (∠ sum of △)", "52° + 2∠DAC = 180°", "∠DAC = 64°", "∠BAC = ∠DAC | (property of rhombus)", "= 64°", "∠EAC = (1/2)∠BAC | (given)", "= (1/2) × 64°", "= 32°", "∵ AC = AE | (given)", "∴ ∠AEC = ∠ACE | (base ∠s, isos. △)", "In △ACE,", "∠EAC + ∠AEC + ∠ACE = 180° | (∠ sum of △)", "32° + 2∠ACE = 180°", "∠ACE = 74°", "∠FCA = ∠DAC | (alt. ∠s, BC // AD)", "= 64°", "∠FCE = ∠ACE − ∠FCA", "= 74° − 64°", "= 10°"], answer: "∠FCE = 10°" },
      25: { steps: ["BE = AB | (definition of equil. △)", "= 2 cm", "BD = 2BE | (property of rectangle)", "= 4 cm", "∠BAD = 90° | (definition of rectangle)", "In △ABD,", "AB² + AD² = BD² | (Pyth. theorem)", "AD = √(BD² − AB²)", "= √(4² − 2²) cm", "= 3.46 cm, cor. to 3 sig. fig."], answer: "AD = 3.46 cm" },
      26: { steps: ["AC = AE | (definition of square)", "= 8 cm", "∠AFC = 90° | (definition of rectangle)", "In △AFC,", "sin ∠ACF = AF / AC", "sin ∠ACF = 4 cm / 8 cm", "∠ACF = 30°", "∠ACD = 90° | (definition of square)", "∠FCD = ∠ACD − ∠ACF", "= 90° − 30°", "= 60°"], answer: "∠FCD = 60°" },
      27: { steps: ["∠FBE = 45° | (property of square)", "∠FEB = ∠DEC | (vert. opp. ∠s)", "= 84°", "In △BEF,", "∠AFC = ∠FBE + ∠FEB | (ext. ∠ of △)", "= 45° + 84°", "= 129°"], answer: "∠AFC = 129°" },
      28: { steps: ["∠EDF = 45° | (property of square)", "∵ DE = DF | (given)", "∴ ∠DEF = ∠DFE | (base ∠s, isos. △)", "In △DEF,", "∠EDF + ∠DEF + ∠DFE = 180° | (∠ sum of △)", "45° + 2∠DEF = 180°", "∠DEF = 67.5°", "∠DEC = 90° | (property of square)", "∠CEF = ∠DEC − ∠DEF", "= 90° − 67.5°", "= 22.5°"], answer: "∠CEF = 22.5°" },
      29: { steps: ["∵ AD = AE | (definition of rhombus)", "∴ ∠ADE = ∠AED | (base ∠s, isos. △)", "In △ADE,", "∠DAE + ∠ADE + ∠AED = 180° | (∠ sum of △)", "30° + 2∠ADE = 180°", "∠ADE = 75°", "∠ADC = 90° | (definition of square)", "∠EDC = ∠ADC − ∠ADE", "= 90° − 75°", "= 15°"], answer: "∠EDC = 15°" },
      30: { steps: ["∵ AG = DG | (property of rectangle)", "∴ ∠DAG = ∠ADG | (base ∠s, isos. △)", "= 32°", "∠AFD = 90° | (given)", "In △AFD,", "∠FAD + ∠ADF + ∠AFD = 180° | (∠ sum of △)", "(∠FAG + 32°) + 32° + 90° = 180°", "∠FAG = 26°"], answer: "∠FAG = 26°" },
      31: { steps: ["∠FEC = ∠ECF = 45° | (property of square)", "∵ EA = EC | (definition of rhombus)", "∴ ∠EAC = ∠ECA | (base ∠s, isos. △)", "In △ACE,", "∠AEC + ∠EAC + ∠ECA = 180° | (∠ sum of △)", "45° + 2∠ECA = 180°", "∠ECA = 67.5°", "∠ACF = ∠ECA − ∠ECF", "= 67.5° − 45°", "= 22.5°"], answer: "∠ACF = 22.5°" },
      32: { steps: ["∠BCD = ∠BAD | (property of rhombus)", "= 134°", "∠BCF = 90° | (definition of square)", "∠DCF + ∠BCD + ∠BCF = 360° | (∠s at a pt.)", "∠DCF + 134° + 90° = 360°", "∠DCF = 136°", "∵ CD = BC | (definition of rhombus)", "= CF | (definition of square)", "∴ ∠CFD = ∠CDF | (base ∠s, isos. △)", "In △CDF,", "∠DCF + ∠CFD + ∠CDF = 180° | (∠ sum of △)", "136° + 2∠CDF = 180°", "∠CDF = 22°", "∠ADC + ∠BAD = 180° | (int. ∠s, AB // DC)", "∠ADC + 134° = 180°", "∠ADC = 46°", "∠ADF = ∠ADC + ∠CDF", "= 46° + 22°", "= 68°"], answer: "∠ADF = 68°" },
      33: { steps: ["DF = FG = GC = CD = 15 cm | (definition of rhombus)", "Note that BG : GE : EC = 1 : 1 : 2.", "BG = GE", "= (1 / (1 + 2)) × 15 cm", "= 5 cm", "AF = BE | (property of rectangle)", "= (5 + 5) cm", "= 10 cm", "AD = AF + DF", "= (10 + 15) cm", "= 25 cm", "BC = BG + GC", "= (5 + 15) cm", "= 20 cm", "In △GEF,", "GE² + EF² = FG² | (Pyth. theorem)", "EF = √(FG² − GE²)", "= √(15² − 5²) cm", "= √200 cm", "∴ Area of quadrilateral ABCD", "= (1/2)(AD + BC)(EF)", "= (1/2)(25 + 20)(√200) cm²", "= 318 cm², cor. to 3 sig. fig."], answer: "318 cm²" },
      34: { steps: ["DG = (1/2)DE | (property of rhombus)", "= (1/2) × 30 cm", "= 15 cm", "CG = (1/2)CF | (property of rhombus)", "= (1/2) × 16 cm", "= 8 cm", "∠DGC = 90° | (property of rhombus)", "In △DGC,", "DG² + CG² = CD² | (Pyth. theorem)", "CD = √(DG² + CG²)", "= √(15² + 8²) cm", "= 17 cm", "∴ Area of square ABCD", "= 17² cm²", "= 289 cm²"], answer: "289 cm²" },
      35: { parts: [
        { label: "(a)", steps: ["∠EDF = ∠BCF = 90° | (definition of square)", "ED = BC | (property of square)", "EF = BF | (definition of rhombus)", "∴ △EDF ≅ △BCF | (RHS)"], answer: "△EDF ≅ △BCF" },
        { label: "(b)", steps: ["∠EFD = ∠BFC | (corr. ∠s, ≅ △s)", "= 68°", "∠EFD + ∠EFB + ∠BFC = 180° | (adj. ∠s on st. line)", "68° + ∠EFB + 68° = 180°", "∠EFB = 44°", "∠EAB = ∠EFB | (property of rhombus)", "= 44°"], answer: "∠EAB = 44°" }
      ]},
      36: { parts: [
        { label: "(a)", steps: ["AB = AD | (definition of square)", "BE = DF | (property of square)", "∠ABE = ∠ABD + ∠DBE", "= ∠ABD + ∠BDF | (definition of square)", "= ∠ADB + ∠BDF | (property of square)", "= ∠ADF", "∴ △ABE ≅ △ADF | (SAS)"], answer: "△ABE ≅ △ADF" },
        { label: "(b)", steps: ["∵ AE = AF | (corr. sides, ≅ △s)", "∴ ∠AFE = ∠AEF | (base ∠s, isos. △)", "= 72°", "In △AEF,", "∠EAF + ∠AEF + ∠AFE = 180° | (∠ sum of △)", "∠EAF + 72° + 72° = 180°", "∠EAF = 36°"], answer: "∠EAF = 36°" }
      ]},
      37: { parts: [
        { label: "(a)", steps: ["∠BCF = ∠DEF | (alt. ∠s, AD // BC)", "∠CBF = ∠EDF | (alt. ∠s, AD // BC)", "∠BFC = ∠DFE | (vert. opp. ∠s)", "∴ △BCF ~ △DEF | (AAA)"], answer: "△BCF ~ △DEF" },
        { label: "(b)", steps: ["AD : DE = BC : DE | (property of rectangle)", "= BF : DF | (corr. sides, ~ △s)", "= (BG + GF) : DF", "= (DG + GF) : DF | (property of rectangle)", "= 3DF : DF", "= 3 : 1", "∴ AE : DE = (AD − DE) : DE", "= (3 − 1) : 1", "= 2 : 1"], answer: "AE : DE = 2 : 1" }
      ]},
      38: { parts: [
        { label: "(a)", steps: ["∠AEF = ∠CBF | (alt. ∠s, AD // BC)", "∠EAF = ∠BCF | (alt. ∠s, AD // BC)", "∠AFE = ∠CFB | (vert. opp. ∠s)", "∴ △AEF ~ △CBF | (AAA)"], answer: "△AEF ~ △CBF" },
        { label: "(b)", steps: ["Note that the areas of △AEB and △AEC are the same since they have the same base AE and the same height.", "∴ Area of △ABF + area of △AEF", "= area of △CEF + area of △AEF", "i.e. The area of △ABF and △CEF are the same.", "∴ The claim is agreed."], answer: "The claim is agreed." }
      ]},
      39: { parts: [
        { label: "(a)", steps: ["AD = GD | (given)", "DE = DC | (given)", "∠ADE = ∠ADC + ∠CDE", "= 90° + ∠CDE | (definition of rectangle)", "= ∠GDE + ∠CDE | (definition of rectangle)", "= ∠GDC", "∴ △ADE ≅ △GDC | (SAS)"], answer: "△ADE ≅ △GDC" },
        { label: "(b)", steps: ["∠DAE = ∠DGC | (corr. ∠s, ≅ △s)", "In △ADH,", "∠AHC = ∠ADH + ∠DAH | (ext. ∠ of △)", "= 90° + ∠DAH | (definition of rectangle)", "In △GDI,", "∠GIE = ∠GDI + ∠DGI | (ext. ∠ of △)", "= 90° + ∠DGI | (definition of rectangle)", "= 90° + ∠DAH", "∴ ∠AHC = ∠GIE", "∴ The claim is agreed."], answer: "The claim is agreed." }
      ]},
      40: { parts: [
        { label: "(a)", steps: ["AB = CB | (definition of rhombus)", "BF = (1/2)BC | (given)", "= (1/2)AB | (definition of rhombus)", "= BE | (given)", "∠ABF = ∠CBE | (common angle)", "∴ △ABF ≅ △CBE | (SAS)"], answer: "△ABF ≅ △CBE" },
        { label: "(b)", steps: ["AE = (1/2)AB | (given)", "= (1/2)BC | (definition of rhombus)", "= CF", "∠EAG = ∠FCG | (corr. ∠s, ≅ △s)", "∠EGA = ∠FGC | (vert. opp. ∠s)", "∴ △AEG ≅ △CFG | (AAS)", "∴ AG = CG | (corr. sides, ≅ △s)", "∴ △AGC is an isosceles triangle."], answer: "△AGC is an isosceles triangle." }
      ]},
      41: { steps: ["In △ABC,", "AB² + BC² = AC² | (Pyth. theorem)", "AC = √(AB² + BC²)", "= √(8² + 8²) cm", "= √128 cm", "AG = AC − GC", "= (√128 − 8) cm", "∠GAH = 45° | (property of square)", "∠CGH = 90° | (definition of square)", "In △AGH,", "∠GAH + ∠AHG = ∠CGH | (ext. ∠ of △)", "45° + ∠AHG = 90°", "∠AHG = 45°", "∵ ∠AHG = ∠GAH", "∴ GH = AG | (sides opp. equal ∠s)", "= (√128 − 8) cm", "Area of quadrilateral CDHG", "= area of △ADC − area of △AGH", "= [(1/2) × 8² − (1/2)(√128 − 8)²] cm²", "= 26.5 cm², cor. to 3 sig. fig."], answer: "26.5 cm²" },
      42: { parts: [
        { label: "(a)", steps: ["AD = CD | (definition of square)", "DF = DF | (common side)", "∠ADF = ∠CDF | (property of square)", "∴ △ADF ≅ △CDF | (SAS)"], answer: "△ADF ≅ △CDF" },
        { label: "(b)", steps: ["∠BAD = 90° | (definition of square)", "∠ABF = 45° | (property of square)", "∵ AB = BF", "∴ ∠BAF = ∠BFA | (base ∠s, isos. △)", "In △ABF,", "∠ABF + ∠BAF + ∠BFA = 180° | (∠ sum of △)", "45° + 2∠BAF = 180°", "∠BAF = 67.5°", "∠DAE = ∠BAD − ∠BAF", "= 90° − 67.5°", "= 22.5°", "∠DCF = ∠DAE | (corr. ∠s, ≅ △s)", "= 22.5°", "In △AED,", "∠AED + ∠DAE + ∠ADE = 180° | (∠ sum of △)", "∠AED + 22.5° + 90° = 180°", "∠AED = 67.5°", "In △CEF,", "∠CFE + ∠ECF = ∠AED | (ext. ∠ of △)", "∠CFE + 22.5° = 67.5°", "∠CFE = 45°"], answer: "∠CFE = 45°" }
      ]},
      43: { steps: ["∠DBC = (1/2)∠ABC | (property of rhombus)", "= (1/2) × 80°", "= 40°", "∠BDC = ∠DBC | (property of rhombus)", "= 40°", "∠BDC + ∠BDF + ∠FDE = 180° | (adj. ∠s on st. line)", "40° + 2∠BDF = 180°", "∠BDF = 70°", "∠FGD = 90° | (property of rhombus)", "In △FGD,", "∠AFD + ∠FGD + ∠GDF = 180° | (∠ sum of △)", "∠AFD + 90° + 70° = 180°", "∠AFD = 20°"], answer: "∠AFD = 20°" },
      44: { steps: ["∠PES = 90° | (definition of square)", "∠EPS = ∠EFH | (corr. ∠s, AD // FH)", "= 45° | (property of square)", "∠ESP = ∠EHF | (corr. ∠s, AD // FH)", "= 45° | (property of square)", "∵ ∠EPS = ∠ESP", "∴ EP = ES | (sides opp. equal ∠s)", "Let EP = a.", "In △EPS,", "EP² + ES² = PS² | (Pyth. theorem)", "PS = √(EP² + ES²)", "= √(a² + a²) cm", "= √2 a cm", "∵ Area of △EPS = x", "∴ (1/2)a² = x", "a² = 2x", "∠APF = ∠EPS | (vert. opp. ∠s)", "= 45°", "∠AFP = 180° − ∠FAP − ∠APF | (∠ sum of △)", "= 180° − 90° − 45°", "= 45°", "∵ ∠APF = ∠AFP", "∴ FA = AP", "HD = FA | (property of rectangle)", "∠HDS = ∠FAP | (definition of rectangle)", "∠DSH = ∠ESP | (vert. opp. ∠s)", "= 45°", "= ∠APF", "∴ △FAP ≅ △HDS | (AAS)", "AP = DS | (corr. sides, ≅ △s)", "∵ AB : FH = 2 : 3", "∴ AB : (AP + PS + SD) = 2 : 3", "AB : (2AP + PS) = 2 : 3", "2FA : (2FA + PS) = 2 : 3", "∴ PS = FA = PA", "∴ Area of rectangle ABCD", "= AB × AD", "= 2PS × 3PS", "= 6 × (√2 a)² cm²", "= 12a² cm²", "= 24x cm²"], answer: "24x cm²" },
      45: { steps: ["For I:", "AB = BC | (definition of rhombus)", "∴ I is true.", "For II:", "The diagonals of a rhombus may not equal to each other.", "∴ II may not be true.", "For III:", "AC ⊥ BD | (property of rhombus)", "∴ III is true.", "∴ The answer is B."], answer: "B" },
      46: { steps: ["For I:", "EM = FM | (property of rectangle)", "∴ I is true.", "For II:", "EG = FH | (property of rectangle)", "∴ II is true.", "For III:", "EG may not perpendicular to FH.", "∴ III may not be true.", "∴ The answer is A."], answer: "A" },
      47: { steps: ["For I:", "∠PQT = ∠QRT = 45° | (property of square)", "∴ I is true.", "For II:", "PT = QT | (property of square)", "∴ II is true.", "For III:", "PR ⊥ QS | (property of square)", "∴ III is true.", "∴ The answer is D."], answer: "D" },
      48: { steps: ["For I:", "A rhombus is a parallelogram with all sides equal.", "∴ I must be true.", "For II and III:", "A rhombus is a rectangle or a square only when all the interior angles are right angles.", "∴ II and III may not be true.", "∴ The answer is A."], answer: "A" },
      49: { steps: ["Let E be the point of intersection of AC and BD.", "AE = (1/2)AC | (property of rhombus)", "= (1/2) × 10 cm", "= 5 cm", "DE = (1/2)BD | (property of rhombus)", "= (1/2) × 24 cm", "= 12 cm", "In △ADE,", "AE² + DE² = AD² | (Pyth. theorem)", "AD = √(AE² + DE²)", "= √(5² + 12²) cm", "= 13 cm", "Perimeter of the rhombus", "= 4AD | (definition of rhombus)", "= 4 × 13 cm", "= 52 cm", "∴ The answer is B."], answer: "B" },
      50: { steps: ["∵ AB = BE | (given)", "∴ ∠BAE = ∠BEA | (base ∠s, isos. △)", "= 33°", "∠ABC + ∠BCD = 180° | (int. ∠s, AB // DC)", "∠ABC + 122° = 180°", "∠ABC = 58°", "In △ABF,", "∠AFB + ∠BAF + ∠ABF = 180° | (∠ sum of △)", "∠AFB + 33° + 58° = 180°", "∠AFB = 89°", "∠EFC = ∠AFB | (vert. opp. ∠s)", "= 89°", "∴ The answer is B."], answer: "B" },
      51: { steps: ["∠BCA = ∠DAC | (alt. ∠s, AD // BC)", "= 38°", "∵ AF = CF | (given)", "∴ BF = CF | (property of rectangle)", "∴ ∠CBF = ∠BCF | (base ∠s, isos. △)", "= 38°", "∵ BE = BF | (given)", "∴ ∠BEF = ∠BFE | (base ∠s, isos. △)", "In △BEF,", "∠EBF + ∠BEF + ∠BFE = 180° | (∠ sum of △)", "38° + 2∠BEF = 180°", "∠BEF = 71°", "In △CEF,", "∠ECF + ∠EFC = ∠BEF | (ext. ∠ of △)", "38° + ∠EFC = 71°", "∠EFC = 33°", "∴ The answer is C."], answer: "C" },
      52: { steps: ["EC = DE | (property of square)", "= 3", "∠CEF = 90° | (property of square)", "In △CEF,", "tan ∠EFC = EC / EF", "= 3 / √3", "∠EFC = 60°", "∠BFC + ∠EFC = 180° | (adj. ∠s on st. line)", "∠BFC + 60° = 180°", "∠BFC = 120°", "∴ The answer is C."], answer: "C" }
    }
  },

  "4.3": {
    label: "4.3",
    questions: {
      1: { steps: ["∵ AB = BD and AC = CE | (given)", "∴ DE = 2BC | (mid-pt. theorem)", "x = 2 × 5", "= 10"], answer: "x = 10" },
      2: { steps: ["∵ CB = BA and CD = DE | (given)", "∴ AE = 2CD | (mid-pt. theorem)", "x = 2 × 9", "= 18"], answer: "x = 18" },
      3: { steps: ["∵ EC = CA = 6 and ED = DB = 5 | (given)", "∴ CD = (1/2)AB | (mid-pt. theorem)", "x = (1/2) × 16", "= 8"], answer: "x = 8" },
      4: { steps: ["∵ AB = BD and AC = CE | (given)", "∴ BC // DE | (mid-pt. theorem)", "∴ ∠ACB = ∠AED | (corr. ∠s, BC // DE)", "= 69°", "In △ABC,", "∠ABC + ∠ACB + ∠BAC = 180° | (∠ sum of △)", "x + 69° + 86° = 180°", "x = 25°"], answer: "x = 25°" },
      5: { steps: ["∵ AC = CE = 3 and BC // DE | (given)", "∴ BD = AB | (intercept theorem)", "x = 4"], answer: "x = 4" },
      6: { steps: ["∵ AC = CE = 7 and AB // CD // EF | (given)", "∴ DF = BD | (intercept theorem)", "= 6", "BF = BD + DF", "x = 6 + 6", "= 12"], answer: "x = 12" },
      7: { steps: ["∵ DE = EF = x and AD // BE // CF | (given)", "∴ BC = AB | (intercept theorem)", "x = 4"], answer: "x = 4" },
      8: { steps: ["∵ AB = BC and AE // BF // CG | (given)", "∴ FG = EF | (intercept theorem)", "= 8", "∵ BC = CD and BF // CG // DH | (given)", "∴ GH = FG | (intercept theorem)", "x = 8"], answer: "x = 8" },
      9: { steps: ["∵ AE = EB and EF // BC | (given)", "∴ AF = FC | (intercept theorem)", "x = 5", "∵ AE = EB and AF = FC", "∴ EF = (1/2)BC | (mid-pt. theorem)", "y = (1/2) × 12", "= 6"], answer: "y = 6" },
      10: { steps: ["∵ AB = BD and AC = CE | (given)", "∴ BC // DE | (mid-pt. theorem)", "∴ ∠ABC = ∠ADE | (corr. ∠s, BC // DE)", "= 68°", "In △ABC,", "∠ACB + ∠ABC + ∠BAC = 180° | (∠ sum of △)", "∠ACB + 68° + 71° = 180°", "∠ACB = 41°"], answer: "∠ACB = 41°" },
      11: { parts: [
        { label: "(a)", steps: ["∵ AC = CE and AD = DF | (given)", "∴ CD = (1/2)EF | (mid-pt. theorem)", "= (1/2) × 18", "= 9"], answer: "CD = 9" },
        { label: "(b)", steps: ["∵ EC = CA and ED = DB | (given)", "∴ AB = 2CD | (mid-pt. theorem)", "= 2 × 9", "= 18"], answer: "AB = 18" }
      ]},
      12: { steps: ["∵ DB = BE and DC = CF | (given)", "∴ BC = (1/2)EF | (mid-pt. theorem)", "= (1/2) × 10 cm", "= 5 cm", "Perimeter of rhombus ABCD", "= 4 × 5 cm", "= 20 cm"], answer: "Perimeter = 20 cm" },
      13: { parts: [
        { label: "(a)", steps: ["∵ BG = GA and BF = FC | (given)", "∴ GF = (1/2)AC | (mid-pt. theorem)", "= (1/2) × 26", "= 13"], answer: "GF = 13" },
        { label: "(b)", steps: ["∵ GB = BD and BF // DE | (given)", "∴ EF = GF | (intercept theorem)", "= 13"], answer: "EF = 13" }
      ]},
      14: { parts: [
        { label: "(a)", steps: ["∵ CE = EA and CF = FB | (given)", "∴ EF = (1/2)AB | (mid-pt. theorem)", "= (1/2) × 24", "= 12"], answer: "EF = 12" },
        { label: "(b)", steps: ["∵ DG = GE and GH // EF | (given)", "∴ DH = HF | (intercept theorem)", "∵ DG = GE and DH = HF", "∴ GH = (1/2)EF | (mid-pt. theorem)", "= (1/2) × 12", "= 6"], answer: "GH = 6" }
      ]},
      15: { steps: ["∵ EF = FG and ED = DC | (given)", "∴ GC = 2FD and GC // FD | (mid-pt. theorem)", "∵ AG = GF and BG // DF", "∴ AB = BD | (intercept theorem)", "∵ AG = GF and AB = BD", "∴ FD = 2BG | (mid-pt. theorem)", "GC = 2FD", "= 4BG", "BC = GC − BG", "= 4BG − BG", "= 3BG", "∴ BC : BG = 3 : 1"], answer: "BC : BG = 3 : 1" },
      16: { steps: ["∵ AE = EC | (diags. of //gram)", "AB // EF | (given)", "∴ BF = FC | (intercept theorem)", "AD = BC | (opp. sides of //gram)", "= BF + FC", "= 2BF", "∴ BF : AD = 1 : 2"], answer: "BF : AD = 1 : 2" },
      17: { steps: ["BA = BC | (given)", "BF = BF | (common side)", "∠ABF = ∠CBF | (given)", "∴ △ABF ≅ △CBF | (SAS)", "∵ AF = FC | (corr. sides, ≅ △s)", "AE = ED | (given)", "∴ CD = 2FE | (mid-pt. theorem)", "BD = 2CD | (given)", "= 4FE", "∴ FE : BD = 1 : 4"], answer: "FE : BD = 1 : 4" },
      18: { steps: ["∵ AF = FE and BF // DE | (given)", "∴ AB = BD | (intercept theorem)", "∵ FG = GD | (diags. of //gram)", "AB = BD", "∴ BG // AF | (mid-pt. theorem)", "i.e. BG // AE i.e. BG // CD", "∵ FG = GD and BG // CD", "∴ FB = BC | (intercept theorem)", "∵ FB = BC and FG = GD", "∴ BG : CD = 1 : 2 | (mid-pt. theorem)"], answer: "BG : CD = 1 : 2" },
      19: { parts: [
        { label: "(a)", steps: ["∵ AB = BD and AC = CE | (given)", "∴ BC // DE | (mid-pt. theorem)", "∵ AB = BD and BG // DF", "∴ AG = FG | (intercept theorem)"], answer: "AG = FG" },
        { label: "(b)", steps: ["∵ AG = GF and AC = CE | (proved in (a))", "∴ EF = 2CG | (mid-pt. theorem)", "= 2 × 4", "= 8"], answer: "EF = 8" }
      ]},
      20: { steps: ["∵ AD = DB and AE = EC | (given)", "∴ DE // BC | (mid-pt. theorem)", "∠DEF = ∠CBF | (alt. ∠s, DE // BC)", "∠EDF = ∠BCF | (alt. ∠s, DE // BC)", "∠DFE = ∠CFB | (vert. opp. ∠s)", "∴ △DEF ~ △CBF | (AAA)"], answer: "△DEF ~ △CBF" },
      21: { steps: ["∵ AD = DB and AF = FC | (given)", "∴ DF // BC | (mid-pt. theorem)", "∵ BD = DA and BE = EC | (given)", "∴ DE // AC | (mid-pt. theorem)", "∵ DF // EC and DE // FC", "∴ DECF is a parallelogram. | (by definition)"], answer: "DECF is a parallelogram." },
      22: { steps: ["∵ BE = EA and EF // AD | (given)", "∴ BF = FD | (intercept theorem)", "∵ BF = FD and AF = FC | (given)", "∴ ABCD is a parallelogram. | (diags. bisect each other)"], answer: "ABCD is a parallelogram." },
      23: { steps: ["Join AC and BD.", "∵ AE = EB and AH = HD | (given)", "∴ EH = (1/2)BD | (mid-pt. theorem)", "∵ CF = FB and CG = GD | (given)", "∴ FG = (1/2)BD | (mid-pt. theorem)", "∴ EH = FG", "∵ BE = EA and BF = FC | (given)", "∴ EF = (1/2)AC | (mid-pt. theorem)", "∵ DH = HA and DG = GC | (given)", "∴ HG = (1/2)AC | (mid-pt. theorem)", "∴ EF = HG", "FH = HF | (common side)", "∴ △EFH ≅ △GHF | (SSS)"], answer: "△EFH ≅ △GHF" },
      24: { steps: ["∵ AB = BC and AE = ED | (given)", "∴ BE // CD and BE = (1/2)CD | (mid-pt. theorem)", "∵ OF = FC and OG = GD | (given)", "∴ FG // CD and FG = (1/2)CD | (mid-pt. theorem)", "∵ BE // FG and BE = FG", "∴ BFGE is a parallelogram. | (2 sides // and equal)"], answer: "BFGE is a parallelogram." },
      25: { parts: [
        { label: "(a)", steps: ["∵ AF = FD | (given)", "AG = GC | (diags. of //gram)", "∴ FG // DC | (mid-pt. theorem)", "∵ FG // DC and AB // DC", "∴ AE // FG", "∵ EG // BC and AD // BC", "∴ AF // EG", "∴ AEGF is a parallelogram. | (by definition)"], answer: "AEGF is a parallelogram." },
        { label: "(b)", steps: ["∵ AG = GC | (diags. of //gram)", "EG // BC | (given)", "∴ AE = EB | (intercept theorem)", "EB = AE = GF | (opp. sides of //gram)", "∠EHB = ∠GHF | (vert. opp. ∠s)", "∠BEH = ∠FGH | (alt. ∠s, BE // GF)", "∴ △BEH ≅ △FGH | (AAS)", "∴ EH = GH | (corr. sides, ≅ △s)", "∴ H is the mid-point of EG."], answer: "H is the mid-point of EG." }
      ]},
      26: { steps: ["Method 1", "∵ AD = DB and AF = FC | (given)", "∴ BC/FD = 2 | (mid-pt. theorem)", "∵ BE = EC and BD = DA | (given)", "∴ AC/ED = 2 | (mid-pt. theorem)", "∵ CE = EB and CF = FA | (given)", "∴ AB/EF = 2 | (mid-pt. theorem)", "∴ △ABC ~ △EFD | (3 sides proportional)"], answer: "△ABC ~ △EFD" },
      27: { steps: ["∵ FG = GA and GE // AD | (given)", "∴ FE = ED | (intercept theorem)", "∵ FG = GA and FE = ED", "∴ GE = (1/2)AD | (mid-pt. theorem)", "∵ HB = BA and BC // AD | (given)", "∴ HC = CD | (intercept theorem)", "∵ HB = BA and HC = CD", "∴ BC = (1/2)AD | (mid-pt. theorem)", "∵ GE // BC and GE = BC", "∴ BCEG is a parallelogram. | (2 sides // and equal)", "∴ BG = CE | (opp. sides of //gram)", "∴ The claim is agreed."], answer: "The claim is agreed." },
      28: { steps: ["Join AC.", "∵ EF = FA and ED = DC | (given)", "∴ FD // AC and FD = (1/2)AC | (mid-pt. theorem)", "∵ GH = HA and GB = BC | (given)", "∴ HB // AC and HB = (1/2)AC | (mid-pt. theorem)", "∵ FD // HB and FD = HB", "∴ BDFH is a parallelogram. | (2 sides // and equal)"], answer: "BDFH is a parallelogram." },
      29: { steps: ["For I:", "∵ BD = DA and BE = EC | (given)", "∴ DE // AC | (mid-pt. theorem)", "∴ I is true.", "For II and III:", "There is not enough information to show that F is the mid-point of AC and DF // BC.", "∴ II and III may not be true.", "∴ The answer is A."], answer: "A" },
      30: { steps: ["For I:", "∵ AD = DB and DF // BC | (given)", "∴ AF = FC | (intercept theorem)", "∴ I is true.", "For II:", "There is not enough information to show that E is the mid-point of BC.", "∴ II may not be true.", "For III:", "∵ AD = DB and DG // BE | (given)", "∴ AG = GE | (intercept theorem)", "∴ III is true.", "∴ The answer is B."], answer: "B" },
      31: { steps: ["∵ CG = GA and CF = FB | (given)", "∴ FG // BA | (mid-pt. theorem)", "FG = (1/2)AB = (1/2) × 5 cm = 2.5 cm | (mid-pt. theorem)", "∵ BE = EA and BF = FC | (given)", "∴ EF // AC | (mid-pt. theorem)", "EF = (1/2)AC = (1/2) × 6 cm = 3 cm | (mid-pt. theorem)", "∵ FG // EA and EF // AG", "∴ AEFG is a parallelogram. | (by definition)", "Perimeter of AEFG = 2 × (EF + FG)", "= 2 × (2.5 + 3) cm", "= 11 cm", "∴ The answer is B."], answer: "B" },
      32: { steps: ["∵ EH = HC and GH // BC | (given)", "∴ EG = GB | (intercept theorem)", "∵ EH = HC and EG = GB", "∴ GH = (1/2)BC | (mid-pt. theorem)", "∵ AE = EC | (diags. of //gram)", "FE // BC | (given)", "∴ AF = FB | (intercept theorem)", "∵ AE = EC and AF = FB", "∴ FE = (1/2)BC | (mid-pt. theorem)", "∵ FE = GH = (1/2)BC", "∴ FE : GH = 1 : 1", "∴ The answer is A."], answer: "A" },
      33: { steps: ["Let BC = 3x.", "Then BF = 2x and FC = x.", "∵ AD = DB and AE = EC | (given)", "∴ DE = (1/2)BC = (3/2)x | (mid-pt. theorem)", "∵ DG = GB and DM = MF | (given)", "∴ GM = (1/2)BF = x | (mid-pt. theorem)", "∵ FM = MD and FH = HE | (given)", "∴ MH = (1/2)DE = (3/4)x | (mid-pt. theorem)", "GH = GM + MH = x + (3/4)x = (7/4)x", "∴ DE : GH = (3/2)x : (7/4)x = 6 : 7", "∴ The answer is D."], answer: "D" }
    }
  },

  "5.1": {
    label: "5.1",
    questions: {
      1: { steps: ["∠AOB = ∠EOF | (given)", "∠AOC = ∠AOB + ∠BOC", "∠BOD = ∠EOF + ∠BOC = ∠AOB + ∠BOC", "∴ ∠AOC = ∠BOD", "∴ a = b"], answer: "a = b" },
      2: { steps: ["a + b + c + d = 180° | (adj. ∠s on st. line)", "a + c = 90° | (given)", "∴ b + d = 90°", "b = 90° − d"], answer: "b = 90° − d" },
      3: { steps: ["∠AOC = ∠BOD = 90° | (given)", "∠AOB = ∠AOC − ∠BOC", "= ∠BOD − ∠BOC", "= ∠COD", "∴ ∠AOB = ∠COD"], answer: "∠AOB = ∠COD" },
      4: { steps: ["∠s at pt.: ∠AOB + ∠BOC + ∠COD + ∠DOA = 360°", "∠ sum of △ applied: c − a − b = 180°"], answer: "c − a − b = 180°" },
      5: { steps: ["∠ACD = p + q | (ext. ∠ of △)", "∠ACD = s + t | (ext. ∠ of △, other △)", "∴ p + q = s + t"], answer: "p + q = s + t" },
      6: { steps: ["∠CBF = x | (corr. ∠s, AB // CD)", "∠EDF = ∠CBF = x | (vert. opp. ∠s)", "∠EDF = z | (given)", "∴ x = y | (vert. opp. ∠s)", "actually: ∠CBF = x corr. ∠s, ∠EDF = z = ∠CBF = x", "∴ x = y"], answer: "x = y" },
      7: { steps: ["∠CBF = x + y | (ext. ∠ of △ or given)", "∠EDF = z | (given)", "∵ ∠CBF = ∠EDF = x + y = z", "∴ BC // DE | (corr. ∠s equal)"], answer: "BC // DE" },
      8: { steps: ["∠BCD = b | (given)", "∠CDE = b | (given)", "∵ ∠BCD = ∠CDE", "∴ BC // DE | (alt. ∠s equal)"], answer: "BC // DE" },
      9: { steps: ["Draw line EF // AB // CD.", "∠ABE = x | (alt. ∠s, AB // EF)", "∠CDE = y | (alt. ∠s, CD // EF)", "z = x + y | (alt. ∠s)"], answer: "z = x + y" },
      10: { steps: ["y = 2x | (ext. ∠ of △ or given)", "∠BAC = x = ∠ABC | (base ∠s)", "∴ △ABC isosceles | (AC = BC, sides opp. equal ∠s)"], answer: "△ABC is an isosceles triangle." },
      11: { steps: ["∠BCA = a | (base ∠s, isos. △)", "∠BCD = 180° − b | (adj. ∠s on st. line)", "∠BAC + ∠ACD = 180° | (int. ∠s, AB // DC)", "a + (a + 180° − b) = 180°", "b = 2a"], answer: "b = 2a" },
      12: { steps: ["∠ABC = ∠DEC | (given)", "∠ACB = ∠DCE | (vert. opp. ∠s)", "AC = DC | (given)", "∴ △ABC ≅ △DEC | (AAS)"], answer: "△ABC ≅ △DEC" },
      13: { steps: ["∠FBD = ∠FBE = ∠CEA = ∠FEB | (given/proved)", "∴ BF = EF | (sides opp. equal ∠s)", "∴ BF = EF"], answer: "BF = EF" },
      14: { steps: ["The claim is disagreed.", "c = a + b, not a + 2b"], answer: "The claim is disagreed." },
      15: { steps: ["∠AEC = b | (given)", "∠BDC = b | (corr. ∠s, given)", "Common ∠ at A/E", "∴ △AEC ~ △BCD | (AAA)"], answer: "△AEC ~ △BCD" },
      16: { steps: ["∠BDE = ∠EFC | (given)", "∠DBE = ∠FEC | (corr. ∠s, BD // EF)", "∠BED = ∠ECF | (∠ sum of △)", "∴ △BDE ~ △EFC | (AAA)"], answer: "△BDE ~ △EFC" },
      17: { steps: ["∠DBE = ∠ACB = y | (base ∠s, isos. △)", "∠BDE = y | (corr. ∠s, given)", "x = y + y = 2y | (ext. ∠ of △)"], answer: "x = 2y" },
      18: { steps: ["x + y = 90° | (given)", "∠ABC + ∠BCD = 2(x + y) = 180°", "∴ AB // DC | (int. ∠s supp.)"], answer: "AB // DC" },
      19: { steps: ["∠BAD = 360° − x | (∠s at pt.)", "∠ADC = 360° − x | (alt. ∠s)", "(360° − x) + y + z = 360°", "x = y + z"], answer: "x = y + z" },
      20: { steps: ["Draw FC with AB // FC // ED.", "(x − 180°) + (180° − z) = y", "x − z = y"], answer: "x − z = y" },
      21: { steps: ["Join BE.", "∠ABE + ∠BED = 180° | (int. ∠s)", "∠CBE + ∠BEF = 180° | (int. ∠s)", "∴ x = y"], answer: "x = y" },
      22: { steps: ["∠BAE = ∠BEA | (base ∠s, isos. △)", "∠EBC = ∠BAD = ∠BEA", "∴ AD // BC | (alt. ∠s equal)"], answer: "AD // BC" },
      23: { parts: [
        { label: "(a)", steps: ["∠ABE = ∠CBD | (common ∠)", "BE = BD | (given)", "∠AEB = ∠CDB | (given)", "∴ △ABE ≅ △CBD | (ASA)"], answer: "△ABE ≅ △CBD" },
        { label: "(b)", steps: ["AB = CB | (corr. sides, ≅ △s)", "DB = EB | (corr. sides, ≅ △s)", "AD = AB − DB = CB − EB = CE"], answer: "AD = CE" }
      ]},
      24: { parts: [
        { label: "(a)", steps: ["∠BAC = ∠EDB | (corr. ∠s)", "∠BEC = ∠BCE = 60° | (equil. △)", "∠ABE = 60° − ∠BAE = ∠DEC"], answer: "∠ABE = ∠DEC" },
        { label: "(b)", steps: ["AB = DE | (corr. sides)", "∠ABE = ∠DEC | (proved in (a))", "BE = EC | (equil. △)", "∴ △ABE ≅ △DEC | (SAS)"], answer: "△ABE ≅ △DEC" }
      ]},
      25: { steps: ["AF = DE | (given)", "∠AFB = ∠DEC | (base ∠s, isos. △)", "BF = CE | (given)", "∴ △ABF ≅ △DCE | (SAS)"], answer: "△ABF ≅ △DCE" },
      26: { parts: [
        { label: "(a)", steps: ["∠ABC = ∠DEB = 90° | (given)", "AB = DE | (given)", "AC = DB | (given)", "∴ △ABC ≅ △DEB | (RHS)"], answer: "△ABC ≅ △DEB" },
        { label: "(b)", steps: ["∠CAB = ∠BDE | (corr. ∠s, ≅ △s)", "∠FAB = 90° − ∠DBE = ∠FBA", "∴ AF = BF | (sides opp. equal ∠s)", "∴ △ABF is isosceles."], answer: "△ABF is isosceles." }
      ]},
      27: { steps: ["∠AEB = ∠ADC | (given)", "∠CBD = ∠BCD | (base ∠s, isos. △)", "∠ABE = ∠ACD | (∠ sum)", "∴ △AEB ~ △ADC | (AAA)"], answer: "△AEB ~ △ADC" },
      28: { steps: ["∠ABD = ∠ADE | (given)", "∠BAD = ∠CDE | (given)", "∠BDA = ∠CED | (∠ sum of △)", "∴ △ABD ~ △DCE | (AAA)"], answer: "△ABD ~ △DCE" },
      29: { parts: [
        { label: "(a)", steps: ["∠ABF = ∠CDF | (corr. ∠s)", "∠ABD = ∠EDF | (given)", "∠ADB = ∠EFD | (alt. ∠s)", "∴ △ABD ~ △EDF | (AAA)"], answer: "△ABD ~ △EDF" },
        { label: "(b)", steps: ["AB/ED = AD/EF | (corr. sides, ~ △s)", "∴ AB × EF = AD × ED"], answer: "AB × EF = AD × ED" }
      ]},
      30: { parts: [
        { label: "(a)", steps: ["△ABC ≅ △CDE ≅ △EFA | (SAS)", "∴ AC = CE = EA", "∴ △ACE is equilateral."], answer: "△ACE is equilateral." },
        { label: "(b)", steps: ["∠CAE = 60° | (equil. △)", "∠CDE = 120° | (int. angle of hexagon)", "∠CAE + ∠CDE = 60° + 120° = 180°"], answer: "∠CAE + ∠CDE = 180°" }
      ]},
      31: { steps: ["△BCF ≅ △EDF | (SAS)", "△ABF ≅ △AEF | (SSS)", "∴ BF = EF | (corr. sides, ≅ △s)"], answer: "BF = EF" },
      32: { steps: ["∠ABE = ∠CDE = 90° | (property of rectangle)", "∠AEB = ∠CED | (vert. opp. ∠s)", "AB = CD | (property of rectangle)", "∴ △ABE ≅ △CDE | (AAS)", "∴ BE = DE | (corr. sides, ≅ △s)"], answer: "BE = DE" },
      33: { parts: [
        { label: "(a)", steps: ["∠AGE = ∠BGD | (vert. opp. ∠s)", "∠EAG = ∠DBG = 90° | (property of square)", "∴ △AGE ~ △BGD | (AAA)"], answer: "△AGE ~ △BGD" },
        { label: "(b)", steps: ["∠AEG = ∠BDG | (corr. ∠s, ~ △s)", "∠ADF = ∠DCF = 90° | (property of square)", "∴ ∠BDF = ∠CFD", "∴ ∠BDG = ∠CFD", "∴ ∠AEG = ∠BDG = ∠CFD"], answer: "∠AEG = ∠BDG = ∠CFD" }
      ]},
      34: { steps: ["△ABC ≅ △BDE | (RHS)", "∠BAC = ∠DBE | (corr. ∠s, ≅ △s)", "∠BFA = 90°", "∴ AC ⊥ BE"], answer: "AC ⊥ BE" },
      35: { parts: [
        { label: "(a)", steps: ["∠ABC = ∠FBG | (common ∠ or corr. ∠s, AC // FG)", "∠BAC = ∠BFG | (corr. ∠s, AC // FG)", "∴ △ABC ~ △FBG | (AAA)"], answer: "△ABC ~ △FBG" },
        { label: "(b)", steps: ["CE = EP = PA | (given)", "AF/AB = 2/3, AE/AC = 2/3 | (given)", "∠EAF = ∠BAC | (common ∠)", "∴ △ABC ~ △AFE | (ratio of 2 sides, inc. ∠)"], answer: "△ABC ~ △AFE" }
      ]},
      36: { steps: ["△AFD ~ △BFC | (AAA)", "△DFC ~ △AFB | (AAA)", "∠FCD = ∠FBA = 60°", "= ∠BEF | (corr. ∠s)", "∴ BE // CD | (corr. ∠s equal)"], answer: "BE // CD" },
      37: { steps: ["Join G to H on BE such that GH ⊥ BE.", "△ABC ≅ △CHG | (AAS)", "△FED ≅ △DHG | (AAS)", "AB + FE = CH + DH = CD"], answer: "AB + FE = CD" },
      38: { steps: ["∴ The answer is D."], answer: "D" },
      39: { steps: ["∴ The answer is A."], answer: "A" },
      40: { steps: ["∴ The answer is B."], answer: "B" },
      41: { steps: ["∴ The answer is A."], answer: "A" },
      42: { steps: ["∴ The answer is D."], answer: "D" },
      43: { steps: ["∴ The answer is B."], answer: "B" },
      44: { steps: ["∴ The answer is D."], answer: "D" }
    }
  },

  "5.2": {
    label: "5.2",
    questions: {
      1: { steps: ["AD = BC | (property of rectangle)", "ED = BF | (opp. sides of //gram)", "AE = AD − ED", "= BC − BF", "= FC", "∴ AE = CF"], answer: "AE = CF" },
      2: { steps: ["BA = BC | (definition of rhombus)", "∠BAC = ∠BCA | (base ∠s, isos. △)", "= y", "In △ABF,", "∠ABF + ∠BAF = ∠AFE | (ext. ∠ of △)", "x + y = z"], answer: "x + y = z" },
      3: { steps: ["DA = DC | (definition of rhombus)", "∠ACD = ∠CAD | (base ∠s, isos. △)", "= ∠EAF", "∠ACD = ∠AEF | (corr. ∠s, EF // CD)", "∴ ∠EAF = ∠AEF", "∴ AF = EF | (sides opp. equal ∠s)", "∴ △AEF is an isosceles triangle."], answer: "△AEF is an isosceles triangle." },
      4: { steps: ["∠CED + ∠AEC = 180° | (adj. ∠s on st. line)", "∠CED = 180° − ∠AEC", "= 180° − ∠BAD | (given)", "∠CDE + ∠BAD = 180° | (int. ∠s, BA // CD)", "∠CDE = 180° − ∠BAD", "∴ ∠CDE = ∠CED", "∴ CE = CD | (sides opp. equal ∠s)", "∴ △CDE is an isosceles triangle."], answer: "△CDE is an isosceles triangle." },
      5: { steps: ["In △ABE and △ADE,", "AB = AD | (definition of rhombus)", "∠BAE = ∠DAE | (property of rhombus)", "AE = AE | (common side)", "∴ △ABE ≅ △ADE | (SAS)"], answer: "△ABE ≅ △ADE" },
      6: { parts: [
        { label: "(a)", steps: ["∠AEB = ∠CFD | (alt. ∠s, AE // FC)", "∠ABE = ∠CDF | (alt. ∠s, AB // DC)", "AB = CD | (opp. sides of //gram)", "∴ △ABE ≅ △CDF | (AAS)"], answer: "△ABE ≅ △CDF" },
        { label: "(b)", steps: ["AE = FC | (corr. sides, ≅ △s)"], answer: "AE = FC" }
      ]},
      7: { parts: [
        { label: "(a)", steps: ["∠OEB = ∠OEC = 90° | (given)", "OB = OC | (property of rectangle)", "OE = OE | (common side)", "∴ △OBE ≅ △OCE | (RHS)"], answer: "△OBE ≅ △OCE" },
        { label: "(b)", steps: ["∠BOE = ∠COE | (corr. ∠s, ≅ △s)", "∴ OE bisects ∠BOC"], answer: "OE bisects ∠BOC" }
      ]},
      8: { steps: ["In △ABE and △CBF,", "AB = CB | (definition of rhombus)", "∠BAE = ∠BCF | (property of rhombus)", "AD = CD | (definition of rhombus)", "AE = (1/2)AD | (given)", "CF = (1/2)CD | (given)", "∴ AE = CF", "∴ △ABE ≅ △CBF | (SAS)", "∴ ∠ABE = ∠CBF | (corr. ∠s, ≅ △s)"], answer: "∠ABE = ∠CBF" },
      9: { steps: ["In △AEF and △CEF,", "AE = CE | (property of rhombus)", "∠AEF = ∠CEF = 90° | (property of rhombus)", "EF = EF | (common side)", "∴ △AEF ≅ △CEF | (SAS)", "∴ ∠EAF = ∠ECF | (corr. ∠s, ≅ △s)"], answer: "∠EAF = ∠ECF" },
      10: { steps: ["∠BCF = ∠DEF | (alt. ∠s, AD // BC)", "CF = EF | (given)", "∠BFC = ∠DFE | (vert. opp. ∠s)", "∴ △BCF ≅ △DEF | (ASA)", "BC = DE | (corr. sides, ≅ △s)", "BC = AE | (opp. sides of //gram)", "∴ AE = DE", "∴ E is the mid-point of AD."], answer: "E is the mid-point of AD." },
      11: { steps: ["AD // BC | (definition of //gram)", "i.e. AE // FC", "∠BAD = ∠BCD | (opp. ∠s of //gram)", "∠EAF = (1/2)∠BAD", "∠FCE = (1/2)∠BCD", "∴ ∠EAF = ∠FCE", "∠DEC = ∠FCE | (alt. ∠s, AD // BC)", "= ∠EAF", "∴ AF // EC | (corr. ∠s equal)", "∴ AECF is a parallelogram. | (opp. ∠s equal)", "∴ AE = CF | (opp. sides of //gram)"], answer: "AE = CF" },
      12: { steps: ["Let G be the point of intersection of AC and EF.", "In △AEG and △AFG,", "AG = AG | (common side)", "∠EAG = ∠FAG | (property of rhombus)", "AB = AD | (definition of rhombus)", "AE = (1/2)AB", "AF = (1/2)AD", "∴ AE = AF", "∴ △AEG ≅ △AFG | (SAS)", "∴ ∠AGE = ∠AGF | (corr. ∠s, ≅ △s)", "∠AGE + ∠AGF = 180° | (adj. ∠s on st. line)", "2∠AGE = 180°", "∠AGE = 90°", "∴ EF ⊥ AC", "∴ The claim is agreed."], answer: "The claim is agreed." },
      13: { steps: ["Join AC. Let AC and BD intersect at point G.", "In △ABF and △ADE,", "AB = AD | (definition of square)", "AF = AE | (definition of rhombus)", "BG = GD | (property of square)", "EG = GF | (property of rhombus)", "BF = BG + GF = GD + EG = DE", "∴ △ABF ≅ △ADE | (SSS)", "∴ ∠BAF = ∠DAE | (corr. ∠s, ≅ △s)"], answer: "∠BAF = ∠DAE" },
      14: { steps: ["∠AHC = ∠ABC | (opp. ∠s of //gram)", "= a", "∠CHE = ∠CDE | (property of rhombus)", "= b", "∠EHG = ∠EFG | (opp. ∠s of //gram)", "= c", "∠AHC + ∠CHE + ∠EHG = 180° | (adj. ∠s on st. line)", "a + b + c = 180°", "∴ The claim is agreed."], answer: "The claim is agreed." },
      15: { parts: [
        { label: "(a)", steps: ["AB = AD | (def. of rhombus)", "∠ABD = ∠ADB | (base ∠s, isos. △)", "∠EBD = ∠ABE − ∠ABD = ∠ADF − ∠ADB = ∠FDB"], answer: "∠EBD = ∠FDB" },
        { label: "(b)", steps: ["In △BDE and △DBF,", "BC = CD | (definition of rhombus)", "∠BDE = ∠DBF | (base ∠s, isos. △)", "BD = DB | (common side)", "∠EBD = ∠FDB | (proved in (a))", "∴ △BDE ≅ △DBF | (ASA)"], answer: "△BDE ≅ △DBF" }
      ]},
      16: { parts: [
        { label: "(a)", steps: ["In △ABE and △DCE,", "AB = DC | (property of square)", "∠BAD = ∠CDA = 90° | (definition of square)", "∵ AE = DE | (given)", "∴ ∠DAE = ∠ADE | (base ∠s, isos. △)", "∠BAE = ∠BAD − ∠DAE = ∠CDA − ∠ADE = ∠CDE", "AE = DE | (given)", "∴ △ABE ≅ △DCE | (SAS)"], answer: "△ABE ≅ △DCE" },
        { label: "(b)", steps: ["CE = BE | (corr. sides, ≅ △s)", "BC = AB = BE | (given/proved)", "∴ BC = BE = CE", "∴ △BCE is equilateral."], answer: "△BCE is equilateral." }
      ]},
      17: { parts: [
        { label: "(a)", steps: ["∠BOE = 90° | (property of square)", "∠BEO = 90° − ∠OBE | (∠ sum of △)", "∠BFG = 90° | (given)", "∠BGF = 90° − ∠OBE", "∴ ∠BGF = ∠BEO"], answer: "∠BGF = ∠BEO" },
        { label: "(b)", steps: ["∠AGO = ∠BEO | (proved in (a))", "∠AOG = ∠BOE = 90° | (property of square)", "AO = BO | (property of square)", "∴ △AGO ≅ △BEO | (AAS)", "∴ AG = BE | (corr. sides, ≅ △s)"], answer: "AG = BE" }
      ]},
      18: { parts: [
        { label: "(a)", steps: ["BC = DC | (property of square)", "EC = FC | (property of square)", "BE = BC − EC = DC − FC = DF"], answer: "BE = DF" },
        { label: "(b)", steps: ["BE = DF | (proved in (a))", "∠ABE = ∠ADF = 90° | (property of square)", "AB = AD | (property of square)", "∴ △ABE ≅ △ADF | (SAS)", "∴ AE = AF | (corr. sides, ≅ △s)", "AG = AG | (common)", "EG = FG | (property of square)", "∴ △AEG ≅ △AFG | (SSS)", "∴ ∠EAG = ∠FAG | (corr. ∠s, ≅ △s)"], answer: "∠EAG = ∠FAG" }
      ]},
      19: { parts: [
        { label: "(a)", steps: ["∠ABF = ∠CBG = 90° | (property of square)", "AB = CB | (property of square)", "FB = GB | (property of square)", "∴ △AFB ≅ △CGB | (SAS)"], answer: "△AFB ≅ △CGB" },
        { label: "(b)", steps: ["∠EFH = ∠BAF | (alt. ∠s) = ∠BCG | (corr. ∠s)", "∠FEH = ∠CBG = 90° | (given)", "∠EHF = ∠AFB = ∠CGB | (∠ sum)", "∴ △EFH ~ △BCG | (AAA)"], answer: "△EFH ~ △BCG" }
      ]},
      20: { parts: [
        { label: "(a)", steps: ["∠AFE = ∠BFC | (vert. opp. ∠s)", "∠EAF = ∠CBF | (alt. ∠s, AE // BC)", "∠AEF = ∠BCF | (alt. ∠s, AE // BC)", "∴ △AEF ~ △BCF | (AAA)"], answer: "△AEF ~ △BCF" },
        { label: "(b)", steps: ["AF/BF = AE/BC = 2/3 | (given)", "Let AF = 2k, BF = 3k", "CD = BA = AF + BF = 5k", "BF : CD = 3k : 5k = 3 : 5", "∴ The claim is disagreed. | (not 3:4)"], answer: "The claim is disagreed." }
      ]},
      21: { parts: [
        { label: "(a)", steps: ["∠AEF = ∠ABD | (corr. ∠s, EF // BD)", "∠AFE = ∠ADB | (corr. ∠s, EF // BD)", "∠EAF = ∠BAD | (common ∠)", "∴ △AEF ~ △ABD | (AAA)"], answer: "△AEF ~ △ABD" },
        { label: "(b)", steps: ["AE/AB = 1/4 | (given)", "BE = 3k, CD = 4k", "△BEG ~ △DCG | (AAA)", "EG/CG = 3/4", "EG/CE = EG/(EG + GC) = 3/7", "∴ EG : CE = 3 : 7 | (agreed)"], answer: "The claim is agreed." }
      ]},
      22: { steps: ["BC // AD | (definition of //gram)", "i.e. BF // ED", "BC = AD | (opp. sides of //gram)", "FC = AE | (opp. sides of //gram)", "BF = BC − FC", "= AD − AE", "= ED", "∴ BFDE is a parallelogram. | (2 sides // and equal)", "∴ BE // FD | (definition of //gram)", "i.e. GE // FH", "AFCE is a parallelogram. | (given)", "∴ AF // EC | (definition of //gram)", "i.e. GF // EH", "∴ EGFH is a parallelogram. | (by definition)"], answer: "EGFH is a parallelogram." },
      23: { steps: ["In △ABE and △CDF,", "∠ABE = ∠CDF | (given)", "BE = DF | (opp. sides of //gram)", "∠AEB = ∠ADF | (corr. ∠s, BE // FD)", "∠CFD = ∠ADF | (alt. ∠s, ED // BF)", "∴ ∠AEB = ∠CFD", "∴ △ABE ≅ △CDF | (ASA)", "ED // BF | (definition of //gram)", "i.e. AD // BC", "AE = CF | (corr. sides, ≅ △s)", "ED = BF | (opp. sides of //gram)", "AD = AE + ED", "= CF + BF", "= BC", "∴ ABCD is a parallelogram. | (2 sides // and equal)"], answer: "ABCD is a parallelogram." },
      24: { steps: ["Join AC.", "Let O be the point of intersection of AC and BD.", "∠AEF = ∠CFE | (given)", "∴ AE // CF | (alt. ∠s equal)", "Consider △AOE and △COF.", "∠AEO = ∠CFO | (given)", "∠AOE = ∠COF | (vert. opp. ∠s)", "AO = CO | (diags. of //gram)", "∴ △AOE ≅ △COF | (AAS)", "∴ AE = CF | (corr. sides, ≅ △s)", "∴ AECF is a parallelogram. | (2 sides // and equal)"], answer: "AECF is a parallelogram." },
      25: { steps: ["Consider △AEH and △CGF.", "AB = DC | (opp. sides of //gram)", "AE = (1/2)AB | (given)", "CG = (1/2)DC | (given)", "∴ AE = CG", "∠EAH = ∠GCF | (opp. ∠s of //gram)", "AD = BC | (opp. sides of //gram)", "AH = (1/2)AD | (given)", "CF = (1/2)BC | (given)", "∴ AH = CF", "∴ △AEH ≅ △CGF | (SAS)", "∴ EH = GF | (corr. sides, ≅ △s)", "Similarly, △BEF ≅ △DGH | (SAS)", "∴ EF = GH | (corr. sides, ≅ △s)", "∴ EFGH is a parallelogram. | (opp. sides equal)"], answer: "EFGH is a parallelogram." },
      26: { parts: [
        { label: "(a)", steps: ["∵ ∠BAE = ∠DFA | (corr. ∠s, ~ △s)", "∴ BA // CD | (alt. ∠s equal)", "∵ ∠AEB = ∠FAD | (corr. ∠s, ~ △s)", "∴ AD // BE | (alt. ∠s equal)", "∴ ABCD is a parallelogram. | (by definition)"], answer: "ABCD is a parallelogram." },
        { label: "(b)", steps: ["AB = AD | (given)", "AB = DC | (opp. sides of //gram)", "BC = AD | (opp. sides of //gram)", "∴ AB = BC = CD = AD", "∴ ABCD is a rhombus. | (by definition)", "∴ The claim is agreed."], answer: "The claim is agreed." }
      ]},
      27: { parts: [
        { label: "(a)", steps: ["EF = EG | (given)", "BE = ED | (property of rhombus)", "∴ BGDF is a parallelogram. | (diags. bisect each other)"], answer: "BGDF is a parallelogram." },
        { label: "(b)", steps: ["Consider △BEF and △DEF.", "EF = EF | (common side)", "∠BEF = 90° = ∠DEF | (property of rhombus)", "BE = DE | (property of rhombus)", "∴ △BEF ≅ △DEF | (SAS)", "∴ BF = DF | (corr. sides, ≅ △s)", "BG = FD | (opp. sides of //gram)", "∴ BF = BG = GD = FD", "∴ BGDF is a rhombus. | (by definition)", "∴ The claim is agreed."], answer: "The claim is agreed." }
      ]},
      28: { steps: ["∵ ∠ACB = ∠CFD | (corr. ∠s, ~ △s)", "∴ BC // ED | (alt. ∠s equal)", "∠CDE = ∠ABC | (corr. ∠s, ~ △s)", "= 90°", "∠CDE + ∠BCD = 180° | (int. ∠s, BC // ED)", "∠BCD = 180° − 90° = 90°", "Similarly, ∠BED = 90°.", "∴ ∠EBC = ∠BCD = ∠CDE = ∠BED = 90°", "∴ BCDE is a rectangle. | (by definition)"], answer: "BCDE is a rectangle." },
      29: { parts: [
        { label: "(a)", steps: ["Join BD.", "Consider △BEF and △BCF.", "AB = EB | (given)", "AD = ED | (given)", "BD = BD | (common side)", "∴ △ABD ≅ △EBD | (SSS)", "∴ ∠BAD = ∠BED | (corr. ∠s, ≅ △s)", "∠BCF + 90° + ∠BAD + 90° = 360° | (∠ sum of polygon)", "∠BCF = 180° − ∠BAD", "= 180° − ∠BED", "∠BED + ∠BEF = 180° | (adj. ∠s on st. line)", "∠BEF = 180° − ∠BED", "∴ ∠BEF = ∠BCF", "∠BFE = ∠BFC = 90° | (given)", "BF = BF | (common side)", "∴ △BEF ≅ △BCF | (AAS)"], answer: "△BEF ≅ △BCF" },
        { label: "(b)", steps: ["Area of quadrilateral ABCD = area of square BFDG", "= 8² cm²", "= 64 cm²"], answer: "64 cm²" }
      ]},
      30: { parts: [
        { label: "(a)", steps: ["In △ABC and △DEF,", "AC = DF | (opp. sides of //gram)", "∠BCE = ∠BFE | (opp. ∠s of //gram)", "AC // FD and BF // CE | (definition of //gram)", "i.e. GC // FH and GF // CH", "∴ CHFG is a parallelogram. | (by definition)", "∴ ∠GCH = ∠GFH | (opp. ∠s of //gram)", "∠BCA = ∠BCE − ∠GCH", "∠EFD = ∠BFE − ∠GFH", "∴ ∠BCA = ∠EFD", "BC = EF | (opp. sides of //gram)", "∴ △ABC ≅ △DEF | (SAS)"], answer: "△ABC ≅ △DEF" },
        { label: "(b)", steps: ["Join AD.", "∠BAC = ∠EDF | (corr. ∠s, ≅ △s)", "∠CAD = ∠ADF | (alt. ∠s, AC // FD)", "∠BAD = ∠BAC + ∠CAD", "= ∠EDF + ∠ADF", "= ∠EDA", "∴ AB // ED | (alt. ∠s equal)"], answer: "AB // ED" }
      ]},
      31: { steps: ["∵ BH = FH | (given)", "∴ ∠FBH = ∠BFH | (base ∠s, isos. △)", "∠CDE = ∠GFB | (alt. ∠s, DC // AF)", "Consider △BCE and △DCE.", "BC = DC | (definition of square)", "∠BCE = ∠DCE = 45° | (property of square)", "CE = CE | (common side)", "∴ △BCE ≅ △DCE | (SAS)", "∴ ∠CBE = ∠CDE | (corr. ∠s, ≅ △s)", "∴ ∠CBE = ∠CDE = ∠GFB = ∠FBH", "∠EBH = ∠CBE + ∠GBH", "= ∠FBH + ∠GBH", "= ∠GBF", "= 90°", "∴ EB ⊥ BH"], answer: "EB ⊥ BH" },
      32: { steps: ["Draw a line EH such that EH ⊥ BC.", "Consider △CFG and △EFH.", "∠CFG = ∠EFH | (vert. opp. ∠s)", "∠FCG = 45° | (property of square)", "∵ ∠BEC = 90° and BE = CE | (property of square)", "∴ ∠FEH = 90° ÷ 2 | (property of isos. △)", "= 45°", "∴ ∠FCG = ∠FEH", "CF = EF | (given)", "∴ △CFG ≅ △EFH | (ASA)", "Consider △BEH and △ECG.", "EH = CG | (corr. sides, ≅ △s)", "∠BEH = ∠ECG = 45° | (proved)", "BE = EC | (property of square)", "∴ △BEH ≅ △ECG | (SAS)", "∴ ∠CEG = ∠EBH | (corr. ∠s, ≅ △s)", "i.e. ∠FEG = ∠FBE"], answer: "∠FEG = ∠FBE" },
      33: { steps: ["∴ The answer is D."], answer: "D" },
      34: { steps: ["∴ The answer is D."], answer: "D" },
      35: { steps: ["∴ The answer is A."], answer: "A" },
      36: { steps: ["∴ The answer is B."], answer: "B" },
      37: { steps: ["∴ The answer is D."], answer: "D" },
      38: { steps: ["∴ The answer is A."], answer: "A" }
    }
  },

  "6.1": {
    label: "6.1",
    questions: {
      1: { steps: ["∵ CD is a median of △ABC.", "∴ DB = AD = 9 cm", "BC = AB | (given)", "= AD + DB = (9 + 9) cm = 18 cm", "Perimeter of △ABC = AB + BC + AC", "= (18 + 18 + 14) cm = 50 cm"], answer: "Perimeter = 50 cm" },
      2: { steps: ["AB + BC + AC = 33 cm", "15 cm + 2AC = 33 cm", "AC = 9 cm", "∵ BD is a median of △ABC.", "∴ AD = (1/2)AC = (1/2) × 9 cm = 4.5 cm"], answer: "AD = 4.5 cm" },
      3: { steps: ["∵ PS is a median of △PQR.", "∴ QS = SR", "∴ Area of △PQR = area of △PRS × 2", "= 19 × 2 cm² = 38 cm²"], answer: "Area = 38 cm²" },
      4: { steps: ["∵ CD is an altitude of △ABC.", "∴ CD ⊥ AB", "In △ACD, ∠ACD + 34° + 90° = 180°", "∠ACD = 56°", "∵ BD = CD | (given)", "∴ ∠DBC = ∠DCB | (base ∠s, isos. △)", "In △BCD, 90° + 2∠DCB = 180°", "∠DCB = 45°", "∠ACB = ∠ACD + ∠DCB = 56° + 45° = 101°"], answer: "∠ACB = 101°" },
      5: { steps: ["∵ AD is an altitude of △ABC.", "∴ ∠ADB = 90°", "In △ABD, ∠ABD + 25° + 90° = 180°", "∠ABD = 65°", "∵ AC = BC | (given)", "∴ ∠BAC = ∠ABC = 65° | (base ∠s, isos. △)", "In △ABC, ∠ACB + 65° + 65° = 180°", "∠ACB = 50°"], answer: "∠ACB = 50°" },
      6: { steps: ["In △ABC, ∠ABC + 65° + 77° = 180°", "∠ABC = 38°", "∵ BD is the angle bisector of ∠ABC.", "∴ ∠DBC = 38° ÷ 2 = 19°", "In △BDC, ∠BDC + 19° + 65° = 180°", "∠BDC = 96°"], answer: "∠BDC = 96°" },
      7: { steps: ["∠SPR = 60° | (property of equil. △)", "∠QRP = ∠SPR = 60° | (alt. ∠s, QR // PS)", "In △PTR, ∠TPR + 92° + 60° = 180°", "∠TPR = 28°", "∵ PT is the angle bisector of ∠QPR.", "∴ ∠QPT = ∠TPR = 28°", "In △PQT, ∠PQR + 28° = 92° | (ext. ∠ of △)", "∠PQR = 64°"], answer: "∠PQR = 64°" },
      8: { steps: ["∵ AD is the perp. bisector of BC.", "∴ AD ⊥ BC and BD = DC", "CD = (1/2)BC = (1/2) × 20 cm = 10 cm", "In △ACD, AC = √(AD² + DC²) = √(24² + 10²) cm = 26 cm"], answer: "AC = 26 cm" },
      9: { steps: ["In △ABC, ∠ABC + 71° + 47° = 180°", "∠ABC = 62°", "∵ BE is the angle bisector of ∠ABC.", "∴ ∠EBC = 62° ÷ 2 = 31°", "∵ AD is an altitude of △ABC.", "∴ ∠BDF = 90°", "In △BFD, ∠DFE = ∠FBD + ∠BDF = 31° + 90° = 121°"], answer: "∠DFE = 121°" },
      10: { steps: ["∵ AD is an altitude of △ABC.", "∴ ∠ADC = 90°", "∵ AB is an altitude of △ABC.", "∴ ∠BAC = 90°", "∠BAD = 90° − ∠DAC", "In △ACD, ∠ACB = 90° − ∠DAC", "∴ ∠ACB = ∠BAD"], answer: "∠ACB = ∠BAD" },
      11: { steps: ["∵ ∠ABD = ∠BAD | (given)", "∴ AD = BD | (sides opp. equal ∠s)", "∵ AD is a median of △ABC.", "∴ BD = CD, i.e. AD = CD", "Let ∠BAD = x, ∠CAD = y.", "∠ABD = x, ∠ACD = y | (base ∠s, isos. △)", "In △ABC, x + y + (x + y) = 180°", "x + y = 90°, i.e. ∠BAC = 90°", "∴ AB is an altitude of △ABC."], answer: "AB is an altitude of △ABC." },
      12: { parts: [
        { label: "(a)", steps: ["∠BCA = ∠DAC | (alt. ∠s, BC // AD)", "∵ AD = CD | (given)", "∴ ∠ACD = ∠DAC | (base ∠s, isos. △)", "= ∠BCA", "∴ AC is the angle bisector of ∠BCD."], answer: "AC is the angle bisector of ∠BCD." },
        { label: "(b)", steps: ["∠BCD + ∠ADC = 180° | (int. ∠s, BC // AD)", "∠BCD + 112° = 180°, ∠BCD = 68°", "∵ AC is the angle bisector of ∠BCD.", "∴ ∠BCA = 68° ÷ 2 = 34°", "In △ABC, ∠ABC + 56° + 34° = 180°", "∠ABC = 90°"], answer: "∠ABC = 90°" }
      ]},
      13: { steps: ["∠DBC = ∠DCB = 60° | (property of equil. △)", "∠ACD = ∠ACB − ∠DCB = 90° − 60° = 30°", "In △ABC, ∠BAC + 90° + 60° = 180°, ∠BAC = 30°", "∵ ∠ACD = ∠BAC", "∴ AD = CD | (sides opp. equal ∠s)", "= BD | (definition of equil. △)", "∴ CD is a median of △ABC."], answer: "CD is a median of △ABC." },
      14: { steps: ["Let ∠DBC = x.", "∠ABC = 2x | (angle bisector)", "∵ AC = BC | (given)", "∴ ∠BAC = ∠ABC = 2x | (base ∠s, isos. △)", "BD = CD | (given)", "∠DCB = ∠DBC = x | (base ∠s, isos. △)", "∠BDA = ∠DCB + ∠DBC = 2x = ∠BAC | (ext. ∠ of △)", "∴ AB = DB | (sides opp. equal ∠s)", "∴ △ABD is an isosceles triangle."], answer: "△ABD is an isosceles triangle." },
      15: { parts: [
        { label: "(a)", steps: ["∠ADE = ∠CBE | (alt. ∠s, AD // BC)", "∠DAE = ∠BCE | (alt. ∠s, AD // BC)", "DE = BE | (given)", "∴ △AED ≅ △CEB | (AAS)"], answer: "△AED ≅ △CEB" },
        { label: "(b)", steps: ["∵ △AED ≅ △CEB | (proved in (a))", "∴ AE = CE | (corr. sides, ≅ △s)", "∴ EF is a median of △AFC."], answer: "EF is a median of △AFC." }
      ]},
      16: { steps: ["∵ BD is the angle bisector of ∠ABC.", "∴ ∠ABD = ∠CBD | (given)", "BD = BD | (common side)", "∠ADB = ∠CDB | (given)", "∴ △ABD ≅ △CBD | (ASA)", "∴ AD = CD | (corr. sides, ≅ △s)", "∠ADB + ∠CDB = 180° | (adj. ∠s on st. line)", "2∠CDB = 180°, ∠CDB = 90°", "∵ AD = CD and BD ⊥ AC", "∴ BD is the perpendicular bisector of AC."], answer: "BD is the perpendicular bisector of AC." },
      17: { steps: ["∵ AE is an altitude of △ABC.", "∴ ∠AEC = 90°", "In △CEF, ∠FCE + 90° = 124°", "∠FCE = 34°", "∵ CD is the angle bisector of ∠ACB.", "∴ ∠ACB = 2 × 34° = 68°", "In △ABC, ∠BAC + 68° + 57° = 180°", "∠BAC = 55°"], answer: "∠BAC = 55°" },
      18: { steps: ["∵ CD is the angle bisector of ∠ACB.", "∴ ∠ACB = 2 × 37° = 74°", "In △ABC, ∠ABC + 74° + 62° = 180°", "∠ABC = 44°", "In △BDE, ∠DEC = ∠DBE + ∠BDE = 44° + 46° = 90°", "∴ DE is an altitude of △BCD."], answer: "DE is an altitude of △BCD." },
      19: { steps: ["∵ AD and BD are angle bisectors of ∠BAC and ∠ABC.", "∴ ∠BAC = 2x and ∠ABC = 2y", "In △ABC, 48° + 2x + 2y = 180°", "x + y = 66°", "In △ABD, ∠ADB + x + y = 180°", "∠ADB + 66° = 180°", "∠ADB = 114°"], answer: "∠ADB = 114°" },
      20: { parts: [
        { label: "(a)", steps: ["∵ DE is the perp. bisector of AC.", "∴ ∠ADE = ∠CDE = 90° and AD = CD", "DE = DE | (common side)", "∴ △ADE ≅ △CDE | (SAS)", "∴ AE = CE | (corr. sides, ≅ △s)"], answer: "△ADE ≅ △CDE; AE = CE" },
        { label: "(b)", steps: ["∵ AE = CE | (proved in (a))", "∴ ∠ECA = 29° | (base ∠s, isos. △, from 122° + 2∠ECA = 180°)", "∵ AB is an altitude of △ABC.", "∴ ∠ABC = 90°", "In △ABC, ∠BAC + 90° + 29° = 180°", "∠BAC = 61°"], answer: "∠BAC = 61°" }
      ]},
      21: { steps: ["Let ∠ACD = x.", "∵ CD is the angle bisector of ∠ACB.", "∴ ∠BCD = x", "∵ CE = DE | (given)", "∴ ∠CDE = ∠DCE = x | (base ∠s, isos. △)", "∵ AD = CD | (given)", "∴ ∠DAC = ∠DCA = x | (base ∠s, isos. △)", "∠BDC = 2x, ∠DEA = 2x | (ext. ∠ of △)", "∠ADE + ∠DAE + ∠DEA = 180°", "∠ADE = ∠CBD", "∴ △ADE ~ △CBD | (AAA)"], answer: "△ADE ~ △CBD" },
      22: { steps: ["Let ∠BCE = a, ∠DCE = b, ∠ABC = x.", "∠BDC = ∠ABC = x | (given)", "In △BCE, ∠AEC = x + a | (ext. ∠ of △)", "In △FCD, ∠DFE = x + b | (ext. ∠ of △)", "AB = BD | (given)", "∴ ∠BAD = ∠BDA | (base ∠s, isos. △)", "∠AEC + ∠CEF = 180° | (adj. ∠s on st. line)", "∠DFE + ∠EFC = 180° | (adj. ∠s on st. line)", "∴ ∠AEC = ∠DFE", "x + a = x + b, so a = b", "∴ ∠BCE = ∠DCE", "∴ CE is the angle bisector of ∠BCD."], answer: "CE is the angle bisector of ∠BCD." },
      23: { steps: ["AE = AE | (common side)", "AB = AD | (given)", "∵ AE is a median of △BAD.", "∴ BE = DE", "∴ △ABE ≅ △ADE | (SSS)", "∴ ∠BEA = ∠DEA | (corr. ∠s, ≅ △s)", "∠BEA + ∠DEA = 180° | (adj. ∠s on st. line)", "∠DEA = 90°", "∴ AC is the perp. bisector of BD.", "∴ CB = CD", "∴ △BCD is an isosceles triangle."], answer: "△BCD is an isosceles triangle." },
      24: { steps: ["∵ AC is the perp. bisector of BD.", "∴ AC ⊥ BD, AB = AD and CB = CD", "Consider △CBE and △ABE.", "BE = BE | (common side)", "∠ECB = ∠EAB | (given)", "∠CEB = ∠AEB = 90°", "∴ △CBE ≅ △ABE | (AAS)", "∴ CE = AE | (corr. sides, ≅ △s)", "∴ BD is the perp. bisector of AC.", "∴ AB = BC = CD = DA"], answer: "AB = BC = CD = DA" },
      25: { parts: [
        { label: "(a)", steps: ["AC = BC | (given)", "AD = BD | (given)", "CD = CD | (common side)", "∴ △CDB ≅ △CDA | (SSS)", "∴ ∠DCB = ∠DCA | (corr. ∠s, ≅ △s)", "∴ CD is the angle bisector of ∠ACB."], answer: "CD is the angle bisector of ∠ACB." },
        { label: "(b)", steps: ["∵ △CDB ≅ △CDA | (proved in (a))", "∴ ∠BDC = ∠ADC = 122°", "∠ADB + 122° + 122° = 360° | (∠s at a pt.)", "∠ADB = 116°", "∵ AD = BD", "∴ ∠BAD = ∠ABD | (base ∠s, isos. △)", "In △ABD, 116° + 2∠ABD = 180°", "∠ABD = 32°"], answer: "∠ABD = 32°" }
      ]},
      26: { steps: ["Let ∠ABE = x and ∠CBF = y.", "∵ BE and BF are angle bisectors of ∠ABD and ∠CBD.", "∴ ∠DBE = x and ∠DBF = y", "x + x + y + y = 180° | (adj. ∠s on st. line)", "x + y = 90°", "∠DBE + ∠DBF + ∠BFD = 180° | (int. ∠s, BE // CD)", "90° + ∠BFD = 180°, ∠BFD = 90°", "∴ BF ⊥ CD", "∠CBF = ∠DBF | (given), BF = BF | (common side)", "∴ △CFB ≅ △DFB | (ASA)", "∴ CF = DF | (corr. sides, ≅ △s)", "∴ BF is the perp. bisector of CD."], answer: "BF is the perp. bisector of CD." },
      27: { parts: [
        { label: "(a)", steps: ["∵ DE is the perp. bisector of AC.", "∴ ED ⊥ AC and AD = DC", "In △CDE, CD = √(CE² − DE²) = √(75² − 45²) cm = 60 cm", "AC = 2CD = 120 cm"], answer: "AC = 120 cm" },
        { label: "(b)", steps: ["∵ AB is an altitude of △ABC.", "∴ ∠ABC = 90°", "(1/2)(75 cm)(AB) = (1/2)(120 cm)(45 cm)", "AB = 72 cm", "∵ AE = EC = 75 cm | (perp. bisector)", "In △ABE, BE = √(AE² − AB²) = √(75² − 72²) cm = 21 cm"], answer: "BE = 21 cm" }
      ]},
      28: { parts: [
        { label: "(a)", steps: ["∵ BD is the angle bisector of ∠ABC.", "∴ ∠ABD = ∠CBD", "BC = CD | (given)", "∴ ∠CBD = ∠CDB | (base ∠s, isos. △)", "∴ ∠ABD = ∠CDB", "∴ AB // DC | (alt. ∠s equal)", "∠BAC = ∠ACD | (alt. ∠s, AB // DC)", "AB = BC | (given)", "∴ ∠BAC = ∠BCA | (base ∠s, isos. △)", "∴ ∠ACD = ∠BCA", "∴ AC is the angle bisector of ∠BCD."], answer: "AC is the angle bisector of ∠BCD." },
        { label: "(b)", steps: ["∵ AB = DC | (given)", "AB // DC | (proved in (a))", "∴ ABCD is a parallelogram. | (2 sides // and equal)", "∴ DA = CB | (opp. sides of //gram)", "So AB = BC = CD = DA.", "∴ ABCD is a rhombus.", "∴ The claim is agreed."], answer: "The claim is agreed." }
      ]},
      29: { parts: [
        { label: "(a)", steps: ["∠MDE = ∠ADB | (common angle)", "∵ EM is a median of △ADE.", "∴ DM/DA = 1/2", "∵ DE = BE | (diags. of //gram)", "∴ DB = 2DE, DE/DB = 1/2", "∴ DM/DA = DE/DB", "∴ △MDE ~ △ADB | (ratio of 2 sides, inc. ∠)", "∴ AB // ME | (corr. ∠s equal)"], answer: "AB // ME" },
        { label: "(b)", steps: ["△NCE ~ △BCA | (AAA: corr. ∠s, EN // AB)", "∵ CE = EA | (diags. of //gram)", "∴ CA = 2CE, NC/BC = CE/CA = 1/2", "∴ NC = (1/2)BC", "∴ EN is a median of △BCE."], answer: "EN is a median of △BCE." }
      ]},
      30: { steps: ["∵ DE is the perp. bisector of BC.", "∴ ∠DEB = 90° and BE = EC, BC = 2BE", "∵ CD is a median of △ABC.", "∴ BD = DA, BA = 2BD", "BE/BC = BD/BA = 1/2", "∠CBA = ∠EBD | (common angle)", "∴ △BDE ~ △BAC | (ratio of 2 sides, inc. ∠)", "∴ ∠BCA = ∠BED = 90°", "∴ AC is an altitude of △ABC."], answer: "AC is an altitude of △ABC." },
      31: { parts: [
        { label: "(a)", steps: ["∵ EF is the perp. bisector of BC.", "∴ EF ⊥ BC and BF = CF", "EF = EF | (common side), ∠BFE = ∠CFE = 90°", "∴ △BFE ≅ △CFE | (SAS)", "∴ ∠FBE = ∠FCE | (corr. ∠s, ≅ △s)", "∴ ∠CBD = ∠BCA", "BC = CB, DB = AC | (given)", "∴ △BCD ≅ △CBA | (SAS)", "∴ ∠BAC = ∠BDC | (corr. ∠s, ≅ △s)"], answer: "∠BAC = ∠BDC" },
        { label: "(b)", steps: ["∠BDC = ∠BAC = 36° | (proved in (a))", "In △BEF, ∠EBF + 57° + 90° = 180°", "∠EBF = 33°", "In △DBC, ∠BCD + 33° + 36° = 180°", "∠BCD = 111°"], answer: "∠BCD = 111°" }
      ]},
      32: { parts: [
        { label: "(a)", steps: ["∵ DG and EF are altitudes of △BDG and △CEF.", "∴ ∠DGB = ∠EFC = 90°", "BD = CE | (given), DG = EF | (given)", "∴ △BGD ≅ △CFE | (RHS)", "∠GBD = ∠FCE | (corr. ∠s, ≅ △s)", "∵ BG and CF are angle bisectors of ∠ABC and ∠ACB.", "∠GBD = ∠GBC = ∠FCE = ∠FCB", "∵ ∠IBC = ∠ICB", "∴ IB = IC | (sides opp. equal ∠s)", "∵ ∠ABC = ∠ACB", "∴ AB = AC | (sides opp. equal ∠s)"], answer: "AB = AC" },
        { label: "(b)", steps: ["∵ ∠BAJ = ∠CAJ | (proved in (a))", "AB = AC, AJ = AJ | (common)", "∴ △AJB ≅ △AJC | (SAS)", "∴ BJ = CJ and ∠AJC = 90°", "∴ IJ is the perp. bisector of BC."], answer: "IJ is the perp. bisector of BC." }
      ]},
      33: { parts: [
        { label: "(a)", steps: ["∵ CD and AE are altitudes of △ABC.", "∴ ∠BDF = ∠BEF = 90°", "DF = EF | (given), BF = BF | (common side)", "∴ △BDF ≅ △BEF | (RHS)", "∴ ∠DBF = ∠EBF | (corr. ∠s, ≅ △s)", "∴ BF is the angle bisector of ∠ABC."], answer: "BF is the angle bisector of ∠ABC." },
        { label: "(b)", steps: ["In △ABE, ∠BAE = 90° − ∠ABE", "In △ACE, ∠CAE = 90° − ∠ACE", "∵ ∠ABE may not equal ∠ACE", "∴ AF may not be the angle bisector of ∠BAC.", "∴ The claim is disagreed."], answer: "The claim is disagreed." }
      ]},
      34: { steps: ["∠BDE + ∠EDA + ∠ADC = 180° | (adj. ∠s on st. line)", "26° + ∠EDA + 84° = 180°, ∠EDA = 70°", "∵ AD = DE | (given)", "∴ ∠DEA = ∠DAE | (base ∠s, isos. △)", "In △DAE, 70° + 2∠DAE = 180°, ∠DAE = 55°", "∵ AD is the angle bisector of ∠BAC.", "∴ ∠DAC = ∠DAE = 55°", "In △ADC, ∠ACB + 84° + 55° = 180°", "∠ACB = 41°", "∴ The answer is B."], answer: "B" },
      35: { steps: ["∵ CD is the angle bisector of ∠ACB.", "∴ ∠ACF = ∠ECF", "∵ AF = CF | (given)", "∴ ∠ACF = ∠CAF | (base ∠s, isos. △)", "i.e. ∠ACF = ∠ECF = ∠CAE", "∵ AE is an altitude of △ABC.", "∴ AE ⊥ BC", "In △CAE, 90° + 3∠CAE = 180°, ∠CAE = 30°", "In △BAE, ∠BAE + 90° + 65° = 180°, ∠BAE = 25°", "∠BAC = 25° + 30° = 55°", "∴ The answer is C."], answer: "C" },
      36: { steps: ["Let ∠DAC = x.", "∠DAB = x and ∠BAC = 2x | (angle bisector)", "∵ AC = BC | (given)", "∴ ∠ABC = ∠BAC = 2x | (base ∠s, isos. △)", "In △BAD, ∠ABD + ∠DAB = ∠ADC | (ext. ∠ of △)", "2x + x = 111°, x = 37°", "In △DAC, ∠ACB + 37° + 111° = 180°", "∠ACB = 32°", "∴ The answer is A."], answer: "A" },
      37: { steps: ["∵ DE is the perp. bisector of AB.", "∴ ED ⊥ AB and BD = DA", "∠BCA = 90° | (given) = ∠EDA", "∠BAC = ∠EAD | (common angle)", "∴ △ABC ~ △AED | (AAA)", "AB/AE = AC/AD | (corr. sides, ~ △s)", "AB/25 cm = (25 + 7) cm / (1/2)AB", "(1/2)AB² = 800 cm², AB = 40 cm", "In △ABC, BC = √(AB² − AC²) = √(40² − (25+7)²) cm = 24 cm", "∴ The answer is C."], answer: "C" },
      38: { steps: ["For I:", "∵ ∠ACD = ∠CAD | (given)", "∴ AD = CD | (sides opp. equal ∠s)", "∴ I is true.", "For II:", "∵ DE is a median of △ACD.", "∴ AE = CE", "DE = DE | (common), AD = CD | (proved)", "∴ △ADE ≅ △CDE | (SSS)", "∠AED = ∠CED, 2∠CED = 180°, ∠CED = 90°", "∴ BD ⊥ AC, BE is an altitude.", "∴ II is true.", "For III: AC may not be the perp. bisector of BD.", "∴ III may not be true.", "∴ The answer is A."], answer: "A" },
      39: { steps: ["For I:", "∠BCD = ∠CBF | (corr. ∠s, ≅ △s)", "∴ I is true.", "For II:", "△ABG ≅ △ACG | (SSS), ∠BAG = ∠CAG", "∴ AE is the angle bisector of ∠BAC.", "∴ II is true.", "For III:", "△ABE ≅ △ACE | (SAS), BE = CE, ∠CEA = 90°", "∴ AE is the perp. bisector of BC.", "∴ III is true.", "∴ The answer is D."], answer: "D" },
      40: { steps: ["For I: DE may not be the angle bisector of ∠ADF.", "∴ I may not be true.", "For II:", "△ABE ≅ △ADE | (SSS), △ABF ≅ △ADF | (SAS)", "BF = DF, ∠DFA = 90°", "∴ AC is the perp. bisector of BD.", "∴ II is true.", "For III:", "△ABC ≅ △ADC | (SAS), BC = DC", "∴ △BCD is an isosceles triangle.", "∴ III is true.", "∴ The answer is D."], answer: "D" },
      41: { steps: ["For I:", "∵ AQ is an altitude of △ABC, AQ ⊥ BC", "∵ BC // PR | (given)", "∴ AQ ⊥ PR, ∠ASP = ∠ASR = 90°", "△ASP ≅ △ASR | (ASA)", "PS = RS | (corr. sides)", "∴ I is true.", "For II and III: may not be true.", "∴ The answer is A."], answer: "A" },
      42: { steps: ["For I: altitude may lie outside the triangle.", "∴ I is true.", "For II: angle bisector always inside.", "∴ II is not true.", "For III: median always inside.", "∴ III is not true.", "∴ The answer is A."], answer: "A" }
    }
  },

  "6.3": {
    label: "6.3",
    questions: {
      1: { steps: ["∵ I is the incentre of △ABC.", "∴ ∠CBI = ∠ABI = 21° and ∠BCI = ∠ACI = 27°", "In △BCI, ∠BIC + 21° + 27° = 180° | (∠ sum of △)", "∠BIC = 132°"], answer: "∠BIC = 132°" },
      2: { steps: ["In △ABC, ∠BAC + 54° + 66° = 180°", "∠BAC = 60°", "∵ I is the incentre of △ABC.", "∴ ∠ABI = 54° ÷ 2 = 27°", "∠BAI = 60° ÷ 2 = 30°", "In △ABI, ∠AIB + 27° + 30° = 180°", "∠AIB = 123°"], answer: "∠AIB = 123°" },
      3: { steps: ["In △ABC, ∠ABC + 68° + 48° = 180°", "∠ABC = 64°", "∵ O is the circumcentre of △ABC.", "∴ ∠BDO = ∠BEO = 90°", "In quadrilateral BDOE,", "∠DOE + 64° + 90° + 90° = 360°", "∠DOE = 116°"], answer: "∠DOE = 116°" },
      4: { steps: ["∵ G is the centroid of △ABC.", "∴ AB = 2AD = 7 × 2 cm = 14 cm", "AC = AB | (given) = 14 cm", "BC + 14 + 14 = 40 cm | (perimeter)", "BC = 12 cm"], answer: "BC = 12 cm" },
      5: { steps: ["Produce CH to meet AB at point D.", "∵ H is the orthocentre of △ABC.", "∴ ∠CDA = 90°", "In △ADC, ∠DAC + 36° + 90° = 180°", "∠DAC = 54°"], answer: "∠DAC = 54°" },
      6: { steps: ["∵ O is the circumcentre of △ABC.", "∴ ∠BDO = ∠BEO = 90°", "BD = AD | (given) = 60 cm", "In △BDO, OB = √(OD² + DB²) = √(25² + 60²) cm = 65 cm", "In △BEO, BE = √(OB² − OE²) = √(65² − 33²) cm = 56 cm", "∵ O is the circumcentre.", "∴ CE = BE = 56 cm"], answer: "CE = 56 cm" },
      7: { steps: ["∵ H is the orthocentre of △ABC.", "∴ ∠BDH = ∠CEH = 90°", "∠DHB = ∠EHC | (vert. opp. ∠s)", "DH = EH | (given)", "∴ △BDH ≅ △CEH | (ASA)", "∴ BH = CH | (corr. sides, ≅ △s)", "∴ △BCH is an isosceles triangle."], answer: "△BCH is an isosceles triangle." },
      8: { steps: ["∵ G is the centroid of △PQR.", "∴ PR = 2PY = 2 × 24 cm = 48 cm", "QR = 2XR = 2 × 26 cm = 52 cm", "In △PQR, PQ = √(QR² − PR²) = √(52² − 48²) cm = 20 cm", "PZ = (1/2)PQ = (1/2) × 20 cm = 10 cm"], answer: "PZ = 10 cm" },
      9: { steps: ["∵ G is the centroid of △ABC.", "∴ BD = CD", "BG = CG | (given), DG = DG | (common side)", "∴ △BDG ≅ △CDG | (SSS)", "∴ ∠BDA = ∠CDA | (corr. ∠s, ≅ △s)", "BD = CD | (proved), AD = AD | (common side)", "∴ △BAD ≅ △CAD | (SAS)", "∴ BA = CA | (corr. sides, ≅ △s)", "∴ △ABC is an isosceles triangle."], answer: "△ABC is an isosceles triangle." },
      10: { steps: ["∵ O is the circumcentre of △ABC.", "∴ OA = OB = OC", "∠OBC = ∠OCB = 30°, ∠OAC = ∠OCA = 30°", "Let ∠OBA = x.", "∠OAB = ∠OBA = x | (base ∠s, isos. △)", "∠ACB = 30° + 30° = 60°", "In △ABC, 60° + (x + 30°) + (x + 30°) = 180°", "x = 30°", "∠BAC = ∠ABC = ∠ACB = 60°", "∴ △ABC is an equilateral triangle."], answer: "△ABC is an equilateral triangle." },
      11: { steps: ["∵ ∠ABC = ∠ACB | (given)", "∴ AB = AC | (sides opp. equal ∠s)", "AE = AD | (given)", "∠BAE = ∠CAD | (common angle)", "∴ △BAE ≅ △CAD | (SAS)", "∴ ∠AEB = ∠ADC = 90° | (given)", "∴ BD and CE are altitudes of △BFC.", "∴ A is the orthocentre of △BFC."], answer: "A is the orthocentre of △BFC." },
      12: { steps: ["Let ∠IAC = x and ∠ICA = y.", "∵ I is the incentre of △ABC.", "∴ ∠BAC = 2x and ∠BCA = 2y", "In △IAC, 128° + x + y = 180°", "x + y = 52°", "In △ABC, ∠ABC + 2x + 2y = 180°", "∠ABC + 2(52°) = 180°", "∠ABC = 76°"], answer: "∠ABC = 76°" },
      13: { steps: ["Let ∠EBC = x and ∠EDC = y.", "∵ I₁ and I₂ are incentres of △ABC and △ADC.", "∴ ∠ABC = 2x and ∠CDA = 2y", "In quadrilateral ABCD,", "2x + 105° + 2y + 57° = 360°", "x + y = 99°", "In quadrilateral BCDE,", "∠BED + x + 105° + y = 360°", "∠BED = 255° − 99° = 156°"], answer: "∠BED = 156°" },
      14: { steps: ["∵ G is the centroid of △ABC.", "∴ AD = CD", "∵ ∠BAC = ∠BCA | (given)", "∴ BC = BA | (sides opp. equal ∠s)", "BD = BD | (common side)", "∴ △BDC ≅ △BDA | (SSS)", "∠ABD = ∠CBD = 120° ÷ 2 = 60°", "∠BDA = 90° | (proved)", "In △ABD, BD = AB cos 60° = 16 cos 60° cm = 8 cm", "AD = AB sin 60° = 16 sin 60° cm = 8√3 cm", "AC = 2AD = 16√3 cm", "Area of △ABC = (1/2) × AC × BD = (1/2) × 16√3 × 8 cm² = 64√3 cm²"], answer: "Area = 64√3 cm²" },
      15: { parts: [
        { label: "(a)", steps: ["∵ G is the centroid of △ABC.", "∴ BE = CE = 15 cm", "AB = 2AD = 2 × 18 cm = 36 cm", "AE = (2 + 1) × EG = 3 × 13 cm = 39 cm", "AB² + BE² = (36² + 15²) cm² = 1521 cm²", "AE² = 39² cm² = 1521 cm²", "∵ AB² + BE² = AE²", "∴ ∠ABE = 90° | (converse of Pyth. theorem)", "∴ △ABC is a right-angled triangle."], answer: "△ABC is a right-angled triangle." },
        { label: "(b)", steps: ["∵ ∠ABE = 90° | (proved in (a))", "∴ AB is an altitude of △ACE.", "Area of △ACE = (1/2) × CE × AB", "= (1/2) × 15 × 36 cm²", "= 270 cm²"], answer: "Area = 270 cm²" }
      ]},
      16: { parts: [
        { label: "(a)", steps: ["In △ABC,", "∠CAB + ∠ABC + ∠ACB = 180° | (∠ sum of △)", "∠CAB + 72° + 68° = 180°", "∠CAB = 40°", "∵ I is the incentre of △ABC.", "∴ ∠IAD = 40° ÷ 2 = 20°", "∠IBD = 72° ÷ 2 = 36°", "In △IDB,", "ID/DB = tan ∠IBD", "DB = ID/tan ∠IBD", "= 10 cm/tan 36°", "In △IDA,", "ID/AD = tan ∠IAD", "AD = ID/tan ∠IAD", "= 10 cm/tan 20°", "AB = AD + DB", "= (10/tan 20° + 10/tan 36°) cm", "≈ 41.2 cm, cor. to 3 sig. fig."], answer: "AB ≈ 41.2 cm" },
        { label: "(b)", steps: ["Join IC. Draw IE and IF such that IE ⊥ BC and IF ⊥ AC.", "∵ I is the incentre of △ABC.", "∴ ∠ICB = 68° ÷ 2 = 34°", "IE = IF = ID = 10 cm", "AF = AD, BE = BD and CE = CF", "In △IEC,", "IE/EC = tan ∠ICB", "EC = IE/tan ∠ICB", "= 10 cm/tan 34°", "Perimeter of △ABC", "= AB + BC + AC", "= (AD + DB) + (BE + EC) + (AF + FC)", "= AD + DB + DB + EC + AD + EC", "= 2AD + 2DB + 2EC", "= 2(AD + DB + EC)", "= 2(10/tan 20° + 10/tan 36° + 10/tan 34°) cm", "≈ 112.128 406 2 cm", "< 120 cm", "∴ The claim is disagreed."], answer: "The claim is disagreed." }
      ]},
      17: { steps: ["∵ H is the orthocentre of △ABC.", "∴ AD ⊥ BC", "AD = AC sin∠ACB = 9 sin 64° cm", "DC = AC cos∠ACB = 9 cos 64° cm", "BD = AD/tan∠ABC = 9 sin 64°/tan 48° cm", "BC = BD + DC = (9 sin 64°/tan 48° + 9 cos 64°) cm", "Area of △ABC = (1/2) × BC × AD", "= (1/2)(9 sin 64°/tan 48° + 9 cos 64°)(9 sin 64°) cm²", "≈ 45.4 cm²"], answer: "Area ≈ 45.4 cm²" },
      18: { parts: [
        { label: "(a)", steps: ["Let ∠IBC = a and ∠ICB = b.", "∵ I is the incentre of △ABC.", "∴ ∠IBD = a, ∠ICE = b", "In △BDI, ∠DIE = a + 95° | (ext. ∠ of △)", "In △CEI, ∠DIE = b + 79° | (ext. ∠ of △)", "a + 95° = b + 79°, so b = a + 16° ...(1)", "In △BDC, 2a + b + 95° = 180° ...(2)", "Solving: a = 23°, b = 39°", "∴ ∠BCD = b = 39°"], answer: "∠BCD = 39°" },
        { label: "(b)", steps: ["In △ABC, ∠BAC + 2(23°) + 2(39°) = 180°", "∠BAC = 56°"], answer: "∠BAC = 56°" }
      ]},
      19: { parts: [
        { label: "(a)", steps: ["∵ O is the circumcentre of △ABC.", "∴ OA = OB", "∴ △OAB is an isosceles triangle."], answer: "△OAB is an isosceles triangle." },
        { label: "(b)", steps: ["(i) ∠OAB = ∠OBA = ∠ABC − ∠OBC = 54° − θ", "∠OAC = ∠OCA = ∠ACB − ∠OCB = 69° − θ", "∠BAC = (54° − θ) + (69° − θ) = 123° − 2θ", "(ii) In △ABC, ∠BAC + 54° + 69° = 180°, ∠BAC = 57°", "57° = 123° − 2θ, θ = 33°"], answer: "θ = 33°" }
      ]},
      20: { parts: [
        { label: "(a)", steps: ["∵ O is the circumcentre of △ABC.", "∴ ∠OBA = ∠OAB = x | (base ∠s, isos. △)", "∠OCB = ∠OBC = y | (base ∠s, isos. △)", "In △BDC, ∠ADC = x + 2y | (ext. ∠ of △)", "In △AEB, ∠AEC = 2x + y | (ext. ∠ of △)"], answer: "∠ADC = x + 2y; ∠AEC = 2x + y" },
        { label: "(b)", steps: ["x + 2y = 85° ...(1)", "2x + y = 80° ...(2)", "Solving: x = 25°, y = 30°", "In △ADO, ∠AOC = ∠ADC + ∠OAB = 85° + 25° = 110°"], answer: "∠AOC = 110°" }
      ]},
      21: { parts: [
        { label: "(a)", steps: ["In △ABC, ∠ABC + 50° + 70° = 180°, ∠ABC = 60°", "∵ O is the circumcentre.", "∴ OA = OB = OC", "In △ABC, 60° + 60° + 2∠OAC = 180°, ∠OAC = 30°", "OA = AD/cos∠OAC = (2/√3) × AD"], answer: "OA = (2/√3)AD" },
        { label: "(b)", steps: ["∵ OD ⊥ AC", "∴ AD = (1/2)AC = (1/2)(8√3) cm = 4√3 cm", "OA = (2/√3)(4√3) cm = 8 cm", "Circumference = 2π(8) cm = 16π cm"], answer: "Circumference = 16π cm" }
      ]},
      22: { steps: ["∵ G is the centroid of △PQR.", "∴ PS = SR", "Area of △GSR = area of △GSP = 22 cm²", "∵ QG : GS = 2 : 1 | (centroid property)", "Area of △QGR = 2 × area of △GSR = 2 × 22 cm² = 44 cm²"], answer: "Area of △QGR = 44 cm²" },
      23: { steps: ["∵ G is the centroid of △ABC.", "∴ BD = DC = (16 ÷ 2) cm = 8 cm", "∴ AD ⊥ BC | (property of isos. △)", "In △ADC, AD = √(AC² − DC²) = √(17² − 8²) cm = 15 cm", "∵ AG : GD = 2 : 1", "∴ GD = (1/3) × 15 cm = 5 cm", "In △GDC, CG = √(GD² + DC²) = √(5² + 8²) cm ≈ 9.43 cm"], answer: "CG ≈ 9.43 cm" },
      24: { parts: [
        { label: "(a)", steps: ["∵ B is the circumcentre of △ACD.", "∴ BC = BA | (circumradius)", "∠BCA = ∠BAC | (base ∠s, isos. △)", "∵ AC is the angle bisector of ∠BAD.", "∴ ∠DAC = ∠BAC", "∴ ∠DAC = ∠BCA", "∴ AD // BC | (alt. ∠s equal)"], answer: "AD // BC" },
        { label: "(b)", steps: ["∵ B is the circumcentre and F is the mid-point of CD.", "∴ BF is the perp. bisector of CD.", "∴ ∠CFB = 90°", "∠ADC + ∠BCF = 180° | (int. ∠s, AD // BC)", "112° + ∠BCF = 180°, ∠BCF = 68°", "In △BCF, ∠CBF + 68° + 90° = 180°", "∠CBF = 22°"], answer: "∠CBF = 22°" }
      ]},
      25: { parts: [
        { label: "(a)", steps: ["△OXY ≅ △OXZ | (SSS: OX = OX, OY = OZ, XY = XZ def. equil.)", "∴ ∠OXY = ∠OXZ | (corr. ∠s)", "i.e. OX is the angle bisector of ∠ZXY.", "△OXY ≅ △OZY | (SSS: OY = OY, OX = OZ, XY = ZY)", "∴ ∠OYX = ∠OYZ | (corr. ∠s)", "i.e. OY is the angle bisector of ∠XYZ.", "∴ O is the incentre of △XYZ."], answer: "O is the incentre of △XYZ." },
        { label: "(b)", steps: ["∵ ∠OYX = ∠OYZ | (proved in (a))", "∴ XA = AZ | (property of isos. △)", "∴ YA is a median of △XYZ.", "∵ ∠OXY = ∠OXZ | (proved in (a))", "∴ YB = BZ | (property of isos. △)", "∴ XB is a median of △XYZ.", "∴ O is the centroid of △XYZ."], answer: "O is the centroid of △XYZ." }
      ]},
      26: { parts: [
        { label: "(a)", steps: ["∵ P is the orthocentre of △PQR.", "∴ ∠RPQ = 90°", "∵ △PSR is equilateral.", "∴ ∠PSR = ∠SPR = ∠SRP = 60°", "In △PQR, ∠PQR + 90° + 60° = 180°", "∠PQR = 30°", "In △QPS, 30° + ∠QPS = 60° | (ext. ∠ of △)", "∠QPS = 30° = ∠PQR", "∴ QS = SP | (sides opp. equal ∠s)", "∵ SP = SR | (def. of equil. △)", "∴ QS = SR", "∴ PS is a median of △PQR."], answer: "PS is a median of △PQR." },
        { label: "(b)", steps: ["∵ SQ = SP = SR | (proved in (a))", "∴ S is the circumcentre of △PQR.", "∴ The claim is agreed."], answer: "The claim is agreed." }
      ]},
      27: { steps: ["Let ∠OAB = a, ∠OBC = b and ∠OCA = c.", "∵ O is the circumcentre.", "∴ OA = OB = OC", "45° + 60° + ∠CAB = 180°, ∠CAB = 75°", "a + c = 75°, a + b = 45°, b + c = 60°", "Solving: a = 30°, c = 45°", "In △OCA, ∠AOC + 45° + 45° = 180°, ∠AOC = 90°", "In △ABP (P on AO extended), ∠ABP + 30° + 90° = 180°, ∠ABP = 60°", "∠OBP = 60° − 30° = 30°", "In △OBP, BP = OB cos 30° = (√3/2)OC"], answer: "BP = (√3/2)OC" },
      28: { steps: ["∵ G₁ is centroid of △ABE.", "∴ BD = DE and AG₁ : G₁D = 2 : 1", "∵ G₂ is centroid of △ACD.", "∴ DE = EC and AG₂ : G₂E = 2 : 1", "∴ BD = DE = EC", "DE = (1/3)BC = (1/3) × 297 cm = 99 cm", "△AG₁G₂ ~ △ADE | (ratio of 2 sides, inc. ∠)", "AG₁/AD = G₁G₂/DE", "2/3 = G₁G₂/99 cm", "G₁G₂ = 66 cm"], answer: "G₁G₂ = 66 cm" },
      29: { parts: [
        { label: "(a)", steps: ["∵ O is the circumcentre of △ABC.", "∴ OE is the perp. bisector of BC.", "∴ OE ⊥ BC and EC = (1/2)BC = (1/2) × 72 cm = 36 cm", "In △AEC, cos∠ACE = EC/AC = 36 cm/60 cm = 3/5"], answer: "cos∠ACE = 3/5" },
        { label: "(b)", steps: ["∵ O is the circumcentre.", "∴ OF is the perp. bisector of AC.", "FC = (1/2)AC = 30 cm", "In △GCF, GC = FC/cos∠ACE = 30 cm/(3/5) = 50 cm", "BG = BC − CG = 72 − 50 = 22 cm", "GE = EC − BG = 36 − 22 = 14 cm"], answer: "GE = 14 cm" },
        { label: "(c)", steps: ["∵ O is the circumcentre.", "∴ AB = AC | (perp. bisector of BC implies isosceles)", "∴ ∠DBH = ∠GFC, ∠HDB = ∠GFC = 90°", "BD = CF", "∴ △HDB ≅ △GFC | (ASA)", "HB = GC = 50 cm | (corr. sides)", "HE = HB − EB = 50 − 36 = 14 cm", "GF = √(GC² − FC²) = √(50² − 30²) cm = 40 cm", "△OGE ~ △CGF | (AAA)", "GE/GF = OE/CF", "14/40 = OE/30 cm", "OE = 10.5 cm", "Area of △OGH = (1/2)(GE + HE)(OE)", "= (1/2)(14 + 14)(10.5) cm² = 147 cm²"], answer: "Area of △OGH = 147 cm²" }
      ]},
      30: { parts: [
        { label: "(a)", steps: ["∵ O is the circumcentre of △ABC.", "∴ OA = OB = OC", "∠OCA = ∠OAC, ∠OBA = ∠OAB | (base ∠s, isos. △)", "2(∠OAC + ∠OAB) = 180°", "∠BAC = 90°", "∴ △ABC is right-angled with ∠BAC = 90°.", "OC = OB = 16 cm", "AB = BC cos∠ABC = 16 × 2 × cos 30° cm = 16√3 cm", "AC = BC sin∠ABC = 16 × 2 × sin 30° cm = 16 cm", "Area of △ABC = (1/2) × 16√3 × 16 cm² = 128√3 cm²"], answer: "Area = 128√3 cm²" },
        { label: "(b)", steps: ["∵ CA and BA are both altitudes of △ABC.", "∴ The orthocentre of △ABC is point A.", "∴ OH = OA = OB = 16 cm"], answer: "OH = 16 cm" }
      ]},
      31: { steps: ["∵ I is the incentre of △ABC.", "∴ ∠CAB = 25° × 2 = 50°", "∵ AB = BC | (given)", "∴ ∠ACB = ∠CAB = 50° | (base ∠s, isos. △)", "In △ABC, ∠ABC + 50° + 50° = 180°", "∠ABC = 80°", "∴ The answer is C."], answer: "C" },
      32: { steps: ["For I:", "∵ H is the orthocentre of △ABC.", "∴ CD, AE and BF are altitudes.", "△AHD ≅ △AHF | (RHS), △HDB ≅ △HFC | (ASA)", "AB = AF + FC = AD + DB = AC", "∴ △ABC is isosceles. ∴ I is true.", "For II: BH = CH | (corr. sides) ∴ II is true.", "For III: AE is perp. bisector of BC. ∴ III is true.", "∴ The answer is D."], answer: "D" },
      33: { steps: ["For I: circumcentre lies on hypotenuse. ∴ I is true.", "For II: centroid always inside triangle. ∴ II is not true.", "For III: BD = AB × BC / BD. ∴ III is true.", "∴ The answer is B."], answer: "B" },
      34: { steps: ["For I: O is circumcentre and AD = DB.", "∴ CD is perp. bisector of AB. ∴ I is true.", "For II: CA may not equal AB. ∴ II may not be true.", "For III: △CDA ≅ △CDB | (SAS)", "∴ ∠ACD = ∠BCD, CD is angle bisector.", "∴ Incentre lies on CD. ∴ III is true.", "∴ The answer is C."], answer: "C" },
      35: { steps: ["∵ ∠QPS = ∠RPS | (given)", "∴ PS ⊥ QR and QS = SR | (property of isos. △)", "For I: PS ⊥ QR, PS is altitude. Orthocentre lies on PS. ∴ I true.", "For II: PS is perp. bisector of QR. Circumcentre lies on PS. ∴ II true.", "For III: QS = SR, PS is median. Centroid lies on PS. ∴ III true.", "∴ The answer is D."], answer: "D" },
      36: { steps: ["For I: incentre always inside. ∴ I is true.", "For II: circumcentre of obtuse-angled △ lies outside. ∴ II is not true.", "For III: orthocentre of obtuse-angled △ lies outside. ∴ III is not true.", "∴ The answer is A."], answer: "A" },
      37: { steps: ["For I: centroid always inside. ∴ I is true.", "For II: circumcentre equidistant from vertices. ∴ II is true.", "For III: incentre equidistant from sides. ∴ III is true.", "∴ The answer is D."], answer: "D" },
      38: { steps: ["For I:", "∵ AD is perp. bisector of BC.", "∴ AD ⊥ BC and EB = EC", "In △ABD, ∠DAB = 30°, ∴ ∠DAB = ∠ABE, EB = EA", "∴ EM ⊥ BC (property of isos. △)", "∴ EM is perp. bisector of AB.", "∴ E is circumcentre of △ABC. ∴ I is true.", "For II:", "∵ E is circumcentre. ∴ EB = EC, ∠ECB = ∠EBC = 30°", "In △BCF, 30° + ∠CFB + 60° = 180°, ∠CFB = 90°", "∴ BF is altitude of △BCE.", "∴ A is orthocentre of △BCE. ∴ II is true.", "For III: △ABE ≅ △CBE | (AAS). Area of △ABE = area of △BCE. ∴ III is true.", "∴ The answer is D."], answer: "D" }
    }
  },

  "UT": {
    label: "UT",
    questions: {
      "Ch4_1": { steps: ["∠ADC = ∠ABC | (opp. ∠s of //gram)", "= 42°", "∵ ED = CD | (given)", "∴ ∠CED = ∠ECD | (base ∠s, isos. △)", "In △ECD, ∠ECD + ∠CED + ∠ADC = 180° | (∠ sum of △)", "2∠ECD + 42° = 180°", "∠ECD = 69°"], answer: "∠ECD = 69°" },
      "Ch4_2": { steps: ["3x = 90° | (property of square)", "x = 30°", "(2y + 1) cm = 15 cm | (property of square)", "2y = 14", "y = 7"], answer: "x = 30°, y = 7" },
      "Ch4_3": { steps: ["∠Q = ∠S | (opp. ∠s of //gram)", "(2x + 10)° = (3x − 15)°", "x = 25", "PS = QR | (opp. sides of //gram)", "2y + 4 = x − 7 = 25 − 7 = 18", "2y = 14", "y = 7"], answer: "x = 25, y = 7" },
      "Ch4_4": { steps: ["∠BOC = 120° | (vert. opp. ∠s)", "In △BOC, BO = CO | (property of rectangle)", "∴ ∠OBC = ∠OCB = x | (base ∠s, isos. △)", "x + 120° + x = 180° | (∠ sum of △)", "x = 30°", "In △BDC, ∠BCD = 90° | (property of rectangle)", "x + y + 90° = 180° | (∠ sum of △)", "y = 60°"], answer: "x = 30°, y = 60°" },
      "Ch4_5": { steps: ["DC = AD | (by definition)", "2x + 3 = 15, x = 6", "∵ AB = BC | (by definition)", "∴ ∠BCA = ∠BAC = 2y | (base ∠s, isos. △)", "70° + 2y + 2y = 180° | (∠ sum of △)", "4y = 110°, y = 27.5°"], answer: "x = 6, y = 27.5°" },
      "Ch4_6": { steps: ["∠ADC = ∠EDF = 102° | (vert. opp. ∠s)", "∵ ∠BAD = ∠BCD and ∠ABC = ∠ADC | (given)", "∴ ABCD is a parallelogram. | (opp. ∠s equal)"], answer: "ABCD is a parallelogram." },
      "Ch4_7": { steps: ["AB = DC | (given)", "∵ ∠BAC = ∠ACD = 51° | (given)", "∴ AB // DC | (alt. ∠s equal)", "∴ ABCD is a parallelogram. | (2 sides // and equal)"], answer: "ABCD is a parallelogram." },
      "Ch4_8": { steps: ["∵ △ABC ≅ △CDA | (given)", "∴ AB = CD and BC = DA | (corr. sides, ≅ △s)", "∴ ABCD is a parallelogram. | (opp. sides equal)"], answer: "ABCD is a parallelogram." },
      "Ch4_9": { steps: ["∠AEB = 90° | (property of rhombus)", "In △ABE, ∠BAE + 54° + 90° = 180° | (∠ sum of △)", "∠BAE = 36°", "∠EAD = ∠BAE | (property of rhombus)", "= 36°", "∠ACD = ∠BAE | (alt. ∠s, AB // DC)", "= 36°", "∠CDF = ∠EAD + ∠ACD | (ext. ∠ of △)", "= 36° + 36° = 72°"], answer: "∠CDF = 72°" },
      "Ch4_10": { parts: [
        { label: "(a)", steps: ["∵ ∠ADE = 90° | (given)", "∴ AE = √(AD² + DE²) | (Pyth. theorem)", "= √(15² + 8²) = 17"], answer: "AE = 17" },
        { label: "(b)", steps: ["∵ AE = CE = 17 | (by (a))", "and AD = BD = 15 | (given)", "∴ BC = 2DE | (mid-pt. theorem)", "= 2(8) = 16"], answer: "BC = 16" }
      ]},
      "Ch4_11": { parts: [
        { label: "(a)", steps: ["∵ ∠BAC = ∠EDC | (given)", "∴ AB // DE | (corr. ∠s equal)", "∵ BE = EC and AB // DE | (proved)", "∴ AD = DC | (intercept theorem)", "= 9 cm"], answer: "AD = 9 cm" },
        { label: "(b)", steps: ["∵ BE = EC and AD = DC | (proved)", "∴ AB = 2DE | (mid-pt. theorem)", "= 2(6) cm = 12 cm"], answer: "AB = 12 cm" }
      ]},
      "Ch5_1": { steps: ["Draw a line FC such that AB // FC // DE.", "∠ABC = 360° − x | (∠s at a pt.)", "∠FCB = x − 180° | (int. ∠s, AB // FC)", "∠FCD = y − (x − 180°) = y − x + 180°", "∠CDE = ∠FCD | (alt. ∠s, FC // DE)", "z = 360° − (y − x + 180°)", "z = 180° − y + x"], answer: "z = 180° − y + x" },
      "Ch5_2": { steps: ["∠ABE = 360° − y | (∠s at a pt.)", "∵ y − x = 270° | (given)", "∴ x = y − 270°", "∠BED = 180° − x − 90° = 90° − x = 360° − y", "∴ ∠ABE = ∠BED", "∴ AB // CD | (alt. ∠s equal)"], answer: "AB // CD" },
      "Ch5_3": { steps: ["∠BAE = 360° − a | (∠s at a pt.)", "∵ a + b = 360° | (given)", "∴ b = 360° − a = ∠BAE", "∴ AB // EC | (corr. ∠s equal)"], answer: "AB // EC" },
      "Ch5_4": { steps: ["∵ DF // BC | (given)", "∴ ∠BCA = z | (alt. ∠s, DF // BC)", "In △ABC, x + y + ∠ACB = 180° | (∠ sum of △)", "x + y + z = 180°", "∴ The claim is agreed."], answer: "The claim is agreed." },
      "Ch5_5": { steps: ["In △ACB, ∠DCB = a + b | (ext. ∠ of △)", "In △DEF, ∠CDF = c + d | (ext. ∠ of △)", "∵ CB // DF", "∴ ∠DCB + ∠CDF = 180° | (int. ∠s, CB // DF)", "a + b + c + d = 180°", "∴ The claim is agreed."], answer: "The claim is agreed." },
      "Ch5_6": { steps: ["In △CDE, ∠CED = a | (base ∠s, isos. △)", "∠ACB = ∠CED + a = 2a | (ext. ∠ of △)", "In △ABC, ∠ABC = ∠ACB = 2a | (base ∠s, isos. △)", "b + 2a + 2a = 180° | (∠ sum of △)", "4a + b = 180°"], answer: "4a + b = 180°" },
      "Ch5_7": { steps: ["∠PQN = ∠PRM = c | (corr. ∠s, ≅ △s)", "In △PQM, ∠PMR = a + ∠PQM = a + c | (ext. ∠ of △)", "∠PNQ = ∠PMR = a + c | (corr. ∠s, ≅ △s)", "In △PMN, b + (a + c) + (a + c) = 180° | (∠ sum of △)", "2a + b + 2c = 180°"], answer: "2a + b + 2c = 180°" },
      "Ch5_8": { steps: ["∠AFB = 180° − b | (adj. ∠s on st. line)", "∠DEC = ∠AFB = 180° − b | (corr. ∠s, ≅ △s)", "In △GEF, ∠AFB + ∠DEC = ∠AGE | (ext. ∠ of △)", "180° − b + 180° − b = a", "a + 2b = 360°"], answer: "a + 2b = 360°" },
      "Ch5_9": { parts: [
        { label: "(a)", steps: ["∠ABC = 90° | (definition of rectangle)", "∴ ∠ABC = ∠ECA", "∠ACB = ∠EAC | (alt. ∠s, AE // BD)", "∠BAC = 180° − ∠ABC − ∠ACB = ∠CEA | (∠ sum of △)", "∴ △ABC ~ △ECA | (AAA)"], answer: "△ABC ~ △ECA" },
        { label: "(b)", steps: ["∵ △ABC ~ △ECA | (proved in (a))", "∴ AC/AE = BC/AC | (corr. sides, ~ △s)", "∴ AC² = AE × BC"], answer: "AC² = AE × BC" }
      ]},
      "Ch5_10": { steps: ["∵ AD = DC | (definition of rhombus)", "∴ ∠DAC = ∠DCA | (base ∠s, isos. △)", "In △ADC, 136° + 2∠DAC = 180°, ∠DAC = 22°", "∠EAC = ∠DAC = 22° | (property of rhombus)", "∠BAC = 58° + 22° = 80°", "In △ABC, ∠ACB + 50° + 80° = 180°, ∠ACB = 50°", "∵ ∠ACB = ∠ABC = 50°", "∴ AC = AB | (sides opp. equal ∠s)", "∴ △ABC is an isosceles triangle."], answer: "△ABC is an isosceles triangle." },
      "Ch6_1": { steps: ["∵ AD is an altitude of △ABC.", "∴ ∠ADC = 90°", "In △ABD, ∠ABD + 44° = 90° | (ext. ∠ of △)", "∠ABD = 46°", "∵ BE is the angle bisector of ∠ABC.", "∴ ∠EBC = 46° ÷ 2 = 23°", "In △BCE, ∠ECB + 23° + 105° = 180° | (∠ sum of △)", "∠ECB = 52°", "∴ ∠ACB = 52°"], answer: "∠ACB = 52°" },
      "Ch6_2": { steps: ["Consider △ABE and △CDE.", "∵ BD is the perp. bisector of AC.", "∴ BD ⊥ AC, i.e. ∠AEB = ∠CED = 90° and AE = CE", "AB = CD | (given)", "∴ △ABE ≅ △CDE | (RHS)"], answer: "△ABE ≅ △CDE" },
      "Ch6_3": { steps: ["Let AB = BC = 2x.", "∵ EG and FG are perp. bisectors of AB and BC.", "∴ ∠BEG = ∠BFG = 90° and BE = BF = x", "BG = BG | (common side)", "∴ △BEG ≅ △BFG | (RHS)"], answer: "△BEG ≅ △BFG" },
      "Ch6_4": { parts: [
        { label: "(a)", steps: ["∠PSR = ∠PQR = 90° | (given)", "∵ PR is the angle bisector of ∠QRS.", "∴ ∠SRP = ∠QRP", "PR = PR | (common side)", "∴ △PSR ≅ △PQR | (AAS)"], answer: "△PSR ≅ △PQR" },
        { label: "(b)", steps: ["SR = QR | (corr. sides, ≅ △s)", "∠SRT = ∠QRT | (proved)", "RT = RT | (common side)", "∴ △SRT ≅ △QRT | (SAS)", "∴ ∠STR = ∠QTR and ST = QT | (corr. sides)", "∠STR + ∠QTR = 180° | (adj. ∠s on st. line)", "2∠STR = 180°, ∠STR = 90°", "∴ PR is the perp. bisector of QS."], answer: "PR is the perp. bisector of QS." }
      ]},
      "Ch6_5": { parts: [
        { label: "(a)", steps: ["∵ △ADG ≅ △CEG | (given)", "∴ AG = CG | (corr. sides, ≅ △s)", "FG = FG | (common side)", "∵ FG is the angle bisector of ∠AGC.", "∴ ∠AGF = ∠CGF", "∴ △AFG ≅ △CFG | (SAS)"], answer: "△AFG ≅ △CFG" },
        { label: "(b)", steps: ["∵ △AFG ≅ △CFG | (proved in (a))", "∴ ∠AFG = ∠CFG | (corr. ∠s)", "and AF = CF | (corr. sides)", "∠AFG + ∠CFG = 180° | (adj. ∠s on st. line)", "2∠AFG = 180°, ∠AFG = 90°", "∴ FG is the perp. bisector of AC."], answer: "FG is the perp. bisector of AC." }
      ]},
      "Ch6_6": { parts: [
        { label: "(a)", steps: ["∵ I is the incentre of △ABC.", "∴ ∠IBA = ∠IBC = 17°", "In △ABI, ∠IAB + 17° + 138° = 180° | (∠ sum of △)", "∠IAB = 25°"], answer: "∠IAB = 25°" },
        { label: "(b)", steps: ["Draw ID such that ID ⊥ AB.", "Radius of inscribed circle = ID = IA sin 25°", "= 6 sin 25° cm ≈ 2.54 cm"], answer: "Radius ≈ 2.54 cm" }
      ]},
      "Ch6_7": { parts: [
        { label: "(a)", steps: ["AP = AB − BP = (45 − x) cm", "CQ = CB − BQ = (28 − x) cm"], answer: "AP = (45 − x) cm, CQ = (28 − x) cm" },
        { label: "(b)", steps: ["AC = AR + CR = AP + CQ", "53 = (45 − x) + (28 − x)", "2x = 20, x = 10"], answer: "x = 10" }
      ]},
      "Ch6_8": { parts: [
        { label: "(a)", steps: ["In △ABC, ∠ABC + 59° + 76° = 180°", "∠ABC = 45°", "∵ O is the circumcentre of △ABC.", "∴ ∠OPB = ∠OQB = 90°", "In quadrilateral BQOP,", "∠POQ + 90° + 45° + 90° = 360°", "∠POQ = 135°"], answer: "∠POQ = 135°" },
        { label: "(b)", steps: ["Join OB.", "∵ O is the circumcentre.", "Radius = OB = √(OQ² + BQ²) | (Pyth. theorem)", "= √(4² + (12 ÷ 2)²) cm = √(16 + 36) cm ≈ 7.21 cm"], answer: "Radius ≈ 7.21 cm" }
      ]},
      "Ch6_9": { steps: ["O is the circumcentre of △ABC and OA = OB.", "In △ABD, AD = √(AB² − BD²) = √(65² − 33²) cm = 56 cm", "Let OB = r cm, OD = (56 − r) cm.", "In △BOD, r² = 33² + (56 − r)² | (Pyth. theorem)", "r² = 1089 + 3136 − 112r + r²", "112r = 4225", "r = 4225/112 cm"], answer: "Radius = 4225/112 cm" },
      "Ch6_10": { steps: ["∵ G is the centroid of △ABC.", "∴ AE = BE and AD = CD", "AB = 12 × 2 cm = 24 cm", "AD = 60 ÷ 2 cm = 30 cm", "In △ABD, BD = √(30² − 24²) cm = 18 cm | (Pyth. theorem)", "∵ BG : GD = 2 : 1", "∴ DG : BD = 1 : 3", "∴ DG = (1/3) × 18 cm = 6 cm"], answer: "DG = 6 cm" },
      "Ch7_1": { steps: ["Volume of pyramid VPQRS = (1/3) × (6 × 3) × 6 cm³", "= 36 cm³", "Volume of pyramid VABCD = (1/3) × (16 × 8) × (10 + 6) cm³", "= 2048/3 cm³", "Volume of the frustum = (2048/3 − 36) cm³"], answer: "647 cm³ (cor. to 3 sig. fig.)" },
      "Ch7_2": { steps: ["Total surface area of the pyramid", "= (4 × 35 + 7 × 7) cm²", "= 189 cm²"], answer: "189 cm²" },
      "Ch7_3": { steps: ["Area of △VAB = (1/2) × 33 × 28 cm²", "= 462 cm²", "Area of △VBC = (1/2) × 16 × 31.5 cm²", "= 252 cm²", "Total surface area of the pyramid", "= (2 × 462 + 2 × 252 + 33 × 16) cm²", "= 1956 cm²"], answer: "1956 cm²" }
    }
  },

  "7.1": {
    label: "7.1",
    questions: {
      1: { steps: ["Volume of the pyramid = (1/3) × 24 × 5 cm³"], answer: "40 cm³" },
      2: { steps: ["Volume of the pyramid = (1/3) × (1/2 × 7 × 3) × 3 cm³"], answer: "10.5 cm³" },
      3: { steps: ["Volume of the pyramid = (1/3) × 30 × 6 cm³"], answer: "60 cm³" },
      4: { steps: ["Volume of the pyramid = (1/3) × 3² × 4 cm³"], answer: "12 cm³" },
      5: { steps: ["Volume of the pyramid = (1/3) × (4 × 2) × 5 cm³"], answer: "40/3 cm³" },
      6: { steps: ["Volume of the pyramid = (1/3) × (1/2 × 3 × 8) × 5 cm³"], answer: "20 cm³" },
      7: { steps: ["Volume of the pyramid = (1/3) × (17 × 8) × 15 cm³"], answer: "680 cm³" },
      8: { steps: ["Let h cm be the height of the pyramid.", "Volume of the pyramid = 24 cm³", "(1/3) × [1/2 × (5 + 7) × 3] × h = 24", "6h = 24", "h = 4"], answer: "The height of the pyramid is 4 cm." },
      9: { steps: ["Volume of the pyramid = 224 cm³", "(1/3) × (QT × 7) × 12 = 224", "QT = 8", "QR = QT | (definition of rhombus)", "= 8 cm"], answer: "QR = 8 cm" },
      10: { steps: ["Let x cm² be the base area of the pyramid.", "Volume of the pyramid = 144 cm³", "(1/3) × x × 12 = 144", "x = 36"], answer: "The base area of the pyramid is 36 cm²." },
      11: { steps: ["Let x cm be the length of a side of the base.", "Height of the equilateral triangle base = √(x² − (x/2)²) cm | (Pyth. theorem)", "= (√3 / 2)x cm", "Volume of the pyramid = 48 cm³", "(1/3) × (1/2 × x × (√3 / 2)x) × 4 = 48", "(√3 / 3)x² = 48", "x² = 144 / √3", "x = 9.12, cor. to 3 sig. fig."], answer: "The length of a side of the base is 9.12 cm." },
      12: { steps: ["Total surface area of the pyramid", "= area of square PQRS + area of △VQR × 4", "= [6² + (1/2 × 6 × 8) × 4] cm²"], answer: "132 cm²" },
      13: { steps: ["Total surface area of the pyramid", "= area of rectangle ABCD + area of △VAB × 2 + area of △VBC × 2", "= [18 × 10 + (1/2 × 18 × 13) × 2 + (1/2 × 10 × 15) × 2] cm²"], answer: "564 cm²" },
      14: { steps: ["Total area of all lateral faces = 70 cm²", "Area of △VBC × 4 = 70 cm²", "(1/2 × BC × 5) × 4 = 70", "BC = 7 cm", "Total surface area of the pyramid", "= area of square ABCD + total area of all lateral faces", "= (7² + 70) cm²"], answer: "119 cm²" },
      15: { steps: ["For the regular hexagon ABCDEF, △OAB, △OBC, △OCD, △ODE, △OEF and △OAF are all equilateral triangles of side 4 cm.", "Height of each equilateral triangle", "= √(4² − (4/2)²) cm | (Pyth. theorem)", "= √12 cm", "Area of hexagon ABCDEF", "= area of an equilateral triangle × 6", "= (1/2 × 4 × √12) × 6 cm²", "= 12√12 cm²", "Total surface area of the pyramid", "= area of the hexagonal base + total area of all lateral faces", "= (12√12 + 10 × 6) cm²"], answer: "102 cm², cor. to 3 sig. fig." },
      16: { steps: ["Volume of the frustum", "= volume of VABC − volume of VDEF", "= [1/3 × 18 × (2 + 4) − 1/3 × 2 × 2] cm³"], answer: "104/3 cm³" },
      17: { parts: [
        { label: "(a)", steps: ["Volume of pyramid VABCD = 1/3 × (8 × 4) × 9 cm³"], answer: "96 cm³" },
        { label: "(b)", steps: ["Volume of the frustum", "= volume of VABCD − volume of VEFGH", "= [96 − 1/3 × (4 × 2) × 4.5] cm³"], answer: "84 cm³" }
      ]},
      18: { steps: ["Volume of the frustum", "= volume of VEFGH − volume of VIJKL", "= [1/3 × 16² × 24 − 1/3 × 12² × (24 − 6)] cm³"], answer: "1184 cm³" },
      19: { parts: [
        { label: "(a)", steps: ["In △PQR,", "PR = √(PQ² + QR²) | (Pyth. theorem)", "= √(6² + 8²) cm = 10 cm", "In △VPO,", "VO = √(VP² − OP²) | (Pyth. theorem)", "= √(13² − (10/2)²) cm"], answer: "VO = 12 cm" },
        { label: "(b)", steps: ["Volume of the pyramid", "= 1/3 × (6 × 8) × 12 cm³"], answer: "192 cm³" }
      ]},
      20: { steps: ["Let O be the projection of V on the base.", "In △ABC,", "AC = √(AB² + BC²) | (Pyth. theorem)", "= √(8² + 8²) cm = √128 cm", "In △VAO,", "VO = √(VA² − OA²) | (Pyth. theorem)", "= √(9² − (√128 / 2)²) cm = 7 cm", "Volume of the pyramid = 1/3 × 8² × 7 cm³"], answer: "448/3 cm³" },
      21: { steps: ["Let VE be the height of △VAB", "In △VAE,", "VE = √(VA² − AE²) | (Pyth. theorem)", "= √(34² − (32/2)²) cm = 30 cm", "Total surface area of the pyramid", "= area of square ABCD + area of △VAB × 4", "= [32² + (1/2 × 32 × 30) × 4] cm²"], answer: "2944 cm²" },
      22: { steps: ["In △BMV,", "VB = √(VM² + BM²) | (Pyth. theorem)", "= √(20² + (30/2)²) cm = 25 cm", "Let VN be the height of △VBC", "In △BNV,", "VN = √(VB² − BN²) | (Pyth. theorem)", "= √(25² − (14/2)²) cm = 24 cm", "Total surface area of the pyramid", "= area of rectangle ABCD + area of △VAB × 2 + area of △VBC × 2", "= [30 × 14 + (1/2 × 30 × 20) × 2 + (1/2 × 14 × 24) × 2] cm²"], answer: "1356 cm²" },
      23: { parts: [
        { label: "(a)", steps: ["Let h cm be the height of the pyramid.", "Volume of the pyramid = 1050 cm³", "(1/3) × (21 × 15) × h = 1050", "h = 10"], answer: "The height of the pyramid is 10 cm." },
        { label: "(b)", steps: ["Suppose PQ = 21 cm, QR = 15 cm and O is the projection of V on the base.", "Let VM and VN be the heights of △VPQ and △VQR respectively.", "In △VMO,", "VM = √(VO² + MO²) | (Pyth. theorem)", "= √(10² + (15/2)²) cm = 12.5 cm", "In △VNO,", "VN = √(VO² + NO²) | (Pyth. theorem)", "= √(10² + (21/2)²) cm = 14.5 cm", "Total surface area of the pyramid", "= area of rectangle PQRS + area of △VPQ × 2 + area of △VQR × 2", "= [21 × 15 + (1/2 × 21 × 12.5) × 2 + (1/2 × 15 × 14.5) × 2] cm²"], answer: "795 cm²" }
      ]},
      24: { steps: ["Total surface area of the pyramid = 360 cm²", "10² cm² + area of each lateral face × 4 = 360 cm²", "Area of each lateral face × 4 = 260 cm²", "Area of each lateral face = 65 cm²", "Area of △VAB = 65 cm²", "(1/2) × 10 cm × VP = 65 cm²", "VP = 13 cm", "In △VPO,", "VO = √(VP² − OP²) | (Pyth. theorem)", "= √(13² − (10/2)²) cm = 12 cm", "Volume of the pyramid = (1/3) × 10² × 12 cm³"], answer: "400 cm³" },
      25: { steps: ["Volume of each pyramid = (1/3) × 5² × 3 cm³ = 25 cm³", "Let h cm be the rise in water level.", "Volume of water risen = total volume of the four pyramids", "10 × 8 × h = 25 × 4", "h = 1.25"], answer: "The rise in water level is 1.25 cm." },
      26: { steps: ["Let x cm be the length of a side of the base of each pyramid.", "Total volume of the two pyramids = volume of the prism", "(1/3 × x² × 15) × 2 = 240 × 6", "x² = 144", "x = 12"], answer: "The length of a side of the base is 12 cm." },
      27: { steps: ["Volume of the pyramid = (1/3) × 16² × 15 cm³ = 1280 cm³", "Volume of water in the tank = (5/2) × 1280 cm³ = 3200 cm³", "Let h cm be the new water level.", "6² × h = 1280 + 3200", "h = 17.5"], answer: "The new water level is 17.5 cm." },
      28: { parts: [
        { label: "(a)", steps: ["Let VO be the height of the pyramid.", "In △VAO,", "AO = √(VA² − VO²) | (Pyth. theorem)", "= √(13² − 12²) cm = 5 cm", "In △ABC,", "AB = √(AC² − BC²) | (Pyth. theorem)", "= √((5 × 2)² − 6²) cm"], answer: "AB = 8 cm" },
        { label: "(b)", steps: ["Capacity of the pyramid", "= (1/3) × (8 × 6) × 12 cm³ = 192 cm³", "∵ 192 cm³ < 200 cm³", "∴ The water will overflow."], answer: "The water will overflow." }
      ]},
      29: { parts: [
        { label: "(a)", steps: ["Let h cm be the height of the solid.", "Volume of the solid = 128 cm³", "(1/3 × 8² × h/2) × 2 = 128", "h = 6"], answer: "The height of the solid is 6 cm." },
        { label: "(b)", steps: ["Let pyramid VABCD be the upper part of the solid.", "Let VO and VP be the heights of the pyramid and △VBC respectively.", "In △VPO,", "VP = √(VO² + OP²) | (Pyth. theorem)", "= √((6/2)² + (8/2)²) cm = 5 cm", "Total surface area of the solid", "= area of △VBC × 8", "= (1/2 × 8 × 5) × 8 cm²"], answer: "160 cm²" }
      ]},
      30: { parts: [
        { label: "(a)", steps: ["In △VAB,", "VA = √(AB² + VB²) | (Pyth. theorem)", "= √(20² + 20²) cm = √800 cm", "In △ABC,", "CB = √(AB² + AC²) | (Pyth. theorem)", "= √(20² + 20²) cm = √800 cm", "In △VAC and △CBV,", "VA = CB = √800 cm", "AC = BV = 20 cm | (given)", "VC = CV | (common side)", "∴ △VAC ≅ △CBV | (SSS)"], answer: "△VAC ≅ △CBV" },
        { label: "(b)", steps: ["Total surface area of the pyramid", "= area of △VAB × 2 + area of △VAC × 2", "= [(1/2 × 20 × 20) × 2 + (1/2 × 20 × √800) × 2] cm²"], answer: "966 cm², cor. to 3 sig. fig." }
      ]},
      31: { parts: [
        { label: "(a)", steps: ["Volume of pyramid ABCDE = (1/3) × 9² × 9 cm³"], answer: "243 cm³" },
        { label: "(b)", steps: ["In △ADE,", "AE = √(AD² + DE²) cm | (Pyth. theorem)", "= √(9² + 9²) cm = √162 cm", "Total surface area of pyramid ABCDE", "= area of square ABCD + area of △ADE × 2 + area of △ABE × 2", "= [9² + (1/2 × 9 × 9) × 2 + (1/2 × 9 × √162) × 2] cm²"], answer: "277 cm², cor. to 3 sig. fig." }
      ]},
      32: { parts: [
        { label: "(a)", steps: ["Let h cm be the height of the frustum.", "MX = (1/2)QR = (1/2) × 5 cm = 2.5 cm", "NY = (1/2)AB = (1/2) × 15 cm = 7.5 cm", "△VMX ~ △VNY | (AAA)", "VY / VX = NY / MX | (corr. sides, ~ △s)", "(6 + h) / 6 = 7.5 / 2.5", "6 + h = 18", "h = 12"], answer: "The height of the frustum is 12 cm." },
        { label: "(b)", steps: ["Volume of the frustum", "= volume of pyramid VABCD - volume of pyramid VPQRS", "= [(1/3) × 15² × (6 + 12) - (1/3) × 5² × 6] cm³"], answer: "1300 cm³" }
      ]},
      33: { steps: ["Let h cm be the height of pyramid VEFGH.", "MX = (1/2)FG = (1/2) × 10 cm = 5 cm", "NY = (1/2)AB = (1/2) × 15 cm = 7.5 cm", "△VMX ~ △VNY | (AAA)", "VX / VY = MX / NY | (corr. sides, ~ △s)", "h / (h + 5) = 5 / 7.5", "3h = 2h + 10", "h = 10", "The height of pyramid VEFGH is 10 cm.", "Volume of the frustum", "= volume of pyramid VABCD - volume of pyramid VEFGH", "= [(1/3) × (15 × 6) × (10 + 5) - (1/3) × (10 × 4) × 10] cm³"], answer: "950/3 cm³" },
      34: { steps: ["Let h cm be the height of the original pyramid.", "Then the height of the new pyramid is 2h cm.", "Let l cm be the length of a side of the base of the new pyramid.", "(1/3) × (l × l) × 2h = (1/3) × (9 × 8) × h", "l² = 36", "l = 6"], answer: "The length of a side of the base of the new pyramid is 6 cm." },
      35: { steps: ["Let h cm be the height of the original pyramid.", "Volume of the original pyramid = total volume of the 3 smaller pyramids", "(1/3) × 12² × h = ((1/3) × 6² × 6) × 3", "h = 4.5", "Note: Text in textbook concludes 'The height of the original pyramid is 6 cm.' due to a presumed typo."], answer: "4.5 cm" },
      36: { steps: ["Volume of the pyramid = (1/3) × 2² × 1.5 m³ = 2 m³", "Capacity of the cubical tank = 3³ m³ = 27 m³", "Volume of the water in the tank = (27 - 2) m³"], answer: "25 m³" },
      37: { parts: [
        { label: "(a)", steps: ["Let h cm be the depth of water in the container.", "Volume of water = 162 cm³", "(1/3) × 9² × h = 162", "h = 6"], answer: "The depth of water in the container is 6 cm." },
        { label: "(b)", steps: ["Let VY and VM be the heights of the container and △VGF respectively.", "VM = √(MX² + VX²) | (Pyth. theorem)", "= √((9/2)² + 6²) cm = 7.5 cm", "Area of the wet surface of the container", "= area of △VGF × 4", "= (1/2 × 9 × 7.5) × 4 cm²"], answer: "135 cm²" },
        { label: "(c)", steps: ["△VMX ~ △VNY | (AAA)", "NY / MX = VY / VX | (corr. sides, ~ △s)", "NY / (9/2) = 8 / 6", "NY = 6 cm", "Capacity of the container", "= (1/3) × (6 × 2)² × 8 cm³ = 384 cm³", "Total volume of the stone and the water", "= (200 + 162) cm³ = 362 cm³", "∵ 362 cm³ < 384 cm³", "∴ The water will not overflow."], answer: "The water will not overflow." }
      ]},
      38: { parts: [
        { label: "(a)", steps: ["Let h cm be the height of the pyramid.", "Then the height of the cuboid is (12 - h) cm.", "Volume of the solid = 280 cm³", "(1/3) × (7 × 5) × h + 7 × 5 × (12 - h) = 280", "(1/3)h + 12 - h = 8", "2h / 3 = 4", "h = 6"], answer: "The height of the pyramid is 6 cm." },
        { label: "(b)", steps: ["In △VMO,", "VM = √(VO² + MO²) | (Pyth. theorem)", "= √(6² + (5/2)²) cm = 6.5 cm", "In △VNO,", "VN = √(VO² + NO²) | (Pyth. theorem)", "= √(6² + (7/2)²) cm = √48.25 cm", "Total surface area of the solid", "= area of the rectangular base + total area of all lateral faces of the cuboid + total area of all lateral faces of the pyramid", "= {[(7+5)×2]×(12-6) + 7×5 + (1/2×7×6.5)×2 + (1/2×5×√48.25)×2} cm²", "≈ 259.23 cm²", "∵ 259.23 cm² < 260 cm²", "∴ The claim is disagreed."], answer: "The claim is disagreed." }
      ]},
      39: { parts: [
        { label: "(a)", steps: ["Volume of the tetrahedron", "= (1/3) × area of △ABD × CD", "= (1/3) × (1/2 × 8 × 6) × 4 cm³"], answer: "32 cm³" }
      ]},
      40: { parts: [
        { label: "(a)", steps: ["In △ABD,", "BD = √(AB² + AD²) | (Pyth. theorem)", "= √(8² + 6²) cm = 10 cm", "Let h cm be the height of the tetrahedron with △BCD as the base.", "Consider the volume of the tetrahedron.", "(1/3) × area of △BCD × h = 32 cm³", "(1/3) × (1/2 × 10 × 4) × h = 32", "h = 4.8"], answer: "The height is 4.8 cm." },
        { label: "(b)", steps: ["Let VR be the height of the original pyramid.", "VP = (27 - 12) cm = 15 cm", "VQ = (15 + 9) cm = 24 cm", "△VNQ ~ △VOR | (AAA)", "NQ / OR = VQ / VR | (corr. sides, ~ △s)", "NQ / 9 = 24 / 27", "NQ = 8 cm", "△VMP ~ △VOR | (AAA)", "MP / OR = VP / VR | (corr. sides, ~ △s)", "MP / 9 = 15 / 27", "MP = 5 cm", "xF = 2NQ = 2 × 8 cm = 16 cm", "JK = 2MP = 2 × 5 cm = 10 cm", "Volume of water in the container", "= volume of VEFGH - volume of VIJKL", "= [(1/3) × 16² × 24 - (1/3) × 10² × 15] cm³"], answer: "1548 cm³" },
        { label: "(c)", steps: ["In △VNQ,", "VN = √(VQ² + NQ²) | (Pyth. theorem)", "= √(24² + 8²) cm = √640 cm", "In △VMP,", "VM = √(VP² + MP²) | (Pyth. theorem)", "= √(15² + 5²) cm = √250 cm", "Area of the wet surface of the container", "= area of the lower base of the frustum + total area of all lateral faces of the frustum", "= [10² + (1/2 × 16 × √640 - 1/2 × 10 × √250) × 4] cm²", "≈ 593.32 cm²", "∵ 593.32 cm² < 600 cm²", "∴ The claim is agreed."], answer: "The claim is agreed." }
      ]},
      41: { steps: ["Volume of ABCDEFGH = BC × CH × CD", "Volume of pyramid DBCHG = (1/3) × BC × CH × CD", "= (1/3) × volume of ABCDEFGH", "∴ Volume of ABCDEFGH : volume of pyramid DBCHG = 3 : 1", "∴ The answer is A."], answer: "A" },
      42: { steps: ["Let h cm be the height of the original pyramid.", "Volume of the original pyramid = total volume of the 9 smaller pyramids", "(1/3) × 6² × h = ((1/3) × 4² × 3) × 9", "h = 12", "∴ The height of the original pyramid is 12 cm.", "∴ The answer is C."], answer: "C" },
      43: { steps: ["Let A and h be the base area and height of the original pyramid respectively.", "Original volume = (1/3)Ah", "New volume = (1/3) × A(1 + 30%) × h(1 - 10%)", "= (1/3) × 1.3A × 0.9h", "= 1.17 × (1/3)Ah", "= original volume × (1 + 17%)", "∴ The percentage change in the volume of the pyramid is +17%.", "∴ The answer is B."], answer: "B" },
      44: { steps: ["Let VO and VP be the heights of the pyramid and △VBC respectively.", "In △VOP,", "VP = √(VO² + OP²) | (Pyth. theorem)", "= √(12² + (10/2)²) cm = 13 cm", "Total surface area of the pyramid", "= area of the square base ABCD + area of △VBC × 4", "= [10² + (1/2 × 10 × 13) × 4] cm²", "= 360 cm²", "∴ The answer is B."], answer: "B" },
      45: { steps: ["Consider the area of △ABC, we have", "(1/2) × AB × BC = 12 cm²  --- (1)", "Consider the area of △ABD we have", "(1/2) × AB × BD = 15 cm²  --- (2)", "Consider the area of △BCD we have", "(1/2) × BC × BD = 10 cm²  --- (3)", "(1)×(2) / (3):", "((1/2 × AB × BC) × (1/2 × AB × BD)) / (1/2 × BC × BD) = (12 × 15) / 10", "AB² / 2 = 18", "AB² = 36 cm²", "AB = 6 cm", "Volume of the pyramid", "= (1/3) × area of △BCD × AB", "= (1/3) × 10 × 6 cm³ = 20 cm³", "∴ The answer is A."], answer: "A" },
      46: { steps: ["Let VY be the height of pyramid VABCD.", "NY = (1/2)AD = (1/2) × 12 cm = 6 cm", "△VMX ~ △VNY | (AAA)", "MX / NY = VX / VY | (corr sides, ~△s)", "MX / 6 cm = 6 / 15", "MX = 2.4 cm", "Volume of the frustum", "= volume of pyramid VABCD - volume of pyramid VEFGH", "= [(1/3) × 12² × 15 - (1/3) × (2.4 × 2)² × 6] cm³", "= 673.92 cm³", "∴ The answer is B."], answer: "B" }
    }
  }

};
