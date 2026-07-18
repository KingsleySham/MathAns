// 鴻安 POS 產品資料 (Traditional Chinese - Hong Kong)
// 如發現價錢有誤，請直接修改此檔案內的 price 數值即可，不需改動其他程式。
// price: 港元 $；unit: 計價單位 (支/呎/碼/包/個/米/箱 等)

window.HUNGON_CATEGORIES = [
  { id: "aircon",   name: "冷氣物料" },
  { id: "drain",    name: "去水喉" },
  { id: "sealant",  name: "玻璃膠 / Selley's" },
  { id: "tape",     name: "膠帶雜項" },
  { id: "plywood",  name: "夾板" },
  { id: "wood",     name: "木枝" },
  { id: "nails",    name: "針釘" },
  { id: "trim",     name: "膠邊 / 柚木線" },
  { id: "slimduct", name: "Slim Duct 管槽系列" }
];

window.HUNGON_PRODUCTS = [
  // ---------- 冷氣物料 ----------
  { id: "ac-tesa",       category: "aircon", name: "Tesa 膠布",              unit: "卷", price: 50 },
  { id: "ac-amtape-b",   category: "aircon", name: "Amtape 黑",              unit: "卷", price: 28 },
  { id: "ac-amtape-w",   category: "aircon", name: "Amtape 白",              unit: "卷", price: 32 },
  { id: "ac-amercell",   category: "aircon", name: "Amercell 黑",            unit: "卷", price: 43 },
  { id: "ac-huangqi",    category: "aircon", name: "黃銅喉 (黃氣)",           unit: "支", price: 78 },
  { id: "ac-pengzhang",  category: "aircon", name: "鵬脹",                   unit: "支", price: 46 },
  { id: "ac-bizhen",     category: "aircon", name: "避震膠",                 unit: "個", price: 75 },
  { id: "ac-ganzhang-l", category: "aircon", name: "桿枝 (大)",              unit: "支", price: 118 },
  { id: "ac-ganzhang-s", category: "aircon", name: "桿枝 (細)",              unit: "支", price: 40 },
  { id: "ac-dijia-s",    category: "aircon", name: "地架 (細架)",            unit: "個", price: 98 },
  { id: "ac-dijia-l",    category: "aircon", name: "地架 (大架)",            unit: "個", price: 128 },
  { id: "ac-dijia-h",    category: "aircon", name: "地架 (加高架)",          unit: "個", price: 205 },
  { id: "ac-banma-s",    category: "aircon", name: "半馬喉 32-50mm",         unit: "米", price: 25 },
  { id: "ac-banma-l",    category: "aircon", name: "半馬喉 60-70mm",         unit: "米", price: 35 },
  { id: "ac-glue-520",   category: "aircon", name: "膠水 Armaflex 520",      unit: "罐", price: 330 },
  { id: "ac-glue-808",   category: "aircon", name: "膠水 AA808",             unit: "罐", price: 60 },
  { id: "ac-glue-pvc",   category: "aircon", name: "PVC 喉膠水",             unit: "罐", price: 20 },
  { id: "ac-glue-add",   category: "aircon", name: "加高膠水",               unit: "罐", price: 12 },
  { id: "ac-uv",         category: "aircon", name: "UV Armaflex 防曬油",     unit: "罐", price: 510 },

  // ---------- 去水喉 ----------
  { id: "dr-thin-set",   category: "drain", name: "細喉 1 set",             unit: "set", price: 360 },
  { id: "dr-thinnest",   category: "drain", name: "最幼喉",                 unit: "米", price: 18 },
  { id: "dr-nozzle",     category: "drain", name: "喉咀",                   unit: "個", price: 6 },
  { id: "dr-nozzle-box", category: "drain", name: "喉咀 (一包)",            unit: "包", price: 70 },
  { id: "dr-thick-set",  category: "drain", name: "大喉 1 set",             unit: "set", price: 398 },
  { id: "dr-soft-tri",   category: "drain", name: "軟喉三叉",               unit: "個", price: 35 },
  { id: "dr-ring",       category: "drain", name: "加高圈",                 unit: "個", price: 45 },
  { id: "dr-thick-part", category: "drain", name: "大喉配件",               unit: "個", price: 85 },

  // ---------- 玻璃膠 / Selley's ----------
  { id: "se-ding",       category: "sealant", name: "釘膠",                  unit: "支", price: 28 },
  { id: "se-ding-box",   category: "sealant", name: "釘膠 (一箱)",           unit: "箱", price: 520 },
  { id: "se-water",      category: "sealant", name: "水性玻璃膠",            unit: "支", price: 32 },
  { id: "se-fast",       category: "sealant", name: "快乾膠",                unit: "支", price: 59 },
  { id: "se-881",        category: "sealant", name: "881 釘膠",              unit: "支", price: 20 },
  { id: "se-881-box",    category: "sealant", name: "881 釘膠 (一箱)",       unit: "箱", price: 360 },
  { id: "se-ge",         category: "sealant", name: "GE 玻璃膠",             unit: "支", price: 30 },
  { id: "se-selleys",    category: "sealant", name: "Selley's 玻璃膠",       unit: "支", price: 25 },
  { id: "se-gun",        category: "sealant", name: "膠鎗",                  unit: "支", price: 25 },
  { id: "se-gun-storm",  category: "sealant", name: "暴風鎗",                unit: "支", price: 70 },

  // ---------- 膠帶雜項 ----------
  { id: "tp-kun",        category: "tape", name: "捆膠",                     unit: "卷", price: 40 },
  { id: "tp-3m-2",       category: "tape", name: "3M 觸紙 2\"",              unit: "卷", price: 10 },
  { id: "tp-3m-1.25",    category: "tape", name: "3M 觸紙 1¼\"",             unit: "卷", price: 9 },
  { id: "tp-fk-window",  category: "tape", name: "FK 鋁窗膠紙",              unit: "卷", price: 22 },
  { id: "tp-fk-double",  category: "tape", name: "FK 雙面膠",                unit: "卷", price: 30 },
  { id: "tp-kraft",      category: "tape", name: "牛皮膠紙 2\"",             unit: "卷", price: 10 },
  { id: "tp-parcel",     category: "tape", name: "封箱膠紙 2\"",             unit: "卷", price: 8 },
  { id: "tp-bathroom",   category: "tape", name: "浴室膠",                   unit: "支", price: 46 },
  { id: "tp-seal-n",     category: "tape", name: "堵縫帶 (窄)",              unit: "碼", price: 20 },
  { id: "tp-seal-w",     category: "tape", name: "堵縫帶 (闊)",              unit: "碼", price: 28 },
  { id: "tp-lafu-5",     category: "tape", name: "拉夫 5m",                  unit: "卷", price: 40 },
  { id: "tp-lafu-55",    category: "tape", name: "拉夫 55m",                 unit: "卷", price: 55 },
  { id: "tp-lafu-75",    category: "tape", name: "拉夫 75m",                 unit: "卷", price: 50 },
  { id: "tp-wipe-3m",    category: "tape", name: "手抹 3M",                  unit: "卷", price: 16 },
  { id: "tp-road-room",  category: "tape", name: "馬路紙 (室)",              unit: "卷", price: 150 },
  { id: "tp-road-pm",    category: "tape", name: "馬路紙 (品明)",            unit: "卷", price: 250 },
  { id: "tp-mdf-thin",   category: "tape", name: "中密板",                   unit: "塊", price: 10 },
  { id: "tp-foil-thin",  category: "tape", name: "錫紙 (薄)",                unit: "卷", price: 22 },
  { id: "tp-foil-thick", category: "tape", name: "錫紙 (厚)",                unit: "卷", price: 25 },

  // ---------- 夾板 ----------
  { id: "ply-1-4x8",     category: "plywood", name: "1 夾 4×8",             unit: "塊", price: 75 },
  { id: "ply-1-4x4",     category: "plywood", name: "1 夾 4×4",             unit: "塊", price: 38 },
  { id: "ply-1-mdf",     category: "plywood", name: "1 夾 MDF",             unit: "塊", price: 17 },
  { id: "ply-2-4x8",     category: "plywood", name: "2 夾 4×8",             unit: "塊", price: 138 },
  { id: "ply-2-white",   category: "plywood", name: "2 夾 單白",            unit: "塊", price: 180 },
  { id: "ply-3-4x8",     category: "plywood", name: "3 夾 4×8",             unit: "塊", price: 145 },
  { id: "ply-3-white",   category: "plywood", name: "3 夾 單白",            unit: "塊", price: 198 },
  { id: "ply-4-4x8",     category: "plywood", name: "4 夾 4×8",             unit: "塊", price: 208 },
  { id: "ply-4-white",   category: "plywood", name: "4 夾 單白",            unit: "塊", price: 250 },
  { id: "ply-6-core",    category: "plywood", name: "6 夾 4×8 大芯",        unit: "塊", price: 268 },
  { id: "ply-6-white",   category: "plywood", name: "6 夾 單白",            unit: "塊", price: 305 },
  { id: "ply-6-fine",    category: "plywood", name: "6 夾 細芯",            unit: "塊", price: 320 },
  { id: "ply-6-double",  category: "plywood", name: "6 夾 双白",            unit: "塊", price: 380 },

  // ---------- 木枝 ----------
  { id: "wd-1x2-bright", category: "wood", name: "1\"x2\" 光馭 (25呎)",     unit: "支", price: 200 },
  { id: "wd-1x2-matte",  category: "wood", name: "1\"x2\" 不馭 (25呎)",     unit: "支", price: 250 },
  { id: "wd-1x2-groove", category: "wood", name: "1\"x2\" 企凹 (25呎)",     unit: "支", price: 250 },

  // ---------- 針釘 ----------
  { id: "nl-t32",        category: "nails", name: "粗釘 T-32 (1¼\")",       unit: "盒", price: 28 },
  { id: "nl-t38",        category: "nails", name: "粗釘 T-38 (1½\")",       unit: "盒", price: 32 },
  { id: "nl-t50",        category: "nails", name: "粗釘 T-50 (2\")",        unit: "盒", price: 40 },
  { id: "nl-f25",        category: "nails", name: "動釘 F-25 (1\")",        unit: "盒", price: 25 },
  { id: "nl-f30",        category: "nails", name: "動釘 F-30 (1⅜\")",      unit: "盒", price: 26 },
  { id: "nl-fst25",      category: "nails", name: "黑釘 FST-25",            unit: "盒", price: 53 },
  { id: "nl-fst30",      category: "nails", name: "黑釘 FST-30",            unit: "盒", price: 60 },
  { id: "nl-fst40",      category: "nails", name: "黑釘 FST-40",            unit: "盒", price: 66 },
  { id: "nl-33-46j",     category: "nails", name: "33 釘 46J",              unit: "盒", price: 22 },
  { id: "nl-33-49j",     category: "nails", name: "33 釘 49J",              unit: "盒", price: 26 },

  // ---------- 膠邊 / 柚木線 ----------
  { id: "tr-pvc-1",      category: "trim", name: "德利 PVC 膠邊 1\"",       unit: "卷", price: 65 },
  { id: "tr-pvc-2",      category: "trim", name: "德利 PVC 膠邊 2\"",       unit: "卷", price: 75 },
  { id: "tr-thin",       category: "trim", name: "普通薄料膠邊",            unit: "卷", price: 50 },
  { id: "tr-teak-2f1",   category: "trim", name: "柚木線 2分1",             unit: "支", price: 45 },
  { id: "tr-teak-2f2",   category: "trim", name: "柚木線 2分2",             unit: "支", price: 65 },
  { id: "tr-teak-2f3",   category: "trim", name: "柚木線 2分3",             unit: "支", price: 85 },
  { id: "tr-teak-4f1",   category: "trim", name: "柚木線 4分1",             unit: "支", price: 80 },
  { id: "tr-teak-4f2",   category: "trim", name: "柚木線 4分2",             unit: "支", price: 165 },
  { id: "tr-teak-4f3",   category: "trim", name: "柚木線 4分3",             unit: "支", price: 125 },
  { id: "tr-teak-5f1",   category: "trim", name: "柚木線 5分1",             unit: "支", price: 350 },

  // ---------- Slim Duct 管槽系列 - 3吋 (75mm) ----------
  { id: "sd3-pipe",      category: "slimduct", name: "直管 2M — 3吋 75mm",        unit: "支", price: 75 },
  { id: "sd3-cover",     category: "slimduct", name: "過牆蓋 — 3吋 75mm",         unit: "個", price: 28 },
  { id: "sd3-hose",      category: "slimduct", name: "軟喉 — 3吋 75mm",           unit: "支", price: 38 },
  { id: "sd3-connect",   category: "slimduct", name: "梳杰(直接) — 3吋 75mm",     unit: "個", price: 18 },
  { id: "sd3-vert90",    category: "slimduct", name: "垂直曲 90° — 3吋 75mm",     unit: "個", price: 30 },
  { id: "sd3-flat90",    category: "slimduct", name: "平面曲 90° — 3吋 75mm",     unit: "個", price: 30 },
  { id: "sd3-end",       category: "slimduct", name: "尾接 — 3吋 75mm",           unit: "個", price: 18 },
  { id: "sd3-wallconn",  category: "slimduct", name: "過牆接口 — 3吋 75mm",       unit: "個", price: 28 },
  { id: "sd3-cutter",    category: "slimduct", name: "刀士 — 3吋 75mm",           unit: "個", price: 28 },
  { id: "sd3-45",        category: "slimduct", name: "45° 平曲 — 3吋 75mm",       unit: "個", price: 30 },

  // ---------- Slim Duct 管槽系列 - 4吋 (100mm) ----------
  { id: "sd4-pipe",      category: "slimduct", name: "直管 2M — 4吋 100mm",       unit: "支", price: 95 },
  { id: "sd4-cover",     category: "slimduct", name: "過牆蓋 — 4吋 100mm",        unit: "個", price: 35 },
  { id: "sd4-hose",      category: "slimduct", name: "軟喉 — 4吋 100mm",          unit: "支", price: 48 },
  { id: "sd4-connect",   category: "slimduct", name: "梳杰(直接) — 4吋 100mm",    unit: "個", price: 26 },
  { id: "sd4-vert90",    category: "slimduct", name: "垂直曲 90° — 4吋 100mm",    unit: "個", price: 35 },
  { id: "sd4-flat90",    category: "slimduct", name: "平面曲 90° — 4吋 100mm",    unit: "個", price: 35 },
  { id: "sd4-tri",       category: "slimduct", name: "三叉接口 — 4吋 100mm",      unit: "個", price: 48 },
  { id: "sd4-cutter",    category: "slimduct", name: "刀士 — 4吋 100mm",          unit: "個", price: 38 },

  // ---------- Slim Duct 管槽系列 - 5吋 (130mm) ----------
  { id: "sd5-pipe",      category: "slimduct", name: "直管 2M — 5吋 130mm",       unit: "支", price: 115 },
  { id: "sd5-cover",     category: "slimduct", name: "過牆蓋 — 5吋 130mm",        unit: "個", price: 55 },
  { id: "sd5-hose",      category: "slimduct", name: "軟喉 — 5吋 130mm",          unit: "支", price: 88 },
  { id: "sd5-connect",   category: "slimduct", name: "梳杰(直接) — 5吋 130mm",    unit: "個", price: 36 },
  { id: "sd5-vert90",    category: "slimduct", name: "垂直曲 90° — 5吋 130mm",    unit: "個", price: 55 },
  { id: "sd5-flat90",    category: "slimduct", name: "平面曲 90° — 5吋 130mm",    unit: "個", price: 55 },
  { id: "sd5-tri",       category: "slimduct", name: "三叉接口 — 5吋 130mm",      unit: "個", price: 58 },

  // ---------- Slim Duct 管槽系列 - 室內 75mm-1M ----------
  { id: "sdin-pipe",     category: "slimduct", name: "直管 — 室內 75mm-1M",       unit: "支", price: 55 },
  { id: "sdin-cover",    category: "slimduct", name: "過牆蓋 — 室內 75mm-1M",     unit: "個", price: 35 },
  { id: "sdin-connect",  category: "slimduct", name: "梳杰(杰) — 室內 75mm-1M",   unit: "個", price: 18 },
  { id: "sdin-inout",    category: "slimduct", name: "梳杰 內/外 — 室內 75mm-1M", unit: "個", price: 40 },
  { id: "sdin-flat",     category: "slimduct", name: "垂直曲(平) — 室內 75mm-1M", unit: "個", price: 40 }
];
